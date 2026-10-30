import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BasemapUnavailableNotice } from "./basemap-unavailable-notice";

test("provider failure notice retains attribution and explains venue/planner fallback", () => {
  const markup = renderToStaticMarkup(<BasemapUnavailableNotice />);
  assert.match(markup, /OpenFreeMap basemap unavailable/);
  assert.match(markup, /Actual venue results remain selectable below/);
  assert.match(markup, /Activation Planner/);
  assert.match(
    markup,
    /OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors \(ODbL\)/,
  );
});
