/**
 * Economic data clients: FRED (Federal Reserve), IMF DataMapper, and World Bank.
 *
 * Ports Python economic/client.py to TypeScript for the Express backend.
 */

import { getCached, setCached } from '../cache';
import { config } from '../config';
import { fetchJson } from '../http';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface FredObservation {
  date: string;
  value: number | null;
}

export interface FredSeriesResponse {
  seriesId: string;
  observations: FredObservation[];
  count: number;
}

export interface CommodityPriceResult {
  commodity: string;
  seriesId: string;
  observations: FredObservation[];
  latestDate: string | null;
  latestValue: number | null;
  periodDays: number;
}

export interface ImfIndicatorResult {
  indicator: string;
  countryCode: string;
  data: Record<string, number | null>;
}

export interface WbIndicatorRecord {
  date: string;
  value: number | null;
  countryName: string;
  countryIso2: string;
  indicatorId: string;
  indicatorLabel: string;
}

export interface WbIndicatorResult {
  countryIso2: string;
  indicatorCode: string;
  records: WbIndicatorRecord[];
}

export interface CountryProfile {
  country: string;
  iso2: string;
  iso3: string;
  gdpUsd: number | null;
  gdpGrowthPct: number | null;
  population: number | null;
  gdpPerCapita: number | null;
  inflationPct: number | null;
  unemploymentPct: number | null;
  currentAccountPctGdp: number | null;
  tradeOpennessPct: number | null;
  dataYear: string | null;
}

export interface MacroSeriesResult {
  indicator: string;
  country: string;
  source: 'imf' | 'worldbank' | 'unavailable';
  data: { year: string; value: number | null }[];
}

export interface SanctionImpactEstimate {
  targetCountry: string;
  sanctionType: string;
  estimatedGdpImpactPct: number;
  estimatedTradeImpactPct: number;
  vulnerabilityScore: number; // 0–10
  keyVulnerabilities: string[];
  mitigationFactors: string[];
  confidenceLevel: 'low' | 'medium' | 'high';
  notes: string;
}

// ---------------------------------------------------------------------------
// Internal raw response shapes
// ---------------------------------------------------------------------------

interface FredApiResponse {
  observations?: {
    date?: string;
    value?: string;
  }[];
}

interface ImfApiResponse {
  values?: Record<string, Record<string, number | null | undefined>>;
}

interface WbApiResponseMeta {
  page?: number;
  pages?: number;
  total?: number;
  per_page?: number;
}

interface WbApiRecord {
  date?: string;
  value?: number | null;
  country?: { id?: string; value?: string };
  indicator?: { id?: string; value?: string };
}

// ---------------------------------------------------------------------------
// Country code lookups
// ---------------------------------------------------------------------------

/** Country name / ISO3 → ISO2 */
const ISO3_TO_ISO2: Record<string, string> = {
  USA: 'US', CAN: 'CA', MEX: 'MX', BRA: 'BR', ARG: 'AR', COL: 'CO', CHL: 'CL', PER: 'PE',
  VEN: 'VE', CUB: 'CU', ECU: 'EC', BOL: 'BO', PRY: 'PY', URY: 'UY',
  DEU: 'DE', FRA: 'FR', GBR: 'GB', ITA: 'IT', ESP: 'ES', NLD: 'NL', RUS: 'RU', UKR: 'UA',
  POL: 'PL', SWE: 'SE', NOR: 'NO', DNK: 'DK', FIN: 'FI', CHE: 'CH', AUT: 'AT', BEL: 'BE',
  PRT: 'PT', GRC: 'GR', CZE: 'CZ', HUN: 'HU', ROU: 'RO', TUR: 'TR',
  CHN: 'CN', JPN: 'JP', KOR: 'KR', TWN: 'TW', IND: 'IN', IDN: 'ID', THA: 'TH', VNM: 'VN',
  MYS: 'MY', PHL: 'PH', SGP: 'SG', AUS: 'AU', NZL: 'NZ', BGD: 'BD', PAK: 'PK', MMR: 'MM',
  KHM: 'KH', IRN: 'IR', SAU: 'SA', ARE: 'AE', ISR: 'IL', IRQ: 'IQ', KWT: 'KW', QAT: 'QA',
  OMN: 'OM', JOR: 'JO', SYR: 'SY', LBN: 'LB', KAZ: 'KZ', UZB: 'UZ', AZE: 'AZ',
  ZAF: 'ZA', NGA: 'NG', EGY: 'EG', ETH: 'ET', KEN: 'KE', GHA: 'GH', TZA: 'TZ', DZA: 'DZ',
  MAR: 'MA', AGO: 'AO', LBY: 'LY', SDN: 'SD', MOZ: 'MZ', ZWE: 'ZW', COD: 'CD', COG: 'CG',
};

const COUNTRY_NAME_TO_ISO3: Record<string, string> = {
  'united states': 'USA', 'usa': 'USA', 'us': 'USA', 'america': 'USA',
  'canada': 'CAN', 'mexico': 'MEX', 'brazil': 'BRA', 'argentina': 'ARG',
  'colombia': 'COL', 'chile': 'CHL', 'peru': 'PER', 'venezuela': 'VEN',
  'cuba': 'CUB', 'ecuador': 'ECU', 'bolivia': 'BOL', 'paraguay': 'PRY', 'uruguay': 'URY',
  'germany': 'DEU', 'france': 'FRA', 'united kingdom': 'GBR', 'uk': 'GBR',
  'britain': 'GBR', 'great britain': 'GBR', 'italy': 'ITA', 'spain': 'ESP',
  'netherlands': 'NLD', 'holland': 'NLD', 'russia': 'RUS', 'russian federation': 'RUS',
  'ukraine': 'UKR', 'poland': 'POL', 'sweden': 'SWE', 'norway': 'NOR',
  'denmark': 'DNK', 'finland': 'FIN', 'switzerland': 'CHE', 'austria': 'AUT',
  'belgium': 'BEL', 'portugal': 'PRT', 'greece': 'GRC', 'czech republic': 'CZE',
  'czechia': 'CZE', 'hungary': 'HUN', 'romania': 'ROU', 'turkey': 'TUR', 'turkiye': 'TUR',
  'china': 'CHN', "people's republic of china": 'CHN', 'prc': 'CHN',
  'japan': 'JPN', 'south korea': 'KOR', 'korea': 'KOR', 'republic of korea': 'KOR',
  'taiwan': 'TWN', 'republic of china': 'TWN', 'india': 'IND', 'indonesia': 'IDN',
  'thailand': 'THA', 'vietnam': 'VNM', 'viet nam': 'VNM', 'malaysia': 'MYS',
  'philippines': 'PHL', 'singapore': 'SGP', 'australia': 'AUS', 'new zealand': 'NZL',
  'bangladesh': 'BGD', 'pakistan': 'PAK', 'myanmar': 'MMR', 'cambodia': 'KHM',
  'iran': 'IRN', 'islamic republic of iran': 'IRN', 'saudi arabia': 'SAU',
  'united arab emirates': 'ARE', 'uae': 'ARE', 'israel': 'ISR', 'iraq': 'IRQ',
  'kuwait': 'KWT', 'qatar': 'QAT', 'oman': 'OMN', 'jordan': 'JOR', 'syria': 'SYR',
  'lebanon': 'LBN', 'kazakhstan': 'KAZ', 'uzbekistan': 'UZB', 'azerbaijan': 'AZE',
  'south africa': 'ZAF', 'nigeria': 'NGA', 'egypt': 'EGY', 'ethiopia': 'ETH',
  'kenya': 'KEN', 'ghana': 'GHA', 'tanzania': 'TZA', 'algeria': 'DZA', 'morocco': 'MAR',
  'angola': 'AGO', 'libya': 'LBY', 'sudan': 'SDN', 'mozambique': 'MOZ',
  'zimbabwe': 'ZWE', 'democratic republic of the congo': 'COD', 'drc': 'COD', 'congo': 'COG',
};

/**
 * Resolve a country name or code to { iso2, iso3 }.
 * Returns null when the country cannot be mapped.
 */
function resolveCountry(nameOrCode: string): { iso2: string; iso3: string } | null {
  const trimmed = nameOrCode.trim();

  // Already ISO3?
  if (trimmed.length === 3) {
    const upper = trimmed.toUpperCase();
    const iso2 = ISO3_TO_ISO2[upper];
    if (iso2) return { iso2, iso3: upper };
  }

  // Already ISO2?
  if (trimmed.length === 2) {
    const upper = trimmed.toUpperCase();
    const entry = Object.entries(ISO3_TO_ISO2).find(([, v]) => v === upper);
    if (entry) return { iso2: upper, iso3: entry[0] };
  }

  const iso3 = COUNTRY_NAME_TO_ISO3[trimmed.toLowerCase()];
  if (!iso3) return null;
  const iso2 = ISO3_TO_ISO2[iso3];
  if (!iso2) return null;
  return { iso2, iso3 };
}

// ---------------------------------------------------------------------------
// FRED
// ---------------------------------------------------------------------------

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const CACHE_NS_FRED = 'fred';
const CACHE_TTL_FRED = 3600; // 1 hour — prices change daily

/** Map commodity name to FRED series ID. */
const COMMODITY_SERIES_MAP: Record<string, string> = {
  oil: 'DCOILWTICO',
  crude_oil: 'DCOILWTICO',
  wti: 'DCOILWTICO',
  brent: 'DCOILBRENTEU',
  gold: 'GOLDAMGBD228NLBM',
  silver: 'GOLDAMGBD228NLBM', // fallback — no dedicated FRED silver series in free tier
  copper: 'PCOPPUSDM',
  wheat: 'WPU0121',
  corn: 'WPU012103',
  natural_gas: 'DHHNGSP',
  gas: 'DHHNGSP',
  coal: 'PCOALAUUSDM',
  aluminum: 'PALUMUSDM',
  iron_ore: 'PIORECRUSDM',
  lumber: 'WPU081',
  soybeans: 'WPU01820112',
  cotton: 'PCOTTINDUSDM',
  sugar: 'PSUGAISAUSDM',
  coffee: 'PCOFFOTMUSDM',
};

/**
 * Fetch FRED series observations.
 *
 * @param seriesId    FRED series identifier (e.g. "DCOILWTICO").
 * @param startDate   Optional ISO-8601 date string.
 * @param endDate     Optional ISO-8601 date string.
 * @param limit       Max number of observations (sorted desc, so most recent first).
 */
export async function fredGetSeriesObservations(
  seriesId: string,
  startDate?: string,
  endDate?: string,
  limit = 100,
): Promise<FredSeriesResponse> {
  const cacheParams: Record<string, string> = {
    series_id: seriesId,
    start: startDate ?? '',
    end: endDate ?? '',
    limit: String(limit),
  };
  const cached = getCached(CACHE_NS_FRED, cacheParams) as FredSeriesResponse | null;
  if (cached !== null) return cached;

  if (!config.fredApiKey) {
    console.warn('fredGetSeriesObservations: FRED_API_KEY not set — returning empty result');
    return { seriesId, observations: [], count: 0 };
  }

  const params: Record<string, string> = {
    api_key: config.fredApiKey,
    series_id: seriesId,
    file_type: 'json',
    sort_order: 'desc',
    limit: String(limit),
  };
  if (startDate) params.observation_start = startDate;
  if (endDate) params.observation_end = endDate;

  let data: FredApiResponse;
  try {
    data = await fetchJson<FredApiResponse>(FRED_BASE, params);
  } catch (err) {
    console.warn(`FRED API error (series=${seriesId}):`, err);
    return { seriesId, observations: [], count: 0 };
  }

  const observations: FredObservation[] = (data.observations ?? []).map((o) => ({
    date: o.date ?? '',
    value: o.value && o.value !== '.' ? parseFloat(o.value) : null,
  }));

  const result: FredSeriesResponse = { seriesId, observations, count: observations.length };
  setCached(result, CACHE_NS_FRED, CACHE_TTL_FRED, cacheParams);
  return result;
}

/**
 * Fetch recent price observations for a named commodity.
 *
 * @param commodity  Commodity name key (e.g. "oil", "gold", "wheat").
 * @param periodDays Number of days to look back (default 365).
 */
export async function getCommodityPrice(
  commodity: string,
  periodDays = 365,
): Promise<CommodityPriceResult> {
  const normalised = commodity.toLowerCase().replace(/\s+/g, '_');
  const seriesId = COMMODITY_SERIES_MAP[normalised];

  if (!seriesId) {
    console.warn(`getCommodityPrice: no FRED series mapped for commodity "${commodity}"`);
    return {
      commodity,
      seriesId: '',
      observations: [],
      latestDate: null,
      latestValue: null,
      periodDays,
    };
  }

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - periodDays * 86400 * 1000).toISOString().slice(0, 10);

  const series = await fredGetSeriesObservations(seriesId, startDate, endDate, 500);

  const validObs = series.observations.filter((o) => o.value !== null);
  const latestObs = validObs[0] ?? null;

  return {
    commodity,
    seriesId,
    observations: series.observations,
    latestDate: latestObs?.date ?? null,
    latestValue: latestObs?.value ?? null,
    periodDays,
  };
}

// ---------------------------------------------------------------------------
// IMF DataMapper
// ---------------------------------------------------------------------------

const IMF_BASE = 'https://www.imf.org/external/datamapper/api/v1';
const CACHE_NS_IMF = 'imf';
const CACHE_TTL_IMF = 7200; // 2 hours

/**
 * Fetch IMF DataMapper indicator for a country.
 *
 * @param indicator    IMF indicator code (e.g. "NGDPDPC", "PCPIPCH").
 * @param countryCode  ISO3 country code.
 */
export async function imfGetIndicator(
  indicator: string,
  countryCode: string,
): Promise<ImfIndicatorResult> {
  const cacheParams: Record<string, string> = { indicator, country: countryCode };
  const cached = getCached(CACHE_NS_IMF, cacheParams) as ImfIndicatorResult | null;
  if (cached !== null) return cached;

  let data: ImfApiResponse;
  try {
    data = await fetchJson<ImfApiResponse>(`${IMF_BASE}/${indicator}/${countryCode}`);
  } catch (err) {
    console.warn(`IMF API error (indicator=${indicator}, country=${countryCode}):`, err);
    return { indicator, countryCode, data: {} };
  }

  const rawValues = data.values?.[indicator]?.[countryCode] ?? {};
  const yearlyData: Record<string, number | null> = {};
  for (const [year, val] of Object.entries(rawValues)) {
    yearlyData[year] = val != null ? Number(val) : null;
  }

  const result: ImfIndicatorResult = { indicator, countryCode, data: yearlyData };
  setCached(result, CACHE_NS_IMF, CACHE_TTL_IMF, cacheParams);
  return result;
}

/**
 * Get the most recent non-null IMF indicator value for a country.
 *
 * @param indicator    IMF indicator code.
 * @param countryCode  ISO3 country code.
 * @returns { year, value } or null if unavailable.
 */
export async function imfGetLatestValue(
  indicator: string,
  countryCode: string,
): Promise<{ year: string; value: number } | null> {
  const result = await imfGetIndicator(indicator, countryCode);
  const sortedYears = Object.keys(result.data).sort((a, b) => b.localeCompare(a));

  for (const year of sortedYears) {
    const val = result.data[year];
    if (val !== null && val !== undefined) {
      return { year, value: val };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// World Bank
// ---------------------------------------------------------------------------

const WB_BASE = 'https://api.worldbank.org/v2/country';
const CACHE_NS_WB = 'worldbank';
const CACHE_TTL_WB = 7200; // 2 hours

/**
 * Fetch World Bank indicator data for a country.
 *
 * @param countryIso2   ISO2 country code.
 * @param indicatorCode World Bank indicator code (e.g. "NY.GDP.MKTP.CD").
 * @param perPage       Number of records per page (default 50).
 */
export async function wbGetIndicator(
  countryIso2: string,
  indicatorCode: string,
  perPage = 50,
): Promise<WbIndicatorResult> {
  const cacheParams: Record<string, string> = {
    country: countryIso2,
    indicator: indicatorCode,
    per_page: String(perPage),
  };
  const cached = getCached(CACHE_NS_WB, cacheParams) as WbIndicatorResult | null;
  if (cached !== null) return cached;

  const url = `${WB_BASE}/${countryIso2}/indicator/${indicatorCode}`;
  const params: Record<string, string> = {
    format: 'json',
    per_page: String(perPage),
  };

  let rawResponse: unknown;
  try {
    rawResponse = await fetchJson<unknown>(url, params);
  } catch (err) {
    console.warn(`World Bank API error (country=${countryIso2}, indicator=${indicatorCode}):`, err);
    return { countryIso2, indicatorCode, records: [] };
  }

  // World Bank returns an array: [meta, data[]]
  const dataArray = Array.isArray(rawResponse) ? (rawResponse[1] as WbApiRecord[]) ?? [] : [];

  const records: WbIndicatorRecord[] = dataArray.map((item) => ({
    date: item.date ?? '',
    value: item.value ?? null,
    countryName: item.country?.value ?? '',
    countryIso2: item.country?.id ?? countryIso2,
    indicatorId: item.indicator?.id ?? indicatorCode,
    indicatorLabel: item.indicator?.value ?? '',
  }));

  const result: WbIndicatorResult = { countryIso2, indicatorCode, records };
  setCached(result, CACHE_NS_WB, CACHE_TTL_WB, cacheParams);
  return result;
}

/**
 * Get the most recent non-null World Bank indicator value for a country.
 *
 * @param countryIso2   ISO2 country code.
 * @param indicatorCode World Bank indicator code.
 * @returns { date, value } or null if unavailable.
 */
export async function wbGetLatestValue(
  countryIso2: string,
  indicatorCode: string,
): Promise<{ date: string; value: number } | null> {
  const result = await wbGetIndicator(countryIso2, indicatorCode, 10);

  const sorted = [...result.records].sort((a, b) => b.date.localeCompare(a.date));
  for (const record of sorted) {
    if (record.value !== null && record.value !== undefined) {
      return { date: record.date, value: record.value };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// High-level composite functions
// ---------------------------------------------------------------------------

/**
 * Build a comprehensive macroeconomic country profile using IMF and World Bank data.
 *
 * @param country  Country name or ISO2/ISO3 code.
 */
export async function buildCountryProfile(country: string): Promise<CountryProfile> {
  const resolved = resolveCountry(country);

  if (!resolved) {
    console.warn(`buildCountryProfile: cannot resolve country "${country}"`);
    return {
      country,
      iso2: '',
      iso3: '',
      gdpUsd: null,
      gdpGrowthPct: null,
      population: null,
      gdpPerCapita: null,
      inflationPct: null,
      unemploymentPct: null,
      currentAccountPctGdp: null,
      tradeOpennessPct: null,
      dataYear: null,
    };
  }

  // Parallel fetch — IMF indicators + World Bank indicators
  const [
    gdpImf,
    gdpGrowthImf,
    inflationImf,
    unemploymentImf,
    currentAccountImf,
    gdpWb,
    populationWb,
    gdpPerCapitaWb,
    tradeOpennessWb,
  ] = await Promise.allSettled([
    imfGetLatestValue('NGDPD', resolved.iso3),           // GDP current prices USD billions
    imfGetLatestValue('NGDP_RPCH', resolved.iso3),       // GDP real growth %
    imfGetLatestValue('PCPIPCH', resolved.iso3),         // Inflation %
    imfGetLatestValue('LUR', resolved.iso3),             // Unemployment rate %
    imfGetLatestValue('BCA_NGDPD', resolved.iso3),       // Current account % of GDP
    wbGetLatestValue(resolved.iso2, 'NY.GDP.MKTP.CD'),   // GDP current USD
    wbGetLatestValue(resolved.iso2, 'SP.POP.TOTL'),      // Population
    wbGetLatestValue(resolved.iso2, 'NY.GDP.PCAP.CD'),   // GDP per capita USD
    wbGetLatestValue(resolved.iso2, 'NE.TRD.GNFS.ZS'),  // Trade openness % of GDP
  ]);

  function getVal<T>(result: PromiseSettledResult<T | null>): T | null {
    return result.status === 'fulfilled' ? result.value : null;
  }

  const gdpImfVal = getVal(gdpImf);
  const gdpWbVal = getVal(gdpWb);
  const populationVal = getVal(populationWb);
  const gdpPerCapitaVal = getVal(gdpPerCapitaWb);
  const gdpGrowthVal = getVal(gdpGrowthImf);
  const inflationVal = getVal(inflationImf);
  const unemploymentVal = getVal(unemploymentImf);
  const currentAccountVal = getVal(currentAccountImf);
  const tradeOpennessVal = getVal(tradeOpennessWb);

  // Prefer IMF GDP (billions → units) over World Bank
  const gdpUsd = gdpImfVal
    ? gdpImfVal.value * 1e9
    : gdpWbVal
      ? gdpWbVal.value
      : null;

  const dataYear =
    gdpImfVal?.year ??
    gdpWbVal?.date ??
    populationVal?.date ??
    null;

  return {
    country,
    iso2: resolved.iso2,
    iso3: resolved.iso3,
    gdpUsd,
    gdpGrowthPct: gdpGrowthVal?.value ?? null,
    population: populationVal?.value ?? null,
    gdpPerCapita: gdpPerCapitaVal?.value ?? null,
    inflationPct: inflationVal?.value ?? null,
    unemploymentPct: unemploymentVal?.value ?? null,
    currentAccountPctGdp: currentAccountVal?.value ?? null,
    tradeOpennessPct: tradeOpennessVal?.value ?? null,
    dataYear,
  };
}

/**
 * Fetch a macro-economic time series for a country.
 * Tries IMF first; falls back to World Bank if IMF returns no data.
 *
 * @param indicator  Indicator name key (see IMF_INDICATOR_MAP / WB_INDICATOR_MAP below).
 * @param country    Country name or ISO2/ISO3 code.
 * @param years      Number of recent years to return (default 5).
 */

const IMF_INDICATOR_MAP: Record<string, string> = {
  gdp: 'NGDPD',
  gdp_growth: 'NGDP_RPCH',
  gdp_per_capita: 'NGDPDPC',
  inflation: 'PCPIPCH',
  unemployment: 'LUR',
  current_account: 'BCA_NGDPD',
  government_debt: 'GGXWDG_NGDP',
  fiscal_balance: 'GGXCNL_NGDP',
  exports: 'TX_RPCH',
  imports: 'TM_RPCH',
};

const WB_INDICATOR_MAP: Record<string, string> = {
  gdp: 'NY.GDP.MKTP.CD',
  gdp_growth: 'NY.GDP.MKTP.KD.ZG',
  gdp_per_capita: 'NY.GDP.PCAP.CD',
  inflation: 'FP.CPI.TOTL.ZG',
  unemployment: 'SL.UEM.TOTL.ZS',
  population: 'SP.POP.TOTL',
  trade_openness: 'NE.TRD.GNFS.ZS',
  fdi_inflows: 'BX.KLT.DINV.CD.WD',
  external_debt: 'DT.DOD.DECT.CD',
  reserves: 'FI.RES.TOTL.CD',
};

export async function fetchMacroSeries(
  indicator: string,
  country: string,
  years = 5,
): Promise<MacroSeriesResult> {
  const resolved = resolveCountry(country);
  const normalised = indicator.toLowerCase().replace(/\s+/g, '_');

  if (!resolved) {
    return { indicator, country, source: 'unavailable', data: [] };
  }

  // Try IMF first
  const imfCode = IMF_INDICATOR_MAP[normalised];
  if (imfCode) {
    const imfResult = await imfGetIndicator(imfCode, resolved.iso3);
    const entries = Object.entries(imfResult.data)
      .filter(([, v]) => v !== null && v !== undefined)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, years)
      .map(([year, value]) => ({ year, value: value as number }));

    if (entries.length > 0) {
      return { indicator, country, source: 'imf', data: entries.reverse() };
    }
  }

  // Fallback: World Bank
  const wbCode = WB_INDICATOR_MAP[normalised];
  if (wbCode) {
    const wbResult = await wbGetIndicator(resolved.iso2, wbCode, years * 2);
    const entries = wbResult.records
      .filter((r) => r.value !== null && r.value !== undefined)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, years)
      .map((r) => ({ year: r.date, value: r.value as number }));

    if (entries.length > 0) {
      return { indicator, country, source: 'worldbank', data: entries.reverse() };
    }
  }

  return { indicator, country, source: 'unavailable', data: [] };
}

/**
 * Heuristic estimate of sanctions impact on a target country.
 * Combines GDP, trade openness, reserve data, and known vulnerability patterns.
 *
 * @param targetCountry  Country name or code of the sanctioned country.
 * @param sanctionType   One of: "comprehensive", "sectoral", "financial", "trade", "travel".
 */
export async function estimateSanctionImpact(
  targetCountry: string,
  sanctionType: string,
): Promise<SanctionImpactEstimate> {
  const [profile, tradeSeries, reservesSeries] = await Promise.allSettled([
    buildCountryProfile(targetCountry),
    fetchMacroSeries('trade_openness', targetCountry, 3),
    fetchMacroSeries('reserves', targetCountry, 1),
  ]);

  const profileData = profile.status === 'fulfilled' ? profile.value : null;
  const tradeData = tradeSeries.status === 'fulfilled' ? tradeSeries.value : null;
  const reservesData = reservesSeries.status === 'fulfilled' ? reservesSeries.value : null;

  // Base GDP impact by sanction type (rough academic estimates)
  const baseGdpImpactMap: Record<string, number> = {
    comprehensive: 5.0,
    sectoral: 2.5,
    financial: 3.5,
    trade: 2.0,
    travel: 0.3,
    arms: 0.5,
    targeted: 0.1,
  };

  const normalised = sanctionType.toLowerCase().replace(/[\s-]+/g, '_');
  let baseGdpImpact = baseGdpImpactMap[normalised] ?? 2.0;
  let baseTradeImpact = baseGdpImpact * 1.8;

  const keyVulnerabilities: string[] = [];
  const mitigationFactors: string[] = [];

  // Adjust based on trade openness
  const latestTradeOpenness = tradeData?.data.slice(-1)[0]?.value ?? null;
  if (latestTradeOpenness !== null && latestTradeOpenness !== undefined) {
    if (latestTradeOpenness > 80) {
      keyVulnerabilities.push(`High trade openness (${latestTradeOpenness.toFixed(1)}% of GDP)`);
      baseGdpImpact *= 1.3;
      baseTradeImpact *= 1.4;
    } else if (latestTradeOpenness < 30) {
      mitigationFactors.push(`Low trade openness (${latestTradeOpenness.toFixed(1)}% of GDP)`);
      baseGdpImpact *= 0.8;
    }
  }

  // Adjust based on reserves (import coverage proxy)
  const reserves = reservesData?.data.slice(-1)[0]?.value;
  if (reserves !== undefined && reserves !== null && profileData?.gdpUsd) {
    const reservesPctGdp = (reserves / profileData.gdpUsd) * 100;
    if (reservesPctGdp < 5) {
      keyVulnerabilities.push(`Low foreign reserves (${reservesPctGdp.toFixed(1)}% of GDP)`);
      baseGdpImpact *= 1.2;
    } else if (reservesPctGdp > 30) {
      mitigationFactors.push(`Large foreign reserves buffer (${reservesPctGdp.toFixed(1)}% of GDP)`);
      baseGdpImpact *= 0.85;
    }
  }

  // Known vulnerability flags based on country profile
  if (profileData) {
    if (profileData.inflationPct !== null && profileData.inflationPct > 20) {
      keyVulnerabilities.push('Pre-existing high inflation — sanctions would amplify currency pressure');
    }
    if (profileData.unemploymentPct !== null && profileData.unemploymentPct > 15) {
      keyVulnerabilities.push('High unemployment — limited social resilience buffer');
    }
    if (profileData.currentAccountPctGdp !== null && profileData.currentAccountPctGdp < -5) {
      keyVulnerabilities.push('Significant current account deficit — import-dependent');
    }
    if (profileData.currentAccountPctGdp !== null && profileData.currentAccountPctGdp > 5) {
      mitigationFactors.push('Current account surplus — strong external position');
    }
    if (profileData.gdpGrowthPct !== null && profileData.gdpGrowthPct > 4) {
      mitigationFactors.push('Strong pre-sanctions growth trajectory');
    }
  }

  if (sanctionType.toLowerCase().includes('financial') || sanctionType.toLowerCase().includes('swift')) {
    keyVulnerabilities.push('Exclusion from global financial messaging system (SWIFT)');
  }
  if (sanctionType.toLowerCase().includes('comprehensive')) {
    keyVulnerabilities.push('Full export/import restrictions with major economies');
    keyVulnerabilities.push('Technology and dual-use goods embargo');
  }

  // Vulnerability score (0–10)
  const rawScore = Math.min(10, baseGdpImpact * 1.2 + keyVulnerabilities.length * 0.5 - mitigationFactors.length * 0.3);
  const vulnerabilityScore = Math.round(rawScore * 10) / 10;

  // Confidence — decreases without data
  const hasGoodData = profileData && profileData.gdpUsd !== null && profileData.tradeOpennessPct !== null;
  const confidenceLevel: SanctionImpactEstimate['confidenceLevel'] = hasGoodData ? 'medium' : 'low';

  return {
    targetCountry,
    sanctionType,
    estimatedGdpImpactPct: Math.round(baseGdpImpact * 10) / 10,
    estimatedTradeImpactPct: Math.round(baseTradeImpact * 10) / 10,
    vulnerabilityScore,
    keyVulnerabilities,
    mitigationFactors,
    confidenceLevel,
    notes:
      'Heuristic estimate based on trade openness, reserve levels, and historical sanction literature. ' +
      'Actual impact depends on implementation scope, third-party enforcement, and target country adaptation.',
  };
}
