"use client";

import type { ConditionDiff, NormalizedCondition, NormalizedRule } from "@/lib/types";
import { cx } from "./ui";

export function conditionLabel(c: NormalizedCondition | null) {
  if (!c) return "";
  return `${c.property || "(identity)"} ${c.operator} ${c.value ?? ""}`.trim();
}

/** Compact, readable rendering of a Flagsmith segment rule tree. */
export function RuleTree({ rules, highlight, tone }: { rules: NormalizedRule[]; highlight?: Set<string>; tone?: "before" | "after" }) {
  if (rules.length === 0) return <span className="text-faint">no rules</span>;
  return (
    <div className="space-y-1 font-mono text-[12px]">
      {rules.map((r, i) => (
        <RuleNode key={i} rule={r} path={`${r.type}[${i}]`} depth={0} highlight={highlight} tone={tone} />
      ))}
    </div>
  );
}

function RuleNode({ rule, path, depth, highlight, tone }: { rule: NormalizedRule; path: string; depth: number; highlight?: Set<string>; tone?: "before" | "after" }) {
  return (
    <div style={{ paddingLeft: depth ? 12 : 0 }} className={depth ? "border-l border-line" : undefined}>
      <div className="text-faint">{rule.type === "ALL" ? "all of" : rule.type === "ANY" ? "any of" : "none of"}</div>
      {rule.conditions.map((c, j) => {
        const p = `${path}.condition[${j}]`;
        const hit = highlight?.has(p);
        return (
          <div
            key={j}
            className={cx(
              "ml-3 rounded-sm px-1",
              hit && tone === "before" && "bg-bad-soft text-bad line-through decoration-bad/50",
              hit && tone === "after" && "bg-ok-soft text-ok",
              !hit && "text-muted",
            )}
          >
            {conditionLabel(c)}
          </div>
        );
      })}
      {rule.rules.map((r, k) => (
        <div key={k} className="ml-3">
          <RuleNode rule={r} path={`${path}/${r.type}[${k}]`} depth={depth + 1} highlight={highlight} tone={tone} />
        </div>
      ))}
    </div>
  );
}

export function highlightSets(diffs: ConditionDiff[] | undefined) {
  const before = new Set<string>();
  const after = new Set<string>();
  for (const d of diffs ?? []) {
    if (d.status !== "added") before.add(d.path);
    if (d.status !== "removed") after.add(d.path);
  }
  return { before, after };
}
