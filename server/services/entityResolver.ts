/**
 * entityResolver.ts — Classify a query subject into the entity ontology.
 *
 * Ported from Python src/orchestrator/entity_resolver.py.
 *
 * Entity types:
 *   company | person | sector | vessel | orchestrator
 *
 * This runs before tool selection so the orchestrator can route to
 * entity-appropriate data sources and renderers.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityResolution {
  /** "company" | "person" | "sector" | "vessel" | "orchestrator" */
  entityType: string;
  /** Extracted canonical name or identifier from the query */
  entityName: string;
  /** Confidence score 0.0–1.0 */
  confidence: number;
  /** One-sentence reasoning */
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Classifier prompt (kept identical to Python original)
// ---------------------------------------------------------------------------

const CLASSIFIER_PROMPT = `\
You are an entity classifier for an economic warfare OSINT system.

Given a user query, identify the PRIMARY entity being asked about and classify it.

Entity types:
- "company"     = a single publicly traded corp, private company, state-owned enterprise, or org
- "person"      = a named individual — oligarch, official, executive, sanctioned person, minister
- "sector"      = an industry sector or commodity group (semiconductors, energy, rare earths, shipping, pharma)
- "vessel"      = a ship, tanker, or cargo vessel — identified by name, IMO number (7 digits), or MMSI (9 digits)
- "orchestrator"= a complex analytical question involving multiple entities, relationships, hypotheticals, \
or supply-chain/geopolitical analysis that cannot be answered by looking up a single entity

Use "orchestrator" ONLY when the query genuinely requires cross-domain reasoning across MULTIPLE DISTINCT \
entities with no single primary subject (e.g. "What is the relationship between Gazprom and Shell?", \
"Map the supply chain exposure of the EU semiconductor sector").

IMPORTANT: If the query mentions a single named entity (vessel, person, company, sector) but adds \
context, hypotheticals, or asks "what should we do", classify by the PRIMARY entity type, NOT as \
orchestrator. Examples:
- "What should I do about the Ever Given, given current events in Iran?" → vessel (Ever Given)
- "What if we sanction TSMC?" → company (TSMC)
- "How should we respond to Viktor Vekselberg's sanctions evasion?" → person (Viktor Vekselberg)
- "What export controls should apply to semiconductors given China tensions?" → sector (semiconductor)
The system will use the full question text to generate context-aware recommendations.

Extract the canonical entity name or identifier from the query. For vessels, return only the vessel \
name or numeric identifier — strip command words like "track"/"find"/"show me"/"what should I do about", \
articles like "the"/"a", and type words like "vessel"/"ship"/"tanker". For orchestrator queries, set \
entity_name to the full query.

Default to "company" if the entity is ambiguous.

Query: {query}

Respond with JSON only, no markdown fences:
{"entity_type": "company|person|sector|vessel|orchestrator", "entity_name": "...", "confidence": 0.0, "reasoning": "one sentence"}`;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Classify the query entity type and extract the canonical name using Claude.
 *
 * @param query  Raw analyst query string.
 * @returns      EntityResolution with entity_type, entity_name, confidence, reasoning.
 */
export async function resolveEntityType(query: string): Promise<EntityResolution> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const response = await client.messages.create({
    model: config.model,
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: CLASSIFIER_PROMPT.replace('{query}', query),
      },
    ],
  });

  let text = (response.content[0] as { type: string; text: string }).text.trim();

  // Strip markdown fences if present
  if (text.includes('```')) {
    const fenceStart = text.indexOf('```') + 3;
    const startOffset = text.slice(fenceStart, fenceStart + 4) === 'json' ? fenceStart + 4 : fenceStart;
    const fenceEnd = text.lastIndexOf('```');
    if (fenceEnd > startOffset) {
      text = text.slice(startOffset, fenceEnd).trim();
    }
  }

  const VALID_TYPES = ['company', 'person', 'sector', 'vessel', 'orchestrator'] as const;

  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    let entityType = (data.entity_type as string) ?? 'company';
    if (!VALID_TYPES.includes(entityType as typeof VALID_TYPES[number])) {
      entityType = 'company';
    }
    return {
      entityType,
      entityName: (data.entity_name as string) ?? query,
      confidence: typeof data.confidence === 'number' ? data.confidence : 0.7,
      reasoning: (data.reasoning as string) ?? '',
    };
  } catch {
    return {
      entityType: 'company',
      entityName: query,
      confidence: 0.5,
      reasoning: 'Fallback: classification parsing failed',
    };
  }
}
