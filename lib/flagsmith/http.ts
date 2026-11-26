import { FlagsmithApiError } from "../errors";

export interface HttpConfig {
  apiUrl: string;
  token: string;
  timeoutMs: number;
  cacheTtlMs: number;
  fetchImpl?: typeof fetch;
  /** Base delay for retry backoff; tests set this to 0. */
  retryBaseMs?: number;
}

interface RequestOptions {
  method?: "GET" | "PATCH" | "PUT" | "POST";
  body?: unknown;
  /** false = bypass cache (used for verification and drift checks). */
  cache?: boolean;
  query?: Record<string, string | number | undefined>;
}

const MAX_RETRIES = 2;
const MAX_PAGES = 50;

/**
 * Thin Flagsmith Management API transport: Api-Key auth, timeouts,
 * retries for transient failures (GET only, plus 429 for writes),
 * TTL cache and in-flight de-duplication for reads, and pagination.
 */
export class FlagsmithHttp {
  private cache = new Map<string, { expires: number; value: unknown }>();
  private inflight = new Map<string, Promise<unknown>>();
  private fetchImpl: typeof fetch;

  constructor(private cfg: HttpConfig) {
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  get origin(): string {
    return new URL(this.cfg.apiUrl).origin;
  }

  url(path: string, query?: RequestOptions["query"]): string {
    const u = path.startsWith("http") ? new URL(path) : new URL(`${this.cfg.apiUrl}/api/v1${path}`);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) u.searchParams.set(k, String(v));
    return u.toString();
  }

  invalidate(): void {
    this.cache.clear();
  }

  async request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    const method = opts.method ?? "GET";
    const url = this.url(path, opts.query);
    if (new URL(url).origin !== this.origin) {
      throw new FlagsmithApiError("bad_response", "Refusing to follow a URL outside the configured Flagsmith host", null, path);
    }
    const useCache = method === "GET" && opts.cache !== false;
    const key = `${method} ${url}`;

    if (useCache) {
      const hit = this.cache.get(key);
      if (hit && hit.expires > Date.now()) return hit.value as T;
    }
    if (method === "GET") {
      const pending = this.inflight.get(key);
      if (pending) return pending as Promise<T>;
    }

    const run = this.execute<T>(url, path, method, opts.body).then((value) => {
      if (method === "GET") this.cache.set(key, { expires: Date.now() + this.cfg.cacheTtlMs, value });
      else this.cache.clear();
      return value;
    });

    if (method === "GET") {
      this.inflight.set(key, run);
      run.finally(() => this.inflight.delete(key)).catch(() => undefined);
    }
    return run;
  }

  private async execute<T>(url: string, path: string, method: string, body: unknown): Promise<T> {
    let attempt = 0;
    const base = this.cfg.retryBaseMs ?? 300;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers: {
            Authorization: `Api-Key ${this.cfg.token}`,
            Accept: "application/json",
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
          cache: "no-store",
        });
      } catch (err) {
        clearTimeout(timer);
        const timedOut = (err as Error)?.name === "AbortError";
        if (method === "GET" && attempt < MAX_RETRIES) {
          attempt++;
          await sleep(base * 2 ** attempt);
          continue;
        }
        throw new FlagsmithApiError(
          timedOut ? "timeout" : "network",
          timedOut
            ? `Flagsmith did not respond within ${this.cfg.timeoutMs} ms (${method} ${path})`
            : `Could not reach Flagsmith at ${this.origin}: ${(err as Error)?.message ?? "network error"}`,
          null,
          path,
        );
      }
      clearTimeout(timer);

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        try {
          return (await res.json()) as T;
        } catch {
          throw new FlagsmithApiError("bad_response", `Flagsmith returned a non-JSON response for ${method} ${path}`, res.status, path);
        }
      }

      const transient = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
      const retryable = res.status === 429 || (method === "GET" && transient);
      if (retryable && attempt < MAX_RETRIES) {
        attempt++;
        const retryAfter = Number.parseFloat(res.headers.get("retry-after") ?? "");
        const wait = Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 3000) : base * 2 ** attempt;
        await sleep(wait);
        continue;
      }

      const detail = await safeDetail(res);
      throw mapStatus(res.status, method, path, detail);
    }
  }

  /** Follows DRF-style pagination ({count,next,results}) or returns a plain array. */
  async getAll<T = unknown>(path: string, query?: RequestOptions["query"], cache = true): Promise<T[]> {
    const first = await this.request<unknown>(path, { query: { page_size: 100, ...query }, cache });
    if (Array.isArray(first)) return first as T[];
    if (!isPage(first)) throw new FlagsmithApiError("bad_response", `Unexpected list response shape for ${path}`, 200, path);
    const out: T[] = [...(first.results as T[])];
    let next = first.next;
    let pages = 1;
    while (next && pages < MAX_PAGES) {
      const page = await this.request<unknown>(next, { cache });
      if (!isPage(page)) throw new FlagsmithApiError("bad_response", `Unexpected page shape for ${path}`, 200, path);
      out.push(...(page.results as T[]));
      next = page.next;
      pages++;
    }
    return out;
  }
}

function isPage(v: unknown): v is { results: unknown[]; next: string | null } {
  return !!v && typeof v === "object" && Array.isArray((v as { results?: unknown }).results);
}

async function safeDetail(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === "string") return j.detail;
      return JSON.stringify(j).slice(0, 300);
    } catch {
      return text.slice(0, 200);
    }
  } catch {
    return "";
  }
}

function mapStatus(status: number, method: string, path: string, detail: string): FlagsmithApiError {
  const suffix = detail ? ` Flagsmith said: ${detail}` : "";
  switch (status) {
    case 401:
      return new FlagsmithApiError("unauthorized", `Flagsmith rejected the API token (401). Check FLAGSMITH_API_TOKEN is an Organisation API key.${suffix}`, status, path);
    case 403:
      return new FlagsmithApiError("forbidden", `The API token lacks permission for ${method} ${path} (403).${suffix}`, status, path);
    case 404:
      return new FlagsmithApiError("not_found", `Flagsmith resource not found: ${path} (404). Check the project and environment IDs.${suffix}`, status, path);
    case 429:
      return new FlagsmithApiError("rate_limited", `Flagsmith rate limit reached (429). Try again shortly.${suffix}`, status, path);
    case 400:
      return new FlagsmithApiError("validation", `Flagsmith rejected the request (400).${suffix}`, status, path);
    default:
      return new FlagsmithApiError("server", `Flagsmith returned HTTP ${status} for ${method} ${path}.${suffix}`, status, path);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
