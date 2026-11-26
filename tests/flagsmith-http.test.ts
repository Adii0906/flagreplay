import { describe, expect, it } from "vitest";
import { FlagsmithHttp } from "@/lib/flagsmith/http";
import { FlagsmithApiError } from "@/lib/errors";

function http(handler: (url: string, init: RequestInit, n: number) => Response | Promise<Response>, timeoutMs = 200) {
  let n = 0;
  const calls: string[] = [];
  const client = new FlagsmithHttp({
    apiUrl: "https://fs.test",
    token: "t",
    timeoutMs,
    cacheTtlMs: 10_000,
    retryBaseMs: 0,
    fetchImpl: (async (u: string, init: RequestInit) => {
      calls.push(`${init.method} ${u}`);
      return handler(u, init, n++);
    }) as unknown as typeof fetch,
  });
  return { client, calls };
}

const json = (d: unknown, s = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...h } });

describe("FlagsmithHttp", () => {
  it("sends the Api-Key header to the v1 API", async () => {
    let auth = "";
    const { client, calls } = http((_u, init) => {
      auth = (init.headers as Record<string, string>).Authorization;
      return json({ id: 1 });
    });
    await client.request("/projects/1/");
    expect(auth).toBe("Api-Key t");
    expect(calls[0]).toBe("GET https://fs.test/api/v1/projects/1/");
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [400, "validation"],
    [500, "server"],
  ])("maps HTTP %i to %s", async (status, code) => {
    const { client } = http(() => json({ detail: "nope" }, status));
    await expect(client.request("/x/")).rejects.toMatchObject({ code });
  });

  it("retries 429 respecting Retry-After, then succeeds", async () => {
    const { client, calls } = http((_u, _i, n) => (n === 0 ? json({}, 429, { "Retry-After": "0" }) : json({ ok: true })));
    expect(await client.request("/x/")).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it("gives up after repeated 503 on GET", async () => {
    const { client, calls } = http(() => json({}, 503));
    await expect(client.request("/x/")).rejects.toBeInstanceOf(FlagsmithApiError);
    expect(calls).toHaveLength(3);
  });

  it("does not retry PATCH on 503", async () => {
    const { client, calls } = http(() => json({}, 503));
    await expect(client.request("/x/", { method: "PATCH", body: {} })).rejects.toMatchObject({ code: "server" });
    expect(calls).toHaveLength(1);
  });

  it("times out slow requests", async () => {
    const { client } = http(
      (_u, init) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
      20,
    );
    await expect(client.request("/slow/", { method: "PATCH", body: {} })).rejects.toMatchObject({ code: "timeout" });
  });

  it("reports network failures", async () => {
    const { client } = http(() => {
      throw new TypeError("fetch failed");
    });
    await expect(client.request("/x/")).rejects.toMatchObject({ code: "network" });
  });

  it("follows pagination and refuses foreign hosts", async () => {
    const { client } = http((u) => {
      if (u.includes("page=2")) return json({ results: [3], next: null });
      return json({ results: [1, 2], next: "https://fs.test/api/v1/items/?page=2" });
    });
    expect(await client.getAll("/items/")).toEqual([1, 2, 3]);

    const evil = http(() => json({ results: [1], next: "https://evil.test/api/v1/items/?page=2" }));
    await expect(evil.client.getAll("/items/")).rejects.toMatchObject({ code: "bad_response" });
  });

  it("caches and de-duplicates concurrent reads, bypassable for verification", async () => {
    const { client, calls } = http(async () => json({ v: 1 }));
    await Promise.all([client.request("/a/"), client.request("/a/"), client.request("/a/")]);
    await client.request("/a/");
    expect(calls).toHaveLength(1);
    await client.request("/a/", { cache: false });
    expect(calls).toHaveLength(2);
  });

  it("rejects non-JSON success responses", async () => {
    const { client } = http(() => new Response("<html>", { status: 200 }));
    await expect(client.request("/x/")).rejects.toMatchObject({ code: "bad_response" });
  });
});
