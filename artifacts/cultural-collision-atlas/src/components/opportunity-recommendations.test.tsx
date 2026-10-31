import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isOpportunityResponseCurrent,
  OpportunityRecommendationsPanel,
  shouldGenerateOpportunityRecommendations,
} from "./opportunity-recommendations";
import type { ActivationOpportunityCandidate } from "@workspace/api-zod";
import { createOpportunityRequestCoordinator } from "../lib/opportunity-request-coordinator";

const exampleOpportunity: ActivationOpportunityCandidate = {
  id: "opp-1",
  title: "Resident-led night market concept",
  opportunityType: "community_event",
  rationale: "The bridge sits between music and neighborhood culture, which suggests a compact, participatory activation.",
  verifiedEvidence: [
    {
      source: "Qloo Insights API",
      sourceReference: "insights:abc123",
      establishes: "The bridge has strong overlap in music and local culture descriptors.",
      category: "cultural_affinity",
      observedAt: "2026-10-31T00:00:00.000Z",
    },
  ],
  inferredSuggestions: [
    {
      candidateAudienceHypothesis: "Residents already engaged with niche music scenes may respond to an evening street activation.",
      culturalThemes: ["local music culture", "community storytelling"],
      activationFormats: ["night market", "talkback installation"],
      supportingEvidenceReferences: ["insights:abc123", "taste:shared-tags"],
      note: "This suggestion remains a hypothesis until community validation.",
    },
  ],
  missingEvidence: ["No venue permission or site availability has been confirmed."],
  limitations: ["This is not an attendance forecast or a sponsor-backed recommendation."],
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeOpportunity(id: string, title: string): ActivationOpportunityCandidate {
  return {
    ...exampleOpportunity,
    id,
    title,
    rationale: `${title} is the currently active recommendation for the user context.`,
    verifiedEvidence: [{
      ...exampleOpportunity.verifiedEvidence[0],
      sourceReference: `${id}:verified`,
    }],
    inferredSuggestions: [{
      ...exampleOpportunity.inferredSuggestions[0],
      candidateAudienceHypothesis: `${title} is the active hypothesis for the current request context.`,
      supportingEvidenceReferences: [`${id}:verified`],
    }],
  };
}

test("renders valid opportunity recommendations with evidence and inference separated", () => {
  const markup = renderToStaticMarkup(
    <OpportunityRecommendationsPanel
      status="ok"
      opportunities={[exampleOpportunity]}
      loading={false}
      error={null}
      reason={undefined}
      analysisContext={{ analysisReference: "ref-1", city: "London", entityId: "candidate-1", candidateName: "Bridge" }}
      city="London"
      entityId="candidate-1"
      onSelectOpportunity={() => {}}
      selectedOpportunityId="opp-1"
    />,
  );

  assert.match(markup, /Resident-led night market concept/);
  assert.match(markup, /community_event/);
  assert.match(markup, /Verified evidence/);
  assert.match(markup, /Inferred suggestions/);
  assert.match(markup, /Qloo Insights API/);
  assert.match(markup, /insights:abc123/);
  assert.match(markup, /night market/);
  assert.match(markup, /No venue permission or site availability has been confirmed/);
  assert.match(markup, /This is not an attendance forecast or a sponsor-backed recommendation/);
});

test("supports insufficient evidence and missing evidence states", () => {
  const insufficient = renderToStaticMarkup(
    <OpportunityRecommendationsPanel
      status="insufficient_evidence"
      opportunities={[]}
      loading={false}
      error={null}
      reason="There is not enough verified cultural overlap to support a recommendation."
      analysisContext={{ analysisReference: "ref-1", city: "London", entityId: "candidate-1", candidateName: "Bridge" }}
      city="London"
      entityId="candidate-1"
      onSelectOpportunity={() => {}}
      selectedOpportunityId={null}
    />,
  );

  assert.match(insufficient, /Insufficient evidence/);
  assert.match(insufficient, /There is not enough verified cultural overlap/);
});

test("shows loading and API error states clearly", () => {
  const loading = renderToStaticMarkup(
    <OpportunityRecommendationsPanel
      status="ok"
      opportunities={[]}
      loading={true}
      error={null}
      reason={undefined}
      analysisContext={{ analysisReference: "ref-1", city: "London", entityId: "candidate-1", candidateName: "Bridge" }}
      city="London"
      entityId="candidate-1"
      onSelectOpportunity={() => {}}
      selectedOpportunityId={null}
    />,
  );

  assert.match(loading, /Generating recommendations/);

  const failed = renderToStaticMarkup(
    <OpportunityRecommendationsPanel
      status="ok"
      opportunities={[]}
      loading={false}
      error={new Error("The discovery analysis expired.")}
      reason={undefined}
      analysisContext={{ analysisReference: "ref-1", city: "London", entityId: "candidate-1", candidateName: "Bridge" }}
      city="London"
      entityId="candidate-1"
      onSelectOpportunity={() => {}}
      selectedOpportunityId={null}
    />,
  );

  assert.match(failed, /Opportunity discovery unavailable/);
});

test("reuses stale-analysis UX when the active context no longer matches", () => {
  const markup = renderToStaticMarkup(
    <OpportunityRecommendationsPanel
      status="ok"
      opportunities={[]}
      loading={false}
      error={new Error("HTTP 410: The Discovery analysis reference expired or is unavailable. Run Discovery again.")}
      reason={undefined}
      analysisContext={{ analysisReference: "ref-1", city: "London", entityId: "candidate-1", candidateName: "Bridge" }}
      city="Paris"
      entityId="candidate-2"
      onSelectOpportunity={() => {}}
      selectedOpportunityId={null}
    />,
  );

  assert.match(markup, /Run Discovery again/);
});

test("ignores stale responses when the user changes city, candidate, or analysis reference", () => {
  const activeContext = { analysisReference: "ref-2", city: "Paris", entityId: "candidate-b" };
  const staleCandidate = { analysisReference: "ref-2", city: "Paris", entityId: "candidate-a" };
  const staleCity = { analysisReference: "ref-2", city: "London", entityId: "candidate-b" };
  const staleAnalysis = { analysisReference: "ref-1", city: "Paris", entityId: "candidate-b" };

  assert.equal(isOpportunityResponseCurrent({ activeContext, responseContext: activeContext }), true);
  assert.equal(isOpportunityResponseCurrent({ activeContext, responseContext: staleCandidate }), false);
  assert.equal(isOpportunityResponseCurrent({ activeContext, responseContext: staleCity }), false);
  assert.equal(isOpportunityResponseCurrent({ activeContext, responseContext: staleAnalysis }), false);
});

test("old errors do not replace the current context UI", () => {
  const activeContext = { analysisReference: "ref-3", city: "Berlin", entityId: "candidate-c" };
  const staleErrorContext = { analysisReference: "ref-2", city: "Berlin", entityId: "candidate-b" };

  assert.equal(isOpportunityResponseCurrent({ activeContext, responseContext: staleErrorContext }), false);
});

test("avoids sending recommendation requests without a valid analysis context", () => {
  assert.equal(shouldGenerateOpportunityRecommendations({ analysisContext: null, city: "London", entityId: "candidate-1" }), false);
  assert.equal(shouldGenerateOpportunityRecommendations({ analysisContext: { analysisReference: "ref-1", city: "London", entityId: "candidate-1", candidateName: "Bridge" }, city: "London", entityId: "candidate-1" }), true);
  assert.equal(shouldGenerateOpportunityRecommendations({ analysisContext: { analysisReference: "ref-1", city: "London", entityId: "candidate-1", candidateName: "Bridge" }, city: "Paris", entityId: "candidate-1" }), false);
  assert.equal(shouldGenerateOpportunityRecommendations({ analysisContext: { analysisReference: "ref-1", city: "London", entityId: "candidate-1", candidateName: "Bridge" }, city: "London", entityId: "candidate-2" }), false);
});

test("older candidate requests cannot overwrite a newer successful recommendation", async () => {
  const coordinator = createOpportunityRequestCoordinator<{
    status: "ok" | "insufficient_evidence";
    opportunities: ActivationOpportunityCandidate[];
  }>();
  const deferredA = createDeferred<void>();
  const deferredB = createDeferred<void>();

  const requestA = coordinator.beginRequest({ analysisReference: "ref-a", city: "London", entityId: "candidate-a" });
  const requestB = coordinator.beginRequest({ analysisReference: "ref-b", city: "London", entityId: "candidate-b" });

  const settleB = deferredB.promise.then(() => {
    const result = coordinator.applySuccess(requestB, {
      status: "ok",
      opportunities: [makeOpportunity("opp-b", "Candidate B activation")],
    });
    return result;
  });

  const settleA = deferredA.promise.then(() => {
    const result = coordinator.applySuccess(requestA, {
      status: "ok",
      opportunities: [makeOpportunity("opp-a", "Candidate A activation")],
    });
    return result;
  });

  deferredB.resolve();
  const bState = await settleB;
  assert.equal(bState.ignored, false);
  assert.equal(bState.data?.opportunities[0]?.id, "opp-b");

  deferredA.resolve();
  const aState = await settleA;
  assert.equal(aState.ignored, true);
  assert.equal(coordinator.getState().data?.opportunities[0]?.id, "opp-b");

  const markup = renderToStaticMarkup(
    <OpportunityRecommendationsPanel
      status={coordinator.getState().data?.status ?? "ok"}
      opportunities={coordinator.getState().data?.opportunities ?? []}
      loading={coordinator.getState().loading}
      error={coordinator.getState().error ?? null}
      analysisContext={{ analysisReference: "ref-b", city: "London", entityId: "candidate-b", candidateName: "Candidate B" }}
      city="London"
      entityId="candidate-b"
      onSelectOpportunity={() => {}}
      selectedOpportunityId={null}
    />,
  );
  assert.match(markup, /Candidate B activation/);
  assert.doesNotMatch(markup, /Candidate A activation/);
});

test("older city requests cannot overwrite a newer successful recommendation", async () => {
  const coordinator = createOpportunityRequestCoordinator<{
    status: "ok" | "insufficient_evidence";
    opportunities: ActivationOpportunityCandidate[];
  }>();
  const deferredA = createDeferred<void>();
  const deferredB = createDeferred<void>();

  const requestA = coordinator.beginRequest({ analysisReference: "ref-city-a", city: "London", entityId: "candidate-1" });
  const requestB = coordinator.beginRequest({ analysisReference: "ref-city-b", city: "Paris", entityId: "candidate-1" });

  const settleB = deferredB.promise.then(() => {
    const result = coordinator.applySuccess(requestB, {
      status: "ok",
      opportunities: [makeOpportunity("opp-paris", "Paris activation")],
    });
    return result;
  });

  const settleA = deferredA.promise.then(() => {
    const result = coordinator.applySuccess(requestA, {
      status: "ok",
      opportunities: [makeOpportunity("opp-london", "London activation")],
    });
    return result;
  });

  deferredB.resolve();
  const bisCurrent = await settleB;
  assert.equal(bisCurrent.ignored, false);
  assert.equal(bisCurrent.data?.opportunities[0]?.id, "opp-paris");

  deferredA.resolve();
  const aisStale = await settleA;
  assert.equal(aisStale.ignored, true);
  assert.equal(coordinator.getState().data?.opportunities[0]?.id, "opp-paris");

  const markup = renderToStaticMarkup(
    <OpportunityRecommendationsPanel
      status={coordinator.getState().data?.status ?? "ok"}
      opportunities={coordinator.getState().data?.opportunities ?? []}
      loading={coordinator.getState().loading}
      error={coordinator.getState().error ?? null}
      analysisContext={{ analysisReference: "ref-city-b", city: "Paris", entityId: "candidate-1", candidateName: "Candidate 1" }}
      city="Paris"
      entityId="candidate-1"
      onSelectOpportunity={() => {}}
      selectedOpportunityId={null}
    />,
  );
  assert.match(markup, /Paris activation/);
  assert.doesNotMatch(markup, /London activation/);
});

test("older analysisReference requests cannot overwrite a newer successful recommendation", async () => {
  const coordinator = createOpportunityRequestCoordinator<{
    status: "ok" | "insufficient_evidence";
    opportunities: ActivationOpportunityCandidate[];
  }>();
  const deferredA = createDeferred<void>();
  const deferredB = createDeferred<void>();

  const requestA = coordinator.beginRequest({ analysisReference: "ref-old", city: "Berlin", entityId: "candidate-9" });
  const requestB = coordinator.beginRequest({ analysisReference: "ref-new", city: "Berlin", entityId: "candidate-9" });

  const settleB = deferredB.promise.then(() => {
    const result = coordinator.applySuccess(requestB, {
      status: "ok",
      opportunities: [makeOpportunity("opp-new-ref", "Ref B activation")],
    });
    return result;
  });

  const settleA = deferredA.promise.then(() => {
    const result = coordinator.applySuccess(requestA, {
      status: "ok",
      opportunities: [makeOpportunity("opp-old-ref", "Ref A activation")],
    });
    return result;
  });

  deferredB.resolve();
  const bResult = await settleB;
  assert.equal(bResult.ignored, false);
  assert.equal(bResult.data?.opportunities[0]?.id, "opp-new-ref");

  deferredA.resolve();
  const aResult = await settleA;
  assert.equal(aResult.ignored, true);
  assert.equal(coordinator.getState().data?.opportunities[0]?.id, "opp-new-ref");

  const markup = renderToStaticMarkup(
    <OpportunityRecommendationsPanel
      status={coordinator.getState().data?.status ?? "ok"}
      opportunities={coordinator.getState().data?.opportunities ?? []}
      loading={coordinator.getState().loading}
      error={coordinator.getState().error ?? null}
      analysisContext={{ analysisReference: "ref-new", city: "Berlin", entityId: "candidate-9", candidateName: "Candidate 9" }}
      city="Berlin"
      entityId="candidate-9"
      onSelectOpportunity={() => {}}
      selectedOpportunityId={null}
    />,
  );
  assert.match(markup, /Ref B activation/);
  assert.doesNotMatch(markup, /Ref A activation/);
});

test("older stale errors do not replace the current successful result", async () => {
  const coordinator = createOpportunityRequestCoordinator<{
    status: "ok" | "insufficient_evidence";
    opportunities: ActivationOpportunityCandidate[];
  }>();
  const deferredA = createDeferred<void>();
  const deferredB = createDeferred<void>();

  const requestA = coordinator.beginRequest({ analysisReference: "ref-error-a", city: "Berlin", entityId: "candidate-a" });
  const requestB = coordinator.beginRequest({ analysisReference: "ref-error-b", city: "Berlin", entityId: "candidate-b" });

  const settleB = deferredB.promise.then(() => {
    const result = coordinator.applySuccess(requestB, {
      status: "ok",
      opportunities: [makeOpportunity("opp-current", "Currently visible activation")],
    });
    return result;
  });

  const settleA = deferredA.promise.then(() => {
    const result = coordinator.applyError(requestA, new Error("stale failure from request A"));
    return result;
  });

  deferredB.resolve();
  const bResult = await settleB;
  assert.equal(bResult.ignored, false);
  assert.equal(bResult.data?.opportunities[0]?.id, "opp-current");

  deferredA.resolve();
  const aResult = await settleA;
  assert.equal(aResult.ignored, true);
  assert.equal(coordinator.getState().data?.opportunities[0]?.id, "opp-current");
  assert.equal(coordinator.getState().error, null);

  const markup = renderToStaticMarkup(
    <OpportunityRecommendationsPanel
      status={coordinator.getState().data?.status ?? "ok"}
      opportunities={coordinator.getState().data?.opportunities ?? []}
      loading={coordinator.getState().loading}
      error={coordinator.getState().error ?? null}
      analysisContext={{ analysisReference: "ref-error-b", city: "Berlin", entityId: "candidate-b", candidateName: "Candidate B" }}
      city="Berlin"
      entityId="candidate-b"
      onSelectOpportunity={() => {}}
      selectedOpportunityId={null}
    />,
  );
  assert.match(markup, /Currently visible activation/);
  assert.doesNotMatch(markup, /Opportunity discovery unavailable/);
});

test("older settled callbacks cannot clear a newer request's loading state", async () => {
  const coordinator = createOpportunityRequestCoordinator<{
    status: "ok" | "insufficient_evidence";
    opportunities: ActivationOpportunityCandidate[];
  }>();
  const deferredA = createDeferred<void>();
  const deferredB = createDeferred<void>();

  const requestA = coordinator.beginRequest({ analysisReference: "ref-load-a", city: "Rome", entityId: "candidate-a" });
  const requestB = coordinator.beginRequest({ analysisReference: "ref-load-b", city: "Rome", entityId: "candidate-b" });

  assert.equal(coordinator.getState().loading, true);

  const staleSettledA = deferredA.promise.then(() => {
    const result = coordinator.applySettled(requestA);
    return result;
  });

  const currentSettledB = deferredB.promise.then(() => {
    const result = coordinator.applySuccess(requestB, {
      status: "ok",
      opportunities: [makeOpportunity("opp-active-load", "Loading test activation")],
    });
    return result;
  });

  deferredA.resolve();
  const staleResult = await staleSettledA;
  assert.equal(staleResult.ignored, true);
  assert.equal(coordinator.getState().loading, true);

  deferredB.resolve();
  const currentResult = await currentSettledB;
  assert.equal(currentResult.ignored, false);
  assert.equal(coordinator.getState().loading, false);
  assert.equal(coordinator.getState().data?.opportunities[0]?.id, "opp-active-load");

  const markup = renderToStaticMarkup(
    <OpportunityRecommendationsPanel
      status={coordinator.getState().data?.status ?? "ok"}
      opportunities={coordinator.getState().data?.opportunities ?? []}
      loading={coordinator.getState().loading}
      error={coordinator.getState().error ?? null}
      analysisContext={{ analysisReference: "ref-load-b", city: "Rome", entityId: "candidate-b", candidateName: "Candidate B" }}
      city="Rome"
      entityId="candidate-b"
      onSelectOpportunity={() => {}}
      selectedOpportunityId={null}
    />,
  );
  assert.match(markup, /Loading test activation/);
});
