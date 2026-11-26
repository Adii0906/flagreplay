"use client";

import { Bot, CheckCircle2, CircleDashed, Lightbulb, TriangleAlert } from "lucide-react";
import { Badge, Section, Spinner, cx } from "./ui";
import type { InvestigationView } from "./types";

export function AiReport({ inv, running }: { inv: InvestigationView; running: boolean }) {
  const r = inv.report;
  const nameOf = (id: string) => {
    const c = inv.changes.find((x) => x.id === id);
    if (c) return c.kind.startsWith("segment") ? `segment ${c.segmentName}` : c.segmentName ? `${c.featureName}/${c.segmentName}` : `${c.featureName}`;
    const e = inv.timeline.find((x) => x.id === id);
    if (e) return e.source === "demo_fixture" ? "fixture event" : e.source === "flagsmith_audit" ? "audit event" : "history event";
    return id;
  };

  const right = !r ? null : r.kind === "ai" ? (
    <Badge tone="outline" title={`${r.attempts} call(s), ${r.durationMs} ms`}>
      <Bot size={11} /> {r.provider} / {r.model}
    </Badge>
  ) : r.kind === "recorded" ? (
    <Badge tone="accent" title="Set LLM_API_KEY to run the model live on the same evidence">Recorded agent output (demo fixture)</Badge>
  ) : (
    <Badge tone="warn">AI unavailable</Badge>
  );

  return (
    <Section label="D" title="AI investigation" icon={<Bot size={14} />} right={right}>
      {!r ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          {running ? (
            <>
              <Spinner className="text-accent" /> Analysing the evidence above. Changes and timeline are already available.
            </>
          ) : (
            "No report."
          )}
        </div>
      ) : !r.data ? (
        <div className="flex items-start gap-2 rounded-md border border-warn/20 bg-warn-soft px-3 py-2 text-sm text-warn">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" /> {r.error}
        </div>
      ) : (
        <div className="space-y-5">
          <div className={cx("rounded-md border p-3.5", r.data.suspected_root_cause.status === "likely" ? "border-accent/35 bg-accent-soft/40" : "border-line bg-surface-2")}>
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-fg">Root-cause assessment</span>
              <Badge tone={r.data.suspected_root_cause.status === "likely" ? "accent" : r.data.suspected_root_cause.status === "possible" ? "warn" : "neutral"}>
                {r.data.suspected_root_cause.status === "likely" ? "Likely cause" : r.data.suspected_root_cause.status === "possible" ? "Possible cause" : "Undetermined"}
              </Badge>
              <Badge tone={r.data.confidence === "high" ? "ok" : r.data.confidence === "medium" ? "warn" : "neutral"}>{r.data.confidence} confidence</Badge>
            </div>
            <p className="text-[15px] leading-relaxed text-fg">{r.data.suspected_root_cause.statement}</p>
            <p className="mt-2 text-xs text-muted">{r.data.confidence_rationale}</p>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-medium text-muted">Evidence</h4>
            <ul className="space-y-2">
              {r.data.evidence.map((e, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  {e.type === "confirmed" ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" /> : <Lightbulb size={15} className="mt-0.5 shrink-0 text-warn" />}
                  <div className="min-w-0">
                    <span className={e.type === "confirmed" ? "text-fg" : "text-muted"}>{e.statement}</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={e.type === "confirmed" ? "ok" : "warn"}>{e.type === "confirmed" ? "Confirmed fact" : "Inference"}</Badge>
                      {e.references.map((ref) => (
                        <Badge key={ref} tone="outline" title={ref}>
                          {nameOf(ref)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {r.data.alternative_hypotheses.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-medium text-muted">Alternative explanations</h4>
              <ul className="space-y-2">
                {r.data.alternative_hypotheses.map((h, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <CircleDashed size={15} className="mt-0.5 shrink-0 text-faint" />
                    <div>
                      <span className="text-fg">{h.hypothesis}</span> <span className="text-muted">{h.assessment}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
