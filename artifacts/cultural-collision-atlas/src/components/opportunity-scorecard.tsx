import React from "react";
import type { GeographicAnalysisResponse } from "@workspace/api-client-react";

type UnifiedAnalysis = NonNullable<GeographicAnalysisResponse["analysis"]>;
type ComponentEntry = UnifiedAnalysis["scores"]["components"][keyof UnifiedAnalysis["scores"]["components"]];

const componentLabels = {
  culturalAffinity: "Cultural affinity",
  descriptorOverlap: "Cultural descriptor overlap",
  geographicSignal: "Geographic cultural signal",
  venueReadiness: "Venue operational readiness",
  evidenceCompleteness: "Evidence completeness",
} as const;

function ComponentCard({ label, component }: { label: string; component: ComponentEntry }) {
  return (
    <article className="min-w-0 border-t border-white/[.08] py-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-[11px] font-semibold text-[#d2d8e4]">{label}</h4>
        {component.status === "available" && component.score !== null ? (
          <span className="mono text-[15px] font-medium text-[#95dfe5]" aria-label={`${label} score ${component.score} out of 100`}>
            {component.score}<span className="text-[9px] text-[#778398]">/100</span>
          </span>
        ) : (
          <span className="rounded-full border border-amber-100/15 px-2 py-0.5 text-[8px] text-[#d5bd8a]">
            Unavailable
          </span>
        )}
      </div>
      <p className="mt-1 text-[9px] leading-5 text-[#8f9bb0]">
        {component.status === "available" ? component.explanation : component.reason}
      </p>
      {component.sourceReferences.length > 0 && (
        <p className="mt-1 break-words text-[8px] leading-4 text-[#6f7b90]">
          Source · {component.sourceReferences.join(" · ")}
        </p>
      )}
    </article>
  );
}

export function OpportunityScorecard({ analysis }: { analysis?: UnifiedAnalysis }) {
  if (!analysis) {
    return (
      <section aria-label="Opportunity component scorecard" className="border-t border-white/[.07] pt-4">
        <h3 className="text-[13px] font-semibold text-[#d6dbe7]">Opportunity components</h3>
        <p className="mt-2 text-[10px] leading-5 text-[#8793a7]" role="status">
          Run a bounded analysis from a Discovery bridge to calculate available components. No composite score is calculated.
        </p>
      </section>
    );
  }

  const { scores, overlap, affinity, recommendations } = analysis;
  const components = Object.entries(componentLabels).map(([key, label]) => ({
    key: key as keyof typeof componentLabels,
    label,
    component: scores.components[key as keyof typeof componentLabels],
  }));

  return (
    <section aria-label="Opportunity component scorecard" data-testid="opportunity-scorecard" className="border-t border-white/[.07] pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow text-[9px] text-[#78849a]">Independent evidence components</div>
          <h3 className="mt-1 text-[14px] font-semibold text-[#d6dbe7]">Opportunity scorecard</h3>
        </div>
        <span className="mono text-[8px] text-[#778398]">{scores.methodologyVersion}</span>
      </div>
      <div className="mt-3 grid gap-x-5 md:grid-cols-2">
        {components.map(({ key, label, component }) => (
          <ComponentCard component={component} key={key} label={label} />
        ))}
      </div>
      <div className="mt-2 rounded-lg border border-white/[.07] bg-white/[.018] p-3">
        <h4 className="text-[10px] font-semibold text-[#d2d8e4]">Descriptor comparison · {overlap.status}</h4>
        <p className="mt-1 text-[9px] leading-5 text-[#8995aa]">
          {overlap.jaccard.status === "available"
            ? `Jaccard ${overlap.jaccard.value?.toFixed(3)} from ${overlap.jaccard.intersectionSize} shared IDs / ${overlap.jaccard.unionSize} unique IDs.`
            : `Jaccard similarity unavailable: ${overlap.jaccard.reason ?? "tag data is incomplete"}.`}
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <DescriptorList label="Shared" values={overlap.matchingTags.map(({ id, interestAName, classification }) => `${interestAName} · ${classification} · ${id}`)} />
          <DescriptorList label="Interest A only" values={overlap.interestAOnlyTags.map(({ name, classification, id }) => `${name} · ${classification} · ${id}`)} />
          <DescriptorList label="Interest B only" values={overlap.interestBOnlyTags.map(({ name, classification, id }) => `${name} · ${classification} · ${id}`)} />
        </div>
        <p className="mt-2 text-[8px] leading-4 text-[#6f7b90]">Coverage · A {overlap.coverage.interestA} ({overlap.coverage.interestATagCount}) · B {overlap.coverage.interestB} ({overlap.coverage.interestBTagCount}) · Sources {overlap.sourceReferences.join("; ") || "not returned"}</p>
      </div>
      <div className="mt-3">
        <h4 className="text-[10px] font-semibold text-[#d2d8e4]">Deterministic recommendations</h4>
        {recommendations.length ? recommendations.map((recommendation) => (
          <article className="mt-2 border-l-2 border-cyan-100/20 pl-3" key={recommendation.id}>
            <h5 className="text-[10px] font-medium text-[#cbd4e2]">{recommendation.title}</h5>
            <p className="mt-1 text-[9px] leading-5 text-[#8793a7]">{recommendation.rationale}</p>
            <p className="mt-1 text-[8px] text-[#6f7b90]">Evidence · {recommendation.evidenceReferences.join(" · ")}</p>
            {recommendation.limitations.map((limitation) => <p className="mt-1 text-[8px] leading-4 text-[#9a8869]" key={limitation}>{limitation}</p>)}
          </article>
        )) : <p className="mt-2 text-[9px] text-[#8793a7]">No evidence-backed recommendations are available.</p>}
      </div>
      <p className="mt-3 text-[9px] leading-5 text-[#9a8869]">
        No composite opportunity score is calculated: no weights or thresholds have been approved. Component scores are not probabilities or campaign-success predictions.
      </p>
      <div className="mt-2 text-[8px] leading-4 text-[#6f7b90]">
        {scores.limitations.join(" ")}
      </div>
    </section>
  );
}

function DescriptorList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <div className="text-[8px] uppercase text-[#778398]">{label}</div>
      {values.length ? (
        <ul className="mt-1 space-y-1 text-[8px] leading-4 text-[#98a4b7]">
          {values.map((value) => <li className="break-words" key={value}>{value}</li>)}
        </ul>
      ) : <p className="mt-1 text-[8px] text-[#6f7b90]">No returned IDs</p>}
    </div>
  );
}