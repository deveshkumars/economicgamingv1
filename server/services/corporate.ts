/**
 * Corporate intelligence clients: OpenCorporates, GLEIF, and ICIJ Offshore Leaks.
 *
 * Ports Python corporate/client.py to TypeScript for the Express backend.
 */

import { getCached, setCached } from '../cache';
import { config } from '../config';
import { fetchJson } from '../http';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface Officer {
  name: string;
  role: string;
  nationality: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface CompanyRecord {
  name: string;
  companyNumber: string;
  jurisdiction: string;
  incorporationDate: string | null;
  status: string | null;
  registeredAddress: string | null;
  officers: Officer[];
}

export interface LEIRecord {
  lei: string;
  legalName: string;
  country: string | null;
  status: string | null;
}

export interface OwnershipLink {
  parentId: string;
  childId: string;
  relationshipType: string;
}

export interface OffshoreEntity {
  name: string;
  sourceDataset: string | null;
  jurisdiction: string | null;
  nodeId: string | null;
}

// ---------------------------------------------------------------------------
// Internal raw response shapes
// ---------------------------------------------------------------------------

interface OcCompanyRaw {
  name?: string;
  company_number?: string;
  jurisdiction_code?: string;
  incorporation_date?: string | null;
  current_status?: string | null;
  registered_address_in_full?: string | null;
  officers?: { officer: OcOfficerRaw }[];
}

interface OcOfficerRaw {
  name?: string;
  position?: string;
  nationality?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

interface OcSearchCompanyResult {
  results?: {
    companies?: { company: OcCompanyRaw }[];
  };
}

interface OcSearchOfficerResult {
  results?: {
    officers?: { officer: OcOfficerRaw }[];
  };
}

interface GleifDataItem {
  id?: string;
  attributes?: {
    lei?: string;
    entity?: {
      legalName?: { name?: string };
      legalAddress?: { country?: string };
    };
    registration?: { status?: string };
    relationship?: {
      startNode?: { id?: string };
      endNode?: { id?: string };
      relationshipType?: string;
    };
  };
}

interface GleifListResponse {
  data?: GleifDataItem[];
}

interface GleifSingleResponse {
  data?: GleifDataItem;
}

interface IcijSearchResult {
  nodes?: {
    name?: string;
    sourceID?: string;
    jurisdictionDescription?: string;
    id?: string | number;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseOcOfficer(raw: OcOfficerRaw): Officer {
  return {
    name: raw.name ?? '',
    role: raw.position ?? '',
    nationality: raw.nationality ?? null,
    startDate: raw.start_date ?? null,
    endDate: raw.end_date ?? null,
  };
}

function parseOcCompany(raw: OcCompanyRaw): CompanyRecord {
  const officers: Officer[] = (raw.officers ?? []).map((o) => parseOcOfficer(o.officer ?? {}));
  return {
    name: raw.name ?? '',
    companyNumber: raw.company_number ?? '',
    jurisdiction: raw.jurisdiction_code ?? '',
    incorporationDate: raw.incorporation_date ?? null,
    status: raw.current_status ?? null,
    registeredAddress: raw.registered_address_in_full ?? null,
    officers,
  };
}

function parseGleifRecord(item: GleifDataItem): LEIRecord {
  const attrs = item.attributes ?? {};
  return {
    lei: attrs.lei ?? item.id ?? '',
    legalName: attrs.entity?.legalName?.name ?? '',
    country: attrs.entity?.legalAddress?.country ?? null,
    status: attrs.registration?.status ?? null,
  };
}

// ---------------------------------------------------------------------------
// OpenCorporates
// ---------------------------------------------------------------------------

const OC_BASE = 'https://api.opencorporates.com/v0.4';

/**
 * Search OpenCorporates for companies matching `query`.
 * Optionally filter by `jurisdiction` (ISO 3166-1 alpha-2 or subdivision code).
 */
export async function ocSearchCompanies(
  query: string,
  jurisdiction?: string,
): Promise<CompanyRecord[]> {
  const cacheParams: Record<string, string> = { q: query };
  if (jurisdiction) cacheParams.jurisdiction_code = jurisdiction;

  const cached = getCached('oc:companies', cacheParams);
  if (cached) return cached as CompanyRecord[];

  const params: Record<string, string> = { q: query };
  if (jurisdiction) params.jurisdiction_code = jurisdiction;
  if (config.opencorporatesApiKey) params.api_token = config.opencorporatesApiKey;

  const data = await fetchJson<OcSearchCompanyResult>(`${OC_BASE}/companies/search`, params);

  const companies: CompanyRecord[] = (data.results?.companies ?? []).map((c) =>
    parseOcCompany(c.company ?? {}),
  );

  setCached(companies, 'oc:companies', 3600, cacheParams);
  return companies;
}

/**
 * Search OpenCorporates for officers (directors/shareholders) matching `name`.
 */
export async function ocSearchOfficers(name: string): Promise<Officer[]> {
  const cacheParams: Record<string, string> = { q: name };
  const cached = getCached('oc:officers', cacheParams);
  if (cached) return cached as Officer[];

  const params: Record<string, string> = { q: name };
  if (config.opencorporatesApiKey) params.api_token = config.opencorporatesApiKey;

  const data = await fetchJson<OcSearchOfficerResult>(`${OC_BASE}/officers/search`, params);

  const officers: Officer[] = (data.results?.officers ?? []).map((o) =>
    parseOcOfficer(o.officer ?? {}),
  );

  setCached(officers, 'oc:officers', 3600, cacheParams);
  return officers;
}

// ---------------------------------------------------------------------------
// GLEIF
// ---------------------------------------------------------------------------

const GLEIF_BASE = 'https://api.gleif.org/api/v1';

/**
 * Full-text search for LEI records.
 */
export async function gleifSearchLei(query: string): Promise<LEIRecord[]> {
  const cacheParams: Record<string, string> = { q: query };
  const cached = getCached('gleif:search', cacheParams);
  if (cached) return cached as LEIRecord[];

  const params: Record<string, string> = {
    'filter[fulltext]': query,
    'page[size]': '10',
  };

  const data = await fetchJson<GleifListResponse>(`${GLEIF_BASE}/lei-records`, params);

  const records: LEIRecord[] = (data.data ?? []).map(parseGleifRecord);

  setCached(records, 'gleif:search', 3600, cacheParams);
  return records;
}

/**
 * Fetch a single LEI record by its identifier.
 */
export async function gleifGetLeiRecord(lei: string): Promise<LEIRecord | null> {
  const cacheParams: Record<string, string> = { lei };
  const cached = getCached('gleif:record', cacheParams);
  if (cached) return cached as LEIRecord;

  const data = await fetchJson<GleifSingleResponse>(`${GLEIF_BASE}/lei-records/${lei}`);

  if (!data.data) return null;
  const record = parseGleifRecord(data.data);

  setCached(record, 'gleif:record', 86400, cacheParams);
  return record;
}

/**
 * Fetch the direct parent ownership relationship for a given LEI.
 * Returns null if no direct parent exists.
 */
export async function gleifGetDirectParent(lei: string): Promise<OwnershipLink | null> {
  const cacheParams: Record<string, string> = { lei };
  const cached = getCached('gleif:direct-parent', cacheParams);
  if (cached !== null) return cached as OwnershipLink | null;

  try {
    const data = await fetchJson<GleifSingleResponse>(
      `${GLEIF_BASE}/lei-records/${lei}/direct-parent-relationship`,
    );

    if (!data.data?.attributes?.relationship) {
      setCached(null, 'gleif:direct-parent', 3600, cacheParams);
      return null;
    }

    const rel = data.data.attributes.relationship;
    const link: OwnershipLink = {
      childId: rel.startNode?.id ?? lei,
      parentId: rel.endNode?.id ?? '',
      relationshipType: rel.relationshipType ?? '',
    };

    setCached(link, 'gleif:direct-parent', 3600, cacheParams);
    return link;
  } catch {
    setCached(null, 'gleif:direct-parent', 3600, cacheParams);
    return null;
  }
}

/**
 * Fetch the ultimate parent ownership relationship for a given LEI.
 * Returns null if no ultimate parent exists.
 */
export async function gleifGetUltimateParent(lei: string): Promise<OwnershipLink | null> {
  const cacheParams: Record<string, string> = { lei };
  const cached = getCached('gleif:ultimate-parent', cacheParams);
  if (cached !== null) return cached as OwnershipLink | null;

  try {
    const data = await fetchJson<GleifSingleResponse>(
      `${GLEIF_BASE}/lei-records/${lei}/ultimate-parent-relationship`,
    );

    if (!data.data?.attributes?.relationship) {
      setCached(null, 'gleif:ultimate-parent', 3600, cacheParams);
      return null;
    }

    const rel = data.data.attributes.relationship;
    const link: OwnershipLink = {
      childId: rel.startNode?.id ?? lei,
      parentId: rel.endNode?.id ?? '',
      relationshipType: rel.relationshipType ?? '',
    };

    setCached(link, 'gleif:ultimate-parent', 3600, cacheParams);
    return link;
  } catch {
    setCached(null, 'gleif:ultimate-parent', 3600, cacheParams);
    return null;
  }
}

// ---------------------------------------------------------------------------
// ICIJ Offshore Leaks
// ---------------------------------------------------------------------------

const ICIJ_BASE = 'https://offshoreleaks.icij.org/api/v1';

/**
 * Search the ICIJ Offshore Leaks database.
 * `entityType` can be "officer", "entity", "intermediary", or "address".
 *
 * Note: This API may be unavailable (404) — returns an empty array on failure.
 */
export async function icijSearch(
  query: string,
  entityType?: string,
): Promise<OffshoreEntity[]> {
  const cacheParams: Record<string, string> = { q: query };
  if (entityType) cacheParams.e = entityType;

  const cached = getCached('icij:search', cacheParams);
  if (cached) return cached as OffshoreEntity[];

  try {
    const params: Record<string, string> = { q: query };
    if (entityType) params.e = entityType;

    const data = await fetchJson<IcijSearchResult>(`${ICIJ_BASE}/search`, params);

    const entities: OffshoreEntity[] = (data.nodes ?? []).map((n) => ({
      name: n.name ?? '',
      sourceDataset: n.sourceID ?? null,
      jurisdiction: n.jurisdictionDescription ?? null,
      nodeId: n.id != null ? String(n.id) : null,
    }));

    setCached(entities, 'icij:search', 3600, cacheParams);
    return entities;
  } catch {
    // API may return 404 or be otherwise unavailable — degrade gracefully
    return [];
  }
}
