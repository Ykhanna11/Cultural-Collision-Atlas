import React from "react";
import type { BridgeCandidate } from "@workspace/api-client-react";

type DisplayEvidence = BridgeCandidate["evidence"][number];

function evidenceFor(
  evidence: DisplayEvidence[],
  label: string,
): DisplayEvidence | undefined {
  return evidence.find((item) => item.label === label);
}

export function AffinityComparisonPanel({
  candidate,
  interestA,
  interestB,
}: {
  candidate: BridgeCandidate;
  interestA: string;
  interestB: string;
}) {
  const joint = candidate.evidence.find((item) =>
    item.label.startsWith("Joint-interest comparison"),
  );
  const singleA = evidenceFor(
    candidate.evidence,
    `Supporting single-interest comparison: ${interestA}`,
  ) ?? candidate.evidence.find((item) => item.label === "A-only query results");
  const singleB = evidenceFor(
    candidate.evidence,
    `Supporting single-interest comparison: ${interestB}`,
  ) ?? candidate.evidence.find((item) => item.label === "B-only query results");
  const attribution = evidenceFor(candidate.evidence, "Per-result input attribution");
  const descriptors = evidenceFor(
    candidate.evidence,
    "Taste Analysis overlap · Shared input descriptors",
  );

  return (
    <section
      aria-label={`Affinity comparison for ${interestA} and ${interestB}`}
      className="border-t border-white/[.06] px-5 py-4"
    >
      <div className="eyebrow text-[9px] text-[#78849a]">Affinity comparison</div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {[
          { label: `${interestA} only`, evidence: singleA },
          { label: `${interestB} only`, evidence: singleB },
          { label: "Joint query", evidence: joint },
        ].map(({ label, evidence }) => (
          <div className="min-w-0 rounded-lg border border-white/[.07] bg-white/[.018] p-3" key={label}>
            <h4 className="text-[10px] font-semibold text-[#d2d7e4]">{label}</h4>
            <p className="mt-2 break-words text-[9px] leading-5 text-[#99a5b8]">
              {evidence?.value ?? "This query result is unavailable in the saved evidence."}
            </p>
            {evidence && <p className="mt-2 text-[8px] text-[#717d92]">{evidence.source}</p>}
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-white/[.07] bg-white/[.018] p-3">
          <h4 className="text-[10px] font-semibold text-[#d2d7e4]">Per-result attribution</h4>
          <p className="mt-2 break-words text-[9px] leading-5 text-[#99a5b8]">
            {attribution?.value ?? "Attribution was not returned or is unavailable."}
          </p>
        </div>
        <div className="rounded-lg border border-white/[.07] bg-white/[.018] p-3">
          <h4 className="text-[10px] font-semibold text-[#d2d7e4]">Shared and distinct descriptors</h4>
          <p className="mt-2 break-words text-[9px] leading-5 text-[#99a5b8]">
            {descriptors?.value ?? "Taste Analysis descriptor comparison was not returned."}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[8px] leading-4 text-[#707c91]">
        Aggregate affinity, tag similarity, and attribution do not establish that the same individuals have both interests.
      </p>
    </section>
  );
}