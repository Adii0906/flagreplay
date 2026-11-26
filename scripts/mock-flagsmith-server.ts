/**
 * Local mock of the Flagsmith Management API for trying live mode without an
 * account. Not used by the app itself.
 *   npx tsx scripts/mock-flagsmith-server.ts      (listens on :4010)
 * Then set FLAGSMITH_API_URL=http://localhost:4010, FLAGSMITH_API_TOKEN=test-token,
 * FLAGSMITH_PROJECT_ID=1, FLAGSMITH_ENVIRONMENT_ID=10.
 * POST /__break     breaks the beta_users segment (simulates an incident)
 * POST /__tamper    changes the segment again (to test the drift safeguard)
 */
import http from "node:http";
import { mockFetch, seedState } from "../tests/mock-flagsmith";

const state = seedState();
const port = Number(process.env.PORT ?? 4010);
const handler = mockFetch(state);

http
  .createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString() || undefined;
    if (req.url === "/__break" || req.url === "/__tamper") {
      const rule = state.segments[0].rules[0] as { rules: { conditions: { value: string }[] }[] };
      rule.rules[0].conditions[0].value = req.url === "/__break" ? "early_access" : "tampered";
      state.audit.unshift({ id: state.audit.length + 1, created_date: new Date().toISOString(), log: "Segment updated: beta_users", author: { email: "mock@example.com" }, environment: null, related_object_type: "SEGMENT", related_object_id: 900 });
      res.end("ok");
      return;
    }
    const r = await handler(`http://localhost:${port}${req.url}`, {
      method: req.method,
      headers: { Authorization: String(req.headers.authorization ?? "") },
      body,
    });
    res.writeHead(r.status, { "Content-Type": "application/json" });
    res.end(await r.text());
  })
  .listen(port, () => console.log(`Mock Flagsmith API on http://localhost:${port}`));
