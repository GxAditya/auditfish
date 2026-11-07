AuditFish  plan

A web app where a hiring manager or compliance team enters a name, a record type and a country (plus optional state/region), and gets a verified record pulled live from the official registry, with a link to prove it and a watch that flags status changes.

## How it works for the user

1. **Connect key (BYOK)** — first visit asks for a TinyFish API key. It is kept only in the browser and sent with each request; never stored on our side. A "Change key" button stays in the header.
2. **Verify** — form with:
  - Name (person or business)
  - Record type: Medical licence, Contractor licence, Lawyer/bar licence, Nurse licence, Company registration, Other (free text)
  - Country (searchable list) and optional state/province/region
  - Optional licence/registration number to narrow the match
3. **Find the official source** — the app picks the official registry for that country/region and record type. A built-in list of known official registries is used first (e.g. UK Companies House, UK GMC, US state medical boards, California CSLB, India MCA, India NMC, Australia AHPRA/ASIC, Canada corporations registry); for anything else TinyFish Search finds the government/regulator site, and only official domains (.gov, .gov.uk, .gov.in, .gov.au, regulator domains on the list) are accepted. The user sees which source was chosen and can switch to another listed one.
4. **Live lookup** — TinyFish Agent opens the official site, runs the search, and returns structured data. A live browser preview shows the agent working; progress steps stream in.
5. **Results, never guessed**:
  - **One match** → a record card.
  - **Several matches** → a list of candidates (name, number, location, status) to choose from; picking one fetches its detail page.
  - **No match** → a clear "No record found in <registry>" with the search that was run and the source link — not an error and not a guess.
  - **Source unavailable / blocked** → says so plainly and offers the next official source.
6. **Record card** shows: status (Active / Expired / Suspended / Revoked / Inactive / Unknown, with the registry's original wording kept), licence or registration number, holder name, type, jurisdiction, issue and expiry dates, disciplinary actions (date, action, summary, link), source link to the exact record page, registry name, and "checked at" time. Buttons: Copy JSON, Download JSON, Watch for changes, Re-check now.
7. **Watchlist** — "Watch" creates a TinyFish Monitor on the record's page (daily). The Watchlist page lists monitors from the user's TinyFish account, last checked time, and a red "Status changed" flag when a monitor run reports a change; opening it re-verifies and shows before/after (status, expiry, disciplinary). Pause, run now, and delete supported. Alerts are in-app only.
8. **History** — past checks kept in the browser for quick reopening.

## Reusable output

Every result follows one fixed JSON format (shown on an "API / Schema" page):

```text
{ query: {name, record_type, country, region},
  outcome: "match" | "multiple_matches" | "no_match" | "source_error",
  records: [{ holder_name, record_type, status, status_raw, number,
              issued_date, expiry_date, disciplinary_actions: [...],
              jurisdiction, registry_name, source_url, checked_at }],
  candidates: [...], sources_checked: [...] }
```

There is also a public endpoint (`POST /api/public/verify`, key passed in a header) so other tools can call TinyVerify and get the same JSON.

## Design

Calm, document-like "compliance ledger" look: off-white paper background, deep ink-green primary, monospace for numbers and dates, clear status pills (green active, amber expired, red suspended/revoked, gray unknown). Distinctive serif headings with a clean sans for body. Pages: Verify (home), Watchlist, Schema/API.

## Technical details

- No accounts, no database: key + history in localStorage; watch state lives in TinyFish Monitors (listed via `GET /v1/monitors` with the user's key), plus a local snapshot of the last record per monitor for before/after comparison.
- Server functions (createServerFn) proxy all TinyFish calls with `X-API-Key` from the request: Search API (source discovery), Agent run via SSE with `output_schema` for structured extraction (separate schemas for "search results list" and "record detail"), Monitor create/list/run/patch/delete.
- Source registry file `src/lib/registries.ts`: country/region/record-type → official search URL + agent goal hints. Official-domain allowlist applied to discovered sources.
- Agent goal tells it to report exactly what the page shows, return `null` for missing fields, and return all candidates when several match; app normalizes status into the fixed set while keeping `status_raw`.
- Matching logic (exact/fuzzy name + optional number) decides match vs multiple vs none; covered by vitest tests.
- Monitor: `type: "fetch"` on the record `source_url`, `schedule_cron: "0 9 * * *"`, `purpose` describing status/expiry/disciplinary changes; change flag read from monitor's latest run.
- Unique head() metadata for each page.