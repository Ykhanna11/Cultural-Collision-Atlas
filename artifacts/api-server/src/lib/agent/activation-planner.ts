import { z } from "zod";
import {
  searchQlooEntities,
  type QlooEntitySearchType,
} from "../qloo/entities";
import {
  DEFAULT_QLOO_RECOMMENDATION_TYPE,
  requestRecommendations,
  type QlooRecommendationType,
} from "../qloo/insights";
import { isRecord } from "../qloo/client";

export const MAX_AGENT_ROUNDS = 3;
export const MAX_QLOO_REQUESTS = 4;

const entityTypes = [
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:brand",
  "urn:entity:locality",
  "urn:entity:movie",
  "urn:entity:person",
  "urn:entity:place",
  "urn:entity:podcast",
  "urn:entity:tv_show",
  "urn:entity:videogame",
] as const;

const searchArgumentsSchema = z
  .object({
    query: z.string().trim().min(1).max(120),
    types: z.array(z.enum(entityTypes)).max(4).nullable(),
  })
  .strict();

const insightArgumentsSchema = z
  .object({
    scope: z.enum(["interest_a", "interest_b", "both"]),
  })
  .strict();

const finalResponseSchema = z
  .object({
    evidenceReferences: z.array(z.string().min(1)).min(1).max(20),
    hypotheses: z.array(z.string().trim().min(1).max(500)).max(8),
    assumptions: z.array(z.string().trim().min(1).max(500)).max(8),
    recommendations: z.array(z.string().trim().min(1).max(500)).max(8),
  })
  .strict();

const toolEvidenceSchema = z
  .array(
    z
      .object({
        referenceId: z.string().min(1).max(32),
        source: z.literal("qloo_api"),
        kind: z.enum(["entity_search", "insights"]),
        entityId: z.string().min(1).max(160),
        name: z.string().min(1).max(200),
        details: z.record(
          z.string(),
          z.union([z.string().max(500), z.number().finite(), z.null()]),
        ),
      })
      .strict(),
  )
  .max(20);

export interface AgentEvidence {
  referenceId: string;
  source: "qloo_api";
  kind: "entity_search" | "insights";
  entityId: string;
  name: string;
  details: Record<string, string | number | null>;
}

export interface AgentInput {
  interestA: string;
  interestB: string;
  interestAId: string;
  interestBId: string;
  city: string;
  cityEntityId?: string;
  recommendationType?: QlooRecommendationType;
  activationType: string;
  budgetRange: string;
  objective: string;
  audienceDescription?: string;
  bridgeId: string;
  bridgeName: string;
}

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface AgentDecision {
  responseId: string;
  toolCalls: AgentToolCall[];
  outputText: string | null;
}

export type AgentContinuationInput =
  | string
  | Array<{ callId: string; output: string }>;

export interface AgentDependencies {
  decide(input: {
    round: number;
    previousResponseId?: string;
    input: AgentContinuationInput;
  }): Promise<AgentDecision>;
  searchEntities(
    query: string,
    types?: QlooEntitySearchType[],
  ): ReturnType<typeof searchQlooEntities>;
  getInsights(input: {
    entityIds: string[];
    city: string;
    cityEntityId?: string;
    entityType: QlooRecommendationType;
  }): Promise<unknown>;
}

export class ActivationPlannerError extends Error {
  constructor(
    readonly reason:
      | "insufficient_evidence"
      | "invalid_model_output"
      | "invalid_tool_call"
      | "budget_exhausted"
      | "provider_failure",
    message: string,
  ) {
    super(message);
    this.name = "ActivationPlannerError";
  }
}

function parseArguments<T>(
  schema: z.ZodType<T>,
  serialized: string,
): T {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new ActivationPlannerError(
      "invalid_tool_call",
      "The model returned invalid tool arguments.",
    );
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ActivationPlannerError(
      "invalid_tool_call",
      "The model returned tool arguments that did not match the allowed schema.",
    );
  }
  return parsed.data;
}

function insightEntities(payload: unknown): Array<{
  entityId: string;
  name: string;
  details: Record<string, string | number | null>;
}> {
  const results =
    isRecord(payload) && isRecord(payload.results) ? payload.results : null;
  if (!Array.isArray(results?.entities)) {
    throw new ActivationPlannerError(
      "provider_failure",
      "Qloo returned an unrecognized Insights response.",
    );
  }
  return results.entities.slice(0, 20).flatMap((item) => {
    if (!isRecord(item)) return [];
    const entityId = item.entity_id;
    const name = item.name;
    if (typeof entityId !== "string" || typeof name !== "string") return [];
    const query = isRecord(item.query) ? item.query : {};
    const affinity =
      typeof query.affinity === "number" &&
      Number.isFinite(query.affinity) &&
      query.affinity >= 0 &&
      query.affinity <= 1
        ? query.affinity
        : null;
    const affinityRank =
      typeof query.affinity_rank === "number" &&
      Number.isInteger(query.affinity_rank) &&
      query.affinity_rank > 0
        ? query.affinity_rank
        : null;
    return [{
      entityId,
      name,
      details: { affinity, affinityRank },
    }];
  });
}

function makeToolEvidence(
  requestNumber: number,
  kind: AgentEvidence["kind"],
  items: Array<{
    entityId: string;
    name: string;
    details: Record<string, string | number | null>;
  }>,
  limit: number,
): AgentEvidence[] {
  return items.map((item, index) => ({
    referenceId: `qloo-${requestNumber}-${index + 1}`,
    source: "qloo_api" as const,
    kind,
    ...item,
  })).slice(0, limit);
}

export async function runActivationPlanner(
  input: AgentInput,
  dependencies: AgentDependencies,
) {
  const evidence: AgentEvidence[] = [];
  let qlooRequests = 0;
  let previousResponseId: string | undefined;
  let continuation: AgentContinuationInput = JSON.stringify({
    request: {
      interestA: input.interestA,
      interestB: input.interestB,
      city: input.city,
      activationType: input.activationType,
      budgetRange: input.budgetRange,
      objective: input.objective,
      audienceDescription: input.audienceDescription ?? null,
      selectedBridge: { id: input.bridgeId, name: input.bridgeName },
    },
    instruction:
      "Plan a culturally respectful activation. Use Qloo tools when evidence is needed. Return only evidence statements grounded in tool results with their reference IDs; label all other ideas as hypotheses, assumptions, or recommendations. If the returned Qloo evidence is insufficient, say so in the structured result rather than inventing support.",
  });

  for (let round = 1; round <= MAX_AGENT_ROUNDS; round += 1) {
    let decision: AgentDecision;
    try {
      decision = await dependencies.decide({
        round,
        ...(previousResponseId && { previousResponseId }),
        input: continuation,
      });
    } catch {
      throw new ActivationPlannerError(
        "provider_failure",
        "The OpenAI provider request failed.",
      );
    }

    previousResponseId = decision.responseId;
    if (decision.toolCalls.length === 0) {
      if (!decision.outputText) {
        throw new ActivationPlannerError(
          "invalid_model_output",
          "The model did not return a structured plan.",
        );
      }
      let output: unknown;
      try {
        output = JSON.parse(decision.outputText);
      } catch {
        throw new ActivationPlannerError(
          "invalid_model_output",
          "The model returned invalid structured output.",
        );
      }
      if (evidence.length === 0) {
        throw new ActivationPlannerError(
          "insufficient_evidence",
          "Qloo returned no evidence to support an agent-generated plan.",
        );
      }
      const parsed = finalResponseSchema.safeParse(output);
      if (!parsed.success) {
        throw new ActivationPlannerError(
          "invalid_model_output",
          "The model response did not match the activation plan schema.",
        );
      }
      const knownReferences = new Set(evidence.map(({ referenceId }) => referenceId));
      if (parsed.data.evidenceReferences.some((id) => !knownReferences.has(id))) {
        throw new ActivationPlannerError(
          "invalid_model_output",
          "The model cited evidence that was not returned by Qloo.",
        );
      }
      return {
        source: "openai_qloo_agent" as const,
        caveat:
          "Qloo results are aggregate recommendation evidence; they do not establish that the same individuals share both interests or predict activation outcomes. All planning suggestions are model-generated and require human validation.",
        ...parsed.data,
        evidence: toolEvidenceSchema.parse(evidence),
      };
    }

    const validatedCalls = decision.toolCalls.map((call) => {
      if (call.name === "search_qloo_entities") {
        return {
          call,
          tool: "search_qloo_entities" as const,
          args: parseArguments(searchArgumentsSchema, call.arguments),
        };
      }
      if (call.name === "get_qloo_insights") {
        return {
          call,
          tool: "get_qloo_insights" as const,
          args: parseArguments(insightArgumentsSchema, call.arguments),
        };
      }
      throw new ActivationPlannerError(
        "invalid_tool_call",
        "The model requested an unregistered Qloo tool.",
      );
    });
    if (qlooRequests + validatedCalls.length > MAX_QLOO_REQUESTS) {
      throw new ActivationPlannerError(
        "budget_exhausted",
        "The Qloo request budget was exhausted.",
      );
    }

    const toolResults: Array<{ callId: string; output: string }> = [];
    for (const { call, tool, args } of validatedCalls) {
      let result: AgentEvidence[];
      if (tool === "search_qloo_entities") {
        qlooRequests += 1;
        try {
          const entities = await dependencies.searchEntities(
            args.query,
            args.types ?? undefined,
          );
          result = makeToolEvidence(
            qlooRequests,
            "entity_search",
            entities.map((entity) => ({
              entityId: entity.id,
              name: entity.name,
              details: {
                type: entity.type,
                subtype: entity.subtype,
              },
            })),
            20 - evidence.length,
          );
        } catch {
          throw new ActivationPlannerError(
            "provider_failure",
            "The Qloo entity-search request failed.",
          );
        }
      } else {
        qlooRequests += 1;
        const entityIds =
          args.scope === "interest_a"
            ? [input.interestAId]
            : args.scope === "interest_b"
              ? [input.interestBId]
              : [input.interestAId, input.interestBId];
        try {
          const payload = await dependencies.getInsights({
            entityIds,
            city: input.city,
            cityEntityId: input.cityEntityId,
            entityType:
              input.recommendationType ?? DEFAULT_QLOO_RECOMMENDATION_TYPE,
          });
          result = makeToolEvidence(
            qlooRequests,
            "insights",
            insightEntities(payload),
            20 - evidence.length,
          );
        } catch (error) {
          if (error instanceof ActivationPlannerError) throw error;
          throw new ActivationPlannerError(
            "provider_failure",
            "The Qloo Insights request failed.",
          );
        }
      }
      const validatedResult = toolEvidenceSchema.safeParse(result);
      if (!validatedResult.success) {
        throw new ActivationPlannerError(
          "provider_failure",
          "Qloo returned evidence that did not match the allowed result schema.",
        );
      }
      evidence.push(...validatedResult.data);
      toolResults.push({
        callId: call.id,
        output: JSON.stringify(validatedResult.data),
      });
    }
    continuation = toolResults;
  }

  throw new ActivationPlannerError(
    "budget_exhausted",
    "The agent decision-round limit was exhausted.",
  );
}

export const activationPlannerToolSchemas = {
  searchEntities: {
    name: "search_qloo_entities",
    description: "Search the Qloo entity catalog for relevant entities.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 120 },
        types: {
          type: ["array", "null"],
          items: { type: "string", enum: entityTypes },
          maxItems: 4,
        },
      },
      required: ["query", "types"],
      additionalProperties: false,
    },
  },
  getInsights: {
    name: "get_qloo_insights",
    description:
      "Retrieve Qloo recommendations for the supplied interests and city.",
    parameters: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["interest_a", "interest_b", "both"] },
      },
      required: ["scope"],
      additionalProperties: false,
    },
  },
} as const;

export const activationPlannerFinalSchema = {
  type: "object",
  properties: {
    evidenceReferences: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 20,
    },
    hypotheses: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 1, maxLength: 500 },
    },
    assumptions: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 1, maxLength: 500 },
    },
    recommendations: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 1, maxLength: 500 },
    },
  },
  required: ["evidenceReferences", "hypotheses", "assumptions", "recommendations"],
  additionalProperties: false,
} as const;

export async function runLiveActivationPlanner(input: AgentInput) {
  const { createOpenAIPlannerModel } = await import("./openai-planner-model");
  return runActivationPlanner(input, {
    decide: createOpenAIPlannerModel(),
    searchEntities: searchQlooEntities,
    getInsights: requestRecommendations,
  });
}
