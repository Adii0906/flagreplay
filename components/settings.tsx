"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, CheckCircle2, CircleDashed, RefreshCw, X, XCircle } from "lucide-react";
import { Badge, Button, Code, Spinner, cx, fmtUtc } from "./ui";
import type { ConnState, Mode } from "./types";

interface SnapRow {
  id: string;
  capturedAt: string;
  source: string;
  hash: string;
  features: number;
  segments: number;
}

export function SettingsDrawer({
  open,
  onClose,
  mode,
  conn,
  loading,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  conn: ConnState | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [snaps, setSnaps] = useState<SnapRow[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [snapMsg, setSnapMsg] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const loadSnaps = async () => {
    const r = await fetch("/api/snapshots", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    setSnaps(r?.snapshots ?? []);
  };

  useEffect(() => {
    if (open && conn?.config.liveConfigured) loadSnaps();
  }, [open, conn?.config.liveConfigured]);

  const capture = async () => {
    setCapturing(true);
    setSnapMsg(null);
    try {
      const res = await fetch("/api/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "live" }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error?.message ?? "Snapshot failed");
      setSnapMsg(j.created ? "Snapshot captured." : "No changes since the last snapshot; nothing new stored.");
      loadSnaps();
    } catch (err) {
      setSnapMsg((err as Error).message);
    } finally {
      setCapturing(false);
    }
  };

  const c = conn?.connection;
  const cfg = conn?.config;
  const rows: [string, boolean, string?][] = cfg
    ? [
        ["FLAGSMITH_API_TOKEN", !cfg.missing.includes("FLAGSMITH_API_TOKEN")],
        ["FLAGSMITH_PROJECT_ID", !cfg.missing.includes("FLAGSMITH_PROJECT_ID"), cfg.projectId ? String(cfg.projectId) : undefined],
        ["FLAGSMITH_ENVIRONMENT_ID", !cfg.missing.includes("FLAGSMITH_ENVIRONMENT_ID")],
        ["FLAGSMITH_COMPARE_ENVIRONMENT_ID", cfg.compareConfigured, "optional"],
        ["FLAGSMITH_WEBHOOK_SECRET", cfg.webhookSecretConfigured, "optional"],
        ["LLM_API_KEY", cfg.llm.configured, `${cfg.llm.provider} / ${cfg.llm.model}`],
      ]
    : [];

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40 flex justify-end bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.aside
            role="dialog"
            aria-label="Connection settings"
            className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-surface scrollbar-thin"
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="text-sm font-semibold">Connection</h2>
              <button onClick={onClose} className="text-faint hover:text-fg" aria-label="Close settings">
                <X size={17} />
              </button>
            </div>

            <div className="space-y-6 px-5 py-5 text-sm">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-faint uppercase">Status ({mode})</span>
                  <Button variant="ghost" onClick={onRefresh} disabled={loading}>
                    {loading ? <Spinner /> : <RefreshCw size={13} />} Test connection
                  </Button>
                </div>
                {mode === "demo" ? (
                  <p className="text-muted">Demo mode uses fixtures and a simulated environment. Switch to Live in the header to use your Flagsmith project.</p>
                ) : !cfg?.liveConfigured ? (
                  <p className="text-warn">Live mode is not configured. Set the variables below in <Code>.env.local</Code> and restart the server.</p>
                ) : c?.ok ? (
                  <div className="space-y-1.5 rounded-md border border-ok/20 bg-ok-soft/40 p-3">
                    <p className="flex items-center gap-1.5 text-ok">
                      <CheckCircle2 size={14} /> Connected to {cfg.apiUrl}
                    </p>
                    <p className="text-muted">
                      Project <span className="text-fg">{c.projectName}</span> (id {c.projectId}), environment <span className="text-fg">{c.environmentName}</span> (id {c.environmentId})
                    </p>
                    {c.compareEnvironmentName && <p className="text-muted">Comparison environment: {c.compareEnvironmentName}</p>}
                    <p className="text-muted">
                      Audit log: <Badge tone={c.auditLog === "available" ? "ok" : "warn"}>{c.auditLog}</Badge>
                      {c.versioningV2 && (
                        <>
                          {" "}
                          <Badge tone="warn">v2 versioning: feature state writes disabled</Badge>
                        </>
                      )}
                    </p>
                  </div>
                ) : (
                  <p className="flex items-start gap-1.5 rounded-md border border-bad/25 bg-bad-soft p-3 text-bad">
                    <XCircle size={14} className="mt-0.5 shrink-0" /> {c?.message ?? "Connection failed"}
                  </p>
                )}
              </div>

              <div>
                <span className="mb-2 block text-xs text-faint uppercase">Server environment variables</span>
                <ul className="divide-y divide-line rounded-md border border-line">
                  {rows.map(([name, ok, hint]) => (
                    <li key={name} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="flex items-center gap-2 font-mono text-[12px]">
                        {ok ? <CheckCircle2 size={13} className="text-ok" /> : <CircleDashed size={13} className={hint === "optional" ? "text-faint" : "text-warn"} />}
                        {name}
                      </span>
                      <span className={cx("truncate text-xs", ok ? "text-muted" : "text-faint")}>{ok ? hint && hint !== "optional" ? hint : "set" : hint ?? "missing"}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-faint">Values are read on the server and are never sent to the browser. See SETUP.md for where to find each one.</p>
              </div>

              <div>
                <span className="mb-2 block text-xs text-faint uppercase">Webhook (optional)</span>
                <p className="text-muted">
                  Add this URL as a Flagsmith environment webhook to record changes as they happen:
                </p>
                <Code className="mt-1.5 block break-all">{origin}/api/webhooks/flagsmith</Code>
                <p className="mt-1.5 text-xs text-faint">Flagsmith must be able to reach this URL (use a tunnel such as ngrok when running locally).</p>
              </div>

              {mode === "live" && cfg?.liveConfigured && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-faint uppercase">FlagReplay snapshots</span>
                    <Button onClick={capture} disabled={capturing}>
                      {capturing ? <Spinner /> : <Camera size={13} />} Capture now
                    </Button>
                  </div>
                  {snapMsg && <p className="mb-2 text-xs text-muted">{snapMsg}</p>}
                  {snaps.length === 0 ? (
                    <p className="text-xs text-faint">No snapshots yet. Capture one now so future incidents have a baseline.</p>
                  ) : (
                    <ul className="max-h-60 divide-y divide-line overflow-y-auto rounded-md border border-line scrollbar-thin">
                      {snaps.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                          <span className="font-mono text-muted">{fmtUtc(s.capturedAt)}</span>
                          <span className="flex items-center gap-1.5">
                            <Badge tone="outline">{s.source.replace("_", " ")}</Badge>
                            <span className="font-mono text-faint">{s.hash.slice(0, 7)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
