import type { AuditAvailability, ConnectionInfo, HistoryEvent, Mode, NormalizedConfig } from "./types";
import type { RecoveryAction } from "./recovery/types";

export type EnvTarget = "primary" | "compare";

/** A source of Flagsmith configuration: the real API (live) or the in-memory simulator (demo). */
export interface ConfigSource {
  mode: Mode;
  environmentKey(target?: EnvTarget): string;
  connection(): Promise<ConnectionInfo>;
  fetchConfig(opts?: { fresh?: boolean; target?: EnvTarget }): Promise<NormalizedConfig>;
  fetchHistory(config: NormalizedConfig): Promise<{ events: HistoryEvent[]; availability: AuditAvailability }>;
  applyAction(action: RecoveryAction, config: NormalizedConfig): Promise<void>;
  hasCompareEnvironment(): boolean;
}
