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
  color: string;
  curve: CurvePoint[];
}

export interface ProjectionPoint {
  day: number;
  pct: number;
  price: number;
}

export interface ProjectionSummaryData {
  day_30_expected?: number;
  day_30_range?: [number, number];
  day_60_expected?: number;
  day_60_range?: [number, number];
  day_90_expected?: number;
  day_90_range?: [number, number];
  max_drawdown_expected?: number;
}

export interface Projection {
  mean: ProjectionPoint[];
  upper: ProjectionPoint[];
  lower: ProjectionPoint[];
  summary: ProjectionSummaryData;
}

export interface SanctionsImpactResponse {
  target: TargetInfo;
  comparables: Comparable[];
  projection: Projection;
  metadata: {
    comparable_count: number;
    time_window_days: [number, number];
    generated_at: string;
  };
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
  meta: {
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
