import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BridgeCandidate } from "@workspace/api-client-react";
import { AffinityComparisonPanel } from "./affinity-comparison";

const candidate: BridgeCandidate = {
  id: "candidate-1",
  name: "Bridge",
  explanation: "Aggregate recommendation only.",
  score: 0,
  scoreDescription: "No probability.",
  confidence: "low",
  evidence: [
    { source: "Qloo", label: "Joint-interest comparison · Brands", value: "joint query returned", kind: "observed_api" },
    { source: "Qloo", label: "A-only query results", value: "A-only query unavailable", kind: "observed_api" },
    { source: "Qloo", label: "Supporting single-interest comparison: Interest B", value: "B-only returned", kind: "observed_api" },
    { source: "Qloo", label: "Per-result input attribution", value: "Attribution unavailable", kind: "observed_api" },
    { source: "Qloo Taste Analysis", label: "Taste Analysis overlap · Shared input descriptors", value: "Shared: tag-1. Interest A only: tag-2. Interest B only: tag-3.", kind: "derived" },
  ],
};

test("renders separate A-only, B-only, joint, attribution, and shared/distinct evidence", () => {
  const markup = renderToStaticMarkup(
    <AffinityComparisonPanel candidate={candidate} interestA="Interest A" interestB="Interest B" />,
  );
  assert.match(markup, /Affinity comparison/);
  assert.match(markup, /A-only query unavailable/);
  assert.match(markup, /B-only returned/);
  assert.match(markup, /joint query returned/);
  assert.match(markup, /Interest A only: tag-2/);
  assert.match(markup, /same individuals/);
});

test("does not infer unavailable evidence", () => {
  const markup = renderToStaticMarkup(
    <AffinityComparisonPanel candidate={{ ...candidate, evidence: [] }} interestA="A" interestB="B" />,
  );
  assert.match(markup, /unavailable in the saved evidence/);
  assert.match(markup, /Attribution was not returned or is unavailable/);
});