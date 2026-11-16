## Project rules

- BYOK: the user's TinyFish key lives in browser localStorage and is passed per request (server fn arg or `X-TinyFish-Key` header); never persist it server-side; the app has no accounts or database.
- All TinyFish calls go through `src/lib/tinyfish.server.ts`; the verification pipeline there is shared by the streaming UI route and the public JSON API so both return identical `auditfish.v1` results.
- Pure matching/status/official-domain logic lives in `src/lib/verification.ts` with tests; matching must never auto-pick among several candidates.
- Watch state = TinyFish Monitors (source of truth) plus local snapshots for before/after; monitors created by the app are named with the "AuditFish" prefix.
- Do not edit generated files (`src/routeTree.gen.ts`). Do not put secret values in the repo.

## Commands

- Install: `npm ci` (npm only; lockfile is `package-lock.json`, pinned via `packageManager: npm@11.21.1`). npm 12's default `allow-remote=none` refuses Tailwind's bundled WASM package, so regenerate the lockfile with `npx npm@11.21.1 install` rather than loosening that setting. `.npmrc` sets `min-release-age=1` (24h supply-chain guard); don't remove it or add excludes without asking.
- Dev server: `npm run dev` (port 8080)
- Tests: `npx vitest run` · Typecheck: `npx tsc --noEmit` · Build: `npx vite build`
- Deploy (Cloudflare Workers, free plan): `npm run deploy`; local Worker preview: `npm run cf:dev`. Worker config is `wrangler.jsonc`; Nitro's `cloudflare-module` preset merges it into `.output/server/wrangler.json` and writes `.wrangler/deploy/config.json`, which redirects a plain `wrangler deploy` there. Cloudflare Workers Builds (GitHub connect): build command `npm run build`, deploy command `npx wrangler deploy`, Worker name `auditfish`.
- Lint has many pre-existing Prettier formatting errors; don't reformat whole files unasked.

## Notes

- TinyFish Agent `agent_config.max_steps` is beta-gated (403 otherwise), so it is not sent. The time budget is `agent_config.max_duration_seconds` (180 s): TinyFish then ends the run COMPLETED with what it found. A cancelled run returns `result: null`, so `runAgentSSE` only cancels (`POST /v1/runs/{id}/cancel`) on repeated-action loops or as a backstop (300 s, 90 steps), then the pipeline moves to the next source.
- Discovered sources are ranked by `sourceScore` (verification.ts): documents (PDF/PPT/…), manuals, notices, sign-up and single-record pages are dropped; register/search pages rank first.
- Long synchronous `run_web_automation` MCP calls tend to drop the connection and the client retries them, creating duplicate paid runs; use `run_web_automation_async` + `get_run` when testing from an agent.
