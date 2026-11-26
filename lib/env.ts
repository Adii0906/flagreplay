import "server-only";

export interface FlagsmithEnv {
  apiUrl: string;
  token: string;
  projectId: number;
  environment: string;
  compareEnvironment: string | null;
  webhookSecret: string | null;
  timeoutMs: number;
  cacheTtlMs: number;
}

export interface LlmEnv {
  provider: string;
  apiKey: string | null;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash" },
};

function str(name: string): string {
  return (process.env[name] ?? "").trim();
}

function int(name: string, fallback: number): number {
  const v = Number.parseInt(str(name), 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Returns which live-mode variables are missing (names only, never values). */
export function missingFlagsmithVars(): string[] {
  return ["FLAGSMITH_API_TOKEN", "FLAGSMITH_PROJECT_ID", "FLAGSMITH_ENVIRONMENT_ID"].filter((k) => !str(k));
}

export function flagsmithEnv(): FlagsmithEnv | null {
  if (missingFlagsmithVars().length > 0) return null;
  const projectId = Number.parseInt(str("FLAGSMITH_PROJECT_ID"), 10);
  if (!Number.isFinite(projectId)) return null;
  return {
    apiUrl: (str("FLAGSMITH_API_URL") || "https://api.flagsmith.com").replace(/\/+$/, "").replace(/\/api\/v1$/, ""),
    token: str("FLAGSMITH_API_TOKEN"),
    projectId,
    environment: str("FLAGSMITH_ENVIRONMENT_ID"),
    compareEnvironment: str("FLAGSMITH_COMPARE_ENVIRONMENT_ID") || null,
    webhookSecret: str("FLAGSMITH_WEBHOOK_SECRET") || null,
    timeoutMs: int("FLAGSMITH_TIMEOUT_MS", 8000),
    cacheTtlMs: int("FLAGSMITH_CACHE_TTL_MS", 15000),
  };
}

export function llmEnv(): LlmEnv {
  const provider = (str("LLM_PROVIDER") || "groq").toLowerCase();
  const defaults = PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS.groq;
  const apiKey = str("LLM_API_KEY") || str("GROQ_API_KEY") || null;
  return {
    provider,
    apiKey,
    baseUrl: (str("LLM_BASE_URL") || defaults.baseUrl).replace(/\/+$/, ""),
    model: str("LLM_MODEL") || defaults.model,
    timeoutMs: int("LLM_TIMEOUT_MS", 20000),
  };
}

export function dbPath(): string {
  return str("FLAGREPLAY_DB_PATH") || "./data/flagreplay.db";
}
