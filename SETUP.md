# FlagReplay setup: Flagsmith + Groq

This guide takes you from a fresh unzip to a live investigation against your own Flagsmith project. Demo mode needs none of it.

## 1. Requirements

- Node.js 20.9 or newer (22 LTS recommended)
- npm
- A Flagsmith account (free tier works) for live mode
- A Groq API key (free) for AI analysis

## 2. Install

```bash
cd flagreplay
npm install
cp .env.example .env.local
```

All secrets go in `.env.local`. That file is read only by the server and is git-ignored. Nothing in it is ever sent to the browser.

## 3. Get your Flagsmith values

Log in at https://app.flagsmith.com.

### FLAGSMITH_API_TOKEN (Organisation API key)

1. Click your organisation name, then **Organisation Settings**.
2. Open the **API Keys** tab.
3. Click **Create API Key**, give it a name like `flagreplay`, and make it an **admin** key (needed to update flags and segments).
4. Copy the key. Flagsmith shows it once.

This is the Management API key (sent as `Authorization: Api-Key <token>`). It is NOT the client-side environment key from the SDK Keys page.

### FLAGSMITH_PROJECT_ID

Open your project. The URL looks like:

```
https://app.flagsmith.com/project/12345/environment/AbCdEf.../features
```

`12345` is the project ID.

### FLAGSMITH_ENVIRONMENT_ID

Use either:
- the environment API key from that URL (the `AbCdEf...` part, also shown under **SDK Keys**), or
- the numeric environment ID.

FlagReplay resolves both and tells you the available environments if it can't find a match.

### Optional values

| Variable | What it does |
| --- | --- |
| `FLAGSMITH_API_URL` | Leave as `https://api.flagsmith.com`. For self-hosted Flagsmith, set your API host (for example `https://flagsmith.mycompany.com`). Don't add `/api/v1`. |
| `FLAGSMITH_COMPARE_ENVIRONMENT_ID` | A second environment (for example Staging) for "staging vs production" investigations. |
| `FLAGSMITH_WEBHOOK_SECRET` | The secret you set on a Flagsmith webhook. Turns on signature verification. |

## 4. Get your Groq key

1. Go to https://console.groq.com/keys and create a key.
2. Put it in `.env.local`:

```env
LLM_PROVIDER=groq
LLM_API_KEY=gsk_...
```

The default model is `openai/gpt-oss-120b`. To use a different one, set `LLM_MODEL`.

Other providers work the same way, since FlagReplay speaks the OpenAI-compatible chat API:

| Provider | `LLM_PROVIDER` | Notes |
| --- | --- | --- |
| Groq | `groq` | default |
| OpenAI | `openai` | |
| OpenRouter | `openrouter` | |
| Google Gemini | `gemini` | uses Gemini's OpenAI-compatible endpoint |
| Anything else | any name | also set `LLM_BASE_URL` and `LLM_MODEL` |

## 5. Your finished `.env.local`

```env
FLAGSMITH_API_URL=https://api.flagsmith.com
FLAGSMITH_API_TOKEN=your_org_api_key
FLAGSMITH_PROJECT_ID=12345
FLAGSMITH_ENVIRONMENT_ID=AbCdEfGhIjKlMn
FLAGSMITH_COMPARE_ENVIRONMENT_ID=
FLAGSMITH_WEBHOOK_SECRET=

LLM_PROVIDER=groq
LLM_API_KEY=gsk_your_key

FLAGREPLAY_DB_PATH=./data/flagreplay.db
```

## 6. Check the connection (read-only)

```bash
npm run smoke:live
```

Expected output:

```
OK  connected: project "My Project" / environment "Development" (420 ms)
    audit log: available
OK  config: 6 features, 2 segment overrides, 3 segments (610 ms)
OK  audit history: 12 recent events
OK  AI provider: groq / openai/gpt-oss-120b
```

This script never writes to Flagsmith. If something is wrong it prints the reason (bad token, wrong project, missing permission and so on).

## 7. Prepare a live incident to match the demo

Use a non-production environment such as Development.

1. **Create a segment** named `beta_users` with one rule: trait `cohort`, operator **In**, value `beta,early_access`.
2. **Create a feature** `new_checkout`, leave it **off** in your environment.
3. On `new_checkout`, open **Segment Overrides**, add `beta_users`, and turn the override **on**.
4. Start FlagReplay (`npm run dev`), open http://localhost:3000, and switch the header toggle to **Live**.
   The first successful live connection stores a baseline snapshot automatically. You can also open Settings (gear icon) and click **Capture now**.
5. Back in Flagsmith, **break it**: edit the `beta_users` rule value to `early_access` (remove `beta`).
6. In FlagReplay, type "Beta users suddenly cannot access the new checkout" and click **Investigate incident**.
7. Review the segment diff and AI assessment, click **Review and approve**, tick the checkbox, and **Apply recovery**.
8. FlagReplay re-reads Flagsmith and shows **Recovery verified**. Refresh the segment in the Flagsmith dashboard to see it restored.

## 8. Webhooks (optional, recommended)

Webhooks give FlagReplay a snapshot every time a flag changes, so you get precise baselines without capturing manually.

1. Flagsmith needs to reach your app. Locally, expose it with a tunnel, for example `ngrok http 3000`.
2. In Flagsmith: **Environment Settings > Webhooks > Create webhook**.
   URL: `https://<your-tunnel>/api/webhooks/flagsmith`
   Secret: any random string. Put the same value in `FLAGSMITH_WEBHOOK_SECRET`.
3. Restart FlagReplay. Requests without a valid `X-Flagsmith-Signature` are rejected with 401.

Received events appear in the timeline as "Flagsmith webhook" and each one triggers a deduplicated snapshot.

## 9. Things to know

- **Audit log access** depends on your Flagsmith plan and key permissions. If it's unavailable, FlagReplay says so in the timeline and relies on its own snapshots. It never invents history.
- **v2 feature versioning**: if your environment has it on, Flagsmith rejects direct feature state writes. FlagReplay detects this and marks those recoveries unavailable. Segment rule restores still work.
- **No baseline yet**: if you investigate before any snapshot exists, FlagReplay stores the first one and tells you no diff was possible. Capture snapshots (or use webhooks) before you need them.
- **Safety**: every recovery re-reads Flagsmith first and aborts if the target object changed since the investigation. It saves a pre-recovery snapshot, changes exactly one object, then re-reads and verifies.

## 10. Trying live mode without a Flagsmith account

A local mock of the Flagsmith Management API is included, for development only:

```bash
npm run mock:flagsmith          # terminal 1, listens on :4010
```

`.env.local`:

```env
FLAGSMITH_API_URL=http://localhost:4010
FLAGSMITH_API_TOKEN=test-token
FLAGSMITH_PROJECT_ID=1
FLAGSMITH_ENVIRONMENT_ID=10
FLAGSMITH_COMPARE_ENVIRONMENT_ID=stgKey456
```

```bash
npm run dev                     # terminal 2
curl -X POST localhost:4010/__break     # simulate the incident after the baseline is captured
```

## Troubleshooting

| Message | Fix |
| --- | --- |
| `Flagsmith rejected the API token (401)` | You used an environment SDK key. Create an Organisation API key (step 3). |
| `The API token lacks permission ... (403)` | Make the API key an admin key, or grant it access to the project. |
| `Environment "..." was not found in project ...` | Check `FLAGSMITH_ENVIRONMENT_ID`; the error lists the environments the token can see. |
| `Live mode is not configured. Missing: ...` | Fill in `.env.local` and restart `npm run dev`. |
| `AI provider returned HTTP 401` | Check `LLM_API_KEY`. |
| `better-sqlite3` install errors | Use Node 20.9+ (22 LTS), delete `node_modules` and run `npm install` again. On Windows, install the "Desktop development with C++" build tools if no prebuilt binary matches. |
