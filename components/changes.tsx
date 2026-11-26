"use client";

import { useState } from "react";
import { ChevronDown, GitCompareArrows } from "lucide-react";
import type { ConfigChange, HistoryEvent } from "@/lib/types";
import { Badge, Section, cx, fmtUtc, fmtValue } from "./ui";
import { RuleTree, conditionLabel, highlightSets } from "./rules";
import type { InvestigationView } from "./types";

const KIND_LABEL: Record<string, string> = {
  feature_added: "Feature added",
  feature_removed: "Feature removed",
  feature_enabled: "Toggle",
  feature_value: "Value",
  override_added: "Override added",
  override_removed: "Override removed",
  override_enabled: "Override toggle",
  override_value: "Override value",
  override_priority: "Override priority",
  segment_added: "Segment created",
  segment_removed: "Segment deleted",
  segment_rules: "Segment rules",
};

export function SuspectedChanges({ inv, rootCauseId }: { inv: InvestigationView; rootCauseId: string | null }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...inv.changes].sort((a, b) => Number(b.id === rootCauseId) - Number(a.id === rootCauseId));
  const visible = showAll ? sorted : sorted.slice(0, 4);
  const evidenceSource =
    inv.comparison === "environment"
      ? `Environment comparison: ${inv.baseline?.label} vs ${inv.environment.name}`
      : inv.mode === "demo"
        ? "Fixture snapshot diff (demo)"
        : "FlagReplay snapshot diff";

  return (
    <Section
      label="B"
      title="Suspected changes"
      icon={<GitCompareArrows size={14} />}
      right={<span className="text-xs text-faint">{inv.changes.length} detected</span>}
    >
      {inv.changes.length === 0 ? (
        <p className="text-sm text-muted">
          {inv.baseline
            ? "No configuration differences between the baseline and the current configuration."
            : "No baseline is available yet, so no configuration diff could be computed. See the data limitations below."}
        </p>
      ) : (
        <div className="space-y-2.5">
          <p className="text-xs text-faint">
            Source of evidence: {evidenceSource}
            {inv.baseline && inv.comparison === "history" && <> / baseline {fmtUtc(inv.baseline.capturedAt)}</>}
          </p>
          {visible.map((c) => (
            <ChangeCard key={c.id} change={c} events={inv.timeline.filter((e) => e.relatedChangeIds.includes(c.id))} isRoot={c.id === rootCauseId} driftLabels={inv.comparison === "environment" ? [inv.baseline?.label ?? "Baseline", inv.environment.name] : null} />
          ))}
          {sorted.length > 4 && (
            <button onClick={() => setShowAll((s) => !s)} className="text-xs text-muted hover:text-fg">
              {showAll ? "Show fewer" : `Show ${sorted.length - 4} more`}
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

function ChangeCard({ change: c, events, isRoot, driftLabels }: { change: ConfigChange; events: HistoryEvent[]; isRoot: boolean; driftLabels: [string, string] | null }) {
  const [open, setOpen] = useState(isRoot);
  const subject = c.kind.startsWith("segment") ? c.segmentName : c.segmentName ? `${c.featureName} / ${c.segmentName}` : c.featureName;
  const ev = events[0];
  const [beforeLabel, afterLabel] = driftLabels ?? ["Previous", "Current"];
  return (
    <div className={cx("rounded-md border bg-surface-2", isRoot ? "border-accent/40" : "border-line")}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[13px] text-fg">{subject}</span>
            <Badge tone="outline">{KIND_LABEL[c.kind] ?? c.kind}</Badge>
            {isRoot && <Badge tone="accent">Suspected root cause</Badge>}
            {(c.matchedTerms?.length ?? 0) > 0 && <Badge tone="neutral" title="Keyword overlap with the incident description">matches: {c.matchedTerms!.join(", ")}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">{c.summary}</p>
          <p className="mt-1 text-xs text-faint">
            {ev ? (
              <>
                {fmtUtc(ev.timestamp)} / {ev.actor ?? "author not recorded"} / {sourceLabel(ev.source)}
              </>
            ) : (
              "No matching history event: change time and author unknown"
            )}
          </p>
        </div>
        <ChevronDown size={15} className={cx("mt-1 shrink-0 text-faint transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-line px-3 py-3">
          {c.kind === "segment_rules" ? (
            <SegmentDiff change={c} labels={[beforeLabel, afterLabel]} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <ValueBox label={beforeLabel} value={c.before} tone="before" />
              <ValueBox label={afterLabel} value={c.after} tone="after" />
            </div>
          )}
          {c.affectedFeatures.length > 0 && c.kind.startsWith("segment") && (
            <p className="mt-2 text-xs text-faint">
              Features with overrides on this segment: <span className="font-mono text-muted">{c.affectedFeatures.join(", ")}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SegmentDiff({ change, labels }: { change: ConfigChange; labels: [string, string] }) {
  const { before, after } = highlightSets(change.conditionDiffs);
  return (
    <div className="space-y-2">
      {change.conditionDiffs?.map((d) => (
        <div key={d.path} className="flex flex-wrap items-center gap-2 font-mono text-[12px]">
          <span className="rounded-sm bg-bad-soft px-1.5 py-0.5 text-bad">{d.before ? conditionLabel(d.before) : "(none)"}</span>
          <span className="text-faint">to</span>
          <span className="rounded-sm bg-ok-soft px-1.5 py-0.5 text-ok">{d.after ? conditionLabel(d.after) : "(removed)"}</span>
        </div>
      ))}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-line bg-surface p-2.5">
          <div className="mb-1.5 text-[11px] text-faint uppercase">{labels[0]}</div>
          <RuleTree rules={(change.before as never) ?? []} highlight={before} tone="before" />
        </div>
        <div className="rounded-md border border-line bg-surface p-2.5">
          <div className="mb-1.5 text-[11px] text-faint uppercase">{labels[1]}</div>
          <RuleTree rules={(change.after as never) ?? []} highlight={after} tone="after" />
        </div>
      </div>
    </div>
  );
}

export function ValueBox({ label, value, tone }: { label: string; value: unknown; tone: "before" | "after" }) {
  const text =
    value && typeof value === "object" && "enabled" in (value as object)
      ? `enabled: ${(value as { enabled: boolean }).enabled}\nvalue: ${fmtValue((value as { value: unknown }).value)}`
      : typeof value === "boolean"
        ? `enabled: ${value}`
        : fmtValue(value);
  return (
    <div className={cx("rounded-md border p-2.5", tone === "before" ? "border-bad/20 bg-bad-soft/40" : "border-ok/20 bg-ok-soft/40")}>
      <div className="mb-1 text-[11px] text-faint uppercase">{label}</div>
      <pre className={cx("font-mono text-[12px] whitespace-pre-wrap", tone === "before" ? "text-bad" : "text-ok")}>{text}</pre>
    </div>
  );
}

export function sourceLabel(s: HistoryEvent["source"]) {
  return {
    flagsmith_audit: "Flagsmith audit log",
    flagsmith_webhook: "Flagsmith webhook",
    flagreplay_snapshot: "FlagReplay snapshot",
    demo_fixture: "Demo fixture",
  }[s];
}
