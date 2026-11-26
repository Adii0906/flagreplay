"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, RotateCcw, ShieldCheck, TriangleAlert, Undo2, X, XCircle } from "lucide-react";
import type { RecoveryAction } from "@/lib/recovery/types";
import type { RecoveryRecord } from "@/lib/investigation/types";
import { Badge, Button, Code, Section, Spinner, cx, fmtUtc } from "./ui";
import { ValueBox } from "./changes";
import { RuleTree } from "./rules";
import type { InvestigationView, Mode } from "./types";

function apiCall(a: RecoveryAction, inv: InvestigationView): string {
  if (a.type === "set_feature_state") return `PATCH /api/v1/environments/${inv.environment.apiKey}/featurestates/${a.featureStateId}/`;
  if (a.type === "set_override_state") return `PATCH /api/v1/features/featurestates/${a.featureStateId}/`;
  return `PATCH /api/v1/projects/{project}/segments/${a.segmentId}/  (rules only)`;
}

export function Recovery({
  inv,
  mode,
  onUpdate,
  onRerun,
}: {
  inv: InvestigationView;
  mode: Mode;
  onUpdate: (inv: InvestigationView) => void;
  onRerun: () => void;
}) {
  const recommended = inv.report?.data?.recommended_action.action_id ?? null;
  const [selected, setSelected] = useState<string | null>(recommended ?? inv.candidates.find((c) => c.available)?.id ?? null);
  const [confirming, setConfirming] = useState(false);
  const [ack, setAck] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (recommended) setSelected(recommended);
  }, [recommended]);

  const action = inv.candidates.find((c) => c.id === selected) ?? null;
  const lastRecovery: RecoveryRecord | undefined = inv.recoveries[inv.recoveries.length - 1];
  const applied = inv.recoveries.some((r) => r.status === "verified" && r.actionId === selected);

  const apply = async () => {
    if (!action) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/recovery/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investigationId: inv.id, actionId: action.id, confirm: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error?.message ?? `Recovery failed (${res.status})`);
      onUpdate(j.investigation);
      setConfirming(false);
      setAck(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const rec = inv.report?.data?.recommended_action;

  return (
    <>
      <Section label="E" title="Recovery recommendation" icon={<Undo2 size={14} />}>
        {inv.candidates.length === 0 ? (
          <p className="text-sm text-muted">No automatic recovery is available: no reversible configuration change was detected.</p>
        ) : (
          <div className="space-y-3">
            {rec && (
              <div className="text-sm">
                <p className="text-fg">{rec.summary}</p>
                <p className="mt-1 text-muted">{rec.rationale}</p>
              </div>
            )}
            {!rec && inv.report && (
              <p className="text-sm text-muted">The AI did not recommend an action. You can still review and apply a deterministic recovery option below.</p>
            )}

            <div className="space-y-1.5" role="radiogroup" aria-label="Recovery options">
              {inv.candidates.map((c) => (
                <button
                  key={c.id}
                  role="radio"
                  aria-checked={selected === c.id}
                  onClick={() => setSelected(c.id)}
                  className={cx(
                    "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    selected === c.id ? "border-accent/50 bg-accent-soft/40 text-fg" : "border-line bg-surface-2 text-muted hover:border-line-strong",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={cx("h-3 w-3 shrink-0 rounded-full border-2", selected === c.id ? "border-accent bg-accent" : "border-line-strong")} />
                    {c.title}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {c.id === recommended && <Badge tone="accent">Recommended</Badge>}
                    {!c.available && <Badge tone="warn">Unavailable</Badge>}
                    {inv.recoveries.some((r) => r.actionId === c.id && r.status === "verified") && <Badge tone="ok">Applied</Badge>}
                  </span>
                </button>
              ))}
            </div>

            {action && (
              <div className="rounded-md border border-line bg-surface-2 p-3">
                <div className="mb-2 text-xs text-faint">Before and after for this change only. Nothing else is modified.</div>
                {action.type === "restore_segment_rules" ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md border border-bad/20 bg-bad-soft/30 p-2.5">
                      <div className="mb-1 text-[11px] text-faint uppercase">Current</div>
                      <RuleTree rules={action.from} />
                    </div>
                    <div className="rounded-md border border-ok/20 bg-ok-soft/30 p-2.5">
                      <div className="mb-1 text-[11px] text-faint uppercase">After recovery</div>
                      <RuleTree rules={action.to} />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ValueBox label="Current" value={action.from} tone="before" />
                    <ValueBox label="After recovery" value={action.to} tone="after" />
                  </div>
                )}
                {!action.available && action.unavailableReason && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-warn">
                    <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {action.unavailableReason}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-faint">
                    {mode === "demo" ? "Applies to the simulated demo environment" : <>Writes via <Code>{apiCall(action, inv).split(" ")[0]}</Code> to {inv.environment.name}</>}
                  </span>
                  <Button variant="primary" disabled={!action.available || applied} onClick={() => setConfirming(true)}>
                    <ShieldCheck size={15} /> {applied ? "Applied and verified" : "Review and approve"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      <Verification inv={inv} last={lastRecovery} onRerun={onRerun} />

      <AnimatePresence>
        {confirming && action && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !applying && setConfirming(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="approve-title"
              className="w-full max-w-lg rounded-t-lg border border-line-strong bg-surface sm:rounded-lg"
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h3 id="approve-title" className="text-sm font-semibold">
                  Approve recovery
                </h3>
                <button onClick={() => setConfirming(false)} disabled={applying} className="text-faint hover:text-fg" aria-label="Close">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3 px-4 py-4 text-sm">
                <p className="text-fg">{action.title}</p>
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-faint">Target</dt>
                  <dd className="text-muted">
                    {mode === "demo" ? <Badge tone="accent">Simulated demo environment</Badge> : <Badge tone="bad">Live Flagsmith</Badge>} {inv.projectName} / {inv.environment.name}
                  </dd>
                  <dt className="text-faint">Request</dt>
                  <dd className="font-mono break-all text-muted">{mode === "demo" ? "none (in-memory simulator)" : apiCall(action, inv)}</dd>
                  <dt className="text-faint">Safeguards</dt>
                  <dd className="text-muted">Re-reads Flagsmith first and aborts if this object changed since the investigation. Saves a pre-recovery snapshot. Re-reads after writing to verify.</dd>
                </dl>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-line bg-surface-2 p-2.5 text-xs text-muted">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 accent-[#f97316]" />
                  I reviewed the before and after configuration and approve this change{mode === "live" ? ` to ${inv.environment.name}` : ""}.
                </label>
                {error && <p className="rounded-md border border-bad/25 bg-bad-soft px-2.5 py-2 text-xs text-bad">{error}</p>}
              </div>
              <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
                <Button variant="ghost" onClick={() => setConfirming(false)} disabled={applying}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={apply} disabled={!ack || applying}>
                  {applying ? <Spinner /> : <ShieldCheck size={15} />} {applying ? "Applying and verifying" : "Apply recovery"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Verification({ inv, last, onRerun }: { inv: InvestigationView; last: RecoveryRecord | undefined; onRerun: () => void }) {
  return (
    <Section label="F" title="Verification" icon={<ShieldCheck size={14} />}>
      {!last ? (
        <p className="text-sm text-muted">
          Nothing applied yet. After approval FlagReplay re-reads {inv.mode === "demo" ? "the simulated environment" : "Flagsmith"} and compares it with the intended recovery state.
        </p>
      ) : last.status === "aborted" ? (
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-md border border-warn/25 bg-warn-soft px-3 py-2 text-sm text-warn">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" /> {last.error}
          </div>
          <Button onClick={onRerun}>
            <RotateCcw size={14} /> Re-run investigation
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className={cx(
              "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
              last.status === "verified" ? "border-ok/25 bg-ok-soft text-ok" : "border-bad/25 bg-bad-soft text-bad",
            )}
          >
            {last.status === "verified" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
            <div>
              <p className="font-medium">{last.status === "verified" ? "Recovery verified" : "Recovery not verified"}</p>
              <p className="mt-0.5 text-xs opacity-90">{last.verification?.message ?? last.error}</p>
            </div>
          </div>
          {last.verification && (
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-faint">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Check</th>
                    <th className="px-3 py-1.5 font-medium">Expected</th>
                    <th className="px-3 py-1.5 font-medium">Re-read value</th>
                    <th className="px-3 py-1.5 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-mono">
                  {last.verification.checks.map((c, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-sans text-muted">{c.label}</td>
                      <td className="px-3 py-1.5 text-fg">{c.expected}</td>
                      <td className={cx("px-3 py-1.5", c.passed ? "text-ok" : "text-bad")}>{c.actual}</td>
                      <td className="px-3 py-1.5">{c.passed ? <CheckCircle2 size={13} className="text-ok" /> : <XCircle size={13} className="text-bad" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {last.verification && last.verification.unrelatedChanges.length > 0 && (
            <div className="rounded-md border border-warn/20 bg-warn-soft px-3 py-2 text-xs text-warn">
              Other changes seen between the pre and post reads:
              <ul className="mt-1 list-disc pl-4">
                {last.verification.unrelatedChanges.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="font-mono text-[11px] text-faint">
            verified at {fmtUtc(last.verification?.checkedAt ?? last.createdAt)} / pre-recovery snapshot {last.preSnapshotId?.slice(0, 8) ?? "none"} / post snapshot {last.postSnapshotId?.slice(0, 8) ?? "none"}
          </p>
        </div>
      )}
    </Section>
  );
}
