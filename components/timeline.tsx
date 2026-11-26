"use client";

import { useState } from "react";
import { ChevronRight, History } from "lucide-react";
import type { HistoryEvent } from "@/lib/types";
import { Badge, Section, cx, fmtUtc, fmtValue } from "./ui";
import { sourceLabel } from "./changes";
import type { InvestigationView } from "./types";

export function Timeline({ inv, rootCauseId }: { inv: InvestigationView; rootCauseId: string | null }) {
  const events = [...inv.timeline].reverse();
  return (
    <Section label="C" title="Change timeline" icon={<History size={14} />} right={<span className="text-xs text-faint">{events.length} events</span>}>
      {!inv.audit.available && inv.audit.reason && (
        <p className="mb-3 rounded-md border border-warn/20 bg-warn-soft px-2.5 py-2 text-xs text-warn">{inv.audit.reason}</p>
      )}
      {events.length === 0 ? (
        <p className="text-sm text-muted">No history events were available for this environment.</p>
      ) : (
        <ol className="relative space-y-0.5">
          <span className="absolute top-2 bottom-2 left-[5px] w-px bg-line" aria-hidden />
          {events.map((e) => (
            <TimelineItem key={e.id} e={e} isRoot={!!rootCauseId && e.relatedChangeIds.includes(rootCauseId)} />
          ))}
        </ol>
      )}
    </Section>
  );
}

function TimelineItem({ e, isRoot }: { e: HistoryEvent; isRoot: boolean }) {
  const [open, setOpen] = useState(isRoot);
  return (
    <li className="relative pl-5">
      <span
        className={cx(
          "absolute top-[9px] left-0 h-[11px] w-[11px] rounded-full border-2 border-bg",
          isRoot ? "bg-accent" : e.relevant ? "bg-muted" : "bg-line-strong",
        )}
      />
      <button onClick={() => setOpen((o) => !o)} className={cx("w-full rounded-md px-2 py-1.5 text-left hover:bg-surface-2", isRoot && "bg-accent-soft/50")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={cx("text-[13px] leading-snug", e.relevant ? "text-fg" : "text-muted")}>{e.title}</p>
            <p className="mt-0.5 font-mono text-[11px] text-faint">
              {e.windowStart ? `between ${fmtUtc(e.windowStart)} and ${fmtUtc(e.timestamp)}` : fmtUtc(e.timestamp)}
            </p>
          </div>
          <ChevronRight size={13} className={cx("mt-1 shrink-0 text-faint transition-transform", open && "rotate-90")} />
        </div>
      </button>
      {open && (
        <div className="mb-2 ml-2 space-y-1.5 rounded-md border border-line bg-surface-2 p-2.5 text-xs">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={e.source === "demo_fixture" ? "accent" : "outline"}>{sourceLabel(e.source)}</Badge>
            {isRoot && <Badge tone="accent">Linked to suspected cause</Badge>}
            {e.objectType && <Badge tone="neutral">{e.objectType}</Badge>}
          </div>
          <p className="text-muted">Author: {e.actor ?? <span className="text-faint">not recorded</span>}</p>
          {e.details.length > 0 ? (
            <ul className="space-y-1 font-mono text-[11px]">
              {e.details.map((d, i) => (
                <li key={i} className="text-muted">
                  <span className="text-faint">{d.field}</span>
                  {e.source !== "flagreplay_snapshot" && (
                    <>
                      : <span className="text-bad">{fmtValue(d.old)}</span> <span className="text-faint">to</span> <span className="text-ok">{fmtValue(d.new)}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-faint">No field-level details were provided by the source.</p>
          )}
          <p className="font-mono text-[10px] text-faint">{e.id}</p>
        </div>
      )}
    </li>
  );
}
