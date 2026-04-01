// --- Health ---

export interface HealthResponse {
  status: 'ok' | 'misconfigured';
  issues: string[];
  model: string;
  tools_available: boolean;
}

// --- Sanctions Impact ---

export interface CslMatch {
  name: string;
  source: string;
  programs: string[];
  start_date: string | null;
}

export interface SanctionsStatus {
  is_sanctioned: boolean;
  lists: string[];
  programs: string[];
  csl_matches: CslMatch[];
}

export interface TargetInfo {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  country: string | null;
  market_cap: number | null;
  current_price: number;
  change_pct: number;
  sanctions_status: SanctionsStatus;
}

export interface CurvePoint {
  day: number;
  pct: number;
}

export interface Comparable {
  name: string;
  ticker: string;
  sanction_date: string;
  description: string;
  sector: string;
  sanction_type?: string;
  color: string;
  curve: CurvePoint[];
}

export interface ProjectionPoint {
  day: number;
  pct: number;
  price: number;
}

export interface ProjectionSummaryData {
  pre_event_decline?: number;
  day_30_post?: number;
  day_30_range?: [number, number];
  day_60_post?: number;
  day_60_range?: [number, number];
  day_90_post?: number;
  day_90_range?: [number, number];
  max_drawdown?: number;
}

export interface Projection {
  mean: ProjectionPoint[];
  upper: ProjectionPoint[];
  lower: ProjectionPoint[];
  summary: ProjectionSummaryData;
  coherence_score?: number;
  coherence_low?: boolean;
}

export interface SanctionsImpactResponse {
  target: TargetInfo;
  comparables: Comparable[];
  projection: Projection;
  metadata: {
    comparable_count: number;
    time_window_days: [number, number];
    generated_at: string;
    sourcing_method?: 'claude' | 'cache' | 'static_fallback';
  };
  narrative?: string;
}

// --- Entity Graph ---

export interface GraphNode {
  id: string;
  label: string;
  title: string;
  group: string;
  color: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label: string;
  arrows: string;
  dashes: boolean;
}

export interface EntityGraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta?: {
    query: string;
    node_count: number;
    edge_count: number;
  };
}

// --- Progress ---

export interface ProgressEntry {
  msg: string;
  type: 'step' | 'error' | 'done';
  time: string;
}

// --- Orchestrator ---

export interface OrchestratorFinding {
  category: string;
  finding: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  [key: string]: unknown;
}

export interface OrchestratorFriendlyFire {
  entity: string;
  details?: string;
  exposure_type?: string;
  estimated_impact?: string;
  [key: string]: unknown;
}

export interface OrchestratorEntity {
  id: string;
  name: string;
  entity_type: string;
  aliases?: string[];
  country?: string | null;
}

export interface OrchestratorRelationship {
  source_id: string;
  target_id: string;
  relationship_type: string;
}

export interface ImpactAssessmentResult {
  query: { raw_query: string; scenario_type: string };
  scenario_type: string;
  executive_summary: string;
  findings: OrchestratorFinding[];
  friendly_fire: OrchestratorFriendlyFire[];
  confidence_summary: Record<string, string>;
  sources: { name: string; url?: string | null; accessed_at?: string }[];
  recommendations: string[];
  /** Present when the orchestrator extracted a graph */
  entity_graph?: {
    entities: OrchestratorEntity[];
    relationships: OrchestratorRelationship[];
  };
}

export interface OrchestratorStatusResponse {
  analysis_id: string;
  status: 'running' | 'completed' | 'failed';
  progress: string[];
  result: ImpactAssessmentResult | null;
  error: string | null;
}

export interface StartAnalysisResponse {
  analysis_id: string;
  status: string;
}

// --- Entity Resolution ---

export interface EntityResolutionResponse {
  entity_type: 'company' | 'person' | 'sector' | 'vessel';
  entity_name: string;
  confidence: number;
  reasoning: string;
}

// --- Person Profile ---

export interface PersonAffiliation {
  company: string;
  role: string;
  nationality: string;
  active: boolean;
}

export interface OffshoreConnection {
  entity: string;
  dataset: string;
  jurisdiction: string;
}

export interface RecentEvent {
  title: string;
  date: string;
  source: string;
  tone: number | null;
}

export interface PersonProfileResponse {
  name: string;
  is_sanctioned: boolean;
  sanction_programs: string[];
  aliases: string[];
  nationality: string | null;
  dob: string | null;
  affiliations: PersonAffiliation[];
  offshore_connections: OffshoreConnection[];
  recent_events: RecentEvent[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  narrative?: string;
  sources: string[];
}

// --- Sector Analysis ---

export interface CompanyProfile {
  name: string;
  ticker: string | null;
  country: string | null;
  is_sanctioned: boolean;
  sanction_names: string[];
}

export interface SupplyChainExposure {
  label: string;
  commodity_code: string;
  import_share_pct: number;
  top_suppliers: unknown[];
}

export interface GeopoliticalTension {
  pair: string;
  event_count: number;
  tension_level: string;
  avg_tone: number | null;
}

export interface SectorAnalysisResponse {
  sector: string;
  sector_key: string;
  company_count: number;
  sanctioned_count: number;
  companies: CompanyProfile[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  narrative?: string;
  supply_chain_exposures?: SupplyChainExposure[];
  geopolitical_tensions?: GeopoliticalTension[];
  sources: string[];
}

// --- Vessel Track ---

export interface VesselDetail {
  name: string;
  imo: string;
  mmsi: string;
  callsign: string;
  flag: string;
  vessel_type: string;
  length: number | null;
  width: number | null;
  deadweight: number;
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
  heading: number;
  status: string;
  destination: string;
  eta: string;
  last_position_epoch: number;
  source: string;
  note?: string;
  owner?: string;
}

export interface RoutePoint {
  lat: number;
  lon: number;
  speed: number;
  ts: number;
}

export interface SanctionsMatch {
  name: string;
  score: number;
  programs: string[];
}

export interface OwnershipLink {
  entity_id: string;
  name: string;
  entity_type: string;
  country: string | null;
  ownership_percentage: number | null;
  is_sanctioned: boolean;
  is_pep: boolean;
  depth: number;
  relationship_type: string;
  parent_entity_id: string | null;
}

export interface TradeRecord {
  supplier: string;
  buyer: string;
  hs_code: string | null;
  hs_description: string | null;
  departure_country: string | null;
  arrival_country: string | null;
  date: string | null;
}

export interface TradeActivity {
  records: TradeRecord[];
  top_hs_codes: { code: string; description: string }[];
  trade_countries: string[];
  record_count: number;
}

export interface PortCall {
  port_name: string;
  country: string;
  latitude: number;
  longitude: number;
  arrival: string;
  departure: string;
}

export interface PortStopInferred {
  latitude: number;
  longitude: number;
  arrival_ts: number;
  departure_ts: number;
  duration_hours: number;
  position_count: number;
}

export interface VesselTrackResponse {
  vessel: VesselDetail;
  is_sanctioned: boolean;
  sanctions_matches: SanctionsMatch[];
  route_history: RoutePoint[];
  countries_visited: string[];
  port_calls: PortCall[];
  port_stops_inferred: PortStopInferred[];
  ownership_chain: OwnershipLink[];
  owner_name: string | null;
  trade_activity: TradeActivity | null;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  narrative?: string;
  sources: string[];
}

// --- Shared utility types ---

export type EntityType = 'company' | 'person' | 'sector' | 'vessel';

export interface EntityResolution {
  entity_type: EntityType;
  entity_name: string;
  confidence: number;
  reasoning: string;
}

export type AnalysisResult =
  | { type: 'company'; data: SanctionsImpactResponse }
  | { type: 'person'; data: PersonProfileResponse }
  | { type: 'vessel'; data: VesselTrackResponse }
  | { type: 'sector'; data: SectorAnalysisResponse };
