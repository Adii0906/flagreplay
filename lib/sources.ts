import "server-only";
import { AppError } from "./errors";
import { missingFlagsmithVars } from "./env";
import { getLiveSource } from "./flagsmith/client";
import { DemoSource } from "./demo/simulator";
import { DEMO_SCENARIOS, matchScenario, type DemoScenarioId } from "./demo/fixtures";
import type { ConfigSource } from "./source";
import type { Mode } from "./types";

/** Resolves the source for a request. Live mode never falls back to demo data. */
export function resolveSource(mode: Mode, opts: { scenario?: string | null; incident?: string } = {}): ConfigSource {
  if (mode === "live") {
    const live = getLiveSource();
    if (!live) {
      throw new AppError("not_configured", `Live mode is not configured. Missing: ${missingFlagsmithVars().join(", ")}. See SETUP.md.`, 400);
    }
    return live;
  }
  const id = opts.scenario && opts.scenario in DEMO_SCENARIOS ? (opts.scenario as DemoScenarioId) : matchScenario(opts.incident ?? "");
  return new DemoSource(id);
}
