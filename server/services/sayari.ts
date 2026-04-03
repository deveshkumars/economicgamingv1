/**
 * Sayari Graph REST client with OAuth2 token management.
 *
 * Ports Python sayari/client.py to TypeScript for the Express backend.
 */

import { getCached, setCached } from '../cache';
import { config } from '../config';
import { fetchJson } from '../http';

// ---------------------------------------------------------------------------
// HS Code → Commodity category mapping
// ---------------------------------------------------------------------------

export const HS_CATEGORY_MAP: Record<string, string> = {
  // Chapter 1–5: Animals & animal products
  '01': 'Live Animals',
  '02': 'Meat & Offal',
  '03': 'Fish & Seafood',
  '04': 'Dairy, Eggs & Honey',
  '05': 'Other Animal Products',

  // Chapter 6–14: Vegetable products
  '06': 'Live Plants & Flowers',
  '07': 'Vegetables',
  '08': 'Fruits & Nuts',
  '09': 'Coffee, Tea & Spices',
  '10': 'Cereals & Grains',
  '11': 'Milling Industry Products',
  '12': 'Oil Seeds & Oleaginous Fruits',
  '13': 'Lac, Gums & Resins',
  '14': 'Vegetable Plaiting Materials',

  // Chapter 15: Fats & oils
  '15': 'Fats, Oils & Waxes',

  // Chapter 16–24: Food preparations
  '16': 'Prepared Meat & Fish',
  '17': 'Sugars & Sugar Confectionery',
  '18': 'Cocoa & Chocolate',
  '19': 'Prepared Cereals & Bakery',
  '20': 'Preserved Vegetables & Fruits',
  '21': 'Miscellaneous Food Preparations',
  '22': 'Beverages & Spirits',
  '23': 'Food Industry Residues & Fodder',
  '24': 'Tobacco',

  // Chapter 25–27: Minerals
  '25': 'Salt, Sulphur & Stone',
  '26': 'Ores, Slag & Ash',
  '27': 'Mineral Fuels & Oil',

  // Chapter 28–38: Chemical products
  '28': 'Inorganic Chemicals',
  '29': 'Organic Chemicals',
  '30': 'Pharmaceutical Products',
  '31': 'Fertilisers',
  '32': 'Dyes, Pigments & Paints',
  '33': 'Essential Oils & Perfumes',
  '34': 'Soaps & Cleaning Agents',
  '35': 'Albuminoidal Substances & Enzymes',
  '36': 'Explosives & Pyrotechnics',
  '37': 'Photographic & Cinematographic Goods',
  '38': 'Miscellaneous Chemical Products',

  // Chapter 39–40: Plastics & rubber
  '39': 'Plastics & Articles',
  '40': 'Rubber & Articles',

  // Chapter 41–43: Hides, leather & furskins
  '41': 'Hides & Leather',
  '42': 'Leather Articles & Bags',
  '43': 'Furskins',

  // Chapter 44–46: Wood & articles
  '44': 'Wood & Articles',
  '45': 'Cork & Articles',
  '46': 'Plaiting Materials & Basketwork',

  // Chapter 47–49: Pulp & paper
  '47': 'Pulp of Wood',
  '48': 'Paper & Paperboard',
  '49': 'Printed Books & Newspapers',

  // Chapter 50–63: Textiles
  '50': 'Silk',
  '51': 'Wool & Animal Hair',
  '52': 'Cotton',
  '53': 'Vegetable Textile Fibres',
  '54': 'Man-made Filaments',
  '55': 'Man-made Staple Fibres',
  '56': 'Wadding, Felt & Nonwovens',
  '57': 'Carpets & Textile Floor Coverings',
  '58': 'Special Woven Fabrics',
  '59': 'Impregnated Textile Fabrics',
  '60': 'Knitted & Crocheted Fabrics',
  '61': 'Knitted Clothing',
  '62': 'Woven Clothing',
  '63': 'Other Made-up Textile Articles',

  // Chapter 64–67: Footwear & headgear
  '64': 'Footwear',
  '65': 'Headgear',
  '66': 'Umbrellas & Walking Sticks',
  '67': 'Feathers & Artificial Flowers',

  // Chapter 68–70: Stone, glass & ceramics
  '68': 'Stone, Plaster & Cement Articles',
  '69': 'Ceramics',
  '70': 'Glass & Glassware',

  // Chapter 71: Precious stones & metals
  '71': 'Precious Stones, Metals & Jewellery',

  // Chapter 72–83: Base metals
  '72': 'Iron & Steel',
  '73': 'Iron & Steel Articles',
  '74': 'Copper & Articles',
  '75': 'Nickel & Articles',
  '76': 'Aluminium & Articles',
  '78': 'Lead & Articles',
  '79': 'Zinc & Articles',
  '80': 'Tin & Articles',
  '81': 'Other Base Metals',
  '82': 'Tools & Cutlery',
  '83': 'Miscellaneous Base Metal Articles',

  // Chapter 84–85: Machinery & electronics
  '84': 'Machinery & Mechanical Appliances',
  '85': 'Electrical Machinery & Electronics',

  // Chapter 86–89: Transport equipment
  '86': 'Railway Rolling Stock',
  '87': 'Vehicles',
  '88': 'Aircraft & Spacecraft',
  '89': 'Ships & Boats',

  // Chapter 90–92: Instruments & optics
  '90': 'Optical & Medical Instruments',
  '91': 'Clocks & Watches',
  '92': 'Musical Instruments',

  // Chapter 93: Arms & ammunition
  '93': 'Arms & Ammunition',

  // Chapter 94–96: Miscellaneous manufactured
  '94': 'Furniture & Bedding',
  '95': 'Toys & Games',
  '96': 'Miscellaneous Manufactured Articles',

  // Chapter 97: Art & antiques
  '97': 'Works of Art & Antiques',
};

/**
 * Resolve a full HS code (4- or 6-digit) to its broad category label.
 *
 * @param hsCode  HS code string (e.g. "270900", "8471", "72").
 */
export function hsCodeToCategory(hsCode: string): string {
  const chapter = hsCode.replace(/\D/g, '').slice(0, 2).padStart(2, '0');
  return HS_CATEGORY_MAP[chapter] ?? `Chapter ${chapter}`;
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface SayariEntity {
  entityId: string;
  label: string;
  type: string;
  country: string | null;
  addresses: string[];
  identifiers: Record<string, string>;
  sources: string[];
  pep: boolean;
  sanctioned: boolean;
}

export interface SayariRelationship {
  sourceId: string;
  targetId: string;
  relationshipType: string;
  attributes: Record<string, unknown>;
}

export interface SayariUBOOwner {
  entityId: string;
  name: string;
  type: string;
  country: string | null;
  ownershipPercentage: number | null;
  pathLength: number;
  sanctioned: boolean;
  pep: boolean;
}

export interface SayariResolveResult {
  entities: SayariEntity[];
  query: string;
}

export interface SayariTraversalResult {
  rootId: string;
  entities: SayariEntity[];
  relationships: SayariRelationship[];
}

export interface SayariUBOResult {
  targetId: string;
  targetName: string;
  owners: SayariUBOOwner[];
}

/** Ownership link used in vessel UBO chain. */
export interface OwnershipLink {
  entityId: string;
  name: string;
  entityType: string;
  country: string | null;
  ownershipPercentage: number | null;
  isSanctioned: boolean;
  isPep: boolean;
  depth: number;
  relationshipType: string;
  parentEntityId: string | null;
}

export interface VesselIntelResult {
  vesselName: string;
  imo: string | null;
  vesselEntity: SayariEntity | null;
  uboChain: OwnershipLink[];
  ownerEntities: SayariEntity[];
  tradeActivity: SayariEntity[];
  sanctionedOwners: OwnershipLink[];
  pepOwners: OwnershipLink[];
  highRiskFlags: string[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Internal raw response shapes
// ---------------------------------------------------------------------------

interface SayariTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

interface SayariRawEntity {
  id?: string;
  label?: string;
  type?: string;
  country?: string | null;
  addresses?: { address?: string }[];
  identifiers?: { type?: string; value?: string }[];
  sources?: { source?: string }[];
  pep?: boolean;
  sanctioned?: boolean;
}

interface SayariRawRelationship {
  source?: string;
  target?: string;
  type?: string;
  attributes?: Record<string, unknown>;
}

interface SayariResolveRaw {
  data?: SayariRawEntity[];
}

interface SayariEntityRaw {
  data?: SayariRawEntity;
}

interface SayariTraversalRaw {
  data?: {
    nodes?: SayariRawEntity[];
    edges?: SayariRawRelationship[];
  };
  root?: string;
}

interface SayariUBORaw {
  target?: SayariRawEntity;
  owners?: {
    entity?: SayariRawEntity;
    ownership_percentage?: number | null;
    path_length?: number;
    sanctioned?: boolean;
    pep?: boolean;
  }[];
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseSayariEntity(raw: SayariRawEntity): SayariEntity {
  const addresses = (raw.addresses ?? []).map((a) => a.address ?? '').filter(Boolean);
  const identifiers: Record<string, string> = {};
  for (const id of raw.identifiers ?? []) {
    if (id.type && id.value) identifiers[id.type] = id.value;
  }
  const sources = (raw.sources ?? []).map((s) => s.source ?? '').filter(Boolean);

  return {
    entityId: raw.id ?? '',
    label: raw.label ?? '',
    type: raw.type ?? '',
    country: raw.country ?? null,
    addresses,
    identifiers,
    sources,
    pep: raw.pep ?? false,
    sanctioned: raw.sanctioned ?? false,
  };
}

function parseSayariRelationship(raw: SayariRawRelationship): SayariRelationship {
  return {
    sourceId: raw.source ?? '',
    targetId: raw.target ?? '',
    relationshipType: raw.type ?? '',
    attributes: raw.attributes ?? {},
  };
}

// ---------------------------------------------------------------------------
// SayariClient class
// ---------------------------------------------------------------------------

export class SayariClient {
  private readonly clientId: string;
  private readonly clientSecret: string;

  private static readonly TOKEN_CACHE_NS = 'sayari_token';
  private static readonly TOKEN_TTL = 3500; // seconds — Sayari tokens typically expire in 3600s

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  // ---------------------------------------------------------------------------
  // OAuth2 token management
  // ---------------------------------------------------------------------------

  /**
   * Obtain a valid Bearer token.
   * Tokens are cached in-process for TOKEN_TTL seconds.
   */
  async _getToken(): Promise<string> {
    const cacheParams = { client_id: this.clientId };
    const cached = getCached(SayariClient.TOKEN_CACHE_NS, cacheParams) as string | null;
    if (cached !== null) return cached;

    const url = 'https://api.sayari.com/oauth/token';

    let data: SayariTokenResponse;
    try {
      data = await fetchJson<SayariTokenResponse>(
        url,
        undefined,
        { 'Content-Type': 'application/x-www-form-urlencoded' },
      );
    } catch {
      // fetchJson sends a GET — the Sayari token endpoint requires a POST form.
      // Perform the POST manually using the global fetch API.
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });

      let attempts = 0;
      let lastErr: Error | null = null;
      while (attempts <= 2) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
          }
          data = (await res.json()) as SayariTokenResponse;
          break;
        } catch (e) {
          clearTimeout(timer);
          lastErr = e as Error;
          attempts++;
          if (attempts <= 2) await new Promise((r) => setTimeout(r, 1000 * attempts));
        }
      }

      if (!data!) {
        throw lastErr ?? new Error('Failed to obtain Sayari OAuth2 token');
      }
    }

    const token = data!.access_token;
    if (!token) throw new Error('Sayari token response missing access_token');

    setCached(token, SayariClient.TOKEN_CACHE_NS, SayariClient.TOKEN_TTL, cacheParams);
    return token;
  }

  /** Build Authorization headers for authenticated requests. */
  private async _authHeaders(): Promise<Record<string, string>> {
    const token = await this._getToken();
    return { Authorization: `Bearer ${token}` };
  }

  // ---------------------------------------------------------------------------
  // Entity resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve a free-text name to Sayari entities.
   *
   * @param name        Entity name (company, person, vessel, etc.).
   * @param limit       Maximum number of results (default 5).
   * @param entityType  Optional type filter (e.g. "company", "vessel").
   */
  async resolve(
    name: string,
    limit = 5,
    entityType?: string,
  ): Promise<SayariResolveResult> {
    const cacheParams: Record<string, string> = {
      name,
      limit: String(limit),
      type: entityType ?? '',
    };
    const cached = getCached('sayari_resolve', cacheParams) as SayariResolveResult | null;
    if (cached !== null) return cached;

    const headers = await this._authHeaders();
    const params: Record<string, string> = { name, limit: String(limit) };
    if (entityType) params.type = entityType;

    let data: SayariResolveRaw;
    try {
      data = await fetchJson<SayariResolveRaw>(
        'https://api.sayari.com/v1/resolution',
        params,
        headers,
      );
    } catch (err) {
      console.warn(`Sayari resolve error (name="${name}"):`, err);
      return { entities: [], query: name };
    }

    const entities = (data.data ?? []).map(parseSayariEntity);
    const result: SayariResolveResult = { entities, query: name };
    setCached(result, 'sayari_resolve', 3600, cacheParams);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Entity detail
  // ---------------------------------------------------------------------------

  /**
   * Fetch a full entity record by Sayari entity ID.
   *
   * @param entityId  Sayari entity identifier.
   */
  async getEntity(entityId: string): Promise<SayariEntity | null> {
    const cacheParams: Record<string, string> = { id: entityId };
    const cached = getCached('sayari_entity', cacheParams) as SayariEntity | null;
    if (cached !== null) return cached;

    const headers = await this._authHeaders();

    let data: SayariEntityRaw;
    try {
      data = await fetchJson<SayariEntityRaw>(
        `https://api.sayari.com/v1/entity/${entityId}`,
        undefined,
        headers,
      );
    } catch (err) {
      console.warn(`Sayari getEntity error (id="${entityId}"):`, err);
      return null;
    }

    if (!data.data) return null;
    const entity = parseSayariEntity(data.data);
    setCached(entity, 'sayari_entity', 86400, cacheParams);
    return entity;
  }

  // ---------------------------------------------------------------------------
  // Graph traversal
  // ---------------------------------------------------------------------------

  /**
   * Traverse the Sayari entity graph from a root entity.
   *
   * @param entityId  Root entity ID.
   * @param depth     Graph traversal depth (default 1).
   * @param limit     Max number of related entities (default 20).
   */
  async getTraversal(
    entityId: string,
    depth = 1,
    limit = 20,
  ): Promise<SayariTraversalResult> {
    const cacheParams: Record<string, string> = {
      id: entityId,
      depth: String(depth),
      limit: String(limit),
    };
    const cached = getCached('sayari_traversal', cacheParams) as SayariTraversalResult | null;
    if (cached !== null) return cached;

    const headers = await this._authHeaders();
    const params: Record<string, string> = {
      depth: String(depth),
      limit: String(limit),
      min_strength: 'weak',
    };

    let data: SayariTraversalRaw;
    try {
      data = await fetchJson<SayariTraversalRaw>(
        `https://api.sayari.com/v1/traversal/${entityId}`,
        params,
        headers,
      );
    } catch (err) {
      console.warn(`Sayari traversal error (id="${entityId}"):`, err);
      return { rootId: entityId, entities: [], relationships: [] };
    }

    const entities = (data.data?.nodes ?? []).map(parseSayariEntity);
    const relationships = (data.data?.edges ?? []).map(parseSayariRelationship);

    const result: SayariTraversalResult = {
      rootId: data.root ?? entityId,
      entities,
      relationships,
    };
    setCached(result, 'sayari_traversal', 3600, cacheParams);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Ultimate Beneficial Ownership
  // ---------------------------------------------------------------------------

  /**
   * Fetch the Ultimate Beneficial Ownership (UBO) chain for an entity.
   *
   * @param entityId  Target entity ID.
   */
  async getUbo(entityId: string): Promise<SayariUBOResult> {
    const cacheParams: Record<string, string> = { id: entityId };
    const cached = getCached('sayari_ubo', cacheParams) as SayariUBOResult | null;
    if (cached !== null) return cached;

    const headers = await this._authHeaders();

    let data: SayariUBORaw;
    try {
      data = await fetchJson<SayariUBORaw>(
        `https://api.sayari.com/v1/ubo/${entityId}`,
        undefined,
        headers,
      );
    } catch (err) {
      console.warn(`Sayari UBO error (id="${entityId}"):`, err);
      return { targetId: entityId, targetName: '', owners: [] };
    }

    const targetName = data.target?.label ?? '';
    const owners: SayariUBOOwner[] = (data.owners ?? []).map((o) => ({
      entityId: o.entity?.id ?? '',
      name: o.entity?.label ?? '',
      type: o.entity?.type ?? '',
      country: o.entity?.country ?? null,
      ownershipPercentage: o.ownership_percentage ?? null,
      pathLength: o.path_length ?? 0,
      sanctioned: o.sanctioned ?? false,
      pep: o.pep ?? false,
    }));

    const result: SayariUBOResult = { targetId: entityId, targetName, owners };
    setCached(result, 'sayari_ubo', 3600, cacheParams);
    return result;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _sayariClientInstance: SayariClient | null = null;

/**
 * Returns the shared SayariClient instance (created on first call).
 * Uses SAYARI_CLIENT_ID and SAYARI_CLIENT_SECRET from config.
 */
export function getSayariClient(): SayariClient {
  if (!_sayariClientInstance) {
    _sayariClientInstance = new SayariClient(
      config.sayariClientId,
      config.sayariClientSecret,
    );
  }
  return _sayariClientInstance;
}

// ---------------------------------------------------------------------------
// Vessel intelligence helper
// ---------------------------------------------------------------------------

/**
 * Build a composite vessel intelligence report.
 *
 * Resolves the vessel by name (and optionally IMO or owner), walks the UBO
 * chain for each resolved entity, and flags sanctioned/PEP owners.
 *
 * @param vesselName  Name of the vessel.
 * @param imo         Optional IMO number string.
 * @param ownerName   Optional registered owner name for corroboration.
 */
export async function getVesselIntel(
  vesselName: string,
  imo?: string,
  ownerName?: string,
): Promise<VesselIntelResult> {
  const client = getSayariClient();

  // Step 1: Resolve vessel name (filter by vessel type)
  const resolveQuery = imo ? `${vesselName} IMO:${imo}` : vesselName;
  const resolveResult = await client.resolve(resolveQuery, 5, 'vessel');

  let vesselEntity: SayariEntity | null = null;
  if (resolveResult.entities.length > 0) {
    // Prefer entities that match IMO if provided
    if (imo) {
      vesselEntity =
        resolveResult.entities.find((e) => {
          const ids = Object.values(e.identifiers).join(' ').toLowerCase();
          return ids.includes(imo.toLowerCase());
        }) ?? resolveResult.entities[0];
    } else {
      vesselEntity = resolveResult.entities[0];
    }
  }

  // Step 2: Also resolve owner if provided
  let ownerEntity: SayariEntity | null = null;
  if (ownerName) {
    const ownerResolve = await client.resolve(ownerName, 3, 'company');
    ownerEntity = ownerResolve.entities[0] ?? null;
  }

  // Step 3: Get trade activity via graph traversal from vessel entity
  let tradeActivity: SayariEntity[] = [];
  if (vesselEntity) {
    const traversal = await client.getTraversal(vesselEntity.entityId, 1, 20);
    tradeActivity = traversal.entities;
  }

  // Step 4: Build UBO chains
  const uboChain: OwnershipLink[] = [];
  const ownerEntities: SayariEntity[] = [];
  const sanctionedOwners: OwnershipLink[] = [];
  const pepOwners: OwnershipLink[] = [];

  async function processUbo(entityId: string, entityLabel: string): Promise<void> {
    const uboResult = await client.getUbo(entityId);

    for (const owner of uboResult.owners) {
      if (!owner.entityId) continue;

      // Avoid duplicates
      if (uboChain.some((l) => l.entityId === owner.entityId)) continue;

      const link: OwnershipLink = {
        entityId: owner.entityId,
        name: owner.name,
        entityType: owner.type,
        country: owner.country,
        ownershipPercentage: owner.ownershipPercentage,
        isSanctioned: owner.sanctioned,
        isPep: owner.pep,
        depth: owner.pathLength,
        relationshipType: 'ownership',
        parentEntityId: entityId,
      };

      uboChain.push(link);
      if (owner.sanctioned) sanctionedOwners.push(link);
      if (owner.pep) pepOwners.push(link);

      // Optionally fetch full entity for enrichment (best-effort, depth-limited)
      if (owner.pathLength <= 2) {
        const fullEntity = await client.getEntity(owner.entityId).catch(() => null);
        if (fullEntity) ownerEntities.push(fullEntity);
      }
    }
  }

  if (vesselEntity) {
    await processUbo(vesselEntity.entityId, vesselEntity.label);
  }
  if (ownerEntity && ownerEntity.entityId !== vesselEntity?.entityId) {
    await processUbo(ownerEntity.entityId, ownerEntity.label);
  }

  // Step 5: High-risk flags
  const highRiskFlags: string[] = [];

  if (sanctionedOwners.length > 0) {
    highRiskFlags.push(
      `${sanctionedOwners.length} sanctioned owner(s) in UBO chain: ${sanctionedOwners.map((o) => o.name).join(', ')}`,
    );
  }

  if (pepOwners.length > 0) {
    highRiskFlags.push(
      `${pepOwners.length} politically exposed person(s) in ownership: ${pepOwners.map((o) => o.name).join(', ')}`,
    );
  }

  if (vesselEntity?.sanctioned) {
    highRiskFlags.push(`Vessel entity itself is on a sanctions list`);
  }

  // Flag high-risk flag countries in ownership chain
  const HIGH_RISK_COUNTRIES = new Set([
    'IRN', 'PRK', 'RUS', 'SYR', 'CUB', 'VEN', 'BLR', 'MMR', 'SDN', 'YEM', 'LBY', 'SOM', 'ZWE',
  ]);
  const riskyOwnerCountries = uboChain
    .filter((o) => o.country && HIGH_RISK_COUNTRIES.has(o.country))
    .map((o) => `${o.name} (${o.country})`);

  if (riskyOwnerCountries.length > 0) {
    highRiskFlags.push(`Owner(s) linked to high-risk jurisdiction(s): ${riskyOwnerCountries.join(', ')}`);
  }

  // Flag opacity: unknown ownership percentages
  const unknownOwnership = uboChain.filter(
    (o) => o.ownershipPercentage === null && o.depth === 1,
  );
  if (unknownOwnership.length > 1) {
    highRiskFlags.push(
      `Ownership percentages undisclosed for ${unknownOwnership.length} direct owner(s) — opacity risk`,
    );
  }

  // Step 6: Summary
  const imoStr = imo ? ` (IMO: ${imo})` : '';
  const ownerCount = uboChain.length;
  const sanctionedCount = sanctionedOwners.length;
  let summary = `Vessel "${vesselName}"${imoStr}: ${ownerCount} entity/entities identified in ownership chain.`;
  if (sanctionedCount > 0) {
    summary += ` WARNING: ${sanctionedCount} sanctioned owner(s) detected.`;
  } else {
    summary += ' No sanctioned owners detected in chain.';
  }
  if (highRiskFlags.length > 0) {
    summary += ` ${highRiskFlags.length} high-risk flag(s) raised.`;
  }

  return {
    vesselName,
    imo: imo ?? null,
    vesselEntity,
    uboChain,
    ownerEntities,
    tradeActivity,
    sanctionedOwners,
    pepOwners,
    highRiskFlags,
    summary,
  };
}
