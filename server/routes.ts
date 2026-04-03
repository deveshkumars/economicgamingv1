/**
 * routes.ts — All API route handlers for the Economic Warfare OSINT backend.
 *
 * Ports Python FastAPI api.py to Express Router.
 * Each endpoint is registered as Express middleware.
 */

import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config';
import { ToolRegistry } from './services/toolRegistry';
import { Orchestrator } from './services/orchestrator';
import { resolveEntityType } from './services/entityResolver';
import { runSanctionsImpact, SANCTIONS_COMPARABLES } from './services/sanctionsImpact';
import {
  OFACClient,
  SanctionsClient,
  cslToEntries,
} from './services/sanctions';
import { searchCsl } from './services/screening';
import {
  gleifSearchLei,
  gleifGetDirectParent,
  gleifGetUltimateParent,
  ocSearchOfficers,
  icijSearch,
} from './services/corporate';
import {
  getSayariClient,
  getVesselIntel,
} from './services/sayari';
import {
  vesselFind,
  vesselByMmsi,
  vesselByImo,
  vesselHistory,
  vesselPortCalls,
  inferPortStops,
} from './services/vessels';
import { gdeltDocSearch } from './services/geopolitical';
import { yfinanceClient } from './services/market';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// ---------------------------------------------------------------------------
// In-memory analysis store
// ---------------------------------------------------------------------------

interface AnalysisRecord {
  status: 'running' | 'complete' | 'error';
  progress: string[];
  result: unknown | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

const _analyses = new Map<string, AnalysisRecord>();

// ---------------------------------------------------------------------------
// Country risk mappings
// ---------------------------------------------------------------------------

export const _HIGH_RISK_COUNTRIES = new Set([
  'RU', 'Russia', 'Russian Federation',
  'IR', 'Iran', 'Islamic Republic of Iran',
  'KP', 'North Korea', "Korea, Democratic People's Republic of",
  'SY', 'Syria', 'Syrian Arab Republic',
  'CU', 'Cuba',
  'BY', 'Belarus',
  'SD', 'Sudan',
  'MM', 'Myanmar', 'Burma',
  'ZW', 'Zimbabwe',
  'VE', 'Venezuela', 'Bolivarian Republic of Venezuela',
  'NI', 'Nicaragua',
  'LY', 'Libya', 'State of Libya',
  'YE', 'Yemen', 'Republic of Yemen',
  'SO', 'Somalia',
  'CF', 'Central African Republic',
  'SS', 'South Sudan', 'Republic of South Sudan',
  'HT', 'Haiti',
  'ML', 'Mali',
  'BF', 'Burkina Faso',
  'GN', 'Guinea',
]);

export const _ELEVATED_RISK_COUNTRIES = new Set([
  'CN', 'China', "People's Republic of China",
  'HK', 'Hong Kong',
  'AE', 'United Arab Emirates',
  'TR', 'Turkey', 'Türkiye',
  'PK', 'Pakistan',
  'AF', 'Afghanistan',
  'IQ', 'Iraq',
  'LB', 'Lebanon',
  'ET', 'Ethiopia',
  'NG', 'Nigeria',
  'AO', 'Angola',
  'CG', 'Congo',
  'CD', 'Democratic Republic of the Congo',
  'TZ', 'Tanzania',
  'KE', 'Kenya',
  'GH', 'Ghana',
  'TH', 'Thailand',
  'KH', 'Cambodia',
  'LA', 'Laos', "Lao People's Democratic Republic",
  'UZ', 'Uzbekistan',
  'TM', 'Turkmenistan',
  'AZ', 'Azerbaijan',
  'GE', 'Georgia',
  'UA', 'Ukraine',
  'MK', 'North Macedonia',
  'RS', 'Serbia',
  'KG', 'Kyrgyzstan',
  'TJ', 'Tajikistan',
  'KZ', 'Kazakhstan',
]);

export const _COUNTRY_NAME_TO_ISO: Record<string, string> = {
  'United States': 'US',
  'United States of America': 'US',
  'USA': 'US',
  'United Kingdom': 'GB',
  'UK': 'GB',
  'Germany': 'DE',
  'France': 'FR',
  'Japan': 'JP',
  'South Korea': 'KR',
  'Korea, Republic of': 'KR',
  'China': 'CN',
  "People's Republic of China": 'CN',
  'Taiwan': 'TW',
  'Netherlands': 'NL',
  'Israel': 'IL',
  'Singapore': 'SG',
  'Switzerland': 'CH',
  'Sweden': 'SE',
  'Italy': 'IT',
  'Spain': 'ES',
  'Canada': 'CA',
  'Australia': 'AU',
  'Brazil': 'BR',
  'India': 'IN',
  'Russia': 'RU',
  'Russian Federation': 'RU',
  'Iran': 'IR',
  'Islamic Republic of Iran': 'IR',
  'North Korea': 'KP',
  "Korea, Democratic People's Republic of": 'KP',
  'Syria': 'SY',
  'Syrian Arab Republic': 'SY',
  'Cuba': 'CU',
  'Belarus': 'BY',
  'Sudan': 'SD',
  'Myanmar': 'MM',
  'Zimbabwe': 'ZW',
  'Venezuela': 'VE',
  'Nicaragua': 'NI',
  'Libya': 'LY',
  'Yemen': 'YE',
  'Somalia': 'SO',
  'United Arab Emirates': 'AE',
  'UAE': 'AE',
  'Turkey': 'TR',
  'Türkiye': 'TR',
  'Pakistan': 'PK',
  'Afghanistan': 'AF',
  'Iraq': 'IQ',
  'Lebanon': 'LB',
  'Hong Kong': 'HK',
  'Luxembourg': 'LU',
  'Cayman Islands': 'KY',
  'British Virgin Islands': 'VG',
  'Panama': 'PA',
  'Marshall Islands': 'MH',
  'Liberia': 'LR',
  'Malta': 'MT',
  'Cyprus': 'CY',
  'Seychelles': 'SC',
  'Isle of Man': 'IM',
  'Jersey': 'JE',
  'Guernsey': 'GG',
  'Bermuda': 'BM',
  'Bahamas': 'BS',
  'Belize': 'BZ',
  'Mauritius': 'MU',
  'Samoa': 'WS',
  'Vanuatu': 'VU',
};

// ---------------------------------------------------------------------------
// Sector data
// ---------------------------------------------------------------------------

export const _SECTOR_COMPANIES: Record<string, string[]> = {
  semiconductor: [
    'TSMC', 'Samsung Electronics', 'Intel', 'ASML', 'Nvidia',
    'Qualcomm', 'Broadcom', 'AMD', 'Texas Instruments', 'SMIC',
    'Micron Technology', 'SK Hynix', 'Infineon Technologies',
    'NXP Semiconductors', 'STMicroelectronics', 'MediaTek',
    'Marvell Technology', 'ON Semiconductor', 'Microchip Technology',
    'KLA Corporation', 'Lam Research', 'Applied Materials',
    'Tokyo Electron', 'Entegris', 'Allegro MicroSystems',
  ],
  energy: [
    'Saudi Aramco', 'ExxonMobil', 'Shell', 'BP', 'TotalEnergies',
    'Chevron', 'Gazprom', 'Rosneft', 'Lukoil', 'ConocoPhillips',
    'Equinor', 'Eni', 'Repsol', 'Petrobras', 'CNOOC', 'CNPC',
    'Sinopec', 'Pioneer Natural Resources', 'Devon Energy',
    'Halliburton', 'Schlumberger', 'Baker Hughes', 'NOV',
    'Valero Energy', 'Phillips 66',
  ],
  shipping: [
    'Maersk', 'MSC Mediterranean Shipping', 'CMA CGM',
    'Hapag-Lloyd', 'COSCO Shipping', 'Evergreen Marine',
    'Yang Ming Marine', 'ONE (Ocean Network Express)',
    'HMM (Hyundai Merchant Marine)', 'ZIM Integrated Shipping',
    'Wan Hai Lines', 'Pacific Basin Shipping',
    'Scorpio Tankers', 'Nordic American Tankers',
    'Teekay Corporation', 'Frontline', 'DHT Holdings',
    'Euronav', 'International Seaways', 'Tsakos Energy Navigation',
  ],
  rare_earth: [
    'MP Materials', 'Lynas Rare Earths', 'China Northern Rare Earth',
    'China Minmetals', 'Shenghe Resources', 'Energy Fuels',
    'USA Rare Earth', 'NioCorp Developments',
    'Medallion Financial', 'Standard Lithium',
    'Piedmont Lithium', 'Albemarle', 'Livent',
    'Sigma Lithium', 'American Lithium Energy',
    'Appia Rare Earths & Uranium', 'Search Minerals',
  ],
  telecom: [
    'Huawei', 'ZTE', 'Ericsson', 'Nokia', 'Qualcomm', 'AT&T',
    'Verizon', 'T-Mobile', 'Deutsche Telekom', 'Softbank',
    'China Mobile', 'China Unicom', 'China Telecom',
    'Vodafone', 'Orange', 'Telefonica', 'BT Group',
    'NTT', 'KDDI', 'MTN Group', 'Airtel Africa',
  ],
  defense_aerospace: [
    'Lockheed Martin', 'Raytheon Technologies', 'Northrop Grumman',
    'Boeing Defense', 'General Dynamics', 'BAE Systems',
    'Thales', 'Leonardo', 'Airbus Defence & Space',
    'Saab', 'MBDA', 'Dassault Aviation',
    'L3Harris Technologies', 'Leidos', 'SAIC',
    'Booz Allen Hamilton', 'ManTech', 'CACI International',
    'Kratos Defense', 'Elbit Systems',
  ],
  aircraft_mro: [
    'ST Engineering', 'Lufthansa Technik', 'Air France KLM Engineering',
    'Delta TechOps', 'United MRO', 'SR Technics',
    'HAECO', 'TAECO', 'Chromalloy', 'StandardAero',
    'Heico', 'TransDigm', 'AAR Corp', 'BBA Aviation',
    'Signature Aviation', 'Everett Aviation',
  ],
  critical_minerals: [
    'Glencore', 'Rio Tinto', 'BHP', 'Vale', 'Anglo American',
    'Freeport-McMoRan', 'Newmont', 'Barrick Gold',
    'First Quantum Minerals', 'Teck Resources',
    'Ivanhoe Mines', 'Lundin Mining', 'Nyrstar',
    'Umicore', 'Coeur Mining', 'Pan American Silver',
    'Wheaton Precious Metals', 'Agnico Eagle Mines',
    'Kinross Gold', 'Endeavour Mining',
  ],
  dual_use_tech: [
    'Palantir', 'Anduril Industries', 'Shield AI',
    'Rebellion Defense', 'Primer AI', 'Govini',
    'Deloitte Federal', 'Accenture Federal Services',
    'Booz Allen Hamilton', 'SAIC', 'CACI International',
    'Leidos', 'Peraton', 'ICF',
    'Veritas Technologies', 'Symantec', 'CrowdStrike',
    'SentinelOne', 'Palo Alto Networks', 'Fortinet',
  ],
  port_logistics: [
    'Hutchison Ports', 'PSA International', 'DP World',
    'COSCO Shipping Ports', 'China Merchants Ports',
    'APM Terminals', 'Eurogate', 'HHLA',
    'GCT Global Container Terminals', 'Virginia International Terminals',
    'Port Authority of New York', 'Port of Los Angeles',
    'Port of Rotterdam', 'Port of Singapore',
    'Port of Hamburg', 'Port of Antwerp-Bruges',
  ],
  financial: [
    'JPMorgan Chase', 'Goldman Sachs', 'Morgan Stanley',
    'Citigroup', 'Bank of America', 'Wells Fargo',
    'HSBC', 'Barclays', 'Deutsche Bank', 'BNP Paribas',
    'Societe Generale', 'Credit Agricole', 'UniCredit',
    'UBS', 'Credit Suisse', 'Commerzbank',
    'Standard Chartered', 'Lloyds Banking Group',
    'ABN AMRO', 'ING Group',
    'VTB Bank', 'Sberbank', 'Gazprombank',
    'Bank of China', 'ICBC', 'China Construction Bank', 'Agricultural Bank of China',
  ],
  space_satellite: [
    'SpaceX', 'Boeing Space', 'Lockheed Martin Space',
    'Northrop Grumman Space', 'Airbus Space',
    'Thales Alenia Space', 'Maxar Technologies',
    'Planet Labs', 'BlackSky Technology',
    'Spire Global', 'HawkEye 360',
    'Satellogic', 'Umbra Lab', 'Capella Space',
    'ICEYE', 'Astroscale', 'Rocket Lab',
    'Relativity Space', 'ABL Space Systems',
    'Momentus', 'Astra Space',
  ],
};

export const _SECTOR_ALIASES: Record<string, string> = {
  semiconductors: 'semiconductor',
  'semiconductor sector': 'semiconductor',
  chips: 'semiconductor',
  chip: 'semiconductor',
  'advanced chips': 'semiconductor',
  microchips: 'semiconductor',
  'oil and gas': 'energy',
  'oil & gas': 'energy',
  petroleum: 'energy',
  oil: 'energy',
  gas: 'energy',
  lng: 'energy',
  'natural gas': 'energy',
  shipping: 'shipping',
  maritime: 'shipping',
  'container shipping': 'shipping',
  tankers: 'shipping',
  'rare earths': 'rare_earth',
  'rare earth metals': 'rare_earth',
  'rare earth minerals': 'rare_earth',
  lithium: 'rare_earth',
  cobalt: 'rare_earth',
  telecommunications: 'telecom',
  '5g': 'telecom',
  'wireless networks': 'telecom',
  defense: 'defense_aerospace',
  aerospace: 'defense_aerospace',
  'defense and aerospace': 'defense_aerospace',
  'defense & aerospace': 'defense_aerospace',
  'defense sector': 'defense_aerospace',
  mro: 'aircraft_mro',
  'aircraft maintenance': 'aircraft_mro',
  'aviation mro': 'aircraft_mro',
  minerals: 'critical_minerals',
  mining: 'critical_minerals',
  'critical minerals': 'critical_minerals',
  metals: 'critical_minerals',
  'dual use': 'dual_use_tech',
  'dual-use': 'dual_use_tech',
  'dual use technology': 'dual_use_tech',
  'dual-use technology': 'dual_use_tech',
  'port logistics': 'port_logistics',
  ports: 'port_logistics',
  'port infrastructure': 'port_logistics',
  logistics: 'port_logistics',
  financial: 'financial',
  'financial sector': 'financial',
  banking: 'financial',
  finance: 'financial',
  banks: 'financial',
  space: 'space_satellite',
  satellite: 'space_satellite',
  'space sector': 'space_satellite',
  'satellite industry': 'space_satellite',
};

// ---------------------------------------------------------------------------
// Entity colors for vis.js graph
// ---------------------------------------------------------------------------

const _ENTITY_COLORS: Record<string, string> = {
  company: '#58a6ff',
  person: '#a371f7',
  government: '#DC143C',
  vessel: '#3fb950',
  sanctions_list: '#F85149',
  theme: '#F0883E',
  sector: '#f0883e',
};

// ---------------------------------------------------------------------------
// Anthropic singleton + helpers
// ---------------------------------------------------------------------------

let _anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return _anthropicClient;
}

async function generateNarrative(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const client = getAnthropicClient();
    const resp = await client.messages.create({
      model: config.model,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    clearTimeout(timer);
    const text = (resp.content[0] as { type: string; text: string }).text ?? '';
    return text.trim();
  } catch {
    clearTimeout(timer);
    return '';
  }
}

const _COA_SYSTEM = `You are a senior economic warfare analyst at a Western intelligence agency.
Your role is to produce concise, actionable Courses of Action (CoAs) in response to sanctions
and economic pressure scenarios. Each CoA must be:
  - Specific and actionable (not vague platitudes)
  - Grounded in the data provided
  - Sequenced with clear priority (IMMEDIATE / SHORT-TERM / MEDIUM-TERM)
  - Calibrated to real geopolitical feasibility

Output exactly 3-4 CoAs as a JSON array of strings. Each string is a single CoA sentence.
Do NOT include markdown, headings, or prose — just the raw JSON array.
Example: ["Freeze ...", "Coordinate with ...", "Escalate ..."]`;

async function generateRecommendations(
  dataSummary: string,
  analystQuestion?: string,
): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const client = getAnthropicClient();
    const userMsg = analystQuestion
      ? `Analyst question: ${analystQuestion}\n\nData summary:\n${dataSummary}`
      : `Data summary:\n${dataSummary}`;

    const resp = await client.messages.create({
      model: config.model,
      max_tokens: 512,
      system: _COA_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    });
    clearTimeout(timer);
    const text = (resp.content[0] as { type: string; text: string }).text ?? '';
    const trimmed = text.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed as string[];
    } catch {
      // fallback: split by newline
      return trimmed
        .split('\n')
        .map((l) => l.replace(/^[-•*\d.]+\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 4);
    }
    return [];
  } catch {
    clearTimeout(timer);
    return [];
  }
}

const _FOLLOWUP_SYSTEM = `You are an economic warfare OSINT analyst assistant.
Answer the analyst's follow-up question based on the context provided.
Be specific, concise, and cite the data. Do not speculate beyond what the data supports.
Format your answer in plain text (no markdown headers).`;

function _buildCompanyFollowupSystem(context: Record<string, unknown>): string {
  const target = (context.target as Record<string, unknown>) ?? {};
  const projection = (context.projection_summary as Record<string, unknown>) ?? {};
  const comparables = (context.comparables as unknown[]) ?? [];
  const narrative = (context.narrative as string) ?? '';

  return `${_FOLLOWUP_SYSTEM}

CONTEXT — Sanctions Impact Analysis:
Target: ${target.name ?? ''} (${target.ticker ?? ''})
Sector: ${target.sector ?? ''} | Country: ${target.country ?? ''}
Market Cap: ${target.market_cap ?? 'N/A'}
Current Price: ${target.current_price ?? 'N/A'}

Projection (based on ${comparables.length} comparable sanctions events):
- 30-day expected: ${projection.day_30_post ?? 'N/A'}%
- 90-day expected: ${projection.day_90_post ?? 'N/A'}%
- Max drawdown: ${projection.max_drawdown ?? 'N/A'}%

Narrative: ${narrative}`;
}

function _buildOrchestratorFollowupSystem(context: Record<string, unknown>): string {
  const query = (context.query as string) ?? '';
  const summary = (context.executive_summary as string) ?? '';
  const findings = (context.findings as unknown[]) ?? [];
  const friendlyFire = (context.friendly_fire as unknown[]) ?? [];
  const recommendations = (context.recommendations as string[]) ?? [];
  const toolResults = context.tool_results;

  let sys = `${_FOLLOWUP_SYSTEM}

CONTEXT — Orchestrator Analysis:
Query: ${query}
Executive Summary: ${summary}

Findings (${findings.length} total):
${findings
  .slice(0, 5)
  .map((f) => {
    const fi = f as Record<string, unknown>;
    return `  [${fi.confidence ?? '?'}] ${fi.category ?? ''}: ${fi.finding ?? ''}`;
  })
  .join('\n')}

Friendly Fire (${friendlyFire.length} entities):
${friendlyFire
  .slice(0, 3)
  .map((ff) => {
    const f = ff as Record<string, unknown>;
    return `  ${f.entity ?? ''}: ${f.details ?? ''}`;
  })
  .join('\n')}

Recommended CoAs:
${recommendations
  .slice(0, 4)
  .map((r, i) => `  ${i + 1}. ${r}`)
  .join('\n')}`;

  if (toolResults) {
    const raw = JSON.stringify(toolResults).slice(0, 3000);
    sys += `\n\nRaw tool results (truncated):\n${raw}`;
  }
  return sys;
}

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

function truncate(s: string, n = 28): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

interface GraphNode {
  id: string;
  label: string;
  title: string;
  color: string;
  font: { color: string };
  shape: string;
  entityType: string;
  country?: string;
  sayariId?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  label: string;
  arrows: string;
  color: { color: string; opacity: number };
  font: { size: number };
}

function makeNode(
  nid: string,
  name: string,
  entityType: string,
  country?: string,
  sayariId?: string,
): GraphNode {
  const color = _ENTITY_COLORS[entityType] ?? '#888888';
  return {
    id: nid,
    label: truncate(name),
    title: name + (country ? ` (${country})` : ''),
    color,
    font: { color: '#e6edf3' },
    shape: entityType === 'person' ? 'ellipse' : 'box',
    entityType,
    country,
    sayariId,
  };
}

// ---------------------------------------------------------------------------
// LLM helpers for sector analysis
// ---------------------------------------------------------------------------

async function _llmMatchSectorKey(sectorQuery: string): Promise<string | null> {
  try {
    const client = getAnthropicClient();
    const knownKeys = Object.keys(_SECTOR_COMPANIES).join(', ');
    const resp = await client.messages.create({
      model: config.model,
      max_tokens: 64,
      messages: [
        {
          role: 'user',
          content: `Map this sector query to the closest known sector key.\nKnown keys: ${knownKeys}\nQuery: "${sectorQuery}"\nRespond with the single best matching key, or "unknown" if none fit. No explanation.`,
        },
      ],
    });
    const text = ((resp.content[0] as { type: string; text: string }).text ?? '').trim().toLowerCase();
    if (text in _SECTOR_COMPANIES) return text;
    return null;
  } catch {
    return null;
  }
}

async function _llmGenerateSectorCompanies(sectorQuery: string): Promise<string[]> {
  try {
    const client = getAnthropicClient();
    const resp = await client.messages.create({
      model: config.model,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `List 15-20 major companies in the "${sectorQuery}" sector. Respond with a JSON array of company name strings only. No tickers, no explanations.`,
        },
      ],
    });
    const text = ((resp.content[0] as { type: string; text: string }).text ?? '').trim();
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed as string[];
    } catch {
      // extract from brackets
      const m = text.match(/\[[\s\S]+\]/);
      if (m) {
        try {
          return JSON.parse(m[0]) as string[];
        } catch {
          // ignore
        }
      }
    }
    return [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------

router.get('/api/health', async (_req: Request, res: Response): Promise<void> => {
  const issues = config.validate();
  const toolRegistry = new ToolRegistry();
  await toolRegistry._ensureLoaded();
  const toolsAvailable = toolRegistry.listTools();

  res.json({
    status: issues.length === 0 ? 'ok' : 'degraded',
    issues,
    model: config.model,
    tools_available: toolsAvailable,
  });
});

// ---------------------------------------------------------------------------
// GET /api/tools
// ---------------------------------------------------------------------------

router.get('/api/tools', async (_req: Request, res: Response): Promise<void> => {
  const registry = new ToolRegistry();
  await registry._ensureLoaded();
  res.json({ tools: registry.listTools() });
});

// ---------------------------------------------------------------------------
// POST /api/analyze
// ---------------------------------------------------------------------------

router.post('/api/analyze', async (req: Request, res: Response): Promise<void> => {
  const { query } = req.body as { query?: string };
  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const record: AnalysisRecord = {
    status: 'running',
    progress: [],
    result: null,
    error: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  _analyses.set(analysisId, record);

  // Fire-and-forget background execution
  const runAnalysis = async (): Promise<void> => {
    try {
      const orchestrator = new Orchestrator();
      const result = await orchestrator.analyze(query, (msg: string) => {
        record.progress.push(msg);
      });
      record.status = 'complete';
      record.result = result;
      record.completedAt = new Date().toISOString();
    } catch (e) {
      record.status = 'error';
      record.error = String(e);
      record.completedAt = new Date().toISOString();
    }
  };

  setTimeout(() => { void runAnalysis(); }, 0);

  res.json({ analysis_id: analysisId, status: 'running' });
});

// ---------------------------------------------------------------------------
// GET /api/analyze/:analysisId
// ---------------------------------------------------------------------------

router.get('/api/analyze/:analysisId', (req: Request, res: Response): void => {
  const { analysisId } = req.params;
  const record = _analyses.get(analysisId as string);
  if (!record) {
    res.status(404).json({ error: 'Analysis not found' });
    return;
  }
  res.json({
    analysis_id: analysisId,
    status: record.status,
    progress: record.progress,
    result: record.result,
    error: record.error,
    started_at: record.startedAt,
    completed_at: record.completedAt,
  });
});

// ---------------------------------------------------------------------------
// POST /api/resolve-entity
// ---------------------------------------------------------------------------

router.post('/api/resolve-entity', async (req: Request, res: Response): Promise<void> => {
  const { query } = req.body as { query?: string };
  if (!query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }
  try {
    const resolution = await resolveEntityType(query);
    res.json({
      entity_type: resolution.entityType,
      entity_name: resolution.entityName,
      confidence: resolution.confidence,
      reasoning: resolution.reasoning,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/sanctions-impact
// ---------------------------------------------------------------------------

router.post('/api/sanctions-impact', async (req: Request, res: Response): Promise<void> => {
  const { ticker } = req.body as { ticker?: string };
  if (!ticker) {
    res.status(400).json({ error: 'ticker is required' });
    return;
  }
  try {
    const result = await runSanctionsImpact(ticker);

    // Generate narrative
    const summaryText = JSON.stringify({
      target: result.target,
      projection_summary: result.projection.summary,
      comparable_count: result.metadata.comparable_count,
      comparable_names: result.comparables.map((c) => c.name),
    });
    const narrativePrompt = `You are a sanctions analyst. Based on the following sanctions impact analysis data, write a 3-5 sentence narrative explaining the projected market impact and key risk factors.\n\nData:\n${summaryText}`;
    const narrative = await generateNarrative(narrativePrompt);

    const recPrompt = `Target: ${result.target.name} (${result.target.ticker})\nSector: ${result.target.sector}\nProjected 30-day decline: ${result.projection.summary.day_30_post ?? 'N/A'}%\nProjected 90-day decline: ${result.projection.summary.day_90_post ?? 'N/A'}%\nMax drawdown: ${result.projection.summary.max_drawdown ?? 'N/A'}%`;
    const recommendations = await generateRecommendations(recPrompt, `What should we do about ${ticker}?`);

    res.json({ ...result, narrative, recommendations });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/entity-graph
// ---------------------------------------------------------------------------

router.post('/api/entity-graph', async (req: Request, res: Response): Promise<void> => {
  const { query } = req.body as { query?: string };
  if (!query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  try {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeSet = new Set<string>();

    const addNode = (node: GraphNode): void => {
      if (!nodeSet.has(node.id)) {
        nodes.push(node);
        nodeSet.add(node.id);
      }
    };

    const addEdge = (from: string, to: string, label: string): void => {
      edges.push({
        from,
        to,
        label,
        arrows: 'to',
        color: { color: '#8b949e', opacity: 0.7 },
        font: { size: 10 },
      });
    };

    // Main entity node
    const mainId = `main_${slug(query)}`;
    let mainSayariId: string | undefined;

    // Sayari entity resolution for main node
    try {
      const sayariClient = getSayariClient();
      const sayariRes = await sayariClient.resolve(query, 3);
      if (sayariRes.entities.length > 0) {
        const best = sayariRes.entities[0];
        mainSayariId = best.entityId;
      }
    } catch {
      // Sayari not available
    }

    addNode(makeNode(mainId, query, 'company', undefined, mainSayariId));

    // GLEIF corporate structure
    try {
      const leiRecords = await gleifSearchLei(query);
      const queryLower = query.toLowerCase();

      for (const rec of leiRecords.slice(0, 5)) {
        const nameLower = rec.legalName.toLowerCase();
        if (!nameLower.includes(queryLower) && !queryLower.includes(nameLower.split(' ')[0] ?? '')) continue;

        const leiNodeId = `lei_${rec.lei}`;
        addNode(makeNode(leiNodeId, rec.legalName, 'company', rec.country ?? undefined));
        if (leiNodeId !== mainId) {
          addEdge(mainId, leiNodeId, 'LEI match');
        }

        // Try to get parent/subsidiary relationships
        try {
          const [directParent, ultimateParent] = await Promise.allSettled([
            gleifGetDirectParent(rec.lei),
            gleifGetUltimateParent(rec.lei),
          ]);
          if (directParent.status === 'fulfilled' && directParent.value) {
            const parentId = `lei_parent_${directParent.value.parentId}`;
            addNode(makeNode(parentId, `Parent: ${directParent.value.parentId}`, 'company'));
            addEdge(parentId, leiNodeId, 'owns');
          }
          if (ultimateParent.status === 'fulfilled' && ultimateParent.value) {
            const uboId = `lei_ubo_${ultimateParent.value.parentId}`;
            addNode(makeNode(uboId, `UBO: ${ultimateParent.value.parentId}`, 'company'));
            addEdge(uboId, leiNodeId, 'ultimate owner');
          }
        } catch {
          // skip
        }
      }
    } catch {
      // GLEIF unavailable
    }

    // OFAC sanctions network
    try {
      const ofacClient = new OFACClient();
      const ofacResults = await ofacClient.search(query);
      const highConf = ofacResults.filter((e) => (e.score ?? 0) >= 0.85);

      for (const entry of highConf.slice(0, 8)) {
        const sanNodeId = `ofac_${slug(entry.name)}`;
        const sanNode = makeNode(sanNodeId, entry.name, 'sanctions_list');
        sanNode.color = _ENTITY_COLORS.sanctions_list;
        addNode(sanNode);
        addEdge(mainId, sanNodeId, 'OFAC match');

        // Parse "Linked To:" from remarks
        if (entry.remarks) {
          const linkedTo = entry.remarks.match(/Linked To:\s*([^;.]+)/gi) ?? [];
          for (const link of linkedTo) {
            const linkedName = link.replace(/Linked To:\s*/i, '').trim();
            if (linkedName) {
              const linkedId = `linked_${slug(linkedName)}`;
              addNode(makeNode(linkedId, linkedName, 'company'));
              addEdge(sanNodeId, linkedId, 'linked to');
            }
          }
        }
      }
    } catch {
      // OFAC unavailable
    }

    // Sector comparable peers (from SANCTIONS_COMPARABLES)
    const queryUpper = query.toUpperCase();
    const relevantComps = SANCTIONS_COMPARABLES.filter(
      (c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.ticker === queryUpper ||
        c.sector === query.toLowerCase(),
    );
    for (const comp of relevantComps.slice(0, 5)) {
      const compId = `comp_${slug(comp.name)}`;
      const compNode = makeNode(compId, comp.name, 'company');
      compNode.color = _ENTITY_COLORS.sector;
      compNode.title = `${comp.name} — ${comp.description ?? ''}`;
      addNode(compNode);
      addEdge(mainId, compId, 'sector peer');
    }

    // Sanctions screening: screen company nodes against OFAC + CSL
    const companyNodes = nodes.filter((n) => n.entityType === 'company' && n.id !== mainId);
    const screeningTasks = companyNodes.slice(0, 10).map(async (n) => {
      try {
        const ofac = new OFACClient();
        const [ofacHits, cslHits] = await Promise.allSettled([
          ofac.search(n.label),
          searchCsl(n.label),
        ]);
        const isSanctioned =
          (ofacHits.status === 'fulfilled' && ofacHits.value.some((e) => (e.score ?? 0) >= 0.85)) ||
          (cslHits.status === 'fulfilled' && cslHits.value.length > 0);
        if (isSanctioned) {
          n.color = _ENTITY_COLORS.sanctions_list;
          n.title = `SANCTIONED: ${n.title}`;
        }
      } catch {
        // ignore
      }
    });
    await Promise.allSettled(screeningTasks);

    res.json({ nodes, edges, query });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/person-profile
// ---------------------------------------------------------------------------

router.post('/api/person-profile', async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body as { name?: string };
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  try {
    const ofacClient = new OFACClient();

    // Run lookups in parallel
    const [cslResult, ofacResult, officersResult, icijResult, gdeltResult] =
      await Promise.allSettled([
        searchCsl(name),
        ofacClient.search(name, 'person'),
        ocSearchOfficers(name),
        icijSearch(name, 'officer'),
        gdeltDocSearch(name),
      ]);

    const cslHits = cslResult.status === 'fulfilled' ? cslResult.value : [];
    const ofacHits = ofacResult.status === 'fulfilled' ? ofacResult.value : [];
    const officers = officersResult.status === 'fulfilled' ? officersResult.value : [];
    const icijHits = icijResult.status === 'fulfilled' ? icijResult.value : [];
    const gdeltDocs = gdeltResult.status === 'fulfilled' ? gdeltResult.value : null;

    // Build sanctions summary
    const sanctionedOnOfac = ofacHits.filter((e) => (e.score ?? 0) >= 0.85);
    const sanctionedOnCsl = cslToEntries(cslHits).filter((e) => (e.score ?? 0) >= 0.5);
    const allSanctions = [...sanctionedOnOfac, ...sanctionedOnCsl];

    const sanctionsSummary = {
      is_sanctioned: allSanctions.length > 0,
      lists: [...new Set(allSanctions.map((e) => e.listSource))],
      programs: [...new Set(allSanctions.flatMap((e) => e.programs))],
      entries: allSanctions.slice(0, 5),
    };

    // Build affiliations from OpenCorporates officers
    const affiliations = officers.slice(0, 20).map((o) => ({
      company: '',
      role: o.role,
      name: o.name,
      start_date: o.startDate,
      end_date: o.endDate,
    }));

    // Offshore connections from ICIJ
    const offshoreConnections = Array.isArray(icijHits)
      ? icijHits.slice(0, 10).map((h: unknown) => {
          const hit = h as Record<string, unknown>;
          return {
            entity: hit.name ?? '',
            dataset: hit.sourceDataset ?? '',
            jurisdiction: hit.jurisdiction ?? '',
          };
        })
      : [];

    // Recent events from GDELT
    const recentEvents: unknown[] = [];
    if (gdeltDocs && typeof gdeltDocs === 'object') {
      const docs = (gdeltDocs as Record<string, unknown>).articles ?? gdeltDocs;
      if (Array.isArray(docs)) {
        recentEvents.push(...docs.slice(0, 10));
      }
    }

    // Build person-centric vis.js graph
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeSet = new Set<string>();

    const addNode = (n: GraphNode): void => {
      if (!nodeSet.has(n.id)) { nodes.push(n); nodeSet.add(n.id); }
    };
    const addEdge = (from: string, to: string, label: string): void => {
      edges.push({ from, to, label, arrows: 'to', color: { color: '#8b949e', opacity: 0.7 }, font: { size: 10 } });
    };

    const personId = `person_${slug(name)}`;
    const personNode = makeNode(personId, name, 'person');
    if (sanctionsSummary.is_sanctioned) personNode.color = _ENTITY_COLORS.sanctions_list;
    addNode(personNode);

    // Add sanction list nodes
    for (const entry of allSanctions.slice(0, 5)) {
      const sanId = `sanctions_${slug(entry.listSource + '_' + entry.id)}`;
      addNode(makeNode(sanId, entry.listSource, 'sanctions_list'));
      addEdge(personId, sanId, 'listed on');
    }

    // Add corporate affiliations
    for (const aff of affiliations.slice(0, 10)) {
      if (aff.company) {
        const compId = `company_${slug(aff.company)}`;
        addNode(makeNode(compId, aff.company, 'company'));
        addEdge(personId, compId, aff.role || 'affiliated');
      }
    }

    // Add offshore connections
    for (const conn of offshoreConnections.slice(0, 5)) {
      if (conn.entity) {
        const offId = `offshore_${slug(conn.entity as string)}`;
        addNode(makeNode(offId, conn.entity as string, 'company', conn.jurisdiction as string | undefined));
        addEdge(personId, offId, 'offshore link');
      }
    }

    // Generate narrative
    const narrativePrompt = `You are an OSINT analyst. Write a 3-5 sentence risk profile narrative for ${name}.\n\nSanctions: ${JSON.stringify(sanctionsSummary)}\nAffiliations: ${affiliations.length} corporate links\nOffshore: ${offshoreConnections.length} connections`;
    const narrative = await generateNarrative(narrativePrompt);

    const recData = `Person: ${name}\nSanctioned: ${sanctionsSummary.is_sanctioned}\nPrograms: ${sanctionsSummary.programs.join(', ')}\nOffshore connections: ${offshoreConnections.length}`;
    const recommendations = await generateRecommendations(recData);

    res.json({
      name,
      sanctions_summary: sanctionsSummary,
      affiliations,
      offshore_connections: offshoreConnections,
      recent_events: recentEvents,
      graph: { nodes, edges },
      narrative,
      recommendations,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/vessel-track
// ---------------------------------------------------------------------------

router.post('/api/vessel-track', async (req: Request, res: Response): Promise<void> => {
  const { query } = req.body as { query?: string };
  if (!query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }
  try {
    // Determine query type
    const isMmsi = /^\d{9}$/.test(query.trim());
    const isImo = /^\d{7}$/.test(query.trim());

    let vesselDetail: unknown = null;
    let vesselMmsi: string | null = null;
    let vesselImo: string | null = null;
    let vesselName: string = query;

    if (isMmsi) {
      vesselMmsi = query.trim();
      vesselDetail = await vesselByMmsi(vesselMmsi);
    } else if (isImo) {
      vesselImo = query.trim();
      vesselDetail = await vesselByImo(vesselImo);
    } else {
      vesselDetail = await vesselFind(query.trim());
    }

    // Extract MMSI/IMO/name from detail
    if (vesselDetail && typeof vesselDetail === 'object') {
      const vd = vesselDetail as Record<string, unknown>;
      const vesselData = (vd.data as Record<string, unknown>) ?? vd;
      // Handle find results (array)
      const vessel = Array.isArray(vesselData) ? (vesselData[0] as Record<string, unknown>) : vesselData;
      if (vessel) {
        vesselMmsi = vesselMmsi ?? (String(vessel.mmsi ?? '') || null);
        vesselImo = vesselImo ?? (String(vessel.imo ?? '') || null);
        vesselName = (vessel.name as string) ?? (vessel.vessel_name as string) ?? query;
      }
    }

    // Fetch history and OFAC in parallel
    const [historyResult, ofacResult, sayariResult] = await Promise.allSettled([
      vesselMmsi ? vesselHistory(vesselMmsi) : Promise.resolve(null),
      (async () => {
        const ofacClient = new OFACClient();
        return ofacClient.search(vesselName, 'vessel');
      })(),
      getVesselIntel(vesselName, vesselImo ?? undefined),
    ]);

    const historyData = historyResult.status === 'fulfilled' ? historyResult.value : null;
    const ofacHits = ofacResult.status === 'fulfilled' ? ofacResult.value : [];
    const sayariIntel = sayariResult.status === 'fulfilled' ? sayariResult.value : null;

    // Port calls
    let portCallsData: unknown = null;
    if (vesselMmsi) {
      portCallsData = await vesselPortCalls(vesselMmsi).catch(() => null);
    }

    // Infer port stops from position history
    let routeHistory: unknown[] = [];
    if (historyData && typeof historyData === 'object') {
      const hd = historyData as Record<string, unknown>;
      const positions = (hd.data as unknown[]) ?? (Array.isArray(historyData) ? historyData : []);
      routeHistory = positions as unknown[];
    }

    // Countries visited (from port stops)
    const portsVisited: string[] = [];
    if (Array.isArray(routeHistory) && routeHistory.length > 0) {
      const stops = inferPortStops(
        routeHistory.map((p) => {
          const pos = p as Record<string, unknown>;
          return {
            latitude: Number(pos.lat ?? pos.latitude ?? 0),
            longitude: Number(pos.lon ?? pos.longitude ?? 0),
            speed: Number(pos.speed ?? 0),
            timestamp: pos.timestamp as string | number | undefined,
          };
        }),
      );
      // Add stop coordinates as visited points (country resolution would require geocoding)
      for (const stop of stops.slice(0, 10)) {
        portsVisited.push(`${stop.latitude.toFixed(2)},${stop.longitude.toFixed(2)}`);
      }
    }

    // Build ownership vis.js graph
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeSet = new Set<string>();

    const addNode = (n: GraphNode): void => {
      if (!nodeSet.has(n.id)) { nodes.push(n); nodeSet.add(n.id); }
    };
    const addEdge = (from: string, to: string, label: string): void => {
      edges.push({ from, to, label, arrows: 'to', color: { color: '#8b949e', opacity: 0.7 }, font: { size: 10 } });
    };

    const vesselNodeId = `vessel_${slug(vesselName)}`;
    addNode(makeNode(vesselNodeId, vesselName, 'vessel'));

    // Flag state
    if (vesselDetail && typeof vesselDetail === 'object') {
      const vd = vesselDetail as Record<string, unknown>;
      const vessel = Array.isArray(vd.data)
        ? (vd.data[0] as Record<string, unknown>)
        : ((vd.data as Record<string, unknown>) ?? vd);
      const flag = (vessel?.flag as string) ?? (vessel?.flag_code as string);
      if (flag) {
        const flagId = `flag_${slug(flag)}`;
        addNode(makeNode(flagId, `Flag: ${flag}`, 'government', flag));
        addEdge(vesselNodeId, flagId, 'flagged in');
      }
      const operator = (vessel?.operator as string) ?? (vessel?.operator_company as string);
      if (operator) {
        const opId = `operator_${slug(operator)}`;
        addNode(makeNode(opId, operator, 'company'));
        addEdge(vesselNodeId, opId, 'operated by');
      }
    }

    // Sayari UBO chain
    if (sayariIntel) {
      for (const link of sayariIntel.uboChain.slice(0, 6)) {
        const uboId = `ubo_${slug(link.entityId)}`;
        const uboNode = makeNode(uboId, link.name, link.entityType === 'person' ? 'person' : 'company', link.country ?? undefined);
        if (link.isSanctioned) uboNode.color = _ENTITY_COLORS.sanctions_list;
        addNode(uboNode);
        const parentId = link.parentEntityId ? `ubo_${slug(link.parentEntityId)}` : vesselNodeId;
        addEdge(parentId, uboId, link.relationshipType || 'owned by');
      }
    }

    // OFAC hits on vessel
    for (const entry of ofacHits.filter((e) => (e.score ?? 0) >= 0.85)) {
      const sanId = `ofac_vessel_${slug(entry.id)}`;
      const sanNode = makeNode(sanId, entry.listSource, 'sanctions_list');
      sanNode.color = _ENTITY_COLORS.sanctions_list;
      addNode(sanNode);
      addEdge(vesselNodeId, sanId, 'OFAC listed');
    }

    // Generate narrative
    const sanctionedOwners = sayariIntel?.sanctionedOwners ?? [];
    const narrativePrompt = `You are a maritime intelligence analyst. Write a 3-5 sentence intelligence brief for vessel "${vesselName}".\n\nOFAC matches: ${ofacHits.length}\nSanctioned owners: ${sanctionedOwners.length}\nHigh risk flags: ${sayariIntel?.highRiskFlags?.join(', ') ?? 'none'}\nRoute stops detected: ${portsVisited.length}`;
    const narrative = await generateNarrative(narrativePrompt);

    const recData = `Vessel: ${vesselName}\nIMO: ${vesselImo ?? 'unknown'}\nSanctioned owners: ${sanctionedOwners.length}\nOFAC hits: ${ofacHits.filter((e) => (e.score ?? 0) >= 0.85).length}`;
    const recommendations = await generateRecommendations(recData, `What actions should we take regarding vessel ${vesselName}?`);

    res.json({
      vessel_name: vesselName,
      mmsi: vesselMmsi,
      imo: vesselImo,
      vessel_detail: vesselDetail,
      ofac_hits: ofacHits,
      sayari_intel: sayariIntel,
      route_history: routeHistory.slice(0, 100),
      port_calls: portCallsData,
      ports_visited: portsVisited,
      graph: { nodes, edges },
      narrative,
      recommendations,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/sector-analysis
// ---------------------------------------------------------------------------

router.post('/api/sector-analysis', async (req: Request, res: Response): Promise<void> => {
  const { sector, include_supply_chain } = req.body as {
    sector?: string;
    include_supply_chain?: boolean;
  };
  if (!sector) {
    res.status(400).json({ error: 'sector is required' });
    return;
  }

  try {
    // Resolve sector key
    const sectorLower = sector.toLowerCase().trim();
    let sectorKey: string | null = _SECTOR_ALIASES[sectorLower] ?? null;
    if (!sectorKey && sectorLower in _SECTOR_COMPANIES) {
      sectorKey = sectorLower;
    }

    // LLM fallback for unknown sectors
    if (!sectorKey) {
      sectorKey = await _llmMatchSectorKey(sectorLower);
    }

    let companies: string[];
    let isCustomSector = false;

    if (sectorKey && sectorKey in _SECTOR_COMPANIES) {
      companies = _SECTOR_COMPANIES[sectorKey]!;
    } else {
      // Generate companies via LLM for unknown sector
      companies = await _llmGenerateSectorCompanies(sector);
      isCustomSector = true;
      sectorKey = sectorLower;
    }

    // OFAC check all companies in parallel (cap at 30)
    const ofacClient = new OFACClient();
    const screeningResults = await Promise.allSettled(
      companies.slice(0, 30).map(async (company) => {
        const hits = await ofacClient.search(company);
        return { company, hits: hits.filter((h) => (h.score ?? 0) >= 0.85) };
      }),
    );

    const sanctionedCompanies: { company: string; programs: string[] }[] = [];
    const screeningMap: Record<string, boolean> = {};

    for (const result of screeningResults) {
      if (result.status === 'fulfilled') {
        const { company, hits } = result.value;
        screeningMap[company] = hits.length > 0;
        if (hits.length > 0) {
          sanctionedCompanies.push({
            company,
            programs: [...new Set(hits.flatMap((h) => h.programs))],
          });
        }
      }
    }

    // Optional supply chain enrichment for defense/aerospace
    let supplyChainData: unknown = null;
    const isDefenseAerospace =
      include_supply_chain &&
      (sectorKey === 'defense_aerospace' || sectorKey === 'aircraft_mro');
    if (isDefenseAerospace) {
      // Try to enrich with GLEIF data for top companies
      const enrichmentTasks = companies.slice(0, 5).map((c) => gleifSearchLei(c).catch(() => []));
      const enriched = await Promise.allSettled(enrichmentTasks);
      supplyChainData = enriched
        .filter((r) => r.status === 'fulfilled')
        .map((r) => (r as PromiseFulfilledResult<unknown>).value);
    }

    // Build sector vis.js graph
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeSet = new Set<string>();

    const addNode = (n: GraphNode): void => {
      if (!nodeSet.has(n.id)) { nodes.push(n); nodeSet.add(n.id); }
    };
    const addEdge = (from: string, to: string, label: string): void => {
      edges.push({ from, to, label, arrows: 'to', color: { color: '#8b949e', opacity: 0.7 }, font: { size: 10 } });
    };

    // Central sector node
    const sectorNodeId = `sector_${slug(sectorKey ?? sector)}`;
    const sectorNode = makeNode(sectorNodeId, sector, 'sector');
    sectorNode.color = _ENTITY_COLORS.sector;
    addNode(sectorNode);

    // Company nodes
    for (const company of companies.slice(0, 20)) {
      const compId = `company_${slug(company)}`;
      const isSanctioned = screeningMap[company] ?? false;
      const compNode = makeNode(compId, company, 'company');
      if (isSanctioned) compNode.color = _ENTITY_COLORS.sanctions_list;
      addNode(compNode);
      addEdge(sectorNodeId, compId, 'sector member');
    }

    // Sanctions list nodes for sanctioned companies
    for (const { company, programs } of sanctionedCompanies) {
      const compId = `company_${slug(company)}`;
      for (const prog of programs.slice(0, 2)) {
        const progId = `program_${slug(prog)}`;
        addNode(makeNode(progId, prog, 'sanctions_list'));
        addEdge(compId, progId, 'designated under');
      }
    }

    // Generate narrative
    const narrativePrompt = `You are an economic warfare analyst. Write a 3-5 sentence sector risk assessment for the ${sector} sector.\n\nTotal companies tracked: ${companies.length}\nSanctioned: ${sanctionedCompanies.length}\nNotable sanctioned: ${sanctionedCompanies.slice(0, 3).map((c) => c.company).join(', ')}`;
    const narrative = await generateNarrative(narrativePrompt);

    const recData = `Sector: ${sector}\nTotal companies: ${companies.length}\nSanctioned count: ${sanctionedCompanies.length}\nSanctioned programs: ${[...new Set(sanctionedCompanies.flatMap((c) => c.programs))].join(', ')}`;
    const recommendations = await generateRecommendations(recData, `What actions should we take regarding the ${sector} sector?`);

    res.json({
      sector,
      sector_key: sectorKey,
      is_custom_sector: isCustomSector,
      companies,
      sanctioned_companies: sanctionedCompanies,
      screening_map: screeningMap,
      supply_chain_data: supplyChainData,
      graph: { nodes, edges },
      narrative,
      recommendations,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/entity-risk-report
// ---------------------------------------------------------------------------

router.post('/api/entity-risk-report', async (req: Request, res: Response): Promise<void> => {
  const { entity, ticker } = req.body as { entity?: string; ticker?: string };
  if (!entity) {
    res.status(400).json({ error: 'entity is required' });
    return;
  }
  try {
    const ofacClient = new OFACClient();

    // Parallel lookups
    const [ofacResult, cslResult, gleifResult, officerResult, marketResult, institutionalResult] =
      await Promise.allSettled([
        ofacClient.search(entity),
        searchCsl(entity),
        gleifSearchLei(entity),
        ocSearchOfficers(entity),
        ticker ? yfinanceClient.getStockProfile(ticker) : Promise.resolve(null),
        ticker ? yfinanceClient.getInstitutionalHolders(ticker) : Promise.resolve([]),
      ]);

    const ofacHits = ofacResult.status === 'fulfilled' ? ofacResult.value : [];
    const cslHits = cslResult.status === 'fulfilled' ? cslResult.value : [];
    const gleifRecords = gleifResult.status === 'fulfilled' ? gleifResult.value : [];
    const officers = officerResult.status === 'fulfilled' ? officerResult.value : [];
    const marketProfile = marketResult.status === 'fulfilled' ? marketResult.value : null;
    const institutionalHolders =
      institutionalResult.status === 'fulfilled' ? institutionalResult.value : [];

    // Additional market data if ticker provided
    let priceData = null;
    let analystData = null;
    if (ticker) {
      const [priceRes, analystRes] = await Promise.allSettled([
        yfinanceClient.getPriceData(ticker, '1y'),
        yfinanceClient.getAnalystEstimate(ticker),
      ]);
      priceData = priceRes.status === 'fulfilled' ? priceRes.value : null;
      analystData = analystRes.status === 'fulfilled' ? analystRes.value : null;
    }

    // Build corporate info
    const corporateInfo = {
      gleif_records: gleifRecords.slice(0, 3),
      officers: officers.slice(0, 10),
    };

    // Sanctions details
    const sanctionedOnOfac = ofacHits.filter((e) => (e.score ?? 0) >= 0.85);
    const sanctionedOnCsl = cslToEntries(cslHits);
    const allSanctionEntries = [...sanctionedOnOfac, ...sanctionedOnCsl];

    const sanctionsDetails = {
      is_sanctioned: allSanctionEntries.length > 0,
      ofac_hits: sanctionedOnOfac.slice(0, 5),
      csl_hits: sanctionedOnCsl.slice(0, 5),
      programs: [...new Set(allSanctionEntries.flatMap((e) => e.programs))],
      lists_found: [...new Set(allSanctionEntries.map((e) => e.listSource))],
    };

    // Market data
    const marketData = {
      profile: marketProfile,
      current_price: priceData?.currentPrice ?? null,
      change_pct: priceData?.changePct ?? null,
      fifty_two_week_high: priceData?.fiftyTwoWeekHigh ?? null,
      fifty_two_week_low: priceData?.fiftyTwoWeekLow ?? null,
      analyst_consensus: analystData?.recommendation ?? null,
      analyst_target: analystData?.targetPrice ?? null,
      num_analysts: analystData?.numAnalysts ?? null,
    };

    // Institutional exposure
    const pensionOrSovExposure = institutionalHolders.filter((h) => {
      const name = h.holderName.toLowerCase();
      return (
        name.includes('pension') ||
        name.includes('sovereign') ||
        name.includes('calpers') ||
        name.includes('calstrs') ||
        name.includes('norges') ||
        name.includes('gic') ||
        name.includes('temasek') ||
        name.includes('abu dhabi') ||
        name.includes('kuwait') ||
        name.includes('qatar')
      );
    });

    const institutionalExposure = {
      top_holders: institutionalHolders.slice(0, 10),
      pension_sovereign_exposure: pensionOrSovExposure,
      total_institutions: institutionalHolders.length,
    };

    // Risk indicators
    const country = marketProfile?.country ?? gleifRecords[0]?.country ?? '';
    const countryIso = _COUNTRY_NAME_TO_ISO[country] ?? country.slice(0, 2).toUpperCase();
    const isHighRisk = _HIGH_RISK_COUNTRIES.has(country) || _HIGH_RISK_COUNTRIES.has(countryIso);
    const isElevatedRisk =
      !isHighRisk &&
      (_ELEVATED_RISK_COUNTRIES.has(country) || _ELEVATED_RISK_COUNTRIES.has(countryIso));

    const hasOffshore = gleifRecords.some((r) => {
      const c = r.country ?? '';
      const iso = _COUNTRY_NAME_TO_ISO[c] ?? c;
      return ['KY', 'VG', 'PA', 'LU', 'LI', 'BM', 'BS', 'BZ', 'SC', 'WS', 'VU', 'MU'].includes(iso);
    });

    const entityStatus = gleifRecords[0]?.status ?? null;
    const marketCap = marketProfile?.marketCap ?? null;

    const riskIndicators = {
      sanctions: sanctionsDetails.is_sanctioned,
      ofac_programs: sanctionsDetails.programs,
      jurisdiction_risk: isHighRisk ? 'HIGH' : isElevatedRisk ? 'ELEVATED' : 'LOW',
      country,
      entity_status: entityStatus,
      market_cap: marketCap,
      fifty_two_week_high: marketData.fifty_two_week_high,
      analyst_consensus: marketData.analyst_consensus,
      friendly_fire: pensionOrSovExposure.map((h) => h.holderName),
      offshore_jurisdiction: hasOffshore,
    };

    // Overall risk level
    let overallRisk: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (sanctionsDetails.is_sanctioned || isHighRisk) {
      overallRisk = 'HIGH';
    } else if (isElevatedRisk || hasOffshore || sanctionsDetails.programs.length > 0) {
      overallRisk = 'MEDIUM';
    }

    // Generate narrative
    const narrativePrompt = `You are a risk analyst. Write a 3-5 sentence entity risk narrative for ${entity}.\n\nRisk level: ${overallRisk}\nSanctioned: ${sanctionsDetails.is_sanctioned}\nCountry: ${country} (${riskIndicators.jurisdiction_risk} risk)\nPrograms: ${sanctionsDetails.programs.join(', ') || 'none'}\nFriendly fire (pension/sovereign holders): ${pensionOrSovExposure.length}`;
    const narrative = await generateNarrative(narrativePrompt);

    res.json({
      entity,
      ticker: ticker ?? null,
      overall_risk: overallRisk,
      corporate_info: corporateInfo,
      sanctions_details: sanctionsDetails,
      market_data: marketData,
      institutional_exposure: institutionalExposure,
      risk_indicators: riskIndicators,
      narrative,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/followup
// ---------------------------------------------------------------------------

router.post('/api/followup', async (req: Request, res: Response): Promise<void> => {
  const { question, context, context_type, conversation_history } = req.body as {
    question?: string;
    context?: Record<string, unknown>;
    context_type?: string;
    conversation_history?: { role: 'user' | 'assistant'; content: string }[];
  };

  if (!question) {
    res.status(400).json({ error: 'question is required' });
    return;
  }

  try {
    let systemPrompt: string;

    if (context_type === 'company') {
      systemPrompt = _buildCompanyFollowupSystem(context ?? {});
    } else if (context_type === 'orchestrator') {
      systemPrompt = _buildOrchestratorFollowupSystem(context ?? {});
    } else {
      systemPrompt = _FOLLOWUP_SYSTEM;
    }

    // Build message history
    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...(conversation_history ?? []),
      { role: 'user', content: question },
    ];

    const client = getAnthropicClient();
    const resp = await client.messages.create({
      model: config.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const answer = ((resp.content[0] as { type: string; text: string }).text ?? '').trim();

    res.json({ answer, question });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/sanctions/screen-batch
// ---------------------------------------------------------------------------

router.post('/api/sanctions/screen-batch', async (req: Request, res: Response): Promise<void> => {
  const { names } = req.body as { names?: string[] };
  if (!Array.isArray(names) || names.length === 0) {
    res.status(400).json({ error: 'names array is required' });
    return;
  }

  const cap = names.slice(0, 30);
  const client = new SanctionsClient();

  const results = await Promise.allSettled(
    cap.map(async (name) => {
      const status = await client.checkStatus(name);
      return { name, ...status };
    }),
  );

  const screening = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return { name: cap[i], error: String(r.reason), isSanctioned: false };
  });

  res.json({ screening, total: screening.length });
});

// ---------------------------------------------------------------------------
// POST /api/sayari/resolve
// ---------------------------------------------------------------------------

router.post('/api/sayari/resolve', async (req: Request, res: Response): Promise<void> => {
  const { query, limit, entity_type } = req.body as {
    query?: string;
    limit?: number;
    entity_type?: string;
  };
  if (!query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }
  try {
    const client = getSayariClient();
    const result = await client.resolve(query, limit ?? 5, entity_type);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/sayari/related
// ---------------------------------------------------------------------------

router.post('/api/sayari/related', async (req: Request, res: Response): Promise<void> => {
  const { entity_id, depth, limit } = req.body as {
    entity_id?: string;
    depth?: number;
    limit?: number;
  };
  if (!entity_id) {
    res.status(400).json({ error: 'entity_id is required' });
    return;
  }
  try {
    const client = getSayariClient();
    const result = await client.getTraversal(entity_id, depth ?? 1, limit ?? 20);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/sayari/ubo
// ---------------------------------------------------------------------------

router.post('/api/sayari/ubo', async (req: Request, res: Response): Promise<void> => {
  const { entity_id } = req.body as { entity_id?: string };
  if (!entity_id) {
    res.status(400).json({ error: 'entity_id is required' });
    return;
  }
  try {
    const client = getSayariClient();
    const result = await client.getUbo(entity_id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/buildworkforce/run
// ---------------------------------------------------------------------------

router.post('/api/buildworkforce/run', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    const resp = await fetch('https://app.buildworkforce.ai/api/v1/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.buildworkforceApiKey}`,
        'X-Team-ID': config.buildworkforceTeamId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      res.status(resp.status).json({ error: `BuildWorkforce error: ${text.slice(0, 200)}` });
      return;
    }
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// GET /api/buildworkforce/runs/:runId
// ---------------------------------------------------------------------------

router.get('/api/buildworkforce/runs/:runId', async (req: Request, res: Response): Promise<void> => {
  const { runId } = req.params;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    const resp = await fetch(`https://app.buildworkforce.ai/api/v1/runs/${runId}`, {
      headers: {
        Authorization: `Bearer ${config.buildworkforceApiKey}`,
        'X-Team-ID': config.buildworkforceTeamId,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      res.status(resp.status).json({ error: `BuildWorkforce poll error: ${text.slice(0, 200)}` });
      return;
    }
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default router;
