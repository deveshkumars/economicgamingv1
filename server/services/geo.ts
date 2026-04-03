/**
 * Geolocation utilities: reverse geocoding and country extraction from
 * AIS position arrays.
 *
 * Uses the BigDataCloud reverse-geocode-client (no API key required for the
 * client-side endpoint — the URL is publicly accessible from server as well).
 */

import { getCached, setCached } from '../cache';
import { fetchJson } from '../http';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BIGDATACLOUD_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const CACHE_NS = 'reverse_geo';
const CACHE_TTL = 604800; // 7 days
const MAX_CONCURRENT = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LatLon {
  latitude: number;
  longitude: number;
}

interface BigDataCloudResponse {
  countryName?: string;
  countryCode?: string;
  city?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// reverseGeocode
// ---------------------------------------------------------------------------

/**
 * Reverse-geocode a single coordinate pair to a country name.
 *
 * Results are cached for 7 days.  Returns an empty string on failure.
 *
 * @param lat Latitude (decimal degrees).
 * @param lon Longitude (decimal degrees).
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const cacheParams: Record<string, string> = {
    lat: lat.toFixed(4),
    lon: lon.toFixed(4),
  };
  const cached = getCached(CACHE_NS, cacheParams) as string | null;
  if (cached !== null) return cached;

  try {
    const data = await fetchJson<BigDataCloudResponse>(
      BIGDATACLOUD_URL,
      {
        latitude: String(lat),
        longitude: String(lon),
        localityLanguage: 'en',
      },
    );
    const country = data.countryName ?? '';
    setCached(country, CACHE_NS, CACHE_TTL, cacheParams);
    return country;
  } catch (err) {
    console.warn(`reverseGeocode failed (lat=${lat}, lon=${lon}):`, err);
    return '';
  }
}

// ---------------------------------------------------------------------------
// getCountriesFromPositions
// ---------------------------------------------------------------------------

/**
 * Derive a de-duplicated list of country names visited from an array of
 * AIS positions.
 *
 * Implementation:
 *  1. Sample `sampleSize` positions evenly from the array.
 *  2. Reverse-geocode each sample with at most MAX_CONCURRENT (5) concurrent
 *     requests via Promise.allSettled.
 *  3. Collect successful country names and return unique, non-empty values.
 *
 * @param positions  Array of position objects containing latitude/longitude.
 * @param sampleSize Maximum number of positions to sample (default 15).
 */
export async function getCountriesFromPositions(
  positions: LatLon[],
  sampleSize = 15,
): Promise<string[]> {
  if (!positions || positions.length === 0) return [];

  // Even sampling
  const sampled = sampleEvenly(positions, sampleSize);

  // Chunk into batches of MAX_CONCURRENT and resolve sequentially between batches
  const countries: string[] = [];

  for (let i = 0; i < sampled.length; i += MAX_CONCURRENT) {
    const batch = sampled.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.allSettled(
      batch.map((p) => reverseGeocode(p.latitude, p.longitude)),
    );
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        countries.push(result.value);
      }
    }
  }

  // Deduplicate while preserving first-occurrence order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const c of countries) {
    const key = c.trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(key);
    }
  }

  return unique;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return at most `n` evenly-spaced elements from `arr`.
 * If arr.length <= n, returns a copy of the full array.
 */
function sampleEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return [...arr];
  const result: T[] = [];
  const step = (arr.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) {
    result.push(arr[Math.round(i * step)]);
  }
  return result;
}
