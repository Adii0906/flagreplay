import { AppError } from "../errors";
import type { LlmEnv } from "../env";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmProvider {
  name: string;
  model: string;
  completeJson(messages: ChatMessage[]): Promise<unknown>;
}

/** Any OpenAI-compatible chat completions endpoint (Groq, OpenAI, OpenRouter, Gemini compat, local). */
export function openAiCompatible(cfg: LlmEnv, fetchImpl: typeof fetch = fetch): LlmProvider {
  return {
    name: cfg.provider,
    model: cfg.model,
    async completeJson(messages) {
      if (!cfg.apiKey) throw new AppError("not_configured", "LLM_API_KEY is not set.", 400);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: cfg.model,
            messages,
            temperature: 0.1,
            max_tokens: 1800,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });
      } catch (err) {
        throw new AppError(
          "llm_error",
          (err as Error)?.name === "AbortError" ? `AI provider timed out after ${cfg.timeoutMs} ms` : `Could not reach AI provider: ${(err as Error)?.message}`,
          502,
        );
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        const text = (await res.text().catch(() => "")).slice(0, 300);
        throw new AppError("llm_error", `AI provider returned HTTP ${res.status}${res.status === 401 ? " (check LLM_API_KEY)" : ""}: ${text}`, 502);
      }
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new AppError("llm_error", "AI provider returned an empty response", 502);
      try {
        return JSON.parse(extractJson(content));
      } catch {
        throw new AppError("llm_error", "AI provider returned invalid JSON", 502);
      }
    },
  };
}

function extractJson(s: string): string {
  const t = s.trim();
  if (t.startsWith("{")) return t;
  const m = t.match(/\{[\s\S]*\}/);
  return m ? m[0] : t;
}
