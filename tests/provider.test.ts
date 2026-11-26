import { describe, expect, it } from "vitest";
import { openAiCompatible } from "@/lib/agent/provider";

const cfg = { provider: "groq", apiKey: "k", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", timeoutMs: 1000 };

describe("OpenAI-compatible provider", () => {
  it("requests JSON mode and parses the content", async () => {
    let sent: { url: string; body: Record<string, unknown>; auth: string } | null = null;
    const p = openAiCompatible(cfg, (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).Authorization };
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
    }) as unknown as typeof fetch);
    expect(await p.completeJson([{ role: "user", content: "json please" }])).toEqual({ ok: true });
    expect(sent!.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(sent!.auth).toBe("Bearer k");
    expect(sent!.body.response_format).toEqual({ type: "json_object" });
    expect(sent!.body.model).toBe("openai/gpt-oss-120b");
  });

  it("surfaces auth errors and invalid JSON clearly", async () => {
    const unauthorized = openAiCompatible(cfg, (async () => new Response("bad key", { status: 401 })) as unknown as typeof fetch);
    await expect(unauthorized.completeJson([])).rejects.toThrow(/401.*LLM_API_KEY/);
    const junk = openAiCompatible(cfg, (async () => new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }))) as unknown as typeof fetch);
    await expect(junk.completeJson([])).rejects.toThrow(/invalid JSON/);
  });

  it("refuses to run without a key", async () => {
    await expect(openAiCompatible({ ...cfg, apiKey: null }).completeJson([])).rejects.toThrow(/LLM_API_KEY/);
  });
});
