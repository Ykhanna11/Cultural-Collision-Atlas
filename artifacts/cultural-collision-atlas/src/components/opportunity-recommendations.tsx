import React, { type ReactNode } from "react";
import { Check, CircleHelp, LoaderCircle, Sparkles, TriangleAlert } from "lucide-react";
import type { ActivationOpportunityCandidate } from "@workspace/api-zod";
import { getStaleAnalysisNotice, type StaleAnalysisContext } from "../lib/stale-analysis";

export interface OpportunityRecommendationsPanelProps {
  analysisContext: StaleAnalysisContext | null;
  city: string;
  entityId: string;
  status: "ok" | "insufficient_evidence";
  opportunities: ActivationOpportunityCandidate[];
  loading: boolean;
  error: unknown;
  reason?: string;
  onSelectOpportunity?: (opportunityId: string) => void;
  selectedOpportunityId: string | null;
}

export interface OpportunityRequestContext {
  analysisReference: string;
  city: string;
  entityId: string;
}

export function shouldGenerateOpportunityRecommendations({
  analysisContext,
  city,
  entityId,
}: {
  analysisContext: StaleAnalysisContext | null;
  city: string;
  entityId: string;
}): boolean {
  if (!analysisContext) return false;
  if (!analysisContext.analysisReference.trim()) return false;
  if (!entityId.trim()) return false;
  if (city.trim().toLowerCase() !== analysisContext.city.trim().toLowerCase()) return false;
  if (entityId !== analysisContext.entityId) return false;
  return true;
}

export function isOpportunityResponseCurrent({
  activeContext,
  responseContext,
}: {
  activeContext: OpportunityRequestContext | null;
  responseContext: OpportunityRequestContext | null;
}): boolean {
  if (!activeContext || !responseContext) return false;
  return (
    activeContext.analysisReference.trim() === responseContext.analysisReference.trim() &&
    activeContext.city.trim().toLowerCase() === responseContext.city.trim().toLowerCase() &&
    activeContext.entityId === responseContext.entityId
  );
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[.07] bg-white/[.018] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#8f99af]">{title}</div>
      <div className="mt-2 text-[10px] leading-5 text-[#b1bbcf]">{children}</div>
    </div>
  );
}

export function OpportunityRecommendationsPanel(props: OpportunityRecommendationsPanelProps) {
  const staleNotice = getStaleAnalysisNotice({
    analysisContext: props.analysisContext,
    city: props.city,
    entityId: props.entityId,
    error: props.error,
  });

  if (!props.analysisContext) {
    return (
      <div className="rounded-2xl border border-white/[.07] bg-[#0d1320] p-5">
        <div className="eyebrow text-[9px] text-[#8c7cc0]">Opportunity recommendations</div>
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-white/[.07] bg-white/[.018] p-3">
          <Sparkles className="mt-0.5 text-[#ab92f4]" size={16} />
          <div className="text-[10px] leading-5 text-[#93a0b7]">
            Connect a valid Discovery result to generate evidence-grounded activation opportunities. This panel does not invent recommendations without an active analysis reference and candidate selection.
          </div>
        </div>
      </div>
    );
  }

  if (staleNotice) {
    return (
      <div className="rounded-2xl border border-amber-100/15 bg-amber-100/[.035] p-5">
        <div className="eyebrow text-[9px] text-[#c5b78f]">Opportunity recommendations</div>
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-amber-100/15 bg-amber-100/[.025] p-3 text-[10px] leading-5 text-[#c5b78f]">
          <TriangleAlert className="mt-0.5 shrink-0" size={16} />
          <div>{staleNotice}</div>
        </div>
      </div>
    );
  }

  if (props.loading) {
    return (
      <div className="rounded-2xl border border-white/[.07] bg-[#0d1320] p-5">
        <div className="eyebrow text-[9px] text-[#8c7cc0]">Opportunity recommendations</div>
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.018] p-3 text-[10px] text-[#b8c1d2]">
          <LoaderCircle size={14} className="animate-spin text-[#9ecff5]" />
          Generating recommendations from the active Discovery analysis…
        </div>
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="rounded-2xl border border-rose-300/15 bg-rose-300/[.05] p-5">
        <div className="eyebrow text-[9px] text-[#d6a3a3]">Opportunity recommendations</div>
        <div className="mt-3 rounded-xl border border-rose-300/15 bg-rose-300/[.025] p-3 text-[10px] leading-5 text-[#f4c7cf]">
          Opportunity discovery unavailable. The active Discovery evidence could not be used to generate recommendations.
        </div>
      </div>
    );
  }

  if (props.status === "insufficient_evidence") {
    return (
      <div className="rounded-2xl border border-white/[.07] bg-[#0d1320] p-5">
        <div className="eyebrow text-[9px] text-[#8c7cc0]">Opportunity recommendations</div>
        <div className="mt-3 rounded-xl border border-amber-100/15 bg-amber-100/[.025] p-4 text-[10px] leading-5 text-[#c5b78f]">
          <div className="font-semibold text-[#e1cf9d]">Insufficient evidence</div>
          <div className="mt-1">{props.reason ?? "There is not enough verified evidence to generate a recommendation."}</div>
        </div>
      </div>
    );
  }

  if (!props.opportunities.length) {
    return (
      <div className="rounded-2xl border border-white/[.07] bg-[#0d1320] p-5">
        <div className="eyebrow text-[9px] text-[#8c7cc0]">Opportunity recommendations</div>
        <div className="mt-3 rounded-xl border border-white/[.07] bg-white/[.018] p-3 text-[10px] leading-5 text-[#a3aebe]">
          No activation opportunities were generated for this Discovery candidate. The source evidence remained limited or did not support a concrete recommendation.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/[.07] bg-[#0d1320] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow text-[9px] text-[#8c7cc0]">Opportunity recommendations</div>
          <h3 className="mt-1 text-[16px] font-semibold text-[#ebedf5]">Discovery-backed activation ideas</h3>
        </div>
        <div className="rounded-full border border-cyan-100/15 bg-cyan-100/[.03] px-2.5 py-1 text-[8px] uppercase tracking-[.12em] text-[#89dfe8]">{props.opportunities.length} ideas</div>
      </div>

      {props.opportunities.map((opportunity) => {
        const selected = props.selectedOpportunityId === opportunity.id;
        return (
          <article key={opportunity.id} className="rounded-xl border border-white/[.07] bg-white/[.018] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#8f99af]">{opportunity.opportunityType}</div>
                <h4 className="mt-2 text-[16px] font-semibold text-[#edf0f5]">{opportunity.title}</h4>
              </div>
              <button
                type="button"
                onClick={() => props.onSelectOpportunity?.(opportunity.id)}
                className={selected
                  ? "rounded-full border border-violet-200/30 bg-violet-100/[.08] px-3 py-1.5 text-[9px] font-semibold text-[#e6dcff]"
                  : "rounded-full border border-white/[.09] bg-white/[.025] px-3 py-1.5 text-[9px] font-semibold text-[#cdd6e8] hover:border-violet-200/20"}
              >
                {selected ? "Selected for planner" : "Select for planner"}
              </button>
            </div>

            <p className="mt-3 text-[10px] leading-5 text-[#b3bdd1]">{opportunity.rationale}</p>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              <Row title="Verified evidence">
                <div className="space-y-2">
                  {opportunity.verifiedEvidence.length ? opportunity.verifiedEvidence.map((item) => (
                    <div key={`${item.source}-${item.sourceReference ?? item.establishes}`} className="rounded-lg border border-cyan-100/[.08] bg-cyan-100/[.02] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] font-semibold text-[#d2d9e9]">{item.source}</span>
                        <span className="rounded-full border border-cyan-100/10 px-1.5 py-0.5 text-[7px] uppercase tracking-[.1em] text-[#89dfe8]">{item.category}</span>
                      </div>
                      <p className="mt-2 text-[9px] leading-4 text-[#b8c2d7]">{item.establishes}</p>
                      {item.sourceReference && (
                        <div className="mt-2 mono break-all text-[8px] text-[#86d2d8]">{item.sourceReference}</div>
                      )}
                      {item.observedAt && <div className="mt-1 text-[8px] text-[#8d99b0]">Observed {new Date(item.observedAt).toISOString().slice(0, 10)}</div>}
                    </div>
                  )) : <span className="text-[#b9b9a1]">No verified evidence was returned for this opportunity.</span>}
                </div>
              </Row>

              <Row title="Inferred suggestions">
                <div className="space-y-3">
                  {opportunity.inferredSuggestions.length ? opportunity.inferredSuggestions.map((suggestion, index) => (
                    <div key={`${opportunity.id}-suggestion-${index}`} className="rounded-lg border border-violet-100/[.08] bg-violet-100/[.02] p-2.5">
                      <p className="text-[9px] leading-4 text-[#d9d3ed]">{suggestion.candidateAudienceHypothesis}</p>
                      {suggestion.culturalThemes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {suggestion.culturalThemes.map((theme) => (
                            <span key={`${theme}-${index}`} className="rounded-full border border-violet-200/15 bg-violet-200/[.04] px-1.5 py-0.5 text-[8px] text-[#d0c4ff]">{theme}</span>
                          ))}
                        </div>
                      )}
                      {suggestion.activationFormats.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {suggestion.activationFormats.map((format) => (
                            <span key={`${format}-${index}`} className="rounded-full border border-cyan-100/10 bg-cyan-100/[.03] px-1.5 py-0.5 text-[8px] text-[#9adfe7]">{format}</span>
                          ))}
                        </div>
                      )}
                      {suggestion.supportingEvidenceReferences.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {suggestion.supportingEvidenceReferences.map((reference) => (
                            <span key={`${reference}-${index}`} className="mono rounded border border-white/[.08] bg-white/[.02] px-1.5 py-0.5 text-[8px] text-[#e3ebff]">{reference}</span>
                          ))}
                        </div>
                      )}
                      {suggestion.note && <p className="mt-2 text-[8px] leading-4 text-[#a5afc6]">{suggestion.note}</p>}
                    </div>
                  )) : <span className="text-[#b9b9a1]">No inference was generated for this opportunity.</span>}
                </div>
              </Row>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              <Row title="Missing evidence">
                {opportunity.missingEvidence.length ? (
                  <ul className="list-disc space-y-1 pl-4">
                    {opportunity.missingEvidence.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : <span className="text-[#b9b9a1]">No missing evidence is flagged for this opportunity.</span>}
              </Row>

              <Row title="Limitations">
                {opportunity.limitations.length ? (
                  <ul className="list-disc space-y-1 pl-4">
                    {opportunity.limitations.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : <span className="text-[#b9b9a1]">No limitations were recorded.</span>}
              </Row>
            </div>

            {opportunity.inferredSuggestions.some((suggestion) => suggestion.supportingEvidenceReferences.length > 0) && (
              <div className="mt-4 rounded-xl border border-white/[.07] bg-white/[.012] p-3">
                <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.12em] text-[#8f99af]">
                  <CircleHelp size={12} /> Supporting evidence references
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Array.from(new Set(opportunity.inferredSuggestions.flatMap((suggestion) => suggestion.supportingEvidenceReferences))).map((reference) => (
                    <span key={reference} className="mono rounded border border-white/[.08] bg-white/[.02] px-1.5 py-0.5 text-[8px] text-[#dfe7fb]">{reference}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 text-[9px] text-[#8d99af]">
              <Check size={12} className="text-[#7bdab5]" />
              Verified evidence and inferred suggestions remain clearly separated; the suggestions are hypotheses, not confirmed outcomes.
            </div>
          </article>
        );
      })}
    </div>
  );
}
