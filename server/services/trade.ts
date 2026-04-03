/**
 * Trade intelligence clients: UN Comtrade and UNCTAD.
 *
 * Ports Python trade/client.py to TypeScript for the Express backend.
 */

import { getCached, setCached } from '../cache';
import { config } from '../config';
import { fetchJson } from '../http';

// ---------------------------------------------------------------------------
// Country name → ISO3 mapping (50+ major countries)
// ---------------------------------------------------------------------------

export const COUNTRY_NAME_TO_ISO3: Record<string, string> = {
  // Americas
  'united states': 'USA',
  'usa': 'USA',
  'us': 'USA',
  'america': 'USA',
  'canada': 'CAN',
  'mexico': 'MEX',
  'brazil': 'BRA',
  'argentina': 'ARG',
  'colombia': 'COL',
  'chile': 'CHL',
  'peru': 'PER',
  'venezuela': 'VEN',
  'cuba': 'CUB',
  'ecuador': 'ECU',
  'bolivia': 'BOL',
  'paraguay': 'PRY',
  'uruguay': 'URY',

  // Europe
  'germany': 'DEU',
  'france': 'FRA',
  'united kingdom': 'GBR',
  'uk': 'GBR',
  'britain': 'GBR',
  'great britain': 'GBR',
  'italy': 'ITA',
  'spain': 'ESP',
  'netherlands': 'NLD',
  'holland': 'NLD',
  'russia': 'RUS',
  'russian federation': 'RUS',
  'ukraine': 'UKR',
  'poland': 'POL',
  'sweden': 'SWE',
  'norway': 'NOR',
  'denmark': 'DNK',
  'finland': 'FIN',
  'switzerland': 'CHE',
  'austria': 'AUT',
  'belgium': 'BEL',
  'portugal': 'PRT',
  'greece': 'GRC',
  'czech republic': 'CZE',
  'czechia': 'CZE',
  'hungary': 'HUN',
  'romania': 'ROU',
  'turkey': 'TUR',
  'turkiye': 'TUR',

  // Asia-Pacific
  'china': 'CHN',
  "people's republic of china": 'CHN',
  'prc': 'CHN',
  'japan': 'JPN',
  'south korea': 'KOR',
  'korea': 'KOR',
  'republic of korea': 'KOR',
  'taiwan': 'TWN',
  'republic of china': 'TWN',
  'india': 'IND',
  'indonesia': 'IDN',
  'thailand': 'THA',
  'vietnam': 'VNM',
  'viet nam': 'VNM',
  'malaysia': 'MYS',
  'philippines': 'PHL',
  'singapore': 'SGP',
  'australia': 'AUS',
  'new zealand': 'NZL',
  'bangladesh': 'BGD',
  'pakistan': 'PAK',
  'myanmar': 'MMR',
  'cambodia': 'KHM',

  // Middle East & Central Asia
  'iran': 'IRN',
  'islamic republic of iran': 'IRN',
  'saudi arabia': 'SAU',
  'united arab emirates': 'ARE',
  'uae': 'ARE',
  'israel': 'ISR',
  'iraq': 'IRQ',
  'kuwait': 'KWT',
  'qatar': 'QAT',
  'oman': 'OMN',
  'jordan': 'JOR',
  'syria': 'SYR',
  'lebanon': 'LBN',
  'kazakhstan': 'KAZ',
  'uzbekistan': 'UZB',
  'azerbaijan': 'AZE',

  // Africa
  'south africa': 'ZAF',
  'nigeria': 'NGA',
  'egypt': 'EGY',
  'ethiopia': 'ETH',
  'kenya': 'KEN',
  'ghana': 'GHA',
  'tanzania': 'TZA',
  'algeria': 'DZA',
  'morocco': 'MAR',
  'angola': 'AGO',
  'libya': 'LBY',
  'sudan': 'SDN',
  'mozambique': 'MOZ',
  'zimbabwe': 'ZWE',
  'democratic republic of the congo': 'COD',
  'drc': 'COD',
  'congo': 'COG',
};

// ---------------------------------------------------------------------------
// ISO3 → UN Comtrade numeric reporter/partner codes
// ---------------------------------------------------------------------------

export const ISO3_TO_COMTRADE_NUM: Record<string, string> = {
  // Major economies explicitly required
  USA: '842',
  CHN: '156',
  RUS: '643',
  IRN: '364',
  DEU: '276',
  JPN: '392',
  GBR: '826',
  KOR: '410',
  TWN: '490',

  // Americas
  CAN: '124',
  MEX: '484',
  BRA: '076',
  ARG: '032',
  COL: '170',
  CHL: '152',
  PER: '604',
  VEN: '862',
  CUB: '192',
  ECU: '218',
  BOL: '068',
  PRY: '600',
  URY: '858',

  // Europe
  FRA: '251',
  ITA: '381',
  ESP: '724',
  NLD: '528',
  UKR: '804',
  POL: '616',
  SWE: '752',
  NOR: '578',
  DNK: '208',
  FIN: '246',
  CHE: '757',
  AUT: '040',
  BEL: '056',
  PRT: '620',
  GRC: '300',
  CZE: '203',
  HUN: '348',
  ROU: '642',
  TUR: '792',

  // Asia-Pacific
  IND: '699',
  IDN: '360',
  THA: '764',
  VNM: '704',
  MYS: '458',
  PHL: '608',
  SGP: '702',
  AUS: '036',
  NZL: '554',
  BGD: '050',
  PAK: '586',
  MMR: '104',
  KHM: '116',

  // Middle East & Central Asia
  SAU: '682',
  ARE: '784',
  ISR: '376',
  IRQ: '368',
  KWT: '414',
  QAT: '634',
  OMN: '512',
  JOR: '400',
  SYR: '760',
  LBN: '422',
  KAZ: '398',
  UZB: '860',
  AZE: '031',

  // Africa
  ZAF: '710',
  NGA: '566',
  EGY: '818',
  ETH: '231',
  KEN: '404',
  GHA: '288',
  TZA: '834',
  DZA: '012',
  MAR: '504',
  AGO: '024',
  LBY: '434',
  SDN: '736',
  MOZ: '508',
  ZWE: '716',
  COD: '180',
  COG: '178',
};

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ComtradeRecord {
  reporterCode: string;
  reporterLabel: string;
  partnerCode: string;
  partnerLabel: string;
  flowCode: string;
  flowLabel: string;
  commodityCode: string;
  commodityLabel: string;
  period: string;
  primaryValue: number;
  netWeight: number | null;
  qty: number | null;
  qtyUnit: string | null;
}

export interface BilateralTradeFlow {
  reporter: string;
  partner: string;
  year: string;
  imports: ComtradeRecord[];
  exports: ComtradeRecord[];
  totalImportValue: number;
  totalExportValue: number;
  tradeBalance: number;
}

export interface CommodityTradeFlow {
  commodityCode: string;
  reporter: string;
  year: string;
  records: ComtradeRecord[];
  totalValue: number;
  topPartners: { partnerLabel: string; value: number; share: number }[];
}

export interface TradePartnerSummary {
  country: string;
  flow: string;
  year: string;
  topPartners: { partnerCode: string; partnerLabel: string; value: number; share: number }[];
  totalValue: number;
}

export interface SupplyChainDependency {
  country: string;
  commodityCode: string;
  totalImports: number;
  topSuppliers: { supplierCode: string; supplierLabel: string; value: number; importShare: number }[];
  concentrationRisk: 'low' | 'medium' | 'high' | 'critical';
}

// ---------------------------------------------------------------------------
// Internal raw response shapes
// ---------------------------------------------------------------------------

interface ComtradeRawRecord {
  reporterCode?: number | string;
  reporterDesc?: string;
  partnerCode?: number | string;
  partnerDesc?: string;
  flowCode?: string;
  flowDesc?: string;
  cmdCode?: string;
  cmdDesc?: string;
  period?: number | string;
  primaryValue?: number;
  netWgt?: number | null;
  qty?: number | null;
  qtyUnitAbbr?: string | null;
}

interface ComtradeApiResponse {
  data?: ComtradeRawRecord[];
  count?: number;
  message?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveToIso3(name: string): string | null {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  // Direct ISO3 pass-through (already a code)
  if (name.length === 3 && name === name.toUpperCase() && ISO3_TO_COMTRADE_NUM[name]) {
    return name;
  }
  return COUNTRY_NAME_TO_ISO3[lower] ?? null;
}

function iso3ToNumeric(iso3: string): string | null {
  return ISO3_TO_COMTRADE_NUM[iso3] ?? null;
}

function resolveToNumeric(countryNameOrIso3: string): { iso3: string; numeric: string } | null {
  const iso3 = resolveToIso3(countryNameOrIso3);
  if (!iso3) return null;
  const numeric = iso3ToNumeric(iso3);
  if (!numeric) return null;
  return { iso3, numeric };
}

function parseComtradeRecord(raw: ComtradeRawRecord): ComtradeRecord {
  return {
    reporterCode: String(raw.reporterCode ?? ''),
    reporterLabel: raw.reporterDesc ?? '',
    partnerCode: String(raw.partnerCode ?? ''),
    partnerLabel: raw.partnerDesc ?? '',
    flowCode: raw.flowCode ?? '',
    flowLabel: raw.flowDesc ?? '',
    commodityCode: raw.cmdCode ?? '',
    commodityLabel: raw.cmdDesc ?? '',
    period: String(raw.period ?? ''),
    primaryValue: raw.primaryValue ?? 0,
    netWeight: raw.netWgt ?? null,
    qty: raw.qty ?? null,
    qtyUnit: raw.qtyUnitAbbr ?? null,
  };
}

function sumValues(records: ComtradeRecord[]): number {
  return records.reduce((acc, r) => acc + (r.primaryValue ?? 0), 0);
}

// ---------------------------------------------------------------------------
// UN Comtrade free preview API
// ---------------------------------------------------------------------------

const COMTRADE_BASE = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
const CACHE_NS_COMTRADE = 'comtrade_trade';
const CACHE_TTL_TRADE = 604800; // 7 days

/**
 * Fetch UN Comtrade preview trade data.
 *
 * @param reporterIso3  ISO3 code of the reporting country.
 * @param year          Trade year (e.g. "2022").
 * @param partnerIso3   Optional ISO3 code of the partner country ("0" = world aggregate).
 * @param commodityCode Optional HS commodity code.
 * @param flowCode      "M" (imports) or "X" (exports). Default "M".
 */
export async function fetchComtradeTrade(
  reporterIso3: string,
  year: string,
  partnerIso3?: string,
  commodityCode?: string,
  flowCode = 'M',
): Promise<ComtradeRecord[]> {
  const reporterNumeric = iso3ToNumeric(reporterIso3);
  if (!reporterNumeric) {
    console.warn(`fetchComtradeTrade: no numeric code for reporter "${reporterIso3}"`);
    return [];
  }

  const partnerNumeric = partnerIso3 ? (iso3ToNumeric(partnerIso3) ?? '0') : '0';

  const cacheParams: Record<string, string> = {
    reporter: reporterNumeric,
    period: year,
    partner: partnerNumeric,
    cmd: commodityCode ?? 'AG6',
    flow: flowCode,
  };

  const cached = getCached(CACHE_NS_COMTRADE, cacheParams) as ComtradeRecord[] | null;
  if (cached !== null) return cached;

  const params: Record<string, string> = {
    reporterCode: reporterNumeric,
    period: year,
    partnerCode: partnerNumeric,
    flowCode,
  };
  if (commodityCode) params.cmdCode = commodityCode;
  if (config.comtradeApiKey) params['subscription-key'] = config.comtradeApiKey;

  let data: ComtradeApiResponse;
  try {
    data = await fetchJson<ComtradeApiResponse>(COMTRADE_BASE, params);
  } catch (err) {
    console.warn(`Comtrade API error (reporter=${reporterIso3}, year=${year}):`, err);
    return [];
  }

  const records: ComtradeRecord[] = (data.data ?? []).map(parseComtradeRecord);
  setCached(records, CACHE_NS_COMTRADE, CACHE_TTL_TRADE, cacheParams);
  return records;
}

/**
 * Fetch bilateral trade flows (imports and exports) between two countries.
 *
 * @param reporter  Country name or ISO3 of the reporting country.
 * @param partner   Country name or ISO3 of the partner country.
 * @param year      Trade year string (e.g. "2022").
 */
export async function getBilateralTradeFlows(
  reporter: string,
  partner: string,
  year: string,
): Promise<BilateralTradeFlow> {
  const reporterResolved = resolveToNumeric(reporter);
  const partnerResolved = resolveToNumeric(partner);

  if (!reporterResolved) {
    console.warn(`getBilateralTradeFlows: cannot resolve reporter "${reporter}"`);
    return {
      reporter,
      partner,
      year,
      imports: [],
      exports: [],
      totalImportValue: 0,
      totalExportValue: 0,
      tradeBalance: 0,
    };
  }
  if (!partnerResolved) {
    console.warn(`getBilateralTradeFlows: cannot resolve partner "${partner}"`);
    return {
      reporter,
      partner,
      year,
      imports: [],
      exports: [],
      totalImportValue: 0,
      totalExportValue: 0,
      tradeBalance: 0,
    };
  }

  const [imports, exports_] = await Promise.all([
    fetchComtradeTrade(reporterResolved.iso3, year, partnerResolved.iso3, undefined, 'M'),
    fetchComtradeTrade(reporterResolved.iso3, year, partnerResolved.iso3, undefined, 'X'),
  ]);

  const totalImportValue = sumValues(imports);
  const totalExportValue = sumValues(exports_);

  return {
    reporter,
    partner,
    year,
    imports,
    exports: exports_,
    totalImportValue,
    totalExportValue,
    tradeBalance: totalExportValue - totalImportValue,
  };
}

/**
 * Fetch commodity-specific trade flows for a given reporter country.
 *
 * @param commodityCode  HS commodity code.
 * @param reporter       Country name or ISO3.
 * @param year           Trade year.
 */
export async function getCommodityTradeFlows(
  commodityCode: string,
  reporter: string,
  year: string,
): Promise<CommodityTradeFlow> {
  const resolved = resolveToNumeric(reporter);
  if (!resolved) {
    console.warn(`getCommodityTradeFlows: cannot resolve reporter "${reporter}"`);
    return {
      commodityCode,
      reporter,
      year,
      records: [],
      totalValue: 0,
      topPartners: [],
    };
  }

  const records = await fetchComtradeTrade(resolved.iso3, year, undefined, commodityCode, 'M');

  const totalValue = sumValues(records);

  // Build partner breakdown
  const partnerMap = new Map<string, { partnerLabel: string; value: number }>();
  for (const r of records) {
    const existing = partnerMap.get(r.partnerCode) ?? { partnerLabel: r.partnerLabel, value: 0 };
    existing.value += r.primaryValue;
    partnerMap.set(r.partnerCode, existing);
  }

  const topPartners = [...partnerMap.entries()]
    .map(([, v]) => ({
      partnerLabel: v.partnerLabel,
      value: v.value,
      share: totalValue > 0 ? v.value / totalValue : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return { commodityCode, reporter, year, records, totalValue, topPartners };
}

/**
 * Get a summary of the top trade partners for a country.
 *
 * @param country  Country name or ISO3.
 * @param flow     "M" (imports) or "X" (exports). Default "M".
 * @param year     Trade year (defaults to one year ago).
 */
export async function getTradePartnerSummary(
  country: string,
  flow = 'M',
  year?: string,
): Promise<TradePartnerSummary> {
  const resolved = resolveToNumeric(country);
  const tradeYear = year ?? String(new Date().getFullYear() - 1);

  if (!resolved) {
    console.warn(`getTradePartnerSummary: cannot resolve country "${country}"`);
    return { country, flow, year: tradeYear, topPartners: [], totalValue: 0 };
  }

  const records = await fetchComtradeTrade(resolved.iso3, tradeYear, undefined, undefined, flow);

  const totalValue = sumValues(records);

  const partnerMap = new Map<string, { partnerLabel: string; value: number }>();
  for (const r of records) {
    // Skip world aggregate (partner code 0)
    if (r.partnerCode === '0') continue;
    const existing = partnerMap.get(r.partnerCode) ?? { partnerLabel: r.partnerLabel, value: 0 };
    existing.value += r.primaryValue;
    partnerMap.set(r.partnerCode, existing);
  }

  const topPartners = [...partnerMap.entries()]
    .map(([code, v]) => ({
      partnerCode: code,
      partnerLabel: v.partnerLabel,
      value: v.value,
      share: totalValue > 0 ? v.value / totalValue : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);

  return { country, flow, year: tradeYear, topPartners, totalValue };
}

/**
 * Analyse import dependency for a specific commodity.
 * Returns top suppliers and their import share for the given country.
 *
 * @param country        Country name or ISO3 of the importing country.
 * @param commodityCode  HS commodity code.
 */
export async function getSupplyChainDependency(
  country: string,
  commodityCode: string,
): Promise<SupplyChainDependency> {
  const resolved = resolveToNumeric(country);
  const year = String(new Date().getFullYear() - 1);

  if (!resolved) {
    console.warn(`getSupplyChainDependency: cannot resolve country "${country}"`);
    return {
      country,
      commodityCode,
      totalImports: 0,
      topSuppliers: [],
      concentrationRisk: 'low',
    };
  }

  const records = await fetchComtradeTrade(resolved.iso3, year, undefined, commodityCode, 'M');

  const totalImports = sumValues(records);

  const supplierMap = new Map<string, { supplierLabel: string; value: number }>();
  for (const r of records) {
    if (r.partnerCode === '0') continue;
    const existing = supplierMap.get(r.partnerCode) ?? { supplierLabel: r.partnerLabel, value: 0 };
    existing.value += r.primaryValue;
    supplierMap.set(r.partnerCode, existing);
  }

  const topSuppliers = [...supplierMap.entries()]
    .map(([code, v]) => ({
      supplierCode: code,
      supplierLabel: v.supplierLabel,
      value: v.value,
      importShare: totalImports > 0 ? v.value / totalImports : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Concentration risk: HHI-inspired heuristic
  let concentrationRisk: SupplyChainDependency['concentrationRisk'] = 'low';
  if (topSuppliers.length > 0) {
    const topShare = topSuppliers[0].importShare;
    const top3Share = topSuppliers.slice(0, 3).reduce((s, x) => s + x.importShare, 0);
    if (topShare > 0.8 || top3Share > 0.95) {
      concentrationRisk = 'critical';
    } else if (topShare > 0.6 || top3Share > 0.85) {
      concentrationRisk = 'high';
    } else if (topShare > 0.4 || top3Share > 0.7) {
      concentrationRisk = 'medium';
    }
  }

  return { country, commodityCode, totalImports, topSuppliers, concentrationRisk };
}
