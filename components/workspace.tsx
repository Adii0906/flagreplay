"use client";

import { ArrowLeft, Check, CircleAlert, FileWarning, Info, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { Badge, Button, Section, Spinner, cx, fmtUtc } from "./ui";
import { StatusBadge } from "./home";
import { SuspectedChanges } from "./changes";
import { Timeline } from "./timeline";
import { AiReport } from "./report";
import { Recovery } from "./recovery";
import type { InvestigationView, Mode, StageView } from "./types";

export function Workspace({
  mode,
  incident,
  stages,
  running,
  investigation: inv,
  error,
  onBack,
  onRerun,
  onUpdate,
}: {
  mode: Mode;
  incident: string;
  stages: StageView[];
  running: boolean;
  investigation: InvestigationView | null;
  error: { code: string; message: string } | null;
  onBack: () => void;
  onRerun: () => void;
  onUpdate: (inv: InvestigationView) => void;
}) {
  const rootCauseId = inv?.report?.data?.suspected_root_cause.change_id ?? null;
  return (
    <div className="pt-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button onClick={onBack} disabled={running} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg disabled:opacity-50">
          <ArrowLeft size={15} /> New investigation
        </button>
        {!running && (
          <Button variant="ghost" onClick={onRerun}>
            <RotateCcw size={14} /> Re-run
          </Button>
        )}
      </div>

      <Stages stages={stages} />

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-4 py-3 text-sm text-bad">
          <CircleAlert size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Investigation could not complete</p>
            <p className="mt-0.5 text-bad/90">{error.message}</p>
            <p className="mt-1 text-xs text-bad/70">Error code: {error.code}. No fallback data was used.</p>
          </div>
        </div>
      )}

      {inv && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Summary inv={inv} incident={incident} running={running} />
            <SuspectedChanges inv={inv} rootCauseId={rootCauseId} />
            <div className="lg:hidden">
              <Timeline inv={inv} rootCauseId={rootCauseId} />
            </div>
            <AiReport inv={inv} running={running} />
            <Recovery key={`${inv.id}:${inv.report?.kind ?? "none"}`} inv={inv} mode={mode} onUpdate={onUpdate} onRerun={onRerun} />
            {inv.limitations.length > 0 && <Limitations items={inv.limitations} />}
          </div>
          <div className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto scrollbar-thin">
              <Timeline inv={inv} rootCauseId={rootCauseId} />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function Stages({ stages }: { stages: StageView[] }) {
  return (
    <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
      {stages.map((s, i) => (
        <li key={s.id} className={cx("bg-surface px-3 py-2.5", s.status === "running" && "bg-surface-2")}>
          <div className="flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center">
              {s.status === "running" ? (
                <Spinner className="text-accent" />
              ) : s.status === "done" ? (
                <Check size={14} className="text-ok" />
              ) : s.status === "error" ? (
                <CircleAlert size={14} className="text-warn" />
              ) : (
                <span className="font-mono text-[11px] text-faint">{i + 1}</span>
              )}
            </span>
            <span className={cx("text-[13px]", s.status === "pending" ? "text-faint" : "text-fg")}>{s.label}</span>
          </div>
          <p className="mt-0.5 min-h-4 truncate pl-6 text-[11px] text-faint" title={s.detail}>
            {s.detail ?? (s.status === "running" ? "in progress" : "")}
            {s.startedAt && s.endedAt ? ` / ${((s.endedAt - s.startedAt) / 1000).toFixed(1)}s` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Summary({ inv, incident, running }: { inv: InvestigationView; incident: string; running: boolean }) {
  const r = inv.report?.data;
  return (
    <Section label="A" title="Incident summary" right={running ? <Badge tone="neutral">Investigating</Badge> : <StatusBadge status={inv.status} />}>
      <p className="text-lg leading-snug font-medium text-fg">{incident}</p>
      {r && <p className="mt-1.5 text-sm text-muted">{r.incident_summary}</p>}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm xl:grid-cols-4">
        <Field label="Affected feature">
          <span className="font-mono text-[13px]">{r?.affected_features.join(", ") || inv.affectedFeature || "unknown"}</span>
        </Field>
        <Field label="Environment">
          {inv.projectName} / {inv.environment.name}
        </Field>
        <Field label="Compared against">{inv.comparison === "environment" ? `${inv.baseline?.label} environment` : inv.baseline ? fmtUtc(inv.baseline.capturedAt) : "no baseline"}</Field>
        <Field label="Investigated">{fmtUtc(inv.createdAt)}</Field>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {inv.mode === "demo" ? <Badge tone="accent">Demo fixture data</Badge> : <Badge tone="ok">Live Flagsmith data</Badge>}
        <Badge tone="outline">{inv.audit.available ? `${inv.audit.retrieved} history events` : "Audit log unavailable"}</Badge>
        {inv.environment.versioningV2 && <Badge tone="warn">v2 feature versioning</Badge>}
      </div>
    </Section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-faint uppercase">{label}</dt>
      <dd className="mt-0.5 truncate text-fg">{children}</dd>
    </div>
  );
}

function Limitations({ items }: { items: string[] }) {
  return (
    <Section label="Data" title="Limitations" icon={<FileWarning size={14} />}>
      <ul className="space-y-1.5">
        {items.map((l, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-muted">
            <Info size={14} className="mt-0.5 shrink-0 text-faint" /> {l}
          </li>
        ))}
      </ul>
    </Section>
  );
}
