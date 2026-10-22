import assert from "node:assert/strict";
import test from "node:test";
import {
  describeHeatmapPoint,
  HEATMAP_MARKER_SIZE_PX,
} from "./heatmap-display.ts";

test("heatmap markers have one uniform size independent of returned metrics", () => {
  const affinityOnly = describeHeatmapPoint(
    { latitude: 0, longitude: 0, affinity: 1 },
    0,
  );
  const popularityOnly = describeHeatmapPoint(
    { latitude: 0, longitude: 0, popularity: 0 },
    1,
  );
  const noMetrics = describeHeatmapPoint({ latitude: 0, longitude: 0 }, 2);

  assert.equal(HEATMAP_MARKER_SIZE_PX, 10);
  assert.deepEqual(
    [affinityOnly.markerSize, popularityOnly.markerSize, noMetrics.markerSize],
    [10, 10, 10],
  );
});

test("heatmap point display reports only returned metrics", () => {
  assert.deepEqual(
    describeHeatmapPoint(
      {
        latitude: 40.7,
        longitude: -74,
        affinity: 0.82,
        popularity: 0.4,
        affinityRank: 3,
      },
      1,
    ),
    {
      label: "Point 2",
      coordinates: "40.7, -74",
      markerSize: 10,
      affinity: "0.82",
      affinityRank: "3",
      popularity: "0.4",
    },
  );
});

test("missing heatmap metrics are identified as not returned", () => {
  assert.deepEqual(describeHeatmapPoint({ latitude: 1, longitude: 2 }, 0), {
    label: "Point 1",
    coordinates: "1, 2",
    markerSize: 10,
    affinity: "Not returned",
    affinityRank: "Not returned",
    popularity: "Not returned",
  });
});
