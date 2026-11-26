# FlagReplay

**Find the feature-flag change behind an incident—and recover it safely.**

## The problem

A small change to a feature flag or user segment can unexpectedly disable a feature or lock users out. When that happens, teams have to piece together what changed, identify the likely cause, and decide how to fix it—often under pressure.

## The solution

FlagReplay investigates incidents in Flagsmith. It compares configuration snapshots and available audit history, highlights relevant changes, and uses AI to explain which change may have caused the problem. A person reviews and approves any recovery. FlagReplay then applies the targeted change and checks Flagsmith again to verify the result.

**In short:** incident description → evidence → likely cause → human-approved recovery → verification.

## How it works

1. **Describe the incident** in plain language.
2. **Review the evidence:** FlagReplay compares flag and segment changes with available history.
3. **Assess the cause:** AI connects the evidence to the incident and distinguishes facts from its interpretation.
4. **Approve a recovery:** review the proposed change before anything is written.
5. **Verify the result:** FlagReplay re-reads the configuration and reports whether recovery succeeded.

## Why FlagReplay

- **Evidence-based:** changes are compared deterministically; the AI explains evidence rather than inventing configuration history.
- **Human-controlled:** nothing is changed until a person approves the proposed recovery.
- **Safer recovery:** FlagReplay checks for intervening changes, targets one object per approval, and verifies the result afterward.
- **Try it without credentials:** demo mode uses clearly labelled sample data. Connect a Flagsmith project for live investigations.

## Try the demo

Requires Node.js 20.9+ and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and try one of the sample incidents.

## Connect Flagsmith

For live investigations, configure your Flagsmith project and AI provider. Follow [SETUP.md](./SETUP.md) for credentials, connection checks, and setup instructions. Secrets stay on the server and are not sent to the browser.

## Built with

Next.js, TypeScript, SQLite, and an OpenAI-compatible AI provider. Configuration comparison, recovery payloads, and verification are handled by application code; AI is used to interpret and explain the evidence.

## Run checks

```bash
npm test
npm run lint
```
