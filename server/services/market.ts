/**
 * market.ts — TypeScript port of Python market/client.py
 *
 * Calls Yahoo Finance REST APIs directly (no yfinance library) and
 * the FRED API for macroeconomic series.
 */

import { getCached, setCached } from '../cache';
import { fetchJson } from '../http';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface StockProfile {
  name: string;
  ticker: string;
  sector: string;
  industry: string;
  country: string;
  exchange: string;
  marketCap: number | null;
  description: string;
}

export interface HistoricalPrice {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface PriceData {
  currentPrice: number | null;
  changePct: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  historical: HistoricalPrice[];
}

export interface InstitutionalHolder {
  holderName: string;
  pctHeld: number | null;
  value: number | null;
  shares: number | null;
}

export interface AnalystEstimate {
  targetPrice: number | null;
  recommendation: string;
  numAnalysts: number | null;
}

// ---------------------------------------------------------------------------
// Internal Yahoo Finance response shapes (partial)
// ---------------------------------------------------------------------------

interface YFRawValue {
  raw?: number | null;
  fmt?: string | null;
}

interface YFQuoteSummaryResult {
  assetProfile?: {
    sector?: string;
    industry?: string;
    country?: string;
    longBusinessSummary?: string;
  };
  price?: {
    shortName?: string;
    longName?: string;
    exchangeName?: string;
    marketCap?: YFRawValue;
    regularMarketPrice?: YFRawValue;
    regularMarketPreviousClose?: YFRawValue;
  };
  summaryDetail?: {
    marketCap?: YFRawValue;
    fiftyTwoWeekHigh?: YFRawValue;
    fiftyTwoWeekLow?: YFRawValue;
  };
  financialData?: {
    targetMeanPrice?: YFRawValue;
    recommendationKey?: string;
    numberOfAnalystOpinions?: YFRawValue;
  };
  recommendationTrend?: unknown;
  institutionOwnership?: {
    ownershipList?: Array<{
      organization?: string;
      pctHeld?: YFRawValue;
      value?: YFRawValue;
      position?: YFRawValue;
    }>;
  };
}

interface YFQuoteSummaryResponse {
  quoteSummary?: {
    result?: YFQuoteSummaryResult[] | null;
    error?: unknown;
  };
}

interface YFChartQuote {
  open?: (number | null)[];
  high?: (number | null)[];
  low?: (number | null)[];
  close?: (number | null)[];
  volume?: (number | null)[];
}

interface YFChartResult {
  meta?: {
    regularMarketPrice?: number;
    previousClose?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: YFChartQuote[];
  };
}

interface YFChartResponse {
  chart?: {
    result?: YFChartResult[] | null;
    error?: unknown;
  };
}

// ---------------------------------------------------------------------------
// FRED response shapes
// ---------------------------------------------------------------------------

interface FredObservation {
  date: string;
  value: string;
}

interface FredObservationsResponse {
  observations?: FredObservation[];
  error_code?: number;
  error_message?: string;
}

interface FredSeries {
  id: string;
  title: string;
  observation_start?: string;
  observation_end?: string;
  frequency?: string;
  units?: string;
  seasonal_adjustment?: string;
  notes?: string;
}

interface FredSearchResponse {
  seriess?: FredSeries[];
  error_code?: number;
  error_message?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const YF_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (compatible; OSINT-Tool/1.0)',
};

const YF_CHART_BASE = 'https://query2.finance.yahoo.com/v8/finance/chart';
const YF_SUMMARY_BASE = 'https://query2.finance.yahoo.com/v10/finance/quoteSummary';
const FRED_BASE = 'https://api.stlouisfed.org/fred';

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

/** Map period string → number of days */
function periodToDays(period: string): number {
  const map: Record<string, number> = {
    '1y': 365,
    '6mo': 180,
    '3mo': 90,
    '1mo': 30,
    '5d': 5,
    '1d': 1,
  };
  return map[period] ?? 365;
}

/** Return [period1, period2] as unix seconds for a trailing-period window */
function periodToUnix(period: string): [number, number] {
  const days = periodToDays(period);
  const now = Math.floor(Date.now() / 1000);
  const start = now - days * 86400;
  return [start, now];
}

/** Parse a YYYY-MM-DD string to unix seconds (UTC midnight) */
function dateToUnix(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
}

/** Format a unix timestamp (seconds) to YYYY-MM-DD */
function unixToDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** Safe extraction from a YFRawValue, falling back to null */
function raw(val: YFRawValue | undefined | null): number | null {
  return val?.raw ?? null;
}

// ---------------------------------------------------------------------------
// Helper: isPensionOrSovereign
// ---------------------------------------------------------------------------

const PENSION_KEYWORDS = [
  'pension',
  'retirement',
  'sovereign',
  'calpers',
  'calstrs',
  'teachers',
  'government',
  'norway',
  'public employees',
  'state board',
  'endowment',
];

export function isPensionOrSovereign(name: string): boolean {
  const lower = name.toLowerCase();
  return PENSION_KEYWORDS.some((kw) => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Fetch quoteSummary modules and return the first result, or null */
async function fetchQuoteSummary(
  ticker: string,
  modules: string,
): Promise<YFQuoteSummaryResult | null> {
  const url = `${YF_SUMMARY_BASE}/${encodeURIComponent(ticker)}`;
  const data = await fetchJson<YFQuoteSummaryResponse>(
    url,
    { modules },
    YF_HEADERS,
  );
  const results = data?.quoteSummary?.result;
  if (!results || results.length === 0) return null;
  return results[0];
}

/** Fetch chart data and return the first result, or null */
async function fetchChart(
  ticker: string,
  period1: number,
  period2: number,
  interval = '1d',
): Promise<YFChartResult | null> {
  const url = `${YF_CHART_BASE}/${encodeURIComponent(ticker)}`;
  const data = await fetchJson<YFChartResponse>(
    url,
    {
      period1: String(period1),
      period2: String(period2),
      interval,
    },
    YF_HEADERS,
  );
  const results = data?.chart?.result;
  if (!results || results.length === 0) return null;
  return results[0];
}

/** Build HistoricalPrice[] from a chart result */
function parseHistorical(result: YFChartResult): HistoricalPrice[] {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const opens = quote.open ?? [];
  const highs = quote.high ?? [];
  const lows = quote.low ?? [];
  const closes = quote.close ?? [];
  const volumes = quote.volume ?? [];

  return timestamps.map((ts, i) => ({
    date: unixToDate(ts),
    open: opens[i] ?? null,
    high: highs[i] ?? null,
    low: lows[i] ?? null,
    close: closes[i] ?? null,
    volume: volumes[i] ?? null,
  }));
}

// ---------------------------------------------------------------------------
// YFinanceClient
// ---------------------------------------------------------------------------

export class YFinanceClient {
  // -------------------------------------------------------------------------
  // getStockProfile
  // -------------------------------------------------------------------------
  async getStockProfile(ticker: string): Promise<StockProfile> {
    const NS = 'yf:profile';
    const cached = getCached(NS, { ticker });
    if (cached) return cached as StockProfile;

    const result = await fetchQuoteSummary(
      ticker,
      'assetProfile,price,summaryDetail',
    );

    const profile = result?.assetProfile;
    const price = result?.price;
    const summary = result?.summaryDetail;

    const marketCap =
      raw(price?.marketCap) ?? raw(summary?.marketCap) ?? null;

    const data: StockProfile = {
      name: price?.shortName ?? price?.longName ?? ticker,
      ticker: ticker.toUpperCase(),
      sector: profile?.sector ?? '',
      industry: profile?.industry ?? '',
      country: profile?.country ?? '',
      exchange: price?.exchangeName ?? '',
      marketCap,
      description: profile?.longBusinessSummary ?? '',
    };

    setCached(data, NS, 3600, { ticker });
    return data;
  }

  // -------------------------------------------------------------------------
  // getPriceData
  // -------------------------------------------------------------------------
  async getPriceData(ticker: string, period = '1y'): Promise<PriceData> {
    const NS = 'yf:price';
    const cached = getCached(NS, { ticker, period });
    if (cached) return cached as PriceData;

    const [period1, period2] = periodToUnix(period);
    const result = await fetchChart(ticker, period1, period2);

    if (!result) {
      const empty: PriceData = {
        currentPrice: null,
        changePct: null,
        fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null,
        historical: [],
      };
      return empty;
    }

    const historical = parseHistorical(result);
    const closes = historical.map((h) => h.close).filter((c): c is number => c !== null);
    const currentPrice = closes.length > 0 ? closes[closes.length - 1] : null;

    const meta = result.meta ?? {};
    const prevClose = meta.previousClose ?? null;
    let changePct: number | null = null;
    if (currentPrice !== null && prevClose !== null && prevClose !== 0) {
      changePct = ((currentPrice - prevClose) / prevClose) * 100;
    }

    const data: PriceData = {
      currentPrice,
      changePct,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
      historical,
    };

    setCached(data, NS, 1800, { ticker, period });
    return data;
  }

  // -------------------------------------------------------------------------
  // getPriceHistoryRange
  // -------------------------------------------------------------------------
  async getPriceHistoryRange(
    ticker: string,
    startDate: string,
    endDate: string,
  ): Promise<HistoricalPrice[]> {
    const NS = 'yf:history';
    const cached = getCached(NS, { ticker, startDate, endDate });
    if (cached) return cached as HistoricalPrice[];

    const period1 = dateToUnix(startDate);
    const period2 = dateToUnix(endDate);
    const result = await fetchChart(ticker, period1, period2);

    const historical = result ? parseHistorical(result) : [];
    setCached(historical, NS, 3600, { ticker, startDate, endDate });
    return historical;
  }

  // -------------------------------------------------------------------------
  // getInstitutionalHolders
  // -------------------------------------------------------------------------
  async getInstitutionalHolders(ticker: string): Promise<InstitutionalHolder[]> {
    const NS = 'yf:institutional';
    const cached = getCached(NS, { ticker });
    if (cached) return cached as InstitutionalHolder[];

    const result = await fetchQuoteSummary(ticker, 'institutionOwnership');
    const ownershipList = result?.institutionOwnership?.ownershipList ?? [];

    const holders: InstitutionalHolder[] = ownershipList.map((entry) => ({
      holderName: entry.organization ?? '',
      pctHeld: raw(entry.pctHeld),
      value: raw(entry.value),
      shares: raw(entry.position),
    }));

    setCached(holders, NS, 3600, { ticker });
    return holders;
  }

  // -------------------------------------------------------------------------
  // getAnalystEstimate
  // -------------------------------------------------------------------------
  async getAnalystEstimate(ticker: string): Promise<AnalystEstimate> {
    const NS = 'yf:analyst';
    const cached = getCached(NS, { ticker });
    if (cached) return cached as AnalystEstimate;

    const result = await fetchQuoteSummary(ticker, 'financialData,recommendationTrend');
    const fd = result?.financialData;

    const data: AnalystEstimate = {
      targetPrice: raw(fd?.targetMeanPrice),
      recommendation: fd?.recommendationKey ?? '',
      numAnalysts: raw(fd?.numberOfAnalystOpinions),
    };

    setCached(data, NS, 3600, { ticker });
    return data;
  }
}

// ---------------------------------------------------------------------------
// FRED functions
// ---------------------------------------------------------------------------

/** Map period string to a download limit (observations are sorted desc) */
function periodToFredLimit(period: string): number {
  const map: Record<string, number> = {
    '1y': 365,
    '6mo': 180,
    '3mo': 90,
    '1mo': 30,
    '5d': 5,
    '1d': 1,
  };
  return map[period] ?? 365;
}

export async function fredGetSeries(
  seriesId: string,
  period = '1y',
): Promise<FredObservationsResponse> {
  const NS = 'fred:series';
  const cached = getCached(NS, { seriesId, period });
  if (cached) return cached as FredObservationsResponse;

  const limit = String(periodToFredLimit(period));

  const data = await fetchJson<FredObservationsResponse>(
    `${FRED_BASE}/series/observations`,
    {
      api_key: config.fredApiKey,
      series_id: seriesId,
      file_type: 'json',
      sort_order: 'desc',
      limit,
    },
  );

  setCached(data, NS, 3600, { seriesId, period });
  return data;
}

export async function fredSearchSeries(
  query: string,
  limit = 5,
): Promise<FredSearchResponse> {
  const NS = 'fred:search';
  const cached = getCached(NS, { query, limit: String(limit) });
  if (cached) return cached as FredSearchResponse;

  const data = await fetchJson<FredSearchResponse>(
    `${FRED_BASE}/series/search`,
    {
      api_key: config.fredApiKey,
      search_text: query,
      file_type: 'json',
      limit: String(limit),
    },
  );

  setCached(data, NS, 3600, { query, limit: String(limit) });
  return data;
}

// ---------------------------------------------------------------------------
// Default export instance
// ---------------------------------------------------------------------------

export const yfinanceClient = new YFinanceClient();
