/**
 * Geopolitical event clients: GDELT (news/event analytics) and ACLED
 * (armed conflict location & event data).
 *
 * GDELT requires no authentication.
 * ACLED requires an API key + email, with optional OAuth refresh token flow.
 */

import { getCached, setCached } from '../cache';
import { config } from '../config';
import { fetchJson } from '../http';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GDELT_DOC_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';
const ACLED_API_URL = 'https://acleddata.com/api/acled/read';
const ACLED_TOKEN_URL = 'https://acleddata.com/oauth/token';

const CACHE_NS_GDELT_DOC = 'gdelt_doc';
const CACHE_NS_GDELT_TIMELINE = 'gdelt_timeline';
const CACHE_NS_ACLED = 'acled_events';

const CACHE_TTL_GDELT = 1800; // 30 minutes
const CACHE_TTL_ACLED = 3600; // 1 hour

// ---------------------------------------------------------------------------
// Module-level ACLED OAuth token (refreshed on demand)
// ---------------------------------------------------------------------------

let acledAccessToken: string | null = null;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date as YYYYMMDDHHMMSS (GDELT format).
 */
function toGdeltDatetime(d: Date): string {
  const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
  return (
    String(d.getFullYear()) +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

/**
 * Return { start, end } GDELT datetime strings spanning `days` days ending now.
 */
function gdeltDateRange(days: number): { start: string; end: string } {
  const now = new Date();
  const past = new Date(now.getTime() - days * 86400 * 1000);
  return { start: toGdeltDatetime(past), end: toGdeltDatetime(now) };
}

/**
 * Format a Date as YYYY-MM-DD (ACLED format).
 */
function toAcledDate(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// GDELT — document search
// ---------------------------------------------------------------------------

/**
 * Search GDELT document API for news articles matching `query`.
 *
 * @param query      Full-text query string.
 * @param days       Number of days to search back from now (default 30).
 * @param maxRecords Maximum articles to return (default 50, capped at 250 by GDELT).
 *
 * Returns the parsed JSON response (articles array or wrapper object), or an
 * empty array on failure.
 */
export async function gdeltDocSearch(
  query: string,
  days = 30,
  maxRecords = 50,
): Promise<unknown> {
  const cacheParams: Record<string, string> = {
    action: 'gdelt_doc',
    query,
    days: String(days),
    maxRecords: String(maxRecords),
  };
  const cached = getCached(CACHE_NS_GDELT_DOC, cacheParams);
  if (cached !== null) return cached;

  const { start, end } = gdeltDateRange(days);

  try {
    const data = await fetchJson(
      GDELT_DOC_URL,
      {
        query,
        mode: 'ArtList',
        maxrecords: String(maxRecords),
        format: 'json',
        startdatetime: start,
        enddatetime: end,
      },
    );
    setCached(data, CACHE_NS_GDELT_DOC, CACHE_TTL_GDELT, cacheParams);
    return data;
  } catch (err) {
    console.warn(`gdeltDocSearch failed (query="${query}"):`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// GDELT — timeline
// ---------------------------------------------------------------------------

/**
 * Retrieve a GDELT volume timeline for `query`.
 *
 * @param query Full-text query string.
 * @param days  Number of days to look back (default 30).
 *
 * Returns parsed JSON (timeline data), or an empty array on failure.
 */
export async function gdeltTimeline(query: string, days = 30): Promise<unknown> {
  const cacheParams: Record<string, string> = {
    action: 'gdelt_timeline',
    query,
    days: String(days),
  };
  const cached = getCached(CACHE_NS_GDELT_TIMELINE, cacheParams);
  if (cached !== null) return cached;

  const { start, end } = gdeltDateRange(days);

  try {
    const data = await fetchJson(
      GDELT_DOC_URL,
      {
        query,
        mode: 'TimelineVol',
        format: 'json',
        startdatetime: start,
        enddatetime: end,
      },
    );
    setCached(data, CACHE_NS_GDELT_TIMELINE, CACHE_TTL_GDELT, cacheParams);
    return data;
  } catch (err) {
    console.warn(`gdeltTimeline failed (query="${query}"):`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// GDELT — bilateral search
// ---------------------------------------------------------------------------

/**
 * Search GDELT for news covering the relationship between two countries.
 * The query is constructed as "<country1> <country2>".
 *
 * @param country1   First country name.
 * @param country2   Second country name.
 * @param days       Days to look back (default 90).
 * @param maxRecords Max articles (default 50).
 *
 * Returns the same shape as gdeltDocSearch.
 */
export async function gdeltBilateralSearch(
  country1: string,
  country2: string,
  days = 90,
  maxRecords = 50,
): Promise<unknown> {
  const query = `${country1} ${country2}`;

  const cacheParams: Record<string, string> = {
    action: 'gdelt_bilateral',
    country1,
    country2,
    days: String(days),
    maxRecords: String(maxRecords),
  };
  const cached = getCached(CACHE_NS_GDELT_DOC, cacheParams);
  if (cached !== null) return cached;

  const { start, end } = gdeltDateRange(days);

  try {
    const data = await fetchJson(
      GDELT_DOC_URL,
      {
        query,
        mode: 'ArtList',
        maxrecords: String(maxRecords),
        format: 'json',
        startdatetime: start,
        enddatetime: end,
      },
    );
    setCached(data, CACHE_NS_GDELT_DOC, CACHE_TTL_GDELT, cacheParams);
    return data;
  } catch (err) {
    console.warn(
      `gdeltBilateralSearch failed (${country1} / ${country2}):`,
      err,
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// ACLED — OAuth token refresh
// ---------------------------------------------------------------------------

/**
 * Refresh the ACLED OAuth access token using the configured refresh token.
 *
 * Updates the module-level `acledAccessToken` variable on success.
 * On failure the existing token (if any) is left unchanged.
 */
export async function refreshAcledToken(): Promise<void> {
  const refreshToken = config.acledRefreshToken;
  if (!refreshToken) {
    console.warn('refreshAcledToken: no REFRESH_TOKEN configured');
    return;
  }

  try {
    // ACLED token endpoint expects an application/x-www-form-urlencoded body
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: 'acled',
      refresh_token: refreshToken,
    });

    const res = await fetch(ACLED_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`refreshAcledToken: HTTP ${res.status} — ${text.slice(0, 200)}`);
      return;
    }

    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data.access_token === 'string') {
      acledAccessToken = data.access_token;
    } else {
      console.warn('refreshAcledToken: response did not contain access_token', data);
    }
  } catch (err) {
    console.warn('refreshAcledToken failed:', err);
  }
}

// ---------------------------------------------------------------------------
// ACLED — events
// ---------------------------------------------------------------------------

/**
 * Retrieve ACLED conflict events for a country within a date window.
 *
 * Authentication uses the key+email approach (primary).  If `acledAccessToken`
 * is set it is included as a Bearer Authorization header.
 *
 * @param country   Country name (ACLED "country" filter).
 * @param days      Number of days to look back from today (default 30).
 * @param eventType Optional ACLED event_type filter (e.g. "Battles").
 * @param limit     Maximum records to return (default 100).
 *
 * Returns the parsed JSON response (data array or wrapper), or an empty array
 * on failure.
 */
export async function acledGetEvents(
  country: string,
  days = 30,
  eventType?: string,
  limit = 100,
): Promise<unknown> {
  const cacheParams: Record<string, string> = {
    action: 'acled_events',
    country,
    days: String(days),
    eventType: eventType ?? '',
    limit: String(limit),
  };
  const cached = getCached(CACHE_NS_ACLED, cacheParams);
  if (cached !== null) return cached;

  const today = new Date();
  const startDate = new Date(today.getTime() - days * 86400 * 1000);

  // ACLED event_date filter: "YYYY-MM-DD|YYYY-MM-DD" with where=BETWEEN
  const eventDate = `${toAcledDate(startDate)}|${toAcledDate(today)}`;

  const params: Record<string, string> = {
    key: config.acledApiKey,
    email: config.acledEmail,
    country,
    event_date: eventDate,
    event_date_where: 'BETWEEN',
    limit: String(limit),
  };

  if (eventType) {
    params.event_type = eventType;
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (acledAccessToken) {
    headers['Authorization'] = `Bearer ${acledAccessToken}`;
  }

  try {
    const data = await fetchJson(ACLED_API_URL, params, headers);
    setCached(data, CACHE_NS_ACLED, CACHE_TTL_ACLED, cacheParams);
    return data;
  } catch (err) {
    console.warn(`acledGetEvents failed (country="${country}"):`, err);
    return [];
  }
}
