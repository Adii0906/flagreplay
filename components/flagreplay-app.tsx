"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Header } from "./header";
import { Home } from "./home";
import { Workspace } from "./workspace";
import { SettingsDrawer } from "./settings";
import { STAGE_LABELS, type ConnState, type InvestigationSummary, type InvestigationView, type Mode, type ReportState, type StageView } from "./types";
import type { PipelineEvent } from "@/lib/investigation/types";

const initialStages = (): StageView[] =>
  (Object.keys(STAGE_LABELS) as (keyof typeof STAGE_LABELS)[]).map((id) => ({ id, label: STAGE_LABELS[id], status: "pending" }));

export function FlagReplayApp() {
  const [mode, setMode] = useState<Mode>("demo");
  const [conn, setConn] = useState<ConnState | null>(null);
  const [connLoading, setConnLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recent, setRecent] = useState<InvestigationSummary[]>([]);

  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<StageView[]>(initialStages());
  const [investigation, setInvestigation] = useState<InvestigationView | null>(null);
  const [incidentText, setIncidentText] = useState<string>("");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [view, setView] = useState<"home" | "workspace">("home");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("flagreplay.mode");
      if (saved === "live" || saved === "demo") setMode(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const loadConnection = useCallback(async (m: Mode) => {
    setConnLoading(true);
    try {
      const res = await fetch(`/api/connection?mode=${m}`, { cache: "no-store" });
      setConn(await res.json());
    } catch {
      setConn(null);
    } finally {
      setConnLoading(false);
    }
  }, []);

  const loadRecent = useCallback(async (m: Mode) => {
    try {
      const res = await fetch(`/api/investigations?mode=${m}`, { cache: "no-store" });
      const j = await res.json();
      setRecent(j.investigations ?? []);
    } catch {
      setRecent([]);
    }
  }, []);

  useEffect(() => {
    loadConnection(mode);
    loadRecent(mode);
  }, [mode, loadConnection, loadRecent]);

  const switchMode = (m: Mode) => {
    if (running) return;
    setMode(m);
    setView("home");
    setInvestigation(null);
    setError(null);
    try {
      localStorage.setItem("flagreplay.mode", m);
    } catch {
      /* ignore */
    }
  };

  const investigate = async (incident: string, scenario?: string | null) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setInvestigation(null);
    setIncidentText(incident);
    setStages(initialStages());
    setView("workspace");

    const update = (e: Extract<PipelineEvent, { type: "stage" }>) =>
      setStages((prev) =>
        prev.map((s) =>
          s.id === e.stage
            ? {
                ...s,
                status: e.status,
                detail: e.detail ?? s.detail,
                startedAt: e.status === "running" ? Date.now() : s.startedAt,
                endedAt: e.status !== "running" ? Date.now() : undefined,
              }
            : s,
        ),
      );

    try {
      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident, mode, scenario: mode === "demo" ? scenario ?? null : null }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw Object.assign(new Error(j?.error?.message ?? `Request failed (${res.status})`), { code: j?.error?.code ?? "server" });
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as PipelineEvent;
          if (ev.type === "stage") update(ev);
          else if (ev.type === "evidence") setInvestigation(ev.investigation);
          else if (ev.type === "report")
            setInvestigation((prev) => (prev ? { ...prev, report: ev.report as ReportState, status: ev.status } : prev));
          else if (ev.type === "error") {
            setError(ev.error);
            setStages((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "error", endedAt: Date.now() } : s)));
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError({ code: (err as { code?: string }).code ?? "server", message: (err as Error).message });
        setStages((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "error" } : s)));
      }
    } finally {
      setRunning(false);
      loadRecent(mode);
    }
  };

  const openRecent = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/investigations/${id}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error?.message ?? "Could not load investigation");
      const inv = j.investigation as InvestigationView;
      setInvestigation(inv);
      setIncidentText(inv.incident);
      setStages(initialStages().map((s) => ({ ...s, status: "done", detail: undefined })));
      setView("workspace");
    } catch (err) {
      setError({ code: "server", message: (err as Error).message });
    }
  };

  const liveBlocked = mode === "live" && conn != null && !conn.config.liveConfigured;

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        mode={mode}
        conn={conn}
        loading={connLoading}
        running={running}
        onMode={switchMode}
        onSettings={() => setSettingsOpen(true)}
        onHome={() => !running && setView("home")}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">
        <AnimatePresence mode="wait" initial={false}>
          {view === "home" ? (
            <motion.div key="home" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
              <Home
                mode={mode}
                liveBlocked={liveBlocked}
                missing={conn?.config.missing ?? []}
                recent={recent}
                onInvestigate={investigate}
                onOpenRecent={openRecent}
                onOpenSettings={() => setSettingsOpen(true)}
                error={error}
              />
            </motion.div>
          ) : (
            <motion.div key="ws" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              <Workspace
                mode={mode}
                incident={incidentText}
                stages={stages}
                running={running}
                investigation={investigation}
                error={error}
                onBack={() => setView("home")}
                onRerun={() => investigate(incidentText, investigation?.scenarioId ?? null)}
                onUpdate={setInvestigation}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <footer className="border-t border-line py-4 text-center text-xs text-faint">
        FlagReplay reads and writes Flagsmith only through the server. Credentials never reach the browser.
      </footer>
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        mode={mode}
        conn={conn}
        loading={connLoading}
        onRefresh={() => loadConnection(mode)}
      />
    </div>
  );
}
