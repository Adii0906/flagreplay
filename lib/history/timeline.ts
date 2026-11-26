import type { ConfigChange, HistoryEvent, Snapshot } from "../types";
import { compareConfigs } from "../diff/compare";

const STOP = new Set(["the", "a", "an", "our", "we", "to", "of", "and", "or", "in", "on", "for", "is", "are", "was", "were", "can", "cannot", "not", "new", "suddenly", "users", "user", "this", "that", "it", "be", "have", "has", "with", "at", "from", "but", "my", "all", "some"]);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function stem(t: string): string {
  return t.replace(/(ing|ed|es|s)$/, "");
}

/** Deterministic relevance scoring of detected changes against the incident text. */
export function scoreChanges(incident: string, changes: ConfigChange[]): ConfigChange[] {
  const inc = new Set(tokens(incident).map(stem));
  const mentionsDisable = /(disabl|turned off|switched off|disappear|missing|gone|cannot|can't|lost|broke)/i.test(incident);
  return changes
    .map((c) => {
      const names = [c.featureName ?? "", c.segmentName ?? "", ...c.affectedFeatures].join(" ");
      const matched = [...new Set(tokens(names).map(stem).filter((t) => inc.has(t)))];
      let score = matched.length * 2;
      if (mentionsDisable && (c.kind === "feature_enabled" || c.kind === "override_enabled") && c.after === false) score += 2;
      if (mentionsDisable && (c.kind === "segment_rules" || c.kind === "override_removed" || c.kind === "segment_removed") && matched.length > 0) score += 1;
      return { ...c, relevance: score, matchedTerms: matched };
    })
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0) || a.id.localeCompare(b.id));
}

function mentions(text: string, name: string | null): boolean {
  if (!name) return false;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zA-Z0-9_])${esc}([^a-zA-Z0-9_]|$)`).test(text);
}

/** Links native history events to detected changes by the object names they mention. */
export function linkEvents(events: HistoryEvent[], changes: ConfigChange[]): HistoryEvent[] {
  return events.map((e) => {
    const hay = `${e.title} ${e.details.map((d) => d.field).join(" ")}`;
    const related = changes
      .filter((c) => {
        if (c.kind.startsWith("segment")) return mentions(hay, c.segmentName) && (e.objectType ?? "SEGMENT") === "SEGMENT";
        return mentions(hay, c.featureName) && e.objectType !== "SEGMENT";
      })
      .map((c) => c.id);
    return { ...e, relatedChangeIds: related, relevant: related.length > 0 };
  });
}

/** Events derived from consecutive FlagReplay snapshots. Exact time is unknown: only the window. */
export function snapshotEvents(snapshots: Snapshot[], netChanges: ConfigChange[]): HistoryEvent[] {
  const ids = new Set(netChanges.map((c) => c.id));
  const out: HistoryEvent[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const cur = snapshots[i];
    if (prev.hash === cur.hash) continue;
    const diff = compareConfigs(prev.config, cur.config);
    if (diff.length === 0) continue;
    out.push({
      id: `snap:${cur.id}`,
      timestamp: cur.capturedAt,
      windowStart: prev.capturedAt,
      source: "flagreplay_snapshot",
      title: `Snapshot detected ${diff.length} change${diff.length === 1 ? "" : "s"}`,
      actor: null,
      objectType: null,
      objectId: null,
      details: diff.map((d) => ({ field: d.summary, old: d.before, new: d.after })),
      relatedChangeIds: diff.map((d) => d.id).filter((id) => ids.has(id)),
      relevant: diff.some((d) => ids.has(d.id)),
    });
  }
  return out;
}

export function sortTimeline(events: HistoryEvent[]): HistoryEvent[] {
  return [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
