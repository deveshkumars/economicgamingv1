/**
 * Datalastic vessel intelligence client.
 *
 * Provides AIS position data, port call history, and pure-logic port-stop
 * inference from raw position streams.
 */

import { getCached, setCached } from '../cache';
import { config } from '../config';
import { fetchJson } from '../http';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATALASTIC_BASE = 'https://api.datalastic.com/api/v0';
const CACHE_NS = 'datalastic';
const CACHE_TTL = 1800; // 30 minutes

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface VesselPosition {
  mmsi?: string | number;
  imo?: string | number;
  latitude: number;
  longitude: number;
  speed?: number;
  course?: number;
  heading?: number;
  timestamp?: string | number;
  [key: string]: unknown;
}

export interface PortStop {
  latitude: number;
  longitude: number;
  arrivalTs: string | number | null;
  departureTs: string | number | null;
  durationHours: number;
  positionCount: number;
}

// ---------------------------------------------------------------------------
// Helper: build Datalastic auth params
// ---------------------------------------------------------------------------

function authParams(): Record<string, string> {
  return { 'api-key': config.datalasticApiKey };
}

// ---------------------------------------------------------------------------
// vesselFind
// ---------------------------------------------------------------------------

/**
 * Search for vessels by name.
 * GET /vessel_find?api-key=...&name=...
 *
 * Returns the raw JSON response from Datalastic, or null on failure.
 */
export async function vesselFind(name: string): Promise<unknown> {
  const cacheParams: Record<string, string> = { action: 'vessel_find', name };
  const cached = getCached(CACHE_NS, cacheParams);
  if (cached !== null) return cached;

  try {
    const data = await fetchJson(
      `${DATALASTIC_BASE}/vessel_find`,
      { ...authParams(), name },
    );
    setCached(data, CACHE_NS, CACHE_TTL, cacheParams);
    return data;
  } catch (err) {
    console.warn(`Datalastic vesselFind failed (name="${name}"):`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// vesselByMmsi
// ---------------------------------------------------------------------------

/**
 * Look up a vessel by MMSI.
 * GET /vessel?api-key=...&mmsi=...
 *
 * Returns the raw JSON response, or null on failure.
 */
export async function vesselByMmsi(mmsi: string): Promise<unknown> {
  const cacheParams: Record<string, string> = { action: 'vessel_mmsi', mmsi };
  const cached = getCached(CACHE_NS, cacheParams);
  if (cached !== null) return cached;

  try {
    const data = await fetchJson(
      `${DATALASTIC_BASE}/vessel`,
      { ...authParams(), mmsi },
    );
    setCached(data, CACHE_NS, CACHE_TTL, cacheParams);
    return data;
  } catch (err) {
    console.warn(`Datalastic vesselByMmsi failed (mmsi="${mmsi}"):`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// vesselByImo
// ---------------------------------------------------------------------------

/**
 * Look up a vessel by IMO number.
 * GET /vessel?api-key=...&imo=...
 *
 * Returns the raw JSON response, or null on failure.
 */
export async function vesselByImo(imo: string): Promise<unknown> {
  const cacheParams: Record<string, string> = { action: 'vessel_imo', imo };
  const cached = getCached(CACHE_NS, cacheParams);
  if (cached !== null) return cached;

  try {
    const data = await fetchJson(
      `${DATALASTIC_BASE}/vessel`,
      { ...authParams(), imo },
    );
    setCached(data, CACHE_NS, CACHE_TTL, cacheParams);
    return data;
  } catch (err) {
    console.warn(`Datalastic vesselByImo failed (imo="${imo}"):`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// vesselHistory
// ---------------------------------------------------------------------------

/**
 * Retrieve AIS position history for a vessel.
 * GET /vessel_history?api-key=...&mmsi=...&days=...
 *
 * @param mmsi MMSI of the vessel.
 * @param days Number of days of history to retrieve (default 30).
 *
 * Returns the raw JSON response, or null on failure.
 */
export async function vesselHistory(mmsi: string, days = 30): Promise<unknown> {
  const cacheParams: Record<string, string> = {
    action: 'vessel_history',
    mmsi,
    days: String(days),
  };
  const cached = getCached(CACHE_NS, cacheParams);
  if (cached !== null) return cached;

  try {
    const data = await fetchJson(
      `${DATALASTIC_BASE}/vessel_history`,
      { ...authParams(), mmsi, days: String(days) },
    );
    setCached(data, CACHE_NS, CACHE_TTL, cacheParams);
    return data;
  } catch (err) {
    console.warn(`Datalastic vesselHistory failed (mmsi="${mmsi}", days=${days}):`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// vesselPortCalls
// ---------------------------------------------------------------------------

/**
 * Retrieve port call history for a vessel.
 * GET /port_calls?api-key=...&mmsi=...&days=...
 *
 * @param mmsi MMSI of the vessel.
 * @param days Number of days of history to retrieve (default 90).
 *
 * Returns the raw JSON response, or null on failure.
 */
export async function vesselPortCalls(mmsi: string, days = 90): Promise<unknown> {
  const cacheParams: Record<string, string> = {
    action: 'vessel_port_calls',
    mmsi,
    days: String(days),
  };
  const cached = getCached(CACHE_NS, cacheParams);
  if (cached !== null) return cached;

  try {
    const data = await fetchJson(
      `${DATALASTIC_BASE}/port_calls`,
      { ...authParams(), mmsi, days: String(days) },
    );
    setCached(data, CACHE_NS, CACHE_TTL, cacheParams);
    return data;
  } catch (err) {
    console.warn(`Datalastic vesselPortCalls failed (mmsi="${mmsi}", days=${days}):`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// inferPortStops  (pure logic — no network calls)
// ---------------------------------------------------------------------------

/**
 * Infer port stops from a raw AIS position array by grouping consecutive
 * low-speed positions (speed < speedThreshold knots).
 *
 * Positions are expected to carry at minimum `latitude`, `longitude`, and
 * optionally `speed` and `timestamp` fields.  When `timestamp` is absent the
 * arrival/departure values are null and durationHours is 0.
 *
 * @param positions      Array of position objects.
 * @param speedThreshold Speed (knots) below which a vessel is considered
 *                       stopped (default 0.5).
 *
 * Returns an array of PortStop objects, one per contiguous stopped group.
 */
export function inferPortStops(
  positions: VesselPosition[],
  speedThreshold = 0.5,
): PortStop[] {
  if (!positions || positions.length === 0) return [];

  const stops: PortStop[] = [];
  let groupStart = -1;

  const toMs = (ts: string | number | undefined): number | null => {
    if (ts === undefined || ts === null) return null;
    if (typeof ts === 'number') return ts > 1e10 ? ts : ts * 1000; // seconds → ms
    const parsed = Date.parse(ts);
    return isNaN(parsed) ? null : parsed;
  };

  const flush = (start: number, end: number): void => {
    const group = positions.slice(start, end + 1);
    if (group.length === 0) return;

    // Representative location: midpoint of the group
    const latSum = group.reduce((s, p) => s + (p.latitude ?? 0), 0);
    const lonSum = group.reduce((s, p) => s + (p.longitude ?? 0), 0);
    const latitude = latSum / group.length;
    const longitude = lonSum / group.length;

    const arrivalMs = toMs(group[0].timestamp as string | number | undefined);
    const departureMs = toMs(group[group.length - 1].timestamp as string | number | undefined);

    let durationHours = 0;
    if (arrivalMs !== null && departureMs !== null) {
      durationHours = Math.abs(departureMs - arrivalMs) / (1000 * 3600);
    }

    const arrivalTs = arrivalMs !== null ? new Date(arrivalMs).toISOString() : null;
    const departureTs = departureMs !== null ? new Date(departureMs).toISOString() : null;

    stops.push({
      latitude,
      longitude,
      arrivalTs,
      departureTs,
      durationHours,
      positionCount: group.length,
    });
  };

  for (let i = 0; i < positions.length; i++) {
    const speed = positions[i].speed as number | undefined;
    const isStopped = speed !== undefined && speed !== null ? speed < speedThreshold : false;

    if (isStopped) {
      if (groupStart === -1) groupStart = i;
    } else {
      if (groupStart !== -1) {
        flush(groupStart, i - 1);
        groupStart = -1;
      }
    }
  }

  // Close any open group at the end of the array
  if (groupStart !== -1) {
    flush(groupStart, positions.length - 1);
  }

  return stops;
}
