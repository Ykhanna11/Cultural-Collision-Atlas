import assert from "node:assert/strict";
import { test } from "node:test";
import { assessVenueSuitability } from "./venue-suitability";

test("labels provider facts, hypotheses, and missing evidence separately", () => {
  const assessment = assessVenueSuitability({
    venue: {
      provider: "openstreetmap",
      providerVenueId: "node-1",
      name: "Community Museum",
      latitude: 40.71,
      longitude: -74,
      categories: ["culture", "museum"],
      attribution: "© OpenStreetMap contributors, ODbL",
      retrievedAt: new Date().toISOString(),
    },
    interestA: "Jazz",
    interestB: "Architecture",
    bridgeName: "Modernist listening rooms",
    categories: ["museum"],
  });
  assert.ok(assessment.score >= 0 && assessment.score <= 100);
  assert.ok(assessment.evidence.some((item) => item.kind === "venue_fact"));
  assert.ok(assessment.evidence.some((item) => item.kind === "bridge_evidence"));
  assert.ok(assessment.evidence.some((item) => item.kind === "missing_data"));
  assert.match(assessment.scoreLabel, /not a probability/i);
});

test("propagates actual Qloo evidence without converting it into cultural affinity", () => {
  const assessment = assessVenueSuitability({
    venue: {
      provider: "openstreetmap",
      providerVenueId: "way-22",
      name: "Jazz Hall",
      latitude: 51.51,
      longitude: -0.12,
      categories: ["culture", "music"],
      attribution: "© OpenStreetMap contributors, ODbL",
      retrievedAt: new Date().toISOString(),
    },
    interestA: "Jazz",
    interestB: "Architecture",
    bridgeName: "Modernist listening rooms",
    categories: ["culture"],
    qlooEvidence: [{
      source: "Qloo Insights API",
      label: "Joint-interest candidate",
      value: "Modernist listening rooms",
      kind: "observed_api",
    }],
  });
  const qlooEvidence = assessment.evidence.find((item) =>
    item.kind === "qloo_evidence" && item.label === "Joint-interest candidate"
  );
  assert.ok(qlooEvidence);
  assert.match(qlooEvidence.value, /Qloo Insights API/);
  assert.ok(assessment.evidence.every((item) => item.kind !== "qloo_evidence" || !item.value.includes("affinity confirmed")));
});
