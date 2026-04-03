/**
 * comparableSourcer.ts — TypeScript port of comparable_sourcer.py
 *
 * Three-layer pipeline for dynamic comparable event sourcing:
 *   1. Cache check  (7-day TTL, keyed on sector + sanction_type + country)
 *   2. Claude suggestion + Yahoo Finance historical validation
 *   3. Static fallback filtered by sanction_type and sector
 *
 * Returns [validatedList, sourceLabel] where sourceLabel is
 * "cache" | "claude" | "static_fallback".
 */

import Anthropic from '@anthropic-ai/sdk';
import { getCached, setCached } from '../cache';
import { config } from '../config';
import { YFinanceClient } from './market';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_NS = 'comparable_sourcer';
const CACHE_TTL = 7 * 24 * 3600; // 7 days in seconds

const PEERS_CACHE_NS = 'target_peers';
const PEERS_CACHE_TTL = 7 * 24 * 3600; // 7 days in seconds

const INVALID_TICKERS = new Set([
  'UNLISTED', 'N/A', 'NA', 'PRIVATE', 'UNKNOWN', 'TBD', 'NONE',
  'DELISTED', 'OTC', 'OTCPK', 'N/L', '-', '.', 'NULL', 'NIL',
]);

const TICKER_RE = /^[A-Za-z0-9.\-^]{1,15}$/;

// ---------------------------------------------------------------------------
// Prompt templates (match Python originals exactly)
// ---------------------------------------------------------------------------

export const _SUGGEST_PROMPT = `You are a financial historian specializing in economic sanctions and export controls.

TARGET CONTEXT:
- Sector: "{sector}" (sub-sector: "{sub_sector}")
- Sanction/risk type: "{sanction_type}"
- Target country: "{country}"
- Approximate market cap: {market_cap}
- Severity level: "{severity}"

Find 6-8 real historical cases where a PUBLICLY TRADED company experienced a materially similar sanctions or regulatory shock. Match on SEVERITY (blocking vs entity-list vs sectoral), MARKET CAP TIER (mega >$200B, large $20-200B, mid $2-20B, small <$2B), and SECTOR.

STRICT RULES:
- Only companies actively listed on a public exchange at the event date.
- No placeholders ("UNLISTED", "N/A", "PRIVATE") — omit if no real ticker exists.
- Ticker = actual exchange symbol (e.g. "BABA", "0763.HK") — no $ prefix.
- Pre-event share price must have been above $2 (no penny stocks).
- No more than 2 cases from the same calendar month — diversify across time periods.
- Each case must have caused a measurable stock price move (>3% within 10 trading days).
- Each ticker may appear only ONCE — pick the most impactful event for that company.
- Prefer US-listed tickers (NYSE/NASDAQ/ADR) with reliable historical data.

For each case provide:
- name: full company name
- ticker: exchange symbol
- sanction_date: YYYY-MM-DD when the shock became public
- sanction_type: one of ofac_ccmc, us_export_control, sectoral, swift_cutoff, retaliation, bis_penalty, regulatory_crackdown, delisting_threat
- severity: one of blocking, entity_list, sectoral, delisting_threat, regulatory_crackdown
- market_cap_tier: one of mega, large, mid, small (at time of event)
- sector: one word — tech, semiconductors, energy, finance, metals, telecom
- description: one sentence, max 15 words

Respond with a JSON array only. No prose, no markdown fences.
[{"name": "...", "ticker": "...", "sanction_date": "...", "sanction_type": "...", "severity": "...", "market_cap_tier": "...", "sector": "...", "description": "..."}]`;

export const _PEERS_PROMPT = `You are building a NON-SANCTIONED CONTROL GROUP for a sanctions impact model.

The purpose: show what a similar company would have done if it had NOT been sanctioned. Control peers must be close enough in geography, sector, size, and business model that their price behavior is a meaningful counterfactual baseline.

SANCTIONED COMPANY: {company_name} ({ticker})
Sector: {sector}
Industry: {industry}
Approximate market cap: {market_cap}
Sanctions context: {sanctions_context}

STRICT RULES — violating any of these disqualifies a peer:
1. SAME COUNTRY / MARKET first, different sector or sub-vertical second.
   - Chinese company → other Chinese ADRs (HK-listed or NYSE/NASDAQ ADR) NOT under the same crackdown/designation. US companies are LAST RESORT.
   - Russian company → other EM banks / energy majors NOT under SWIFT cutoff.
   - Western semiconductor → other chip companies NOT covered by the same BIS rule.
2. NOT subject to the same sanctions, export controls, or crackdowns as {company_name}.
3. Similar market cap — within roughly 0.5x to 2x of the target's market cap.
4. Publicly listed on a major exchange with liquid trading from 2018 onward.
5. Real ticker symbols only — no $ prefix, no "UNLISTED", "N/A", or placeholder text.
6. Do NOT suggest any of these tickers (already used as sanctioned comparables): {excluded_tickers}

EXAMPLES of good vs bad peers:
  Good for Alibaba (Chinese e-commerce): JD (JD.com), TCOM (Trip.com), BEKE (Beike)
  Bad  for Alibaba: AMZN, EBAY  ← different country, different regulatory regime
  Good for Lam Research (US chip equipment): AMAT, KLAC  ← same sector, same geography
  Bad  for Lam Research: ASML  ← if ASML is also under export controls

Select 4-5 peers. Return ONLY a JSON array of ticker strings. No prose, no markdown.
["TICK1", "TICK2", "TICK3", "TICK4"]`;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ComparableEntry {
  name: string;
  ticker: string;
  sanction_date: string;
  sanction_type: string;
  severity: string;
  market_cap_tier: string;
  sector: string;
  description: string;
  industry?: string;
  _post_event_move_pct?: number;
  [key: string]: unknown;
}

export interface DynamicComparablesOptions {
  severity?: string;
  marketCap?: number;
  subSector?: string;
}

export interface TargetPeersOptions {
  marketCap?: number;
  excludedTickers?: Set<string>;
  sanctionsContextStr?: string;
}

// ---------------------------------------------------------------------------
// Helper: fmtMarketCap
// ---------------------------------------------------------------------------

export function fmtMarketCap(mc: number | null | undefined): string {
  if (!mc || mc <= 0) return 'unknown';
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(1)}T`;
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(1)}B`;
  if (mc >= 1e6) return `$${Math.round(mc / 1e6)}M`;
  return `$${mc.toLocaleString()}`;
}

// ---------------------------------------------------------------------------
// Internal: parse JSON from Claude response (handle fences + truncation)
// ---------------------------------------------------------------------------

function parseClaudeJson(text: string): unknown[] {
  let clean = text.trim();

  // Strip markdown code fences if present
  if (clean.includes('```')) {
    const startIdx = clean.indexOf('```') + 3;
    const afterFence = clean.slice(startIdx);
    const endIdx = afterFence.lastIndexOf('```');
    clean = endIdx !== -1 ? afterFence.slice(0, endIdx).trim() : afterFence.trim();
    // Strip optional "json" language tag
    if (clean.startsWith('json')) clean = clean.slice(4).trim();
  }

  // Repair truncated arrays: if starts with [ but doesn't end with ]
  if (clean.startsWith('[') && !clean.endsWith(']')) {
    const lastBrace = clean.lastIndexOf('}');
    if (lastBrace !== -1) {
      clean = clean.slice(0, lastBrace + 1) + ']';
    } else {
      return [];
    }
  }

  try {
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Internal: validate a single comparable entry via Yahoo Finance
// ---------------------------------------------------------------------------

async function validateComparableEntry(
  entry: Record<string, unknown>,
): Promise<ComparableEntry | null> {
  const rawTicker = (String(entry.ticker ?? '')).trim().replace(/^\$/, '');
  const sanctionDateStr = String(entry.sanction_date ?? '').trim();

  if (!rawTicker || !sanctionDateStr) return null;
  if (INVALID_TICKERS.has(rawTicker.toUpperCase())) return null;
  if (!TICKER_RE.test(rawTicker)) return null;

  const sanctionDt = new Date(`${sanctionDateStr}T00:00:00Z`);
  if (isNaN(sanctionDt.getTime())) return null;

  // 90-day pre-event window + 20-day post-event
  const startDt = new Date(sanctionDt.getTime() - 90 * 86400 * 1000);
  const endDt = new Date(sanctionDt.getTime() + 20 * 86400 * 1000);
  const startStr = startDt.toISOString().slice(0, 10);
  const endStr = endDt.toISOString().slice(0, 10);

  const yf = new YFinanceClient();
  let historical;
  try {
    historical = await yf.getPriceHistoryRange(rawTicker, startStr, endStr);
  } catch {
    return null;
  }

  if (!historical || historical.length < 20) return null;

  // Filter to valid close prices
  const rows = historical
    .filter((h) => h.close !== null)
    .map((h) => ({
      date: h.date,
      price: h.close as number,
      volume: h.volume ?? 0,
    }));

  if (rows.length < 20) return null;

  // Split into pre and post event
  const pre = rows.filter((r) => r.date <= sanctionDateStr);
  const post = rows.filter((r) => r.date > sanctionDateStr);

  if (pre.length === 0 || post.length === 0) return null;

  const eventPrice = pre[pre.length - 1].price;

  // Rule: no penny stocks
  if (eventPrice < 2.0) return null;

  // Rule: minimum average volume
  const preVolumes = pre.map((r) => r.volume).filter((v) => v > 0);
  if (preVolumes.length > 0) {
    const avgVol = preVolumes.reduce((a, b) => a + b, 0) / preVolumes.length;
    if (avgVol < 100_000) return null;
  }

  // Rule: minimum post-event price move
  const postPrice = post[Math.min(9, post.length - 1)].price;
  if (eventPrice === 0) return null;
  const movePct = ((postPrice - eventPrice) / eventPrice) * 100;
  if (Math.abs(movePct) < 3.0) return null;

  return {
    ...(entry as ComparableEntry),
    ticker: rawTicker,
    _post_event_move_pct: Math.round(movePct * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// getDynamicComparables
// ---------------------------------------------------------------------------

/**
 * Three-layer pipeline returning [comparableList, sourceLabel].
 *
 * sourceLabel: "cache" | "claude" | "static_fallback"
 */
export async function getDynamicComparables(
  sector: string | null,
  sanctionType: string | null,
  country: string | null,
  staticFallback: ComparableEntry[],
  sectorGroups?: Record<string, string[]> | null,
  options?: DynamicComparablesOptions,
): Promise<[ComparableEntry[], string]> {
  const cacheParams: Record<string, string> = {
    sector: sector ?? '',
    sanction_type: sanctionType ?? '',
    country: country ?? '',
  };

  // --- Layer 1: cache ---
  const cached = getCached(CACHE_NS, cacheParams) as ComparableEntry[] | null;
  if (cached !== null && cached.length >= 3) {
    return [cached, 'cache'];
  }

  // --- Layer 2: Claude + validation ---
  let validated: ComparableEntry[] = [];
  try {
    const client = new Anthropic({ apiKey: config.anthropicApiKey });

    const prompt = _SUGGEST_PROMPT
      .replace('{sector}', sector ?? 'general')
      .replace('{sub_sector}', options?.subSector ?? sector ?? 'general')
      .replace('{sanction_type}', sanctionType ?? 'general')
      .replace('{country}', country ?? 'unknown')
      .replace('{market_cap}', fmtMarketCap(options?.marketCap))
      .replace('{severity}', options?.severity ?? 'unknown');

    const response = await Promise.race([
      client.messages.create({
        model: config.model,
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Claude timeout')), 30_000),
      ),
    ]);

    const text = (response as Anthropic.Message).content[0];
    const rawText = text.type === 'text' ? text.text.trim() : '';

    const candidates = parseClaudeJson(rawText) as Record<string, unknown>[];

    // Validate all candidates in parallel
    const results = await Promise.allSettled(
      candidates.map((c) => validateComparableEntry(c)),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value !== null) {
        validated.push(result.value);
      }
    }

    // Dedup by ticker — keep entry with largest absolute post-event move
    const tickerBest = new Map<string, ComparableEntry>();
    for (const v of validated) {
      const t = (v.ticker ?? '').toUpperCase();
      if (!t) continue;
      const move = Math.abs(v._post_event_move_pct ?? 0);
      const existing = tickerBest.get(t);
      if (!existing || move > Math.abs(existing._post_event_move_pct ?? 0)) {
        tickerBest.set(t, v);
      }
    }
    validated = Array.from(tickerBest.values());
  } catch (err) {
    console.warn('Comparable sourcer: Claude call failed, falling back to static list:', err);
  }

  if (validated.length >= 3) {
    setCached(validated, CACHE_NS, CACHE_TTL, cacheParams);
    return [validated, 'claude'];
  }

  // --- Layer 3: static fallback ---
  let comparables = [...staticFallback];

  if (sanctionType) {
    const typeFiltered = comparables.filter((c) => c.sanction_type === sanctionType);
    if (typeFiltered.length >= 3) comparables = typeFiltered;
  }

  if (sector && sectorGroups) {
    const related = sectorGroups[sector.toLowerCase()] ?? [sector.toLowerCase()];
    const sectorFiltered = comparables.filter((c) =>
      related.includes((c.sector ?? '').toLowerCase()),
    );
    if (sectorFiltered.length >= 3) comparables = sectorFiltered;
  }

  return [comparables, 'static_fallback'];
}

// ---------------------------------------------------------------------------
// getTargetControlPeers
// ---------------------------------------------------------------------------

/**
 * Source non-sanctioned peer tickers for the target company via Claude.
 * Each peer is validated to exist in Yahoo Finance (≥5 points for 1mo period).
 */
export async function getTargetControlPeers(
  ticker: string,
  companyName: string,
  sector: string | null,
  industry: string | null,
  options?: TargetPeersOptions,
): Promise<string[]> {
  const excluded = options?.excludedTickers ?? new Set<string>();

  // Build cache key including excluded tickers for correctness
  const cacheKeyStr = excluded.size > 0
    ? `${ticker.toUpperCase()}|${Array.from(excluded).sort().join('_')}`
    : ticker.toUpperCase();
  const cacheParams = { ticker: cacheKeyStr };

  const cached = getCached(PEERS_CACHE_NS, cacheParams) as string[] | null;
  if (cached !== null) {
    return cached;
  }

  try {
    const client = new Anthropic({ apiKey: config.anthropicApiKey });

    const prompt = _PEERS_PROMPT
      .replace(/{company_name}/g, companyName)
      .replace(/{ticker}/g, ticker.toUpperCase())
      .replace('{sector}', sector ?? 'unknown')
      .replace('{industry}', industry ?? 'unknown')
      .replace('{market_cap}', fmtMarketCap(options?.marketCap))
      .replace('{sanctions_context}', options?.sanctionsContextStr ?? 'general sanctions risk')
      .replace('{excluded_tickers}', excluded.size > 0 ? Array.from(excluded).sort().join(', ') : 'none');

    const response = await Promise.race([
      client.messages.create({
        model: config.model,
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Claude timeout')), 15_000),
      ),
    ]);

    const textBlock = (response as Anthropic.Message).content[0];
    const rawText = textBlock.type === 'text' ? textBlock.text.trim() : '';

    const rawList = parseClaudeJson(rawText) as unknown[];
    if (!Array.isArray(rawList)) return [];

    // Clean and deduplicate ticker candidates
    const seen = new Set<string>();
    const candidatesClean: string[] = [];
    for (const item of rawList) {
      const t = String(item).trim().replace(/^\$/, '');
      if (INVALID_TICKERS.has(t.toUpperCase())) continue;
      if (!TICKER_RE.test(t)) continue;
      if (t.toUpperCase() === ticker.toUpperCase()) continue;
      if (seen.has(t.toUpperCase())) continue;
      if (excluded.has(t.toUpperCase())) continue;
      seen.add(t.toUpperCase());
      candidatesClean.push(t);
    }

    // Validate each peer exists in Yahoo Finance
    const yf = new YFinanceClient();
    const existenceChecks = await Promise.allSettled(
      candidatesClean.slice(0, 8).map(async (t) => {
        try {
          const now = new Date();
          const monthAgo = new Date(now.getTime() - 30 * 86400 * 1000);
          const hist = await yf.getPriceHistoryRange(
            t,
            monthAgo.toISOString().slice(0, 10),
            now.toISOString().slice(0, 10),
          );
          return hist && hist.length >= 5;
        } catch {
          return false;
        }
      }),
    );

    const peers: string[] = [];
    for (let i = 0; i < candidatesClean.slice(0, 8).length; i++) {
      const result = existenceChecks[i];
      if (result.status === 'fulfilled' && result.value === true) {
        peers.push(candidatesClean[i]);
      }
    }

    const finalPeers = peers.slice(0, 6);
    setCached(finalPeers, PEERS_CACHE_NS, PEERS_CACHE_TTL, cacheParams);
    return finalPeers;
  } catch (err) {
    console.warn(`Target peers: failed for ${ticker}:`, err);
    return [];
  }
}

