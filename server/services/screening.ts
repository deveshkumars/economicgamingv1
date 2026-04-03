/**
 * Trade.gov Consolidated Screening List (CSL) client.
 *
 * Endpoint: https://data.trade.gov/consolidated_screening_list/v1/search
 * Free API key required: https://developer.trade.gov
 */

import { getCached, setCached } from '../cache';
import { config } from '../config';
import { fetchJson } from '../http';

const CSL_BASE_URL = 'https://data.trade.gov/consolidated_screening_list/v1/search';
const CACHE_NS = 'trade_gov_csl';
const CACHE_TTL = 3600;

// ---------------------------------------------------------------------------
// Raw CSL hit shape returned by the Trade.gov API
// ---------------------------------------------------------------------------

export interface CslAddress {
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  address?: string;
}

export interface CslId {
  type?: string;
  number?: string;
  country?: string;
  expiration_date?: string;
  issue_date?: string;
  notes?: string;
}

export interface CslHit {
  name: string;
  source: string;
  programs: string[];
  start_date?: string;
  end_date?: string;
  remarks?: string;
  source_list_url?: string;
  addresses: CslAddress[];
  alt_names: string[];
  ids: CslId[];
  entity_number?: string;
  type?: string;
}

// ---------------------------------------------------------------------------
// searchCsl
// ---------------------------------------------------------------------------

/**
 * Search the Trade.gov Consolidated Screening List.
 *
 * @param query    Entity name to search (the API performs its own fuzzy matching).
 * @param limit    Maximum number of results to return (default 25).
 * @param sources  Optional comma-separated source filter (e.g. "SDN,Entity List").
 * @param countries Optional comma-separated country filter.
 * @returns        Raw normalised result array from the CSL API.
 */
export async function searchCsl(
  query: string,
  limit = 25,
  sources?: string,
  countries?: string,
): Promise<CslHit[]> {
  if (!config.tradeGovApiKey) {
    console.warn(
      'Trade.gov CSL disabled — set TRADE_GOV_API_KEY in .env ' +
        '(free key from https://developer.trade.gov/)',
    );
    return [];
  }

  const cacheParams: Record<string, string> = {
    action: 'search',
    q: query,
    limit: String(limit),
    sources: sources ?? '',
    countries: countries ?? '',
  };

  const cached = getCached(CACHE_NS, cacheParams) as CslHit[] | null;
  if (cached !== null) return cached;

  const params: Record<string, string> = {
    name: query,
    size: String(limit),
  };
  if (sources) params.sources = sources;
  if (countries) params.countries = countries;

  let data: { results?: unknown[] };
  try {
    data = await fetchJson<{ results?: unknown[] }>(CSL_BASE_URL, params, {
      'subscription-key': config.tradeGovApiKey,
    });
  } catch (err) {
    console.warn(`Trade.gov CSL unavailable for query="${query}":`, err);
    return [];
  }

  const results: CslHit[] = [];
  for (const raw of data.results ?? []) {
    const hit = raw as Record<string, unknown>;
    results.push({
      name: (hit.name as string) ?? '',
      source: (hit.source as string) ?? '',
      programs: (hit.programs as string[]) ?? [],
      start_date: hit.start_date as string | undefined,
      end_date: hit.end_date as string | undefined,
      remarks: hit.remarks as string | undefined,
      source_list_url: hit.source_list_url as string | undefined,
      addresses: (hit.addresses as CslAddress[]) ?? [],
      alt_names: (hit.alt_names as string[]) ?? [],
      ids: (hit.ids as CslId[]) ?? [],
      entity_number: hit.entity_number as string | undefined,
      type: hit.type as string | undefined,
    });
  }

  setCached(results, CACHE_NS, CACHE_TTL, cacheParams);
  return results;
}
