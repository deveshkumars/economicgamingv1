/**
 * orchestrator.ts — The "quarterback" agent that decomposes questions and synthesizes results.
 *
 * Ported from Python src/orchestrator/main.py.
 *
 * Pipeline: decompose → execute plan (parallel where possible) → synthesize → done.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import {
  DECOMPOSITION_PROMPT,
  SYNTHESIS_PROMPT,
  SYNTHESIS_SYSTEM_SUPPLEMENT,
  SYSTEM_PROMPT,
} from './prompts';
import { ToolRegistry } from './toolRegistry';

// ---------------------------------------------------------------------------
// Shared types (matching frontend's ImpactAssessmentResult)
// ---------------------------------------------------------------------------

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

export interface ImpactAssessmentResult {
  query: { raw_query: string; scenario_type: string };
  scenario_type: string;
  executive_summary: string;
  findings: OrchestratorFinding[];
  friendly_fire: OrchestratorFriendlyFire[];
  confidence_summary: Record<string, string>;
  sources: { name: string; url?: string | null; accessed_at?: string }[];
  recommendations: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool_results?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Internal plan types
// ---------------------------------------------------------------------------

interface ToolCall {
  name?: string;
  tool?: string;
  parameters?: Record<string, unknown>;
  params?: Record<string, unknown>;
}

interface PlanStep {
  step: number;
  description: string;
  tools: (ToolCall | string)[];
  depends_on: number[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class Orchestrator {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly toolRegistry: ToolRegistry;

  constructor() {
    const issues = config.validate();
    if (issues.length > 0) {
      throw new Error(
        'Config issues: ' +
          issues.join(', ') +
          '. Set missing keys in .env file. See .env.example for reference.',
      );
    }

    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    this.model = config.model;
    this.toolRegistry = new ToolRegistry();
  }

  // -------------------------------------------------------------------------
  // analyze
  // -------------------------------------------------------------------------

  /**
   * Run the full analysis pipeline for an analyst question.
   *
   * @param query            Raw analyst query.
   * @param progressCallback Optional callback called with each progress message.
   */
  async analyze(
    query: string,
    progressCallback?: (msg: string) => void,
  ): Promise<ImpactAssessmentResult> {
    const emit = (msg: string): void => {
      console.log(msg);
      progressCallback?.(msg);
    };

    emit(`Query received: ${query.slice(0, 120)}`);

    // Step 1: Decompose
    emit('[1/4] Decomposing question into research plan...');
    const plan = await this._decompose(query);
    emit(`[1/4] Research plan: ${plan.length} step(s) identified`);

    // Step 2: Execute plan
    emit('[2/4] Executing research plan...');
    const toolResults = await this._executePlan(plan, emit);
    emit(`[2/4] Collected results from ${Object.keys(toolResults).length} research step(s)`);

    // Step 3: Synthesize
    emit('[3/4] Synthesizing findings with Claude...');
    const assessment = await this._synthesize(query, toolResults);
    assessment.tool_results = toolResults;

    // Step 4: Done
    emit('[4/4] Analysis complete.');

    return assessment;
  }

  // -------------------------------------------------------------------------
  // _decompose
  // -------------------------------------------------------------------------

  /** Use Claude to decompose the question into a research plan. */
  private async _decompose(query: string): Promise<PlanStep[]> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: DECOMPOSITION_PROMPT.replace('{query}', query),
        },
      ],
    });

    const text = (response.content[0] as { type: string; text: string }).text;
    const jsonStr = extractJson(text);

    try {
      const plan = JSON.parse(jsonStr) as PlanStep[];
      return plan;
    } catch {
      return this._fallbackPlan(query);
    }
  }

  // -------------------------------------------------------------------------
  // _executePlan
  // -------------------------------------------------------------------------

  /**
   * Execute the research plan, running independent steps in parallel.
   * Uses topological ordering: steps whose dependencies are all satisfied
   * run concurrently in each wave.
   */
  private async _executePlan(
    plan: PlanStep[],
    emit?: (msg: string) => void,
  ): Promise<AnyRecord> {
    const results: AnyRecord = {};
    const completedSteps = new Set<number>();

    const log = (msg: string): void => {
      console.log(msg);
      emit?.(msg);
    };

    while (completedSteps.size < plan.length) {
      // Find steps whose dependencies are all satisfied
      const ready: PlanStep[] = [];
      for (const step of plan) {
        const stepNum = step.step ?? 0;
        if (completedSteps.has(stepNum)) continue;
        const deps = step.depends_on ?? [];
        if (deps.every((d) => completedSteps.has(d))) {
          ready.push(step);
        }
      }

      if (ready.length === 0) {
        // Circular / unresolvable dependencies — break to avoid infinite loop
        break;
      }

      for (const step of ready) {
        log(`  Running: ${step.description ?? `step ${step.step ?? '?'}`}`);
      }

      // Execute ready steps in parallel
      const stepResults = await Promise.allSettled(
        ready.map((step) => this._executeStep(step, results)),
      );

      for (let i = 0; i < ready.length; i++) {
        const step = ready[i];
        const stepNum = step.step ?? 0;
        const outcome = stepResults[i];
        completedSteps.add(stepNum);

        if (outcome.status === 'rejected') {
          results[`step_${stepNum}`] = {
            error: String(outcome.reason),
            description: step.description ?? '',
          };
          log(`  Step ${stepNum} failed: ${outcome.reason}`);
        } else {
          results[`step_${stepNum}`] = outcome.value;
          log(`  Step ${stepNum} done: ${step.description ?? ''}`);
        }
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // _executeStep
  // -------------------------------------------------------------------------

  /** Execute a single research step by calling the specified tools. */
  private async _executeStep(step: PlanStep, _priorResults: AnyRecord): Promise<AnyRecord> {
    const stepResults: AnyRecord = {};
    const tools = step.tools ?? [];

    for (const toolCall of tools) {
      let toolName: string;
      let params: AnyRecord;

      if (typeof toolCall === 'string') {
        // Handle Python-style call strings: "get_stock_profile('SMCI')"
        [toolName, params] = parseStringToolCall(toolCall);
      } else {
        // LLM may use "tool"/"params" or "name"/"parameters" interchangeably
        toolName = (toolCall.name ?? toolCall.tool ?? '') as string;
        params = (toolCall.parameters ?? toolCall.params ?? {}) as AnyRecord;
      }

      try {
        const result = await this.toolRegistry.callTool(toolName, params);
        stepResults[toolName] = result;
      } catch (e) {
        stepResults[toolName] = { error: String(e) };
      }
    }

    return {
      description: step.description ?? '',
      results: stepResults,
    };
  }

  // -------------------------------------------------------------------------
  // _synthesize
  // -------------------------------------------------------------------------

  /** Use Claude to synthesize tool results into a final assessment. */
  private async _synthesize(query: string, toolResults: AnyRecord): Promise<ImpactAssessmentResult> {
    const scenarioType = 'sanction_impact'; // default

    // Diagnostics
    const errorOnlySteps = Object.keys(toolResults).filter((k) => {
      const v = toolResults[k];
      return (
        typeof v === 'object' &&
        v !== null &&
        Object.keys(v).every((key) => ['error', 'description'].includes(key))
      );
    });
    const dataSteps = Object.keys(toolResults).filter((k) => !errorOnlySteps.includes(k));

    if (errorOnlySteps.length > 0) {
      console.log(
        `  [synthesize] ${errorOnlySteps.length} step(s) returned errors only: ${errorOnlySteps.join(', ')}`,
      );
    }

    let resultsText = JSON.stringify(toolResults, null, 2);

    // Truncate if too long for context window
    const LIMIT = 50000;
    if (resultsText.length > LIMIT) {
      const charsDropped = resultsText.length - LIMIT;
      const truncationNote =
        `\n\n[DATA TRUNCATED: ${charsDropped.toLocaleString()} characters dropped. ` +
        `${dataSteps.length} steps had data; ${errorOnlySteps.length} steps errored. ` +
        'Findings that rely on data from truncated steps should be rated LOW confidence.]';
      resultsText = resultsText.slice(0, LIMIT) + truncationNote;
      console.log(`  [synthesize] Tool results truncated: ${charsDropped.toLocaleString()} chars dropped`);
    }

    const synthesisSystem = SYSTEM_PROMPT + SYNTHESIS_SYSTEM_SUPPLEMENT;
    const userContent = SYNTHESIS_PROMPT.replace('{query}', query)
      .replace('{scenario_type}', scenarioType)
      .replace('{tool_results}', resultsText);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      system: synthesisSystem,
      messages: [{ role: 'user', content: userContent }],
    });

    const text = (response.content[0] as { type: string; text: string }).text;
    const jsonStr = extractJson(text);

    let data: AnyRecord;
    try {
      data = JSON.parse(jsonStr) as AnyRecord;
    } catch (e) {
      console.log(`[synthesize] JSON parse failed (${e}); retrying with strict JSON instruction...`);
      console.log(`  [synthesize] Failed response (first 500 chars): ${text.slice(0, 500)}`);

      // Retry: send broken response back and ask for clean JSON only
      const retryResponse = await this.client.messages.create({
        model: this.model,
        max_tokens: 16000,
        system: synthesisSystem,
        messages: [
          { role: 'user', content: userContent },
          { role: 'assistant', content: text },
          {
            role: 'user',
            content:
              'Your response was not valid JSON. Output ONLY the raw JSON object ' +
              '— no markdown, no prose, no explanation. Start your response with { ' +
              'and end with }.',
          },
        ],
      });

      const retryText = (retryResponse.content[0] as { type: string; text: string }).text;
      const retryJsonStr = extractJson(retryText);

      try {
        data = JSON.parse(retryJsonStr) as AnyRecord;
        console.log('[synthesize] Retry succeeded.');
      } catch (e2) {
        console.log(`[synthesize] Retry also failed (${e2}). Extracting findings from raw text.`);
        // Last resort: surface raw narrative so user sees something
        data = {
          scenario_type: scenarioType,
          executive_summary: text.slice(0, 600).trim(),
          findings: [
            {
              category: 'Analysis',
              finding: text.slice(0, 2000).trim(),
              confidence: 'MEDIUM',
            },
          ],
          friendly_fire: [],
          recommendations: [],
          confidence_summary: {},
          sources_used: [],
        };
      }
    }

    return this._buildResult(query, scenarioType, data);
  }

  // -------------------------------------------------------------------------
  // _buildResult
  // -------------------------------------------------------------------------

  /** Convert raw JSON data from Claude into a typed ImpactAssessmentResult. */
  private _buildResult(
    query: string,
    defaultScenarioType: string,
    data: AnyRecord,
  ): ImpactAssessmentResult {
    const scenarioType = (data.scenario_type as string) ?? defaultScenarioType;

    const confidenceSummary: Record<string, string> = {};
    const rawConf = (data.confidence_summary ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(rawConf)) {
      if (typeof v === 'string') {
        confidenceSummary[k] = v;
      }
    }

    const sources: { name: string; url?: string | null; accessed_at?: string }[] = (
      (data.sources_used as unknown[]) ?? []
    ).map((s) =>
      typeof s === 'string'
        ? { name: s }
        : { name: (s as AnyRecord).name ?? String(s) },
    );

    return {
      query: { raw_query: query, scenario_type: scenarioType },
      scenario_type: scenarioType,
      executive_summary: (data.executive_summary as string) ?? '',
      findings: (data.findings as OrchestratorFinding[]) ?? [],
      friendly_fire: (data.friendly_fire as OrchestratorFriendlyFire[]) ?? [],
      confidence_summary: confidenceSummary,
      sources,
      recommendations: (data.recommendations as string[]) ?? [],
    };
  }

  // -------------------------------------------------------------------------
  // _fallbackPlan
  // -------------------------------------------------------------------------

  /** Generate a basic research plan when Claude's decomposition fails. */
  private _fallbackPlan(query: string): PlanStep[] {
    return [
      {
        step: 1,
        description: 'Search for target entities in sanctions databases',
        tools: [{ name: 'search_sanctions', parameters: { query } }],
        depends_on: [],
      },
      {
        step: 2,
        description: 'Resolve entity and map corporate structure',
        tools: [{ name: 'search_entity', parameters: { query } }],
        depends_on: [],
      },
      {
        step: 3,
        description: 'Search for market data on target entity',
        tools: [{ name: 'search_market_entity', parameters: { query } }],
        depends_on: [],
      },
      {
        step: 4,
        description: 'Check geopolitical context',
        tools: [{ name: 'search_events', parameters: { query } }],
        depends_on: [],
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Helper: parseStringToolCall
// ---------------------------------------------------------------------------

/**
 * Parse a Python-style tool call string like `get_stock_profile("SMCI")` into
 * [toolName, params].
 *
 * Returns [callStr, {}] if parsing fails, leaving the error to callTool.
 */
export function parseStringToolCall(callStr: string): [string, AnyRecord] {
  callStr = callStr.trim();
  const m = callStr.match(/^(\w+)\s*\((.*)\)\s*$/s);
  if (!m) return [callStr, {}];

  const toolName = m[1];
  const argsStr = m[2].trim();
  if (!argsStr) return [toolName, {}];

  const params: AnyRecord = {};

  // Try keyword args first: key='value' or key="value" or key=123
  const kwMatches = [...argsStr.matchAll(/(\w+)\s*=\s*(?:"([^"]*?)"|'([^']*?)'|(\d+))/g)];
  if (kwMatches.length > 0) {
    for (const kw of kwMatches) {
      const key = kw[1];
      // Take first non-empty capture group after the key=
      const val = kw[2] ?? kw[3] ?? kw[4] ?? '';
      params[key] = /^\d+$/.test(val) ? parseInt(val, 10) : val;
    }
  } else {
    // Positional args only — extract string/number values
    const posVals = [...argsStr.matchAll(/"([^"]*?)"|'([^']*?)'|(\d+)/g)];
    const positional = posVals.map((grp) => grp[1] ?? grp[2] ?? grp[3] ?? '');
    if (positional.length >= 1) {
      params['query'] = positional[0];
    }
  }

  return [toolName, params];
}

// ---------------------------------------------------------------------------
// Helper: extractJson
// ---------------------------------------------------------------------------

/**
 * Extract the outermost JSON object from a Claude response.
 *
 * Strategy order:
 * 1. Markdown ```json ... ``` code block (validate with JSON.parse)
 * 2. Any ``` ... ``` code block (validate with JSON.parse)
 * 3. Scan for first `{` that starts a parse-valid JSON object
 * 4. Return the raw text as a last resort
 */
export function extractJson(text: string): string {
  // 1 & 2: code blocks
  for (const prefix of ['```json', '```']) {
    if (text.includes(prefix)) {
      const blockStart = text.indexOf(prefix) + prefix.length;
      const blockEnd = text.indexOf('```', blockStart);
      if (blockEnd !== -1) {
        const candidate = text.slice(blockStart, blockEnd).trim();
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          // fall through to raw scan
        }
      }
    }
  }

  // 3: scan for first valid { ... } pair using string-aware depth tracking
  let pos = 0;
  while (pos < text.length) {
    const idx = text.indexOf('{', pos);
    if (idx === -1) break;

    const candidate = extractBalancedJson(text, idx, '{', '}');
    if (candidate !== null) {
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // continue scanning
      }
    }
    pos = idx + 1;
  }

  // 4: return raw text; caller will handle parse failure
  return text;
}

/**
 * Extract a balanced JSON object/array from text starting at `start`.
 *
 * Properly tracks string literals so that { } [ ] inside quoted values
 * do not corrupt the bracket depth counter.
 */
function extractBalancedJson(
  text: string,
  start: number,
  openCh: string,
  closeCh: string,
): string | null {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === openCh) {
      depth++;
    } else if (ch === closeCh) {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}
