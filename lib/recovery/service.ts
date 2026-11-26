import "server-only";
import { randomUUID } from "node:crypto";
import { AppError } from "../errors";
import type { ConfigSource } from "../source";
import { recordSnapshot } from "../snapshot/service";
import { getInvestigation, saveInvestigation } from "../investigation/store";
import type { RecoveryRecord } from "../investigation/types";
import { LiveFlagsmithSource } from "../flagsmith/client";
import { detectDrift, verifyRecovery } from "./verify";

export interface ApplyInput {
  investigationId: string;
  actionId: string;
  confirm: boolean;
  source: ConfigSource;
}

/**
 * Approved recovery: re-read, drift check, preserve the current state, apply
 * exactly one targeted change, re-read again and verify.
 */
export async function applyRecovery(input: ApplyInput): Promise<RecoveryRecord> {
  if (input.confirm !== true) throw new AppError("validation", "Recovery requires explicit confirmation.", 400);
  const record = getInvestigation(input.investigationId);
  if (!record) throw new AppError("not_found", "Investigation not found", 404);
  if (record.mode !== input.source.mode) throw new AppError("conflict", `This investigation was run in ${record.mode} mode; switch modes to recover it.`, 409);
  if (input.source.environmentKey() !== record.environmentKey) {
    throw new AppError("conflict", "The connected environment differs from the one investigated. Recovery aborted.", 409);
  }
  const action = record.candidates.find((a) => a.id === input.actionId);
  if (!action) throw new AppError("not_found", "Recovery action not found for this investigation", 404);
  if (!action.available) throw new AppError("recovery_unavailable", action.unavailableReason ?? "This recovery is not available.", 409);
  if (record.recoveries.some((r) => r.actionId === action.id && r.status === "verified")) {
    throw new AppError("conflict", "This recovery was already applied and verified.", 409);
  }

  const base: RecoveryRecord = {
    id: randomUUID(),
    actionId: action.id,
    status: "aborted",
    createdAt: new Date().toISOString(),
    preSnapshotId: null,
    postSnapshotId: null,
    verification: null,
    error: null,
  };

  const persist = (r: RecoveryRecord) => {
    record.recoveries.push(r);
    if (r.status === "verified") record.status = "recovered";
    else if (r.status === "failed") record.status = "recovery_failed";
    saveInvestigation(record);
    return r;
  };

  // 1. Fresh read + drift detection
  const before = await input.source.fetchConfig({ fresh: true });
  const drift = detectDrift(action, before);
  if (drift.drifted) return persist({ ...base, status: "aborted", error: drift.message });

  // 2. Preserve current configuration
  const pre = recordSnapshot(record.environmentKey, before, "pre_recovery").snapshot;

  // 3. Apply exactly one targeted change
  try {
    await input.source.applyAction(action, before);
  } catch (err) {
    return persist({ ...base, status: "failed", preSnapshotId: pre.id, error: `Flagsmith rejected the change: ${err instanceof Error ? err.message : "unknown error"}` });
  }

  // 4. Re-read and verify
  if (input.source instanceof LiveFlagsmithSource) input.source.http.invalidate();
  let after;
  try {
    after = await input.source.fetchConfig({ fresh: true });
  } catch (err) {
    return persist({
      ...base,
      status: "failed",
      preSnapshotId: pre.id,
      error: `The change was sent but the configuration could not be re-read for verification: ${err instanceof Error ? err.message : "unknown"}. Check Flagsmith directly.`,
    });
  }
  const post = recordSnapshot(record.environmentKey, after, "post_recovery").snapshot;
  const verification = verifyRecovery(action, before, after);
  return persist({
    ...base,
    status: verification.status === "verified" ? "verified" : "failed",
    preSnapshotId: pre.id,
    postSnapshotId: post.id,
    verification,
    error: verification.status === "verified" ? null : verification.message,
  });
}
