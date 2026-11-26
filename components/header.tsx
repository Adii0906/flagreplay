"use client";

import { Settings } from "lucide-react";
import { Logo, cx } from "./ui";
import type { ConnState, Mode } from "./types";

export function Header({
  mode,
  conn,
  loading,
  running,
  onMode,
  onSettings,
  onHome,
}: {
  mode: Mode;
  conn: ConnState | null;
  loading: boolean;
  running: boolean;
  onMode: (m: Mode) => void;
  onSettings: () => void;
  onHome: () => void;
}) {
  const c = conn?.connection;
  let dot = "bg-faint";
  let status = "Checking";
  if (!loading) {
    if (mode === "demo") {
      dot = "bg-accent";
      status = "Demo data";
    } else if (!conn?.config.liveConfigured) {
      dot = "bg-warn";
      status = "Not configured";
    } else if (c?.ok) {
      dot = "bg-ok";
      status = "Live";
    } else {
      dot = "bg-bad";
      status = "Connection failed";
    }
  }
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <button onClick={onHome} className="flex items-center gap-2.5" aria-label="FlagReplay home">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">FlagReplay</span>
        </button>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="hidden min-w-0 items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1 text-xs md:flex" title={c?.message ?? undefined}>
            <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", dot, loading && "fr-pulse")} />
            <span className="text-muted">{status}</span>
            {c?.ok && (
              <>
                <span className="text-faint">/</span>
                <span className="truncate text-fg">{c.projectName}</span>
                <span className="text-faint">/</span>
                <span className="truncate text-fg">{c.environmentName}</span>
              </>
            )}
          </div>

          <div role="radiogroup" aria-label="Data mode" className="flex rounded-md border border-line bg-surface p-0.5 text-xs">
            {(["demo", "live"] as Mode[]).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                disabled={running}
                onClick={() => onMode(m)}
                className={cx(
                  "rounded-[4px] px-2.5 py-1 font-medium capitalize transition-colors disabled:cursor-not-allowed",
                  mode === m ? (m === "demo" ? "bg-accent-soft text-accent" : "bg-surface-3 text-fg") : "text-faint hover:text-muted",
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <button onClick={onSettings} className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg" aria-label="Connection settings">
            <Settings size={17} />
          </button>
        </div>
      </div>
      {mode === "demo" && (
        <div className="border-t border-accent/15 bg-accent-soft/40">
          <p className="mx-auto max-w-6xl px-4 py-1 text-[11px] text-accent/90 sm:px-6">
            Demo mode: deterministic sample incidents and a simulated Flagsmith environment. No real project is read or changed.
          </p>
        </div>
      )}
    </header>
  );
}
