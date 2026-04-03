/**
 * Sanctions clients: OpenSanctions, OFAC SDN, and a composite SanctionsClient.
 *
 * Ports Python src/tools/sanctions/client.py to TypeScript for the Express backend.
 */

import { getCached, setCached } from '../cache';
import { config } from '../config';
import { fetchJson, fetchText } from '../http';
import { searchCsl, type CslHit } from './screening';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface SanctionEntry {
  id: string;
  name: string;
  aliases: string[];
  entityType: string; // "person" | "company" | "vessel" | "aircraft" | "unknown"
  programs: string[];
  addresses: string[];
  identifiers: Record<string, string>;
  listSource: string;
  designationDate: string | null; // ISO-8601 string or null
  remarks: string | null;
  score: number | null;
}

export interface SanctionSearchResult {
  query: string;
  matches: SanctionEntry[];
  totalMatches: number;
}

export interface SanctionStatus {
  entityName: string;
  isSanctioned: boolean;
  listsFound: string[];
  designationDates: (string | null)[];
  programs: string[];
  entries: SanctionEntry[];
}

export interface ProximityNode {
  entityId: string;
  entityName: string;
  entityType: string;
  isSanctioned: boolean;
  sanctionsLists: string[];
  hopDistance: number;
}

export interface ProximityEdge {
  sourceId: string;
  targetId: string;
  relationshipType: string;
}

export interface ProximityResult {
  queryEntity: string;
  nodes: ProximityNode[];
  edges: ProximityEdge[];
  nearestSanctionedHop: number | null;
  sanctionedNeighbors: ProximityNode[];
}

export interface RecentDesignation {
  entry: SanctionEntry;
  actionType: string;
  effectiveDate: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENSANCTIONS_BASE = 'https://api.opensanctions.org';
const OFAC_SDN_CSV_URL = 'https://www.treasury.gov/ofac/downloads/sdn.csv';
const OFAC_ALT_CSV_URL = 'https://www.treasury.gov/ofac/downloads/alt.csv';
const OFAC_ADD_CSV_URL = 'https://www.treasury.gov/ofac/downloads/add.csv';

const CACHE_NS_OPENSANCTIONS = 'opensanctions';
const CACHE_NS_OFAC = 'ofac';
const CACHE_TTL_SEARCH = 3600; // 1 hour
const CACHE_TTL_SDN = 86400;   // 24 hours

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/**
 * Minimal RFC-4180 CSV parser that handles quoted fields containing commas.
 * Returns an array of string arrays (one per row).
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        row.push(field);
        field = '';
      } else {
        field += ch;
      }
    }
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function tryParseDate(str: string | undefined | null): string | null {
  if (!str) return null;
  // Try standard formats: "2023-01-15", "01/15/2023", "15 Jan 2023"
  const cleaned = str.slice(0, 10);
  const iso = Date.parse(cleaned);
  if (!isNaN(iso)) return new Date(iso).toISOString();
  const full = Date.parse(str);
  if (!isNaN(full)) return new Date(full).toISOString();
  return null;
}

/**
 * Extract a date from OFAC remarks text.
 * Looks for "15 Jan 2023" or "2023-01-15" patterns.
 */
function extractDateFromRemarks(remarks: string): string | null {
  if (!remarks) return null;
  const monthPattern =
    /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i;
  const isoPattern = /(\d{4}-\d{2}-\d{2})/;
  let m = monthPattern.exec(remarks);
  if (m) return tryParseDate(m[1]);
  m = isoPattern.exec(remarks);
  if (m) return tryParseDate(m[1]);
  return null;
}

// ---------------------------------------------------------------------------
// OpenSanctions client
// ---------------------------------------------------------------------------

interface OpenSanctionsSearchResponse {
  results?: Record<string, unknown>[];
}

export class OpenSanctionsClient {
  /**
   * Search OpenSanctions for entities matching `query`.
   * No API key is required for basic search on the public endpoint.
   *
   * @param query      Text query.
   * @param limit      Max results (default 5).
   * @param entityType Optional entity type: "person" maps to schema "Person",
   *                   anything else maps to "LegalEntity".
   */
  async search(query: string, limit = 5, entityType?: string): Promise<SanctionEntry[]> {
    const cacheParams: Record<string, string> = {
      action: 'search',
      q: query,
      limit: String(limit),
      entityType: entityType ?? '',
    };
    const cached = getCached(CACHE_NS_OPENSANCTIONS, cacheParams) as SanctionEntry[] | null;
    if (cached !== null && cached.length > 0) return cached;

    const params: Record<string, string> = { q: query, limit: String(limit) };
    if (entityType) {
      params.schema = entityType.toLowerCase() === 'person' ? 'Person' : 'LegalEntity';
    }

    // Build optional auth headers — the public API works without a key.
    const headers: Record<string, string> = { Accept: 'application/json' };
    const apiKey = (config as Record<string, unknown>).opensanctionsApiKey as string | undefined;
    if (apiKey) headers['Authorization'] = `ApiKey ${apiKey}`;

    let data: OpenSanctionsSearchResponse;
    try {
      data = await fetchJson<OpenSanctionsSearchResponse>(
        `${OPENSANCTIONS_BASE}/search/default`,
        params,
        headers,
      );
    } catch (err) {
      console.warn(`OpenSanctions search unavailable (query="${query}"):`, err);
      return [];
    }

    const entries = this._parseSearchResults(data);
    if (entries.length > 0) {
      setCached(entries, CACHE_NS_OPENSANCTIONS, CACHE_TTL_SEARCH, cacheParams);
    }
    return entries;
  }

  async getEntity(entityId: string): Promise<SanctionEntry | null> {
    const cacheParams = { action: 'entity', id: entityId };
    const cached = getCached(CACHE_NS_OPENSANCTIONS, cacheParams) as SanctionEntry | null;
    if (cached !== null) return cached;

    const headers: Record<string, string> = { Accept: 'application/json' };
    const apiKey = (config as Record<string, unknown>).opensanctionsApiKey as string | undefined;
    if (apiKey) headers['Authorization'] = `ApiKey ${apiKey}`;

    let data: Record<string, unknown>;
    try {
      data = await fetchJson<Record<string, unknown>>(
        `${OPENSANCTIONS_BASE}/entities/${entityId}`,
        undefined,
        headers,
      );
    } catch (err) {
      console.warn(`OpenSanctions getEntity unavailable (id="${entityId}"):`, err);
      return null;
    }

    const entry = this._parseEntity(data);
    if (entry) {
      setCached(entry, CACHE_NS_OPENSANCTIONS, CACHE_TTL_SEARCH, cacheParams);
    }
    return entry;
  }

  async getEntityRelationships(entityId: string): Promise<Record<string, string>[]> {
    const cacheParams = { action: 'relationships', id: entityId };
    const cached = getCached(
      CACHE_NS_OPENSANCTIONS,
      cacheParams,
    ) as Record<string, string>[] | null;
    if (cached !== null) return cached;

    const headers: Record<string, string> = { Accept: 'application/json' };
    const apiKey = (config as Record<string, unknown>).opensanctionsApiKey as string | undefined;
    if (apiKey) headers['Authorization'] = `ApiKey ${apiKey}`;

    let data: Record<string, unknown>;
    try {
      data = await fetchJson<Record<string, unknown>>(
        `${OPENSANCTIONS_BASE}/entities/${entityId}`,
        undefined,
        headers,
      );
    } catch (err) {
      console.warn(`OpenSanctions relationships unavailable (id="${entityId}"):`, err);
      return [];
    }

    const relationships: Record<string, string>[] = [];
    const props = (data.properties ?? {}) as Record<string, unknown[]>;

    const relKeys = [
      'ownershipOwner',
      'ownershipAsset',
      'directorshipDirector',
      'directorshipOrganization',
      'membershipMember',
      'membershipOrganization',
      'associateOf',
      'parent',
      'subsidiaries',
      'holder',
      'asset',
    ];

    for (const key of relKeys) {
      const values = props[key] ?? [];
      for (const val of values) {
        if (typeof val === 'string') {
          relationships.push({ related_id: val, relationship_type: key, source_id: entityId });
        } else if (val && typeof val === 'object' && (val as Record<string, unknown>).id) {
          const v = val as Record<string, string>;
          relationships.push({
            related_id: v.id,
            related_name: v.caption ?? '',
            relationship_type: key,
            source_id: entityId,
          });
        }
      }
    }

    for (const refId of (data.referents as string[]) ?? []) {
      relationships.push({ related_id: refId, relationship_type: 'sameAs', source_id: entityId });
    }

    setCached(relationships, CACHE_NS_OPENSANCTIONS, CACHE_TTL_SEARCH, cacheParams);
    return relationships;
  }

  // --- Helpers ---

  private _parseSearchResults(data: OpenSanctionsSearchResponse): SanctionEntry[] {
    const entries: SanctionEntry[] = [];
    for (const result of data.results ?? []) {
      const entry = this._parseEntity(result);
      if (!entry) continue;
      entry.score = (result.score as number) ?? null;
      entries.push(entry);
    }
    return entries;
  }

  private _parseEntity(data: Record<string, unknown>): SanctionEntry | null {
    const entityId = data.id as string | undefined;
    if (!entityId) return null;

    const props = (data.properties ?? {}) as Record<string, string[]>;
    const caption = (data.caption as string) ?? '';
    const names = props.name ?? [];
    const name = caption || names[0] || entityId;

    const aliases = [...names.filter((n) => n !== name), ...(props.alias ?? []), ...(props.weakAlias ?? [])];

    const schema = ((data.schema as string) ?? '').toLowerCase();
    const typeMap: Record<string, string> = {
      person: 'person',
      company: 'company',
      organization: 'organization',
      legalentity: 'company',
      vessel: 'vessel',
      aircraft: 'aircraft',
    };
    const entityType = typeMap[schema] ?? 'unknown';

    let programs = props.program ?? [];
    if (programs.length === 0) programs = props.topics ?? [];

    const addrParts = props.address ?? [];
    const countries = props.country ?? [];
    const addresses = addrParts.length > 0 ? addrParts : countries;

    const identifiers: Record<string, string> = {};
    for (const idKey of [
      'passportNumber',
      'idNumber',
      'registrationNumber',
      'innCode',
      'taxNumber',
      'ogrnCode',
      'swiftBic',
      'imoNumber',
    ]) {
      const vals = props[idKey] ?? [];
      if (vals.length > 0) identifiers[idKey] = vals[0];
    }

    // Designation date: prefer createdAt
    let designationDate: string | null = null;
    const dateStrs = props.createdAt ?? props.modifiedAt ?? [];
    if (dateStrs.length > 0) designationDate = tryParseDate(dateStrs[0]);

    const datasets = data.datasets as string[] | undefined;
    const listSource = Array.isArray(datasets) && datasets.length > 0
      ? datasets.join(', ')
      : 'OpenSanctions';

    const remarkParts = props.notes ?? [];

    return {
      id: entityId,
      name,
      aliases: [...new Set(aliases)],
      entityType,
      programs,
      addresses,
      identifiers,
      listSource,
      designationDate,
      remarks: remarkParts.length > 0 ? remarkParts.join('; ') : null,
      score: null,
    };
  }
}

// ---------------------------------------------------------------------------
// OFAC SDN client
// ---------------------------------------------------------------------------

interface SdnRow {
  ent_num: string;
  name: string;
  type: string;
  program: string;
  title: string;
  call_sign: string;
  vessel_type: string;
  tonnage: string;
  grt: string;
  vessel_flag: string;
  vessel_owner: string;
  remarks: string;
}

export class OFACClient {
  private _sdnEntries: SdnRow[] | null = null;
  private _altNames: Record<string, string[]> | null = null;
  private _addresses: Record<string, string[]> | null = null;

  private async _ensureLoaded(): Promise<void> {
    if (this._sdnEntries !== null) return;

    const cachedSdn = getCached(CACHE_NS_OFAC, { action: 'sdn_csv' }) as SdnRow[] | null;
    const cachedAlt = getCached(CACHE_NS_OFAC, { action: 'alt_csv' }) as Record<
      string,
      string[]
    > | null;
    const cachedAdd = getCached(CACHE_NS_OFAC, { action: 'add_csv' }) as Record<
      string,
      string[]
    > | null;

    if (cachedSdn !== null) {
      this._sdnEntries = cachedSdn;
      this._altNames = cachedAlt ?? {};
      this._addresses = cachedAdd ?? {};
      return;
    }

    await this._downloadAndParse();
  }

  private async _downloadAndParse(): Promise<void> {
    let sdnText: string;
    try {
      sdnText = await fetchText(OFAC_SDN_CSV_URL);
    } catch (err) {
      console.warn('Failed to download OFAC SDN CSV:', err);
      this._sdnEntries = [];
      this._altNames = {};
      this._addresses = {};
      return;
    }
    this._sdnEntries = this._parseSdnCsv(sdnText);

    try {
      const altText = await fetchText(OFAC_ALT_CSV_URL);
      this._altNames = this._parseAltCsv(altText);
    } catch {
      console.warn('Failed to download OFAC ALT CSV, continuing without aliases');
      this._altNames = {};
    }

    try {
      const addText = await fetchText(OFAC_ADD_CSV_URL);
      this._addresses = this._parseAddCsv(addText);
    } catch {
      console.warn('Failed to download OFAC ADD CSV, continuing without addresses');
      this._addresses = {};
    }

    setCached(this._sdnEntries, CACHE_NS_OFAC, CACHE_TTL_SDN, { action: 'sdn_csv' });
    setCached(this._altNames, CACHE_NS_OFAC, CACHE_TTL_SDN, { action: 'alt_csv' });
    setCached(this._addresses, CACHE_NS_OFAC, CACHE_TTL_SDN, { action: 'add_csv' });
  }

  /**
   * Parse OFAC SDN CSV (no header row).
   * Columns: ent_num, SDN_Name, SDN_Type, Program, Title, Call_Sign,
   *          Vess_type, Tonnage, GRT, Vess_flag, Vess_owner, Remarks
   */
  private _parseSdnCsv(text: string): SdnRow[] {
    const rows = parseCsv(text);
    const entries: SdnRow[] = [];
    for (const row of rows) {
      if (row.length < 6) continue;
      entries.push({
        ent_num: row[0].trim(),
        name: row[1].trim(),
        type: row[2].trim(),
        program: row[3].trim(),
        title: (row[4] ?? '').trim(),
        call_sign: (row[5] ?? '').trim(),
        vessel_type: (row[6] ?? '').trim(),
        tonnage: (row[7] ?? '').trim(),
        grt: (row[8] ?? '').trim(),
        vessel_flag: (row[9] ?? '').trim(),
        vessel_owner: (row[10] ?? '').trim(),
        remarks: (row[11] ?? '').trim(),
      });
    }
    return entries;
  }

  /** Parse OFAC ALT CSV — alternate names keyed by ent_num (col 0, alt_name col 3). */
  private _parseAltCsv(text: string): Record<string, string[]> {
    const altMap: Record<string, string[]> = {};
    for (const row of parseCsv(text)) {
      if (row.length < 4) continue;
      const entNum = row[0].trim();
      const altName = row[3].trim();
      if (entNum && altName) {
        (altMap[entNum] ??= []).push(altName);
      }
    }
    return altMap;
  }

  /** Parse OFAC ADD CSV — addresses keyed by ent_num (col 0, address cols 2-5). */
  private _parseAddCsv(text: string): Record<string, string[]> {
    const addMap: Record<string, string[]> = {};
    for (const row of parseCsv(text)) {
      if (row.length < 6) continue;
      const entNum = row[0].trim();
      const parts = row.slice(2, 6).map((p) => p.trim()).filter(Boolean);
      const address = parts.join(', ');
      if (entNum && address) {
        (addMap[entNum] ??= []).push(address);
      }
    }
    return addMap;
  }

  /**
   * Search the OFAC SDN list for entities matching `query`.
   *
   * @param query      Text to search for.
   * @param entityType Optional filter: "person", "company", "organization", "vessel", "aircraft".
   */
  async search(query: string, entityType?: string): Promise<SanctionEntry[]> {
    const cacheParams: Record<string, string> = {
      action: 'search',
      q: query,
      entityType: entityType ?? '',
    };
    const cached = getCached(CACHE_NS_OFAC, cacheParams) as SanctionEntry[] | null;
    if (cached !== null) return cached;

    await this._ensureLoaded();

    const queryLower = query.toLowerCase();
    const queryTokens = new Set<string>(queryLower.match(/[a-z0-9]+/g) ?? []);

    // Optional type filter
    let typeFilter = '';
    if (entityType) {
      const typeMap: Record<string, string> = {
        person: 'individual',
        company: 'entity',
        organization: 'entity',
        vessel: 'vessel',
        aircraft: 'aircraft',
      };
      typeFilter = typeMap[entityType.toLowerCase()] ?? '';
    }

    const results: SanctionEntry[] = [];

    for (const row of this._sdnEntries ?? []) {
      // Strip surrounding quotes that sometimes appear in the OFAC CSV type field
      const rowType = row.type.replace(/^"|"$/g, '').toLowerCase();
      if (typeFilter && rowType !== typeFilter) continue;

      let score = OFACClient._matchScore(queryLower, queryTokens, row.name.toLowerCase());

      // Check alternate names
      const altNames = this._altNames?.[row.ent_num] ?? [];
      for (const alt of altNames) {
        const altScore = OFACClient._matchScore(queryLower, queryTokens, alt.toLowerCase());
        if (altScore > score) score = altScore;
      }

      if (score < 0.3) continue;

      const etypeMap: Record<string, string> = {
        individual: 'person',
        entity: 'company',
        vessel: 'vessel',
        aircraft: 'aircraft',
      };
      const mappedType = etypeMap[rowType] ?? 'unknown';

      const programs = row.program
        .split(';')
        .map((p) => p.trim())
        .filter(Boolean);

      const identifiers = OFACClient._parseRemarksIdentifiers(row.remarks);
      const addresses = this._addresses?.[row.ent_num] ?? [];
      const designationDate = extractDateFromRemarks(row.remarks);

      results.push({
        id: `ofac-${row.ent_num}`,
        name: row.name,
        aliases: altNames,
        entityType: mappedType,
        programs,
        addresses,
        identifiers,
        listSource: 'OFAC SDN',
        designationDate,
        remarks: row.remarks || null,
        score: Math.round(score * 1000) / 1000,
      });
    }

    // Sort by score descending, top 20
    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const topResults = results.slice(0, 20);

    setCached(topResults, CACHE_NS_OFAC, CACHE_TTL_SEARCH, cacheParams);
    return topResults;
  }

  /**
   * Return SDN entries with designation dates within `days` of today.
   * Date extraction is best-effort from the remarks field.
   *
   * @param days Number of days to look back (default 30).
   */
  async getRecentDesignations(days = 30): Promise<RecentDesignation[]> {
    await this._ensureLoaded();

    const cutoff = new Date(Date.now() - days * 86400 * 1000);
    const recent: RecentDesignation[] = [];

    for (const row of this._sdnEntries ?? []) {
      const designationDate = extractDateFromRemarks(row.remarks);
      if (!designationDate) continue;
      if (new Date(designationDate) < cutoff) continue;

      const rowType = row.type.replace(/^"|"$/g, '').toLowerCase();
      const etypeMap: Record<string, string> = {
        individual: 'person',
        entity: 'company',
        vessel: 'vessel',
        aircraft: 'aircraft',
      };

      const altNames = this._altNames?.[row.ent_num] ?? [];
      const addresses = this._addresses?.[row.ent_num] ?? [];
      const programs = row.program
        .split(';')
        .map((p) => p.trim())
        .filter(Boolean);

      const entry: SanctionEntry = {
        id: `ofac-${row.ent_num}`,
        name: row.name,
        aliases: altNames,
        entityType: etypeMap[rowType] ?? 'unknown',
        programs,
        addresses,
        identifiers: OFACClient._parseRemarksIdentifiers(row.remarks),
        listSource: 'OFAC SDN',
        designationDate,
        remarks: row.remarks || null,
        score: null,
      };

      recent.push({ entry, actionType: 'designation', effectiveDate: designationDate });
    }

    recent.sort((a, b) => {
      if (!a.effectiveDate) return 1;
      if (!b.effectiveDate) return -1;
      return new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime();
    });

    return recent;
  }

  // --- Static helpers ---

  /**
   * Compute a simple fuzzy match score [0, 1] between query and a candidate name.
   *
   * Scoring tiers:
   *  1.0 — exact substring match (query inside name)
   *  0.9 — reverse substring match (name inside query)
   *  0.8 — token overlap (fraction of query tokens found in name)
   *  0.5 — partial token match (individual characters overlap)
   *  0.0 — no match
   */
  static _matchScore(queryLower: string, queryTokens: Set<string>, nameLower: string): number {
    if (nameLower.includes(queryLower)) return 1.0;
    if (queryLower.includes(nameLower)) return 0.9;

    const nameTokens = new Set<string>(nameLower.match(/[a-z0-9]+/g) ?? []);
    if (queryTokens.size === 0) return 0.0;

    const overlap = [...queryTokens].filter((t) => nameTokens.has(t)).length;
    if (overlap > 0) return (overlap / queryTokens.size) * 0.8;

    const partialMatches = [...queryTokens].filter((qt) =>
      [...nameTokens].some((nt) => qt.includes(nt) || nt.includes(qt)),
    ).length;
    if (partialMatches > 0) return (partialMatches / queryTokens.size) * 0.5;

    return 0.0;
  }

  /**
   * Extract key-value identifiers from an OFAC remarks string.
   * Looks for patterns like "DOB 01 Jan 1970;" or "Passport 12345;".
   */
  static _parseRemarksIdentifiers(remarks: string): Record<string, string> {
    const identifiers: Record<string, string> = {};
    if (!remarks) return identifiers;

    const idKeys = [
      'DOB',
      'POB',
      'Passport',
      'National ID No.',
      'Tax ID No.',
      'Registration ID',
      'SWIFT/BIC',
      'Website',
      'Email Address',
      'alt. Passport',
      'SSN',
      'Cedula No.',
      'D-U-N-S Number',
    ];

    for (const key of idKeys) {
      const idx = remarks.indexOf(key);
      if (idx === -1) continue;
      let start = idx + key.length;
      while (start < remarks.length && ' :.'.includes(remarks[start])) start++;
      let end = remarks.indexOf(';', start);
      if (end === -1) end = remarks.length;
      const value = remarks.slice(start, end).trim().replace(/\.$/, '');
      if (value) identifiers[key] = value;
    }

    return identifiers;
  }
}

// ---------------------------------------------------------------------------
// Helper: convert CSL results to SanctionEntry
// ---------------------------------------------------------------------------

const CSL_TYPE_MAP: Record<string, string> = {
  entity: 'company',
  individual: 'person',
  vessel: 'vessel',
  aircraft: 'aircraft',
};

/**
 * Convert raw Trade.gov CSL API results (as returned by `searchCsl`) into
 * the unified `SanctionEntry` format.
 */
export function cslToEntries(cslResults: CslHit[]): SanctionEntry[] {
  const entries: SanctionEntry[] = [];

  for (const hit of cslResults) {
    const name = (hit.name ?? '').trim();
    if (!name) continue;

    const designationDate = tryParseDate(hit.start_date);

    const identifiers: Record<string, string> = {};
    for (const idObj of hit.ids ?? []) {
      const idType = (idObj.type ?? '').trim();
      const idNum = (idObj.number ?? '').trim();
      if (idType && idNum) identifiers[idType] = idNum;
    }

    const addresses: string[] = [];
    for (const addr of hit.addresses ?? []) {
      const parts = [addr.city, addr.state, addr.country].filter(Boolean) as string[];
      if (parts.length > 0) addresses.push(parts.join(', '));
    }

    entries.push({
      id: `csl-${hit.entity_number ?? name}`,
      name,
      aliases: hit.alt_names ?? [],
      entityType: CSL_TYPE_MAP[(hit.type ?? '').toLowerCase()] ?? 'unknown',
      programs: hit.programs ?? [],
      addresses,
      identifiers,
      listSource: hit.source ?? 'CSL',
      designationDate,
      remarks: hit.remarks ?? null,
      score: 0.9, // CSL results are government-verified; treat as high confidence
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Composite SanctionsClient
// ---------------------------------------------------------------------------

export class SanctionsClient {
  readonly opensanctions: OpenSanctionsClient;
  readonly ofac: OFACClient;

  constructor() {
    this.opensanctions = new OpenSanctionsClient();
    this.ofac = new OFACClient();
  }

  /**
   * Search Trade.gov CSL and OFAC SDN in parallel and merge deduplicated results.
   *
   * @param query      Name to search for.
   * @param entityType Optional entity type filter.
   */
  async search(query: string, entityType?: string): Promise<SanctionSearchResult> {
    const [cslRaw, ofacResults] = await Promise.allSettled([
      searchCsl(query),
      this.ofac.search(query, entityType),
    ]);

    const matches: SanctionEntry[] = [];

    if (cslRaw.status === 'fulfilled') {
      matches.push(...cslToEntries(cslRaw.value));
    } else {
      console.warn('CSL search error:', cslRaw.reason);
    }

    if (ofacResults.status === 'fulfilled') {
      matches.push(...ofacResults.value);
    } else {
      console.warn('OFAC search error:', ofacResults.reason);
    }

    // Deduplicate by lowercased name, keeping the higher-scored entry
    const seen = new Map<string, SanctionEntry>();
    for (const entry of matches) {
      const key = entry.name.toLowerCase().trim();
      const existing = seen.get(key);
      if (!existing || (entry.score ?? 0) > (existing.score ?? 0)) {
        seen.set(key, entry);
      }
    }

    const deduped = [...seen.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    return { query, matches: deduped, totalMatches: deduped.length };
  }

  /**
   * Check whether `entityName` appears on any sanctions list.
   * CSL hits score 0.9 (government-verified). OFAC fuzzy hits require >=0.85
   * to reduce false positives.
   *
   * @returns SanctionStatus with isSanctioned flag, listsFound, and programs.
   */
  async checkStatus(entityName: string): Promise<SanctionStatus> {
    const result = await this.search(entityName);
    const strongMatches = result.matches.filter((m) => (m.score ?? 0) >= 0.85);

    const listsFound: string[] = [];
    const designationDates: (string | null)[] = [];
    const programs: string[] = [];

    for (const entry of strongMatches) {
      if (entry.listSource && !listsFound.includes(entry.listSource)) {
        listsFound.push(entry.listSource);
      }
      if (entry.designationDate) designationDates.push(entry.designationDate);
      for (const prog of entry.programs) {
        if (!programs.includes(prog)) programs.push(prog);
      }
    }

    return {
      entityName,
      isSanctioned: strongMatches.length > 0,
      listsFound,
      designationDates,
      programs,
      entries: strongMatches,
    };
  }

  /**
   * Walk the OpenSanctions entity graph to find how many hops separate
   * `entityName` from any sanctioned entity.
   *
   * @param entityName Name of the entity to investigate.
   * @param maxHops    Maximum graph depth to traverse (default 2).
   */
  async getProximity(entityName: string, maxHops = 2): Promise<ProximityResult> {
    const searchResults = await this.opensanctions.search(entityName, 3);
    if (searchResults.length === 0) {
      return {
        queryEntity: entityName,
        nodes: [],
        edges: [],
        nearestSanctionedHop: null,
        sanctionedNeighbors: [],
      };
    }

    const rootEntry = searchResults[0];
    const rootNode: ProximityNode = {
      entityId: rootEntry.id,
      entityName: rootEntry.name,
      entityType: rootEntry.entityType,
      isSanctioned: rootEntry.programs.length > 0,
      sanctionsLists: rootEntry.programs.length > 0 ? [rootEntry.listSource] : [],
      hopDistance: 0,
    };

    const nodes = new Map<string, ProximityNode>([[rootEntry.id, rootNode]]);
    const edges: ProximityEdge[] = [];
    const sanctionedNeighbors: ProximityNode[] = [];
    let nearestSanctionedHop: number | null = null;

    if (rootNode.isSanctioned) {
      nearestSanctionedHop = 0;
      sanctionedNeighbors.push(rootNode);
    }

    let frontier = [rootEntry.id];

    for (let hop = 1; hop <= maxHops; hop++) {
      if (frontier.length === 0) break;
      const nextFrontier: string[] = [];

      for (const entityId of frontier) {
        const relationships = await this.opensanctions.getEntityRelationships(entityId);

        for (const rel of relationships) {
          const relatedId = rel.related_id;
          if (!relatedId || nodes.has(relatedId)) continue;

          const relatedEntry = await this.opensanctions.getEntity(relatedId);
          let node: ProximityNode;

          if (relatedEntry === null) {
            node = {
              entityId: relatedId,
              entityName: rel.related_name ?? relatedId,
              entityType: 'unknown',
              isSanctioned: false,
              sanctionsLists: [],
              hopDistance: hop,
            };
          } else {
            const isSanctioned = relatedEntry.programs.length > 0;
            node = {
              entityId: relatedId,
              entityName: relatedEntry.name,
              entityType: relatedEntry.entityType,
              isSanctioned,
              sanctionsLists: isSanctioned ? [relatedEntry.listSource] : [],
              hopDistance: hop,
            };
          }

          nodes.set(relatedId, node);
          nextFrontier.push(relatedId);

          edges.push({
            sourceId: entityId,
            targetId: relatedId,
            relationshipType: rel.relationship_type ?? 'associated',
          });

          if (node.isSanctioned) {
            sanctionedNeighbors.push(node);
            if (nearestSanctionedHop === null || hop < nearestSanctionedHop) {
              nearestSanctionedHop = hop;
            }
          }
        }
      }

      frontier = nextFrontier;
    }

    return {
      queryEntity: entityName,
      nodes: [...nodes.values()],
      edges,
      nearestSanctionedHop,
      sanctionedNeighbors,
    };
  }
}
