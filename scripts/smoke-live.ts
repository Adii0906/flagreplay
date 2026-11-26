/**
 * Read-only live smoke test. Uses .env.local credentials, never writes.
 *   npm run smoke:live
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

async function main() {
  const { flagsmithEnv, missingFlagsmithVars, llmEnv } = await import("../lib/env");
  const { LiveFlagsmithSource } = await import("../lib/flagsmith/client");
  const cfg = flagsmithEnv();
  if (!cfg) {
    console.error(`Missing: ${missingFlagsmithVars().join(", ")}. Fill in .env.local (see SETUP.md).`);
    process.exit(1);
  }
  const src = new LiveFlagsmithSource(cfg);
  const t0 = Date.now();
  const conn = await src.connection();
  if (!conn.ok) {
    console.error(`Connection failed: ${conn.message}`);
    process.exit(1);
  }
  console.log(`OK  connected: project "${conn.projectName}" / environment "${conn.environmentName}" (${Date.now() - t0} ms)`);
  console.log(`    audit log: ${conn.auditLog}${conn.versioningV2 ? " / v2 feature versioning ON (feature state writes disabled)" : ""}`);
  const t1 = Date.now();
  const c = await src.fetchConfig({ fresh: true });
  const overrides = c.features.reduce((n, f) => n + f.overrides.length, 0);
  console.log(`OK  config: ${c.features.length} features, ${overrides} segment overrides, ${c.segments.length} segments (${Date.now() - t1} ms)`);
  const h = await src.fetchHistory(c);
  console.log(h.availability.available ? `OK  audit history: ${h.events.length} recent events` : `--  audit history unavailable: ${h.availability.reason}`);
  const llm = llmEnv();
  console.log(llm.apiKey ? `OK  AI provider: ${llm.provider} / ${llm.model}` : "--  LLM_API_KEY not set (AI analysis disabled in live mode)");
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
