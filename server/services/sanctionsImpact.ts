/**
 * sanctionsImpact.ts — TypeScript port of sanctions_impact.py
 *
 * Computes projected stock price impact based on dynamically sourced comparable
 * sanctions cases. Comparable events are sourced via Claude + Yahoo Finance
 * validation, with a static reference dataset as fallback.
 */

import {
  getDynamicComparables,
  getTargetControlPeers,
  fmtMarketCap,
  type ComparableEntry,
} from './comparableSourcer';
import { YFinanceClient } from './market';
import { SanctionsClient } from './sanctions';
import { searchCsl } from './screening';

// ---------------------------------------------------------------------------
// Color palette for chart lines
// ---------------------------------------------------------------------------

export const CHART_COLORS: string[] = [
  '#58a6ff', '#f0883e', '#a371f7', '#3fb950', '#f85149',
  '#db61a2', '#79c0ff', '#d2a8ff', '#56d4dd', '#e3b341',
  '#ff7b72', '#7ee787',
];

// ---------------------------------------------------------------------------
// Curated reference dataset — US-accessible tickers only
// ---------------------------------------------------------------------------

export const SANCTIONS_COMPARABLES: ComparableEntry[] = [
  {
    name: 'ZTE Corp',
    ticker: '0763.HK',
    sanction_date: '2018-04-16',
    description: 'US Commerce Dept denial order — total export ban',
    sector: 'telecom',
    sanction_type: 'ofac_ccmc',
    severity: 'blocking',
    market_cap_tier: 'mid',
  },
  {
    name: 'Alibaba',
    ticker: 'BABA',
    sanction_date: '2020-11-03',
    description: 'ANT Group IPO halted — regulatory crackdown begins',
    sector: 'tech',
    sanction_type: 'ofac_ccmc',
    severity: 'regulatory_crackdown',
    market_cap_tier: 'mega',
  },
  {
    name: 'Full Truck Alliance',
    ticker: 'YMM',
    sanction_date: '2021-07-02',
    description: 'China cybersecurity probe — data security crackdown',
    sector: 'tech',
    sanction_type: 'ofac_ccmc',
    severity: 'regulatory_crackdown',
    market_cap_tier: 'mid',
  },
  {
    name: 'Qualcomm',
    ticker: 'QCOM',
    sanction_date: '2019-05-15',
    description: 'Huawei supply ban — BIS Entity List export restriction',
    sector: 'semiconductors',
    sanction_type: 'us_export_control',
    severity: 'entity_list',
    market_cap_tier: 'large',
    industry: 'chip_designer',
  },
  {
    name: 'Nvidia',
    ticker: 'NVDA',
    sanction_date: '2022-10-07',
    description: 'BIS advanced chip export rule — A100/H100 banned to China',
    sector: 'semiconductors',
    sanction_type: 'us_export_control',
    severity: 'sectoral',
    market_cap_tier: 'mega',
    industry: 'chip_designer',
  },
  {
    name: 'ASML',
    ticker: 'ASML',
    sanction_date: '2023-01-28',
    description: 'Dutch EUV export license revoked — US pressure on Netherlands',
    sector: 'semiconductors',
    sanction_type: 'us_export_control',
    severity: 'sectoral',
    market_cap_tier: 'mega',
    industry: 'chip_equipment',
  },
  {
    name: 'SMIC',
    ticker: '0981.HK',
    sanction_date: '2020-12-18',
    description: 'BIS Entity List — US equipment ban to largest Chinese foundry',
    sector: 'semiconductors',
    sanction_type: 'us_export_control',
    severity: 'entity_list',
    market_cap_tier: 'mid',
    industry: 'chip_foundry',
  },
  {
    name: 'Seagate',
    ticker: 'STX',
    sanction_date: '2023-04-19',
    description: 'BIS $300M fine for Huawei HDD sales violating export rules',
    sector: 'semiconductors',
    sanction_type: 'bis_penalty',
    severity: 'entity_list',
    market_cap_tier: 'mid',
  },
  {
    name: 'Gazprom ADR',
    ticker: 'OGZPY',
    sanction_date: '2022-02-24',
    description: 'EU/US sectoral energy sanctions — Russia Ukraine invasion',
    sector: 'energy',
    sanction_type: 'sectoral',
    severity: 'sectoral',
    market_cap_tier: 'large',
  },
  {
    name: 'Sberbank ADR',
    ticker: 'SBRCY',
    sanction_date: '2022-02-24',
    description: 'SWIFT exclusion — Russia financial sector sanctions',
    sector: 'finance',
    sanction_type: 'swift_cutoff',
    severity: 'blocking',
    market_cap_tier: 'large',
  },
];

// ---------------------------------------------------------------------------
// Sector groupings for filtering
// ---------------------------------------------------------------------------

export const SECTOR_GROUPS: Record<string, string[]> = {
  semiconductors: ['semiconductors', 'tech', 'telecom'],
  tech: ['tech', 'telecom', 'semiconductors', 'surveillance'],
  telecom: ['telecom', 'tech'],
  energy: ['energy'],
  finance: ['finance'],
  metals: ['metals', 'energy'],
  surveillance: ['surveillance', 'tech'],
  biotech: ['biotech', 'tech'],
};

// ---------------------------------------------------------------------------
// Sector benchmark ETFs
// ---------------------------------------------------------------------------

export const SECTOR_BENCHMARK: Record<string, string> = {
  semiconductors: 'SOXX',
  tech: 'QQQ',
  energy: 'XLE',
  finance: 'XLF',
  metals: 'XME',
  telecom: 'IYZ',
  surveillance: 'QQQ',
  biotech: 'XBI',
};

const DEFAULT_BENCHMARK = 'SPY';

// ---------------------------------------------------------------------------
// Window constants
// ---------------------------------------------------------------------------

export const PRE_DAYS = 60;
export const POST_DAYS = 120;

// ---------------------------------------------------------------------------
// Severity adjacency map
// ---------------------------------------------------------------------------

const SEVERITY_ADJACENCY: Record<string, Set<string>> = {
  blocking: new Set(['entity_list']),
  entity_list: new Set(['blocking', 'sectoral']),
  sectoral: new Set(['entity_list', 'delisting_threat']),
  delisting_threat: new Set(['sectoral', 'regulatory_crackdown']),
  regulatory_crackdown: new Set(['delisting_threat']),
};

const CAP_TIERS = ['mega', 'large', 'mid', 'small'] as const;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CurvePoint {
  day: number;
  pct: number;
}

export interface ProjectionPoint {
  day: number;
  pct: number;
  price: number;
}

export interface ComparableCurve {
  name: string;
  ticker: string;
  sanction_date: string;
  description: string;
  sector: string;
  sanction_type: string;
  industry: string;
  color: string;
  curve: CurvePoint[];
}

export interface ProjectionSummary {
  pre_event_decline?: number;
  day_30_post?: number;
  day_30_range?: [number, number];
  day_60_post?: number;
  day_60_range?: [number, number];
  day_90_post?: number;
  day_90_range?: [number, number];
  max_drawdown?: number;
  shock_trough?: number;
  recovery_day?: number | null;
  terminal_pct?: number;
}

export interface Projection {
  mean: ProjectionPoint[];
  upper: ProjectionPoint[];
  lower: ProjectionPoint[];
  summary: ProjectionSummary;
  coherence_score?: number;
  coherence_low?: boolean;
}

export interface TargetInfo {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  country: string;
  market_cap: number | null;
  current_price: number | null;
  change_pct: number | null;
  sanctions_status?: SanctionsContext;
  _recent_prices_30d?: number[];
}

export interface SanctionsContext {
  is_sanctioned: boolean;
  lists: string[];
  programs: string[];
  csl_matches: Array<{
    name: string;
    source: string;
    programs: string[];
    start_date?: string;
  }>;
}

export interface SanctionsImpactResult {
  target: TargetInfo;
  comparables: ComparableCurve[];
  projection: Projection;
  control_comparables: ComparableCurve[];
  control_projection: Projection;
  metadata: {
    comparable_count: number;
    control_peer_count: number;
    control_peer_tickers: string[];
    time_window_days: [number, number];
    generated_at: string;
    sourcing_method: string;
    inferred_severity: string | null;
    inferred_cap_tier: string;
  };
}

export interface ComputeProjectionOptions {
  targetSector?: string | null;
  targetSanctionType?: string | null;
  targetPrices30d?: number[] | null;
  targetSeverity?: string | null;
  targetCapTier?: string | null;
}

// ---------------------------------------------------------------------------
// Weight helpers
// ---------------------------------------------------------------------------

function severityWeight(targetSev: string | null | undefined, compSev: string | null | undefined): number {
  if (!targetSev || !compSev) return 0.7;
  if (targetSev === compSev) return 1.0;
  if (SEVERITY_ADJACENCY[targetSev]?.has(compSev)) return 0.6;
  return 0.3;
}

function capTierWeight(targetTier: string | null | undefined, compTier: string | null | undefined): number {
  if (!targetTier || !compTier) return 0.7;
  const tIdx = CAP_TIERS.indexOf(targetTier as typeof CAP_TIERS[number]);
  const cIdx = CAP_TIERS.indexOf(compTier as typeof CAP_TIERS[number]);
  if (tIdx === -1 || cIdx === -1) return 0.7;
  const diff = Math.abs(tIdx - cIdx);
  if (diff === 0) return 1.0;
  if (diff === 1) return 0.7;
  return 0.4;
}

// ---------------------------------------------------------------------------
// inferCapTier
// ---------------------------------------------------------------------------

export function inferCapTier(marketCap: number | null | undefined): string {
  if (!marketCap || marketCap <= 0) return 'mid';
  if (marketCap >= 200e9) return 'mega';
  if (marketCap >= 20e9) return 'large';
  if (marketCap >= 2e9) return 'mid';
  return 'small';
}

// ---------------------------------------------------------------------------
// getTargetInfo
// ---------------------------------------------------------------------------

export async function getTargetInfo(ticker: string): Promise<TargetInfo> {
  const yf = new YFinanceClient();
  const [profile, price] = await Promise.all([
    yf.getStockProfile(ticker),
    yf.getPriceData(ticker, '1y'),
  ]);

  const recentPrices30d = (price.historical ?? [])
    .slice(-30)
    .map((h) => h.close)
    .filter((c): c is number => c !== null);

  return {
    ticker: ticker.toUpperCase(),
    name: profile.name,
    sector: profile.sector,
    industry: profile.industry,
    country: profile.country,
    market_cap: profile.marketCap,
    current_price: price.currentPrice,
    change_pct: price.changePct,
    _recent_prices_30d: recentPrices30d,
  };
}

// ---------------------------------------------------------------------------
// getSanctionsContext
// ---------------------------------------------------------------------------

export async function getSanctionsContext(
  ticker: string,
  companyName: string,
): Promise<SanctionsContext> {
  const result: SanctionsContext = {
    is_sanctioned: false,
    lists: [],
    programs: [],
    csl_matches: [],
  };

  // OFAC + OpenSanctions check
  try {
    const sanctionsClient = new SanctionsClient();
    const status = await sanctionsClient.checkStatus(companyName);
    result.is_sanctioned = status.isSanctioned;
    result.lists = status.listsFound;
    result.programs = status.programs;
  } catch (e) {
    console.warn(`Sanctions check failed for ${ticker} (continuing):`, e);
  }

  // Trade.gov CSL check
  try {
    const cslResults = await searchCsl(companyName);
    result.csl_matches = cslResults.slice(0, 10).map((m: unknown) => {
      const rec = m as { name?: string; source?: string; programs?: string[]; start_date?: string };
      return {
        name: rec.name ?? '',
        source: rec.source ?? '',
        programs: rec.programs ?? [],
        start_date: rec.start_date,
      };
    });
  } catch (e) {
    console.warn(`CSL check failed for ${ticker} (continuing):`, e);
  }

  return result;
}

// ---------------------------------------------------------------------------
// fetchComparableCurve
// ---------------------------------------------------------------------------

export async function fetchComparableCurve(
  comp: ComparableEntry,
  color: string,
): Promise<ComparableCurve | null> {
  const ticker = comp.ticker;
  if (!ticker) return null;

  const sanctionDateStr = comp.sanction_date;
  const sanctionDt = new Date(`${sanctionDateStr}T00:00:00Z`);
  if (isNaN(sanctionDt.getTime())) return null;

  // 120 days before to 240 days after
  const startDt = new Date(sanctionDt.getTime() - 120 * 86400 * 1000);
  const endDt = new Date(sanctionDt.getTime() + 240 * 86400 * 1000);
  const startStr = startDt.toISOString().slice(0, 10);
  const endStr = endDt.toISOString().slice(0, 10);

  const sector = comp.sector ?? '';
  const benchmarkTicker = SECTOR_BENCHMARK[sector] ?? DEFAULT_BENCHMARK;

  const yf = new YFinanceClient();
  let historical, benchmarkHist;
  try {
    [historical, benchmarkHist] = await Promise.all([
      yf.getPriceHistoryRange(ticker, startStr, endStr),
      yf.getPriceHistoryRange(benchmarkTicker, startStr, endStr),
    ]);
  } catch {
    console.warn(`Failed to fetch price data for ${ticker}`);
    return null;
  }

  if (!historical || historical.length < 20) {
    console.warn(`Insufficient data for ${ticker} (${historical?.length ?? 0} points)`);
    return null;
  }

  // Build date→price maps
  const pricesByDate = new Map<string, number>();
  for (const hp of historical) {
    if (hp.close !== null) pricesByDate.set(hp.date, hp.close);
  }

  const benchmarkByDate = new Map<string, number>();
  for (const hp of (benchmarkHist ?? [])) {
    if (hp.close !== null) benchmarkByDate.set(hp.date, hp.close);
  }

  // Find event price: walk back up to 10 days to find a trading day
  function getEventPrice(priceMap: Map<string, number>): number | null {
    for (let off = 0; off < 10; off++) {
      const d = new Date(sanctionDt.getTime() - off * 86400 * 1000)
        .toISOString()
        .slice(0, 10);
      if (priceMap.has(d)) return priceMap.get(d)!;
    }
    return null;
  }

  const sanctionPrice = getEventPrice(pricesByDate);
  if (sanctionPrice === null || sanctionPrice === 0) {
    console.warn(`No sanction-date price for ${ticker}`);
    return null;
  }

  const benchmarkEventPrice = getEventPrice(benchmarkByDate);

  // Build sorted (date, price) list
  const datedPrices: Array<{ date: string; dt: Date; price: number }> = [];
  for (const [dateStr, price] of pricesByDate) {
    const dt = new Date(`${dateStr}T00:00:00Z`);
    if (!isNaN(dt.getTime())) {
      datedPrices.push({ date: dateStr, dt, price });
    }
  }
  datedPrices.sort((a, b) => a.dt.getTime() - b.dt.getTime());

  // Find sanction-date trading-day index
  let sanctionIdx = datedPrices.length - 1;
  for (let i = 0; i < datedPrices.length; i++) {
    if (datedPrices[i].date >= sanctionDateStr) {
      sanctionIdx = i;
      break;
    }
  }

  // Forward-fill benchmark prices to handle holiday gaps
  let lastKnownBench: number | null = benchmarkEventPrice;

  const tradingDays: CurvePoint[] = [];
  for (let i = 0; i < datedPrices.length; i++) {
    const { date: dateStr, price } = datedPrices[i];
    const dayOffset = i - sanctionIdx;

    if (dayOffset < -PRE_DAYS || dayOffset > POST_DAYS) continue;

    const rawPct = ((price - sanctionPrice) / sanctionPrice) * 100;

    let excessPct = rawPct;
    if (benchmarkEventPrice && benchmarkEventPrice !== 0) {
      const benchPrice = benchmarkByDate.get(dateStr);
      if (benchPrice) lastKnownBench = benchPrice;
      if (lastKnownBench && lastKnownBench !== 0) {
        const benchmarkPct = ((lastKnownBench - benchmarkEventPrice) / benchmarkEventPrice) * 100;
        excessPct = rawPct - benchmarkPct;
      }
    }

    tradingDays.push({ day: dayOffset, pct: Math.round(excessPct * 100) / 100 });
  }

  if (tradingDays.length < 20) return null;

  return {
    name: comp.name,
    ticker,
    sanction_date: sanctionDateStr,
    description: comp.description,
    sector,
    sanction_type: comp.sanction_type ?? '',
    industry: comp.industry ?? '',
    color,
    curve: tradingDays,
  };
}

// ---------------------------------------------------------------------------
// getComparableCurves
// ---------------------------------------------------------------------------

export async function getComparableCurves(
  comparables: ComparableEntry[],
  industryFilter?: string | null,
): Promise<ComparableCurve[]> {
  // Sub-filter by chip industry type when ≥3 matching entries exist
  if (industryFilter) {
    const industryFiltered = comparables.filter((c) => c.industry === industryFilter);
    if (industryFiltered.length >= 3) comparables = industryFiltered;
  }

  // Deduplicate by ticker — keep first occurrence
  const seenTickers = new Set<string>();
  const deduped: ComparableEntry[] = [];
  for (const c of comparables) {
    const t = (c.ticker ?? '').toUpperCase();
    if (t && !seenTickers.has(t)) {
      seenTickers.add(t);
      deduped.push(c);
    }
  }

  const results = await Promise.allSettled(
    deduped.map((comp, i) =>
      fetchComparableCurve(comp, CHART_COLORS[i % CHART_COLORS.length]),
    ),
  );

  const curves: ComparableCurve[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value !== null) {
      curves.push(result.value);
    } else if (result.status === 'rejected') {
      console.warn('Comparable curve fetch error:', result.reason);
    }
  }

  return curves;
}

// ---------------------------------------------------------------------------
// getControlCurves
// ---------------------------------------------------------------------------

export async function getControlCurves(
  rawComparables: ComparableEntry[],
  targetPeers: string[],
): Promise<ComparableCurve[]> {
  // Tickers already in the comparable (sanctioned) group
  const comparableTickers = new Set(
    rawComparables
      .map((c) => (c.ticker ?? '').toUpperCase())
      .filter(Boolean),
  );

  let resolvedPeers = targetPeers;

  // Fallback: source peers for each comparable individually
  if (resolvedPeers.length === 0) {
    const peerResults = await Promise.allSettled(
      rawComparables
        .filter((c) => c.ticker)
        .map((comp) =>
          getTargetControlPeers(
            comp.ticker,
            comp.name ?? comp.ticker,
            comp.sector ?? null,
            comp.industry ?? null,
          ),
        ),
    );
    const fallbackSet = new Set<string>();
    for (const r of peerResults) {
      if (r.status === 'fulfilled') {
        for (const t of r.value) fallbackSet.add(t);
      }
    }
    resolvedPeers = Array.from(fallbackSet);
  }

  if (resolvedPeers.length === 0) return [];

  // Build (peer, sanction_date) task list, deduping repeated windows
  const tasks: Array<Promise<ComparableCurve | null>> = [];
  const seenPeerWindows = new Set<string>();
  let colorIdx = 0;

  for (const comp of rawComparables) {
    const sanctionDate = comp.sanction_date;
    for (const peerTicker of resolvedPeers) {
      const peerUpper = peerTicker.toUpperCase();
      if (comparableTickers.has(peerUpper)) continue;

      const windowKey = `${peerUpper}|${sanctionDate}`;
      if (seenPeerWindows.has(windowKey)) continue;
      seenPeerWindows.add(windowKey);

      const peerComp: ComparableEntry = {
        ticker: peerTicker,
        sanction_date: sanctionDate,
        sector: comp.sector ?? '',
        name: peerTicker,
        description: 'Non-sanctioned peer',
        sanction_type: comp.sanction_type ?? '',
        severity: '',
        market_cap_tier: '',
        industry: '',
      };
      tasks.push(
        fetchComparableCurve(peerComp, CHART_COLORS[colorIdx % CHART_COLORS.length]),
      );
      colorIdx++;
    }
  }

  if (tasks.length === 0) return [];

  const results = await Promise.allSettled(tasks);
  const rawCurves: ComparableCurve[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value !== null) {
      rawCurves.push(r.value);
    } else if (r.status === 'rejected') {
      console.warn('Control peer curve fetch error:', r.reason);
    }
  }

  // Aggregate: each peer appears once, excess return averaged across event windows
  const curvesByTicker = new Map<string, ComparableCurve[]>();
  for (const c of rawCurves) {
    const arr = curvesByTicker.get(c.ticker) ?? [];
    arr.push(c);
    curvesByTicker.set(c.ticker, arr);
  }

  const aggregated: ComparableCurve[] = [];
  for (const [tickerStr, tickerCurves] of curvesByTicker) {
    // Average pct at each day across all event windows
    const dayPcts = new Map<number, number[]>();
    for (const c of tickerCurves) {
      for (const pt of c.curve) {
        const arr = dayPcts.get(pt.day) ?? [];
        arr.push(pt.pct);
        dayPcts.set(pt.day, arr);
      }
    }

    const avgCurve: CurvePoint[] = Array.from(dayPcts.entries())
      .sort(([a], [b]) => a - b)
      .map(([day, pcts]) => ({
        day,
        pct: Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100) / 100,
      }));

    const ref = tickerCurves[0];
    aggregated.push({
      name: tickerStr,
      ticker: tickerStr,
      sanction_date: '',
      description: `Non-sanctioned peer (avg ${tickerCurves.length} windows)`,
      sector: ref.sector,
      sanction_type: '',
      industry: '',
      color: ref.color,
      curve: avgCurve,
    });
  }

  return aggregated;
}

// ---------------------------------------------------------------------------
// computeProjection
// ---------------------------------------------------------------------------

export function computeProjection(
  comparableCurves: ComparableCurve[],
  targetCurrentPrice: number,
  options?: ComputeProjectionOptions,
): Projection {
  const empty: Projection = { mean: [], upper: [], lower: [], summary: {} };
  if (!comparableCurves.length || !targetCurrentPrice) return empty;

  const today = new Date();

  // Count events per sanction_date for cluster dedup weighting
  const dateCounts = new Map<string, number>();
  for (const c of comparableCurves) {
    const d = c.sanction_date ?? '';
    dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1);
  }

  // Per-curve weight components: [base_w, sev_w]
  // base_w includes everything except severity so the per-day loop can apply
  // a phase-dependent severity exponent.
  let curveWeightParts: Array<[number, number]> = comparableCurves.map((curveData) => {
    let years = 5.0;
    try {
      const eventDt = new Date(`${curveData.sanction_date}T00:00:00Z`);
      years = (today.getTime() - eventDt.getTime()) / (365.25 * 86400 * 1000);
    } catch { /* keep 5 years */ }
    const recency = Math.exp(-0.10 * years);

    const sectorW = (options?.targetSector && curveData.sector === options.targetSector) ? 1.0 : 0.5;
    const typeW = (options?.targetSanctionType && curveData.sanction_type === options.targetSanctionType) ? 1.0 : 0.5;

    const clusterN = dateCounts.get(curveData.sanction_date ?? '') ?? 1;
    const clusterW = 1.0 / Math.max(clusterN, 1);

    const sevW = severityWeight(options?.targetSeverity, (curveData as unknown as ComparableEntry).severity);
    const capW = capTierWeight(options?.targetCapTier, (curveData as unknown as ComparableEntry).market_cap_tier);

    const baseW = recency * sectorW * typeW * clusterW * capW;
    return [baseW, sevW];
  });

  let curves = [...comparableCurves];

  // --- Trimmed mean: drop top/bottom 20% by day-30 excess return if ≥5 curves ---
  if (curves.length >= 5) {
    const day30Vals: number[] = curves.map((curveData) => {
      const pts = new Map(curveData.curve.map((p) => [p.day, p.pct]));
      const near = Array.from(pts.keys()).filter((d) => d >= 0 && d <= 40);
      if (near.length === 0) return 0;
      const closest = near.reduce((a, b) => Math.abs(a - 30) < Math.abs(b - 30) ? a : b);
      return pts.get(closest) ?? 0;
    });

    const n = curves.length;
    const trim = Math.max(1, Math.floor(n / 5));
    const sorted = [...Array(n).keys()].sort((a, b) => day30Vals[a] - day30Vals[b]);
    const keepSet = new Set(sorted.slice(trim, n - trim));
    curves = curves.filter((_, i) => keepSet.has(i));
    curveWeightParts = curveWeightParts.filter((_, i) => keepSet.has(i));
  }

  // --- Coherence score: directional agreement at day 30 ---
  let coherenceScore = 1.0;
  if (curves.length > 0) {
    const day30Signs: boolean[] = [];
    for (const curveData of curves) {
      const pts = new Map(curveData.curve.map((p) => [p.day, p.pct]));
      const near = Array.from(pts.keys()).filter((d) => d >= 0 && d <= 40);
      if (near.length > 0) {
        const closest = near.reduce((a, b) => Math.abs(a - 30) < Math.abs(b - 30) ? a : b);
        day30Signs.push((pts.get(closest) ?? 0) < 0);
      }
    }
    if (day30Signs.length > 0) {
      const negFrac = day30Signs.filter(Boolean).length / day30Signs.length;
      coherenceScore = Math.max(negFrac, 1.0 - negFrac);
    }
  }
  const coherenceLow = coherenceScore < 0.65;

  // --- Realized volatility → band scaling ---
  let bandScale = 1.0;
  const prices30d = options?.targetPrices30d ?? [];
  if (prices30d.length >= 5) {
    const dailyReturns: number[] = [];
    for (let i = 1; i < prices30d.length; i++) {
      if (prices30d[i - 1] !== 0) {
        dailyReturns.push(prices30d[i] / prices30d[i - 1] - 1);
      }
    }
    if (dailyReturns.length > 0) {
      const meanR = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((a, r) => a + (r - meanR) ** 2, 0) / dailyReturns.length;
      const realizedVol = Math.sqrt(variance) * Math.sqrt(252);
      bandScale = Math.max(0.5, Math.min(2.0, realizedVol / 0.30));
    }
  }

  // --- Build per-day entries ---
  const allDayEntries = new Map<number, Array<[number, number]>>(); // day → [(curve_idx, pct)]
  for (let i = 0; i < curves.length; i++) {
    for (const point of curves[i].curve) {
      const arr = allDayEntries.get(point.day) ?? [];
      arr.push([i, point.pct]);
      allDayEntries.set(point.day, arr);
    }
  }

  const meanCurve: ProjectionPoint[] = [];
  const upperBand: ProjectionPoint[] = [];
  const lowerBand: ProjectionPoint[] = [];

  for (const day of Array.from(allDayEntries.keys()).sort((a, b) => a - b)) {
    const entries = allDayEntries.get(day)!;
    if (entries.length < 2) continue;

    // Two-phase severity exponent: shock phase (1.5) → structural phase (1.0)
    let sevExp: number;
    if (day <= 7) {
      sevExp = 1.5;
    } else if (day <= 12) {
      sevExp = 1.5 - 0.1 * (day - 7);
    } else {
      sevExp = 1.0;
    }

    const rawWeights: number[] = [];
    const pcts: number[] = [];
    for (const [curveIdx, pct] of entries) {
      const [baseW, sevW] = curveWeightParts[curveIdx];
      rawWeights.push(baseW * Math.pow(sevW, sevExp));
      pcts.push(pct);
    }

    const dayTotal = rawWeights.reduce((a, b) => a + b, 0) || 1.0;
    const dayW = rawWeights.map((w) => w / dayTotal);

    const meanPct = dayW.reduce((acc, w, idx) => acc + w * pcts[idx], 0);
    const variance = dayW.reduce((acc, w, idx) => acc + w * (pcts[idx] - meanPct) ** 2, 0);
    const stdPct = Math.sqrt(variance);
    const scaledStd = bandScale * stdPct;

    const projectedPrice = targetCurrentPrice * (1 + meanPct / 100);
    const upperPrice = targetCurrentPrice * (1 + (meanPct + scaledStd) / 100);
    const lowerPrice = targetCurrentPrice * (1 + (meanPct - scaledStd) / 100);

    meanCurve.push({ day, pct: Math.round(meanPct * 100) / 100, price: Math.round(projectedPrice * 100) / 100 });
    upperBand.push({ day, pct: Math.round((meanPct + scaledStd) * 100) / 100, price: Math.round(upperPrice * 100) / 100 });
    lowerBand.push({ day, pct: Math.round((meanPct - scaledStd) * 100) / 100, price: Math.round(lowerPrice * 100) / 100 });
  }

  // --- Summary ---
  const summary: ProjectionSummary = {};

  const prePcts = meanCurve.filter((p) => p.day < 0).map((p) => p.pct);
  if (prePcts.length > 0) {
    summary.pre_event_decline = Math.round(-prePcts[0] * 100) / 100;
  }

  const postPctsByDay = new Map(meanCurve.filter((p) => p.day >= 0).map((p) => [p.day, p.pct]));
  const upperPtsByDay = new Map(upperBand.filter((p) => p.day >= 0).map((p) => [p.day, p.pct]));
  const lowerPtsByDay = new Map(lowerBand.filter((p) => p.day >= 0).map((p) => [p.day, p.pct]));

  for (const [label, targetDay] of [['day_30', 30], ['day_60', 60], ['day_90', 90]] as const) {
    const candidates = Array.from(postPctsByDay.keys()).filter((d) => d <= targetDay);
    if (candidates.length > 0) {
      const nearest = Math.max(...candidates);
      summary[`${label}_post` as keyof ProjectionSummary] = postPctsByDay.get(nearest) as never;

      const uCandidates = Array.from(upperPtsByDay.keys()).filter((d) => d <= targetDay);
      const lCandidates = Array.from(lowerPtsByDay.keys()).filter((d) => d <= targetDay);
      if (uCandidates.length > 0 && lCandidates.length > 0) {
        const uNearest = Math.max(...uCandidates);
        const lNearest = Math.max(...lCandidates);
        summary[`${label}_range` as keyof ProjectionSummary] = [
          Math.round((lowerPtsByDay.get(lNearest) ?? 0) * 100) / 100,
          Math.round((upperPtsByDay.get(uNearest) ?? 0) * 100) / 100,
        ] as never;
      }
    }
  }

  const allMeanPcts = meanCurve.map((p) => p.pct);
  if (allMeanPcts.length > 0) {
    summary.max_drawdown = Math.round(Math.min(...allMeanPcts) * 100) / 100;
  }

  // Shock trough: minimum mean excess return in days 0-10
  const shockPts = meanCurve.filter((p) => p.day >= 0 && p.day <= 10).map((p) => p.pct);
  if (shockPts.length > 0) {
    summary.shock_trough = Math.round(Math.min(...shockPts) * 100) / 100;
  }

  // Recovery day: first day after trough where mean recovers 50% of drawdown
  const postMeanPts = meanCurve.filter((p) => p.day >= 0);
  if (postMeanPts.length > 0) {
    const troughPct = Math.min(...postMeanPts.map((p) => p.pct));
    const troughDay = postMeanPts.find((p) => p.pct === troughPct)!.day;
    const recoveryThreshold = troughPct < 0 ? troughPct * 0.5 : 0;
    let recoveryDay: number | null = null;
    for (const p of postMeanPts) {
      if (p.day > troughDay && p.pct >= recoveryThreshold) {
        recoveryDay = p.day;
        break;
      }
    }
    summary.recovery_day = recoveryDay;
    summary.terminal_pct = postMeanPts[postMeanPts.length - 1].pct;
  }

  return {
    mean: meanCurve,
    upper: upperBand,
    lower: lowerBand,
    summary,
    coherence_score: Math.round(coherenceScore * 1000) / 1000,
    coherence_low: coherenceLow,
  };
}

// ---------------------------------------------------------------------------
// runSanctionsImpact — top-level entry point
// ---------------------------------------------------------------------------

export async function runSanctionsImpact(ticker: string): Promise<SanctionsImpactResult> {
  // Fetch target info
  let targetInfo: TargetInfo;
  try {
    targetInfo = await getTargetInfo(ticker);
  } catch (e) {
    throw new Error(`Could not find data for ticker '${ticker}'. Check the symbol and try again.`);
  }

  const companyName = targetInfo.name || ticker;

  // Start sanctions context fetch in the background
  const sanctionsTask = getSanctionsContext(ticker, companyName);

  // Normalize sector
  const sectorRaw = (targetInfo.sector ?? '').toLowerCase();
  const sectorMap: Record<string, string> = {
    technology: 'tech',
    'communication services': 'telecom',
    semiconductors: 'semiconductors',
    energy: 'energy',
    'financial services': 'finance',
    financials: 'finance',
    'basic materials': 'metals',
    healthcare: 'biotech',
  };
  const mappedSector = sectorMap[sectorRaw] ?? sectorRaw;

  const sanctionsContext = await sanctionsTask;

  const countryRaw = (targetInfo.country ?? '').toLowerCase();

  // Helper predicates
  const isWestern = (c: string) =>
    ['united states', 'netherlands', 'germany', 'france', 'united kingdom',
      'japan', 'korea', 'taiwan', 'australia', 'canada', 'israel', 'sweden',
      'finland', 'singapore'].some((k) => c.includes(k));
  const isChinese = (c: string) => c.includes('china') || c === 'hong kong' || c === 'hk';
  const isRussian = (c: string) => c.includes('russia');

  const industryRaw = (targetInfo.industry ?? '').toLowerCase();

  // Infer sanction type
  let inferredSanctionType: string | null = null;

  if (isRussian(countryRaw) && ['finance', 'financials'].includes(mappedSector)) {
    inferredSanctionType = 'swift_cutoff';
  } else if (isRussian(countryRaw) && ['energy', 'metals'].includes(mappedSector)) {
    inferredSanctionType = 'sectoral';
  } else if (
    isChinese(countryRaw) && (
      ['tech', 'telecom', 'semiconductors', 'surveillance'].includes(mappedSector) ||
      ['internet', 'software', 'e-commerce', 'electronic', 'semiconductor'].some((k) => industryRaw.includes(k))
    )
  ) {
    inferredSanctionType = 'ofac_ccmc';
  } else if (isWestern(countryRaw) && ['semiconductors', 'tech', 'telecom'].includes(mappedSector)) {
    inferredSanctionType = 'us_export_control';
  }

  // Override based on actual sanctions status
  const programs = (sanctionsContext.programs ?? []).map((p) => p.toUpperCase());
  const cslSources = (sanctionsContext.csl_matches ?? []).map((m) => (m.source ?? '').toLowerCase());

  if (cslSources.some((s) => s.includes('entity list') || s.includes('bis'))) {
    inferredSanctionType = 'us_export_control';
  } else if (
    programs.some((p) =>
      ['UKRAINE-EO13661', 'RUSSIA-EO14024', 'IRAN', 'CUBA', 'DPRK', 'SYRIA'].includes(p),
    )
  ) {
    inferredSanctionType = 'sectoral';
  } else if (programs.some((p) => p.toLowerCase().includes('swift'))) {
    inferredSanctionType = 'swift_cutoff';
  }

  // Infer semiconductor sub-industry
  const FOUNDRY_KEYWORDS = ['foundry', 'contract manufactur', 'wafer fabricat', 'wafer foundry',
    'logic foundry', 'fab ', 'fabrication services'];
  const EQUIPMENT_KEYWORDS = ['equipment', 'materials', 'systems', 'instruments', 'photonics',
    'laser', 'lithograph', 'etch', 'deposition', 'metrology'];
  const DESIGNER_KEYWORDS = ['semiconductor', 'computing', 'microelectronics', 'fabless',
    'integrated circuit', 'chip design', 'ic design'];

  let inferredIndustry: string | null = null;
  if (mappedSector === 'semiconductors' || industryRaw.includes('semiconductor')) {
    if (FOUNDRY_KEYWORDS.some((k) => industryRaw.includes(k))) {
      inferredIndustry = 'chip_foundry';
    } else if (EQUIPMENT_KEYWORDS.some((k) => industryRaw.includes(k))) {
      inferredIndustry = 'chip_equipment';
    } else if (DESIGNER_KEYWORDS.some((k) => industryRaw.includes(k)) || mappedSector === 'semiconductors') {
      inferredIndustry = 'chip_designer';
    }
  }

  // Extract and remove internal 30-day prices
  const recentPrices30d = targetInfo._recent_prices_30d ?? [];
  delete targetInfo._recent_prices_30d;

  // Infer severity
  let inferredSeverity: string | null = null;
  if (inferredSanctionType === 'swift_cutoff') {
    inferredSeverity = 'blocking';
  } else if (inferredSanctionType === 'ofac_ccmc') {
    inferredSeverity = sanctionsContext.is_sanctioned ? 'blocking' : 'regulatory_crackdown';
  } else if (inferredSanctionType === 'us_export_control') {
    const hasEntityList = cslSources.some((s) => s.includes('entity list'));
    inferredSeverity = hasEntityList ? 'entity_list' : 'sectoral';
  } else if (inferredSanctionType === 'sectoral') {
    inferredSeverity = 'sectoral';
  } else if (inferredSanctionType === 'bis_penalty' || inferredSanctionType === 'retaliation') {
    inferredSeverity = 'entity_list';
  }

  const targetMarketCap = targetInfo.market_cap;
  const targetCapTier = inferCapTier(targetMarketCap);

  // Get dynamic comparables
  const [rawComparables, sourcingMethod] = await getDynamicComparables(
    mappedSector || null,
    inferredSanctionType,
    targetInfo.country || null,
    SANCTIONS_COMPARABLES,
    SECTOR_GROUPS,
    {
      severity: inferredSeverity ?? undefined,
      marketCap: targetMarketCap ?? undefined,
      subSector: industryRaw || undefined,
    },
  );

  // Collect sanctioned comparable tickers for cross-list dedup
  const usedTickers = new Set(
    rawComparables
      .map((c) => (c.ticker ?? '').toUpperCase())
      .filter(Boolean),
  );

  // Build sanctions context string for peers prompt
  const ctxParts = [inferredSanctionType ?? 'general'];
  if (inferredSeverity) ctxParts.push(`severity: ${inferredSeverity}`);
  if (sanctionsContext.programs.length > 0) {
    ctxParts.push(`programs: ${sanctionsContext.programs.slice(0, 3).join(', ')}`);
  }
  const sanctionsContextStr = ctxParts.join('; ');

  // Fetch target-similar peers and comparable curves in parallel
  const [targetPeers, curves] = await Promise.all([
    getTargetControlPeers(
      ticker,
      companyName,
      mappedSector || null,
      industryRaw || null,
      {
        marketCap: targetMarketCap ?? undefined,
        excludedTickers: usedTickers,
        sanctionsContextStr,
      },
    ),
    getComparableCurves(rawComparables, inferredIndustry),
  ]);

  // Belt-and-suspenders: filter out any control peers that overlap with comparables
  const filteredPeers = targetPeers.filter((t) => !usedTickers.has(t.toUpperCase()));

  const controlCurves = await getControlCurves(rawComparables, filteredPeers);

  const currentPrice = targetInfo.current_price ?? 0;
  const projectionOpts: ComputeProjectionOptions = {
    targetSector: mappedSector || null,
    targetSanctionType: inferredSanctionType,
    targetPrices30d: recentPrices30d,
    targetSeverity: inferredSeverity,
    targetCapTier,
  };

  const projection = computeProjection(curves, currentPrice, projectionOpts);
  const controlProjection = computeProjection(controlCurves, currentPrice, projectionOpts);

  targetInfo.sanctions_status = sanctionsContext;

  return {
    target: targetInfo,
    comparables: curves,
    projection,
    control_comparables: controlCurves,
    control_projection: controlProjection,
    metadata: {
      comparable_count: curves.length,
      control_peer_count: controlCurves.length,
      control_peer_tickers: filteredPeers,
      time_window_days: [-PRE_DAYS, POST_DAYS],
      generated_at: new Date().toISOString(),
      sourcing_method: sourcingMethod,
      inferred_severity: inferredSeverity,
      inferred_cap_tier: targetCapTier,
    },
  };
}
