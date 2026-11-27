# FlagReplay 

**Find the feature flag change behind an incident and recover it safely.**

## The problem

A small change to a feature flag or user segment can disable a feature or lock users out. No code changed and nothing was deployed, so normal debugging misses it. Teams have to piece together what changed, find the likely cause, and decide how to fix it, often under pressure.

## The solution

FlagReplay investigates incidents in Flagsmith. It compares configuration snapshots and available audit history, highlights relevant changes, and uses AI to explain which change likely caused the problem. A person reviews and approves any recovery. FlagReplay then applies the targeted change through the Flagsmith Management API and reads Flagsmith again to verify the result.

**In short:** incident description → evidence → likely cause → human approved recovery → verification.

## How it works

1. **Describe the incident** in plain language.
2. **Review the evidence:** FlagReplay compares flag and segment changes with available history.
3. **Assess the cause:** AI connects the evidence to the incident and separates confirmed facts from inference.
4. **Approve a recovery:** review the before and after diff before anything is written.
5. **Verify the result:** FlagReplay re-reads the configuration and reports whether recovery succeeded.

## Why FlagReplay

- **Evidence based:** changes are compared deterministically. The AI explains evidence and never invents configuration history.
- **Human controlled:** nothing changes until a person approves the proposed recovery.
- **Safer recovery:** FlagReplay aborts if the config changed since the investigation, touches one object per approval, and verifies afterward.
- **Try it without credentials:** demo mode uses clearly labelled sample data. Connect a Flagsmith project for live investigations.

## Try the demo (60 seconds, no credentials)

Requires Node.js 20.9+ and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The header toggle starts on **Demo**.

1. Click **Beta users lost checkout access**.
2. Under **Suspected changes**, the `beta_users` segment is flagged as the root cause: `cohort IN beta,early_access` became `cohort IN early_access`.
3. Read the **AI investigation**: confirmed facts, inferences, confidence and alternative explanations.
4. Click **Review and approve**, tick the confirmation, then **Apply recovery**.
5. **Verification** shows *Recovery verified*.

Also try **A feature unexpectedly became disabled** and **Staging and production have different configurations**.

## Connect Flagsmith

For live investigations, configure your Flagsmith project and AI provider. Follow [SETUP.md](./SETUP.md) for credentials, connection checks and a step by step live incident. Secrets stay on the server and never reach the browser.

Quick version: switch to **Live**, capture a baseline, edit the `beta_users` segment rule in Flagsmith, investigate, approve. FlagReplay restores the rule in your real Flagsmith project, and the change appears in Flagsmith's Audit Log.

## Built with

Next.js, TypeScript, Tailwind CSS, Zod, SQLite, the Flagsmith Management API, and Groq (any OpenAI compatible provider works). Configuration comparison, recovery payloads and verification are handled by application code. AI is used only to interpret and explain the evidence.

## Known limitations

- Native history depends on your Flagsmith plan's audit log access. Without it, FlagReplay relies on its own snapshots, so capture a baseline before you need it.
- Environments with **v2 feature versioning** reject direct flag state writes. FlagReplay marks those recoveries unavailable. Segment rule restores still work.
- One object is restored per approval, by design.

## Run checks

```bash
npm test
npm run lint
```