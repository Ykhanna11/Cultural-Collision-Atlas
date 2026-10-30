import React from "react";
import type { GeographicAnalysisResponse } from "@workspace/api-client-react";

type GeographicSummary = GeographicAnalysisResponse["summary"];

export function GeographicSummaryPanel({
  summary,
}: {
  summary?: GeographicSummary;
}) {
  if (!summary) return null;
  const { south, west, north, east } = summary.requestedBounds;

  return (
    <section
      aria-label="Geographic evidence summary"
      className="mt-4 border-t border-white/[.07] pt-3 text-[9px] leading-5 text-[#8490a4]"
    >
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <span>
          Area coverage: <b className="font-medium text-[#c2ccda]">{summary.coverage}</b>
        </span>
        <span>
          Qloo signals: <b className="font-medium text-[#80dce5]">{summary.heatmap.pointCount}</b>
          {" "}· {summary.heatmap.status}
        </span>
        <span>
          {summary.venues.recordCount} venue records · {summary.venues.source} · {summary.venues.status}
        </span>
        <span>Overture extract: {summary.overtureCoverage.status}</span>
      </div>
      {summary.venues.categoryCounts.length > 0 && (
        <div aria-label="Venue counts by category" className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {summary.venues.categoryCounts.map(({ category, count }) => (
            <span key={category}>{category}: {count}</span>
          ))}
        </div>
      )}
      <p className="mt-2 text-[#6f7a8e]">
        Requested bounds: {south}, {west} to {north}, {east}. {summary.sourceSeparation}
      </p>
    </section>
  );
}