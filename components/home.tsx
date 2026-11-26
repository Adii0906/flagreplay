"use client";

import { useState } from "react";
import { ArrowRight, ChevronRight, Clock, FlaskConical, Search, TriangleAlert } from "lucide-react";
import { Badge, Button, cx, fmtTime } from "./ui";
import { EXAMPLES, type InvestigationSummary, type Mode } from "./types";

const FLOW = ["Incident", "Evidence", "Explanation", "Approval", "Recovery", "Verification"];

export function Home({
  mode,
  liveBlocked,
  missing,
  recent,
  onInvestigate,
  onOpenRecent,
  onOpenSettings,
  error,
}: {
  mode: Mode;
  liveBlocked: boolean;
  missing: string[];
  recent: InvestigationSummary[];
  onInvestigate: (incident: string, scenario?: string | null) => void;
  onOpenRecent: (id: string) => void;
  onOpenSettings: () => void;
  error: { code: string; message: string } | null;
}) {
  const [text, setText] = useState("");
  const [scenario, setScenario] = useState<string | null>(null);
  const canSubmit = text.trim().length >= 5 && !liveBlocked;

  const submit = () => {
    if (canSubmit) onInvestigate(text.trim(), scenario);
  };

  return (
    <div className="mx-auto max-w-3xl pt-12 sm:pt-20">
      <div className="mb-3 flex flex-wrap items-center gap-1 font-mono text-[11px] text-faint">
        {FLOW.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            <span className={i === 0 ? "text-accent" : undefined}>{s}</span>
            {i < FLOW.length - 1 && <ChevronRight size={11} />}
          </span>
        ))}
      </div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">What went wrong?</h1>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">
        Investigate feature flag changes and recover from incidents. FlagReplay reconstructs what changed in Flagsmith, explains the likely cause with evidence, and restores the previous configuration once you approve.
      </p>

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="rounded-lg border border-line-strong bg-surface focus-within:border-accent/60">
          <label htmlFor="incident" className="sr-only">
            Describe the incident
          </label>
          <textarea
            id="incident"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setScenario(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            rows={3}
            maxLength={1000}
            placeholder="Our beta users suddenly cannot access the new checkout feature."
            className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] leading-relaxed text-fg placeholder:text-faint focus:outline-none"
          />
          <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2">
            <span className="text-xs text-faint">
              {mode === "demo" ? (
                <span className="inline-flex items-center gap-1.5">
                  <FlaskConical size={12} className="text-accent" /> Runs against demo fixtures
                </span>
              ) : (
                "Runs against your connected Flagsmith environment"
              )}
            </span>
            <Button type="submit" variant="primary" disabled={!canSubmit}>
              <Search size={15} /> Investigate incident
            </Button>
          </div>
        </div>
      </form>

      {liveBlocked && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-warn/25 bg-warn-soft px-3 py-2 text-sm text-warn">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          <div>
            Live mode needs server credentials: {missing.join(", ")}.{" "}
            <button onClick={onOpenSettings} className="underline underline-offset-2">
              Open settings
            </button>{" "}
            or switch to Demo.
          </div>
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-md border border-bad/25 bg-bad-soft px-3 py-2 text-sm text-bad">{error.message}</div>
      )}

      <div className="mt-6">
        <p className="mb-2 text-xs text-faint">{mode === "demo" ? "Try a seeded incident" : "Examples"}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.scenario}
              onClick={() => {
                setText(ex.incident);
                setScenario(ex.scenario);
                if (mode === "demo") onInvestigate(ex.incident, ex.scenario);
              }}
              className={cx(
                "group flex items-start justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-left text-sm text-muted transition-colors hover:border-line-strong hover:text-fg",
              )}
            >
              <span>{ex.label}</span>
              <ArrowRight size={14} className="mt-0.5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10">
        <div className="mb-2 flex items-center gap-2 text-xs text-faint">
          <Clock size={12} /> Recent investigations
          <Badge tone="outline">{mode}</Badge>
        </div>
        {recent.length === 0 ? (
          <p className="rounded-md border border-dashed border-line px-3 py-4 text-sm text-faint">No investigations yet in {mode} mode.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {recent.map((r) => (
              <li key={r.id}>
                <button onClick={() => onOpenRecent(r.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-fg">{r.incident}</span>
                    <span className="block text-xs text-faint">
                      {r.environmentName}
                      {r.affectedFeature ? ` / ${r.affectedFeature}` : ""} / {fmtTime(r.createdAt)}
                    </span>
                  </span>
                  <StatusBadge status={r.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "ok" | "accent" | "bad" | "neutral" | "warn"; label: string }> = {
    recovered: { tone: "ok", label: "Recovered" },
    report_ready: { tone: "accent", label: "Report ready" },
    investigating: { tone: "neutral", label: "Investigating" },
    recovery_failed: { tone: "bad", label: "Recovery failed" },
    failed: { tone: "bad", label: "Failed" },
  };
  const m = map[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
