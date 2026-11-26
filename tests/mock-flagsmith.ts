/**
 * Minimal in-process mock of the Flagsmith Management API endpoints FlagReplay
 * uses, shaped after the Flagsmith serializers. Used by tests and by
 * scripts/mock-flagsmith-server.ts for local end-to-end runs.
 */
export interface MockState {
  project: { id: number; name: string };
  environments: { id: number; name: string; api_key: string; project: number; use_v2_feature_versioning: boolean }[];
  features: { id: number; name: string; type: string }[];
  featureStates: {
    id: number;
    feature: number;
    environment: number;
    feature_segment: number | null;
    identity: number | null;
    enabled: boolean;
    feature_state_value: { type: string; string_value: string | null; integer_value: number | null; boolean_value: boolean | null };
  }[];
  featureSegments: { id: number; feature: number; segment: number; environment: number; priority: number }[];
  segments: { id: number; name: string; project: number; rules: unknown[] }[];
  audit: { id: number; created_date: string; log: string; author: { email: string } | null; environment: { id: number; name: string } | null; related_object_type: string; related_object_id: number | null }[];
  auditForbidden?: boolean;
  requests: { method: string; path: string; body: unknown }[];
}

export function seedState(): MockState {
  const sv = (s: string | null) => ({ type: "unicode", string_value: s, integer_value: null, boolean_value: null });
  return {
    project: { id: 1, name: "Mock Project" },
    environments: [
      { id: 10, name: "Production", api_key: "prodKey123", project: 1, use_v2_feature_versioning: false },
      { id: 11, name: "Staging", api_key: "stgKey456", project: 1, use_v2_feature_versioning: false },
    ],
    features: [
      { id: 100, name: "new_checkout", type: "STANDARD" },
      { id: 101, name: "banner_text", type: "STANDARD" },
    ],
    featureStates: [
      { id: 1000, feature: 100, environment: 10, feature_segment: null, identity: null, enabled: false, feature_state_value: sv(null) },
      { id: 1001, feature: 100, environment: 10, feature_segment: 500, identity: null, enabled: true, feature_state_value: sv(null) },
      { id: 1002, feature: 101, environment: 10, feature_segment: null, identity: null, enabled: true, feature_state_value: sv("hello") },
      { id: 1003, feature: 101, environment: 10, feature_segment: null, identity: 77, enabled: false, feature_state_value: sv("identity override") },
    ],
    featureSegments: [{ id: 500, feature: 100, segment: 900, environment: 10, priority: 0 }],
    segments: [
      {
        id: 900,
        name: "beta_users",
        project: 1,
        rules: [{ type: "ALL", rules: [{ type: "ANY", rules: [], conditions: [{ operator: "IN", property: "cohort", value: "beta,early_access" }] }], conditions: [] }],
      },
    ],
    audit: [
      { id: 1, created_date: "2026-11-22T16:47:00Z", log: "Segment updated: beta_users", author: { email: "dev@example.com" }, environment: null, related_object_type: "SEGMENT", related_object_id: 900 },
    ],
    requests: [],
  };
}

const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

export function mockFetch(state: MockState, base = "https://mock.flagsmith.test"): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const p = url.pathname.replace(/^\/api\/v1/, "");
    state.requests.push({ method, path: p, body });
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    if (auth !== "Api-Key test-token") return json({ detail: "Invalid token." }, 401);
    void base;

    let m: RegExpMatchArray | null;
    if (method === "GET" && p === `/projects/${state.project.id}/`) return json(state.project);
    if (method === "GET" && p === "/environments/") return json(page(state.environments.filter((e) => String(e.project) === url.searchParams.get("project"))));
    if (method === "GET" && (m = p.match(/^\/environments\/([^/]+)\/$/))) {
      const env = state.environments.find((e) => e.api_key === m![1]);
      return env ? json(env) : json({ detail: "Not found." }, 404);
    }
    if (method === "GET" && p === `/projects/${state.project.id}/features/`) return json(page(state.features));
    if (method === "GET" && p === `/projects/${state.project.id}/segments/`) return json(page(state.segments));
    if (method === "GET" && p === "/features/featurestates/") {
      const env = Number(url.searchParams.get("environment"));
      return json(page(state.featureStates.filter((s) => s.environment === env)));
    }
    if (method === "GET" && p === "/features/feature-segments/") {
      const env = Number(url.searchParams.get("environment"));
      const f = Number(url.searchParams.get("feature"));
      return json(page(state.featureSegments.filter((s) => s.environment === env && s.feature === f).map((s) => ({ ...s, segment_name: state.segments.find((x) => x.id === s.segment)?.name }))));
    }
    if (method === "GET" && (m = p.match(/^\/projects\/\d+\/audit\/(\d+\/)?$/))) {
      if (state.auditForbidden) return json({ detail: "You do not have permission to perform this action." }, 403);
      if (m[1]) {
        const a = state.audit.find((x) => x.id === Number(m![1].replace("/", "")));
        return a ? json({ ...a, change_details: [{ field: "rules", old: "beta,early_access", new: "early_access" }], change_type: "UPDATE" }) : json({ detail: "Not found." }, 404);
      }
      return json(page(state.audit));
    }
    if (method === "PATCH" && (m = p.match(/^\/environments\/([^/]+)\/featurestates\/(\d+)\/$/))) {
      const fs = state.featureStates.find((s) => s.id === Number(m![2]) && s.feature_segment === null);
      if (!fs) return json({ detail: "Not found." }, 404);
      if ("enabled" in body) fs.enabled = body.enabled;
      if ("feature_state_value" in body) {
        const v = body.feature_state_value;
        fs.feature_state_value =
          typeof v === "number" ? { type: "int", string_value: null, integer_value: v, boolean_value: null } : typeof v === "boolean" ? { type: "bool", string_value: null, integer_value: null, boolean_value: v } : { type: "unicode", string_value: v, integer_value: null, boolean_value: null };
      }
      return json(fs);
    }
    if (method === "PATCH" && (m = p.match(/^\/features\/featurestates\/(\d+)\/$/))) {
      const fs = state.featureStates.find((s) => s.id === Number(m![1]));
      if (!fs) return json({ detail: "Not found." }, 404);
      if ("enabled" in body) fs.enabled = body.enabled;
      if (body.feature_state_value) fs.feature_state_value = { string_value: null, integer_value: null, boolean_value: null, ...body.feature_state_value };
      return json(fs);
    }
    if (method === "PATCH" && (m = p.match(/^\/projects\/\d+\/segments\/(\d+)\/$/))) {
      const seg = state.segments.find((s) => s.id === Number(m![1]));
      if (!seg) return json({ detail: "Not found." }, 404);
      if (body.rules) seg.rules = body.rules;
      return json(seg);
    }
    return json({ detail: `mock: unhandled ${method} ${p}` }, 404);
  }) as typeof fetch;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
