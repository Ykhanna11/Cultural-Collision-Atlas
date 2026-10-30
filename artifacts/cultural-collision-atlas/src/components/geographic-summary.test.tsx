import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GeographicAnalysisResponse } from "@workspace/api-client-react";
import { GeographicSummaryPanel } from "./geographic-summary";

const summary: GeographicAnalysisResponse["summary"] = {
  requestedBounds: { south: 51.45, west: -0.2, north: 51.55, east: -0.05 },
  observedBounds: null,
  heatmap: {
    status: "unavailable",
    source: "Qloo Insights API",
    pointCount: 0,
    duplicateCount: 0,
    invalidCoordinateCount: 0,
    points: [],
  },
  venues: {
    status: "returned",
    source: "Overture Maps Places",
    recordCount: 2,
    duplicateCount: 0,
    invalidCoordinateCount: 0,
    categoryCounts: [{ category: "culture", count: 2 }],
    records: [],
  },
  overtureCoverage: { status: "covered", bounds: { south: 51, west: -1, north: 52, east: 0 } },
  coverage: "partial",
  sourceSeparation: "Qloo points and venue records remain separate entities.",
};

test("renders partial source availability and actual venue category counts", () => {
  const markup = renderToStaticMarkup(<GeographicSummaryPanel summary={summary} />);
  assert.match(markup, /Area coverage: <b[^>]*>partial<\/b>/);
  assert.match(markup, /Qloo signals: <b[^>]*>0<\/b> · unavailable/);
  assert.match(markup, /2 venue records · Overture Maps Places · returned/);
  assert.match(markup, /culture: 2/);
  assert.match(markup, /separate entities/);
});

test("renders empty and unavailable venue data without inventing categories", () => {
  const emptySummary: GeographicAnalysisResponse["summary"] = {
    ...summary,
    venues: {
      ...summary.venues,
      status: "unavailable",
      recordCount: 0,
      records: [],
      categoryCounts: [],
    },
    coverage: "unavailable",
  };
  const markup = renderToStaticMarkup(<GeographicSummaryPanel summary={emptySummary} />);
  assert.match(markup, /0 venue records · Overture Maps Places · unavailable/);
  assert.doesNotMatch(markup, /Venue counts by category/);
});