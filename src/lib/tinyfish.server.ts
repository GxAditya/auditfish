// Server-only TinyFish client + verification pipeline.
import { knownSourcesFor } from "./registries";
import {
  decideMatch,
  hostOf,
  isOfficialDomain,
  normalizeStatus,
  overallMessage,
  RECORD_TYPES,
  type Candidate,
  type SourceCheck,
  type SourceInfo,
  type VerificationResult,
  type VerifiedRecord,
  type VerifyQuery,
} from "./verification";

const AGENT = "https://agent.tinyfish.ai";
const SEARCH = "https://api.search.tinyfish.ai";

export class TinyFishError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function tf(apiKey: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "X-API-Key": apiKey.trim(), ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg = body?.error?.message ?? body?.message ?? body?.detail ?? `TinyFish request failed (${res.status})`;
    console.error("[tinyfish]", init.method ?? "GET", url.split("?")[0], res.status, text.slice(0, 300));
    throw new TinyFishError(res.status === 401 ? "TinyFish rejected the API key." : `TinyFish error ${res.status}: ${String(msg)}`, res.status);
  }
  return body;
}

// ---------------- sources ----------------

export function recordTypeLabel(v: string, other?: string | null) {
  if (v === "other") return other || "licence or registration";
  return RECORD_TYPES.find((r) => r.value === v)?.label ?? v;
}

export async function discoverSources(apiKey: string, q: { country: string; region: string | null; record_type: string; record_type_other?: string | null }): Promise<SourceInfo[]> {
  const known = knownSourcesFor(q.country, q.region, q.record_type);
  const label = recordTypeLabel(q.record_type, q.record_type_other).replace(/\(.*?\)/g, "").trim();
  const place = [q.region, q.country].filter(Boolean).join(", ");
  const queries = [`official ${label} ${q.record_type === "company" ? "registry search" : "licence verification lookup"} ${place}`];
  if (q.region && q.record_type !== "company") queries.unshift(`${q.region} ${label} council register search ${q.country}`);
  let discovered: SourceInfo[] = [];
  try {
    const bodies = await Promise.all(
      queries.map((query) => tf(apiKey, `${SEARCH}?${new URLSearchParams({ query, language: "en" })}`, { method: "GET" }).catch(() => null)),
    );
    const results: any[] = bodies.flatMap((b) => b?.results ?? []);
    const seenHosts = new Set(known.map((k) => k.domain));
    for (const r of results) {
      if (!r?.url || !isOfficialDomain(r.url)) continue;
      const host = hostOf(r.url);
      if (seenHosts.has(host)) continue;
      seenHosts.add(host);
      discovered.push({ id: `disc-${host}`, name: String(r.title ?? host).slice(0, 120), url: r.url, domain: host, kind: "discovered" });
      if (discovered.length >= 4) break;
    }
  } catch (e) {
    // Search is optional: built-in registries still work if it fails.
    console.error("[tinyfish] source search failed", e instanceof Error ? e.message : e);
    discovered = [];
  }
  return [...known, ...discovered];
}

// ---------------- agent ----------------

export type PipelineEvent =
  | { type: "status"; message: string }
  | { type: "streaming_url"; url: string; source: string }
  | { type: "progress"; message: string }
  | { type: "source_done"; check: SourceCheck };

const nullableStr = { type: "string", nullable: true };

const LOOKUP_SCHEMA = {
  type: "object",
  properties: {
    page_state: { type: "string", enum: ["results_found", "no_results", "blocked_or_error"] },
    blocked_reason: nullableStr,
    searches_tried: { type: "array", maxItems: 6, items: { type: "string" } },
    candidates: {
      type: "array",
      maxItems: 25,
      items: {
        type: "object",
        properties: {
          holder_name: { type: "string" },
          number: nullableStr,
          location: nullableStr,
          status_raw: nullableStr,
          detail_url: nullableStr,
        },
        required: ["holder_name"],
      },
    },
    record: {
      type: "object",
      nullable: true,
      properties: {
        holder_name: { type: "string" },
        number: nullableStr,
        status_raw: nullableStr,
        record_kind: nullableStr,
        issued_date: nullableStr,
        expiry_date: nullableStr,
        address: nullableStr,
        detail_url: nullableStr,
        disciplinary_actions: {
          type: "array",
          items: {
            type: "object",
            properties: { date: nullableStr, action: { type: "string" }, summary: nullableStr, link: nullableStr },
            required: ["action"],
          },
        },
      },
      required: ["holder_name"],
    },
  },
  required: ["page_state", "searches_tried", "candidates"],
};

export function lookupGoal(q: VerifyQuery, label: string, target?: Candidate) {
  const place = q.region ? `${q.region}, ${q.country}` : q.country;
  const who = target
    ? `the entry for "${target.holder_name}"${target.number ? ` with number ${target.number}` : ""}${target.location ? ` (${target.location})` : ""}`
    : `"${q.name}"${q.number ? ` (licence/registration number ${q.number})` : ""}`;
  const fallbacks = target
    ? `If that returns no rows, search by the name instead.`
    : `If a search returns no rows, retry in this order and stop at the first that returns rows: (a) surname/last word only, (b) the name in reverse order, (c) the first name only. Keep the state/council filter on for every retry. Never run more than 4 searches in total.`;
  return [
    `You are checking a ${label} on this official register for ${place}. Stay on this website.`,
    `1. Find the public search form. It may be on this page or one click away (a link like "Search the register", "Verify a licence", "Find a doctor/company"). Close cookie or notice banners.${q.region ? ` If the form has a state, province, council or jurisdiction filter, choose the option for ${q.region}.` : ""}`,
    `2. Look up ${who}. If a number is given, search by number first; otherwise search by full name. ${fallbacks} Put the exact terms of each search you ran into "searches_tried", e.g. "name=Sharan; council=Bihar Medical Council".`,
    `3. Put every result row (up to 25) into "candidates" exactly as shown: name, licence/registration/company number, location or council, status text, and the link to that row's own detail page if it has one. Do not filter, merge or guess.`,
    `4. If exactly one row is clearly ${target ? "the target entry" : `"${q.name}"`}, open its details. That can be a separate page, a popup or modal (a "View" or "Details" button), or an expanding row. Fill "record" verbatim from it: name, number, status text, licence/record kind, issue/registration date, expiry/renewal date, address, and every disciplinary action, public order, sanction, condition or enforcement action (date, action, summary, link). Set record.detail_url only if the details opened as their own page with their own address; otherwise null. If several rows could be the person or business, leave "record" null.`,
    `5. If every search returned nothing, set page_state "no_results". If a captcha you cannot pass, a login wall, an error page or a block stops you, set page_state "blocked_or_error" and explain in blocked_reason.`,
    `Rules: copy values verbatim; use null for anything not shown; never invent names, numbers, dates or statuses. Do not log in, create accounts, pay, or submit any form other than the register search.`,
  ].join("\n");
}

async function startAgent(apiKey: string, body: Record<string, unknown>) {
  return fetch(`${AGENT}/v1/automation/run-sse`, {
    method: "POST",
    headers: { "X-API-Key": apiKey.trim(), "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
  });
}

async function runAgentSSE(apiKey: string, url: string, goal: string, onEvent: (e: PipelineEvent) => void, sourceName: string): Promise<any> {
  const base = { url, goal, output_schema: LOOKUP_SCHEMA };
  // Try the most capable config first, then fall back to plainer requests if the account/plan rejects options.
  const attempts: Record<string, unknown>[] = [
    { ...base, browser_profile: "stealth", agent_config: { max_steps: 40, max_duration_seconds: 300 } },
    { ...base },
    { url, goal: goal + "\nReturn the result as JSON with keys page_state, blocked_reason, searches_tried, candidates, record." },
  ];
  let res: Response | null = null;
  let lastText = "";
  for (const body of attempts) {
    res = await startAgent(apiKey, body);
    if (res.ok && res.body) break;
    lastText = await res.text().catch(() => "");
    console.error("[tinyfish] run-sse", res.status, lastText.slice(0, 300));
    if (res.status === 401 || res.status === 402 || res.status === 429) break;
  }
  if (!res || !res.ok || !res.body) {
    const status = res?.status ?? 500;
    let msg = lastText.slice(0, 200);
    try { const j = JSON.parse(lastText); msg = j?.error?.message ?? j?.message ?? j?.detail ?? msg; } catch { /* keep text */ }
    throw new TinyFishError(status === 401 ? "TinyFish rejected the API key." : `Agent run failed (${status}): ${typeof msg === "string" ? msg : JSON.stringify(msg)}`, status);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let final: any = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data) continue;
      let ev: any;
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev.type === "STREAMING_URL" && ev.streaming_url) onEvent({ type: "streaming_url", url: ev.streaming_url, source: sourceName });
      else if (ev.type === "PROGRESS") onEvent({ type: "progress", message: String(ev.purpose ?? ev.action ?? ev.message ?? "Working…") });
      else if (ev.type === "COMPLETE") final = ev;
    }
  }
  if (!final) throw new TinyFishError("The agent stream ended without a result.", 502);
  if (final.status && final.status !== "COMPLETED") {
    const err = typeof final.error === "string" ? final.error : final.error?.message;
    throw new TinyFishError(err ?? final.help_message ?? `Agent run ${String(final.status).toLowerCase()}`, 502);
  }
  let result = final.result ?? final.result_json;
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      result = null;
    }
  }
  if (result && result.result && !result.page_state) result = result.result;
  if (!result || typeof result !== "object") throw new TinyFishError("The agent returned no structured result.", 502);
  return result;
}

function absolutize(u: string | null | undefined, base: string): string | null {
  if (!u) return null;
  try {
    const url = new URL(u, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function sameUrl(a: string, b: string) {
  const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/[/#?]+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

// ---------------- pipeline ----------------

export interface PipelineInput {
  query: VerifyQuery;
  record_type_other?: string | null;
  sources: SourceInfo[]; // in order of preference
  target?: Candidate | null; // set when user picked one of multiple matches
  maxSources?: number;
}

export async function runVerification(apiKey: string, input: PipelineInput, onEvent: (e: PipelineEvent) => void = () => {}): Promise<VerificationResult> {
  const { query } = input;
  const label = recordTypeLabel(query.record_type, input.record_type_other);
  const checks: SourceCheck[] = [];
  const maxSources = input.maxSources ?? 2;
  let tried = 0;
  let lastCandidates: Candidate[] = [];
  let lastOutcome: VerificationResult["outcome"] = "source_error";

  for (const src of input.sources) {
    if (tried >= maxSources) break;
    tried++;
    const now = () => new Date().toISOString();
    let searches: string[] = [];
    const done = (result: SourceCheck["result"], message: string | null, checked_at = now()) => {
      const check: SourceCheck = { registry_name: src.name, url: src.url, result, message, searches, checked_at };
      checks.push(check);
      onEvent({ type: "source_done", check });
    };
    onEvent({ type: "status", message: `Searching ${src.name}…` });
    try {
      const startUrl = input.target?.detail_url && hostOf(input.target.detail_url) === src.domain ? input.target.detail_url : src.url;
      const raw = await runAgentSSE(apiKey, startUrl, lookupGoal(query, label, input.target ?? undefined), onEvent, src.name);

      searches = Array.isArray(raw.searches_tried) ? raw.searches_tried.filter((s: unknown) => typeof s === "string").slice(0, 6) : [];
      if (raw.page_state === "blocked_or_error") {
        done("error", raw.blocked_reason ?? "The site blocked or failed the search.");
        continue; // try next official source
      }

      const candidates: Candidate[] = (raw.candidates ?? []).filter((c: any) => c?.holder_name).map((c: any) => ({
        holder_name: String(c.holder_name).trim(),
        number: c.number ?? null,
        location: c.location ?? null,
        status_raw: c.status_raw ?? null,
        status: normalizeStatus(c.status_raw),
        detail_url: absolutize(c.detail_url, startUrl),
      }));

      const rec = raw.record;
      const recCandidate: Candidate | null = rec?.holder_name
        ? { holder_name: rec.holder_name, number: rec.number ?? null, location: rec.address ?? null, status_raw: rec.status_raw ?? null, status: normalizeStatus(rec.status_raw), detail_url: absolutize(rec.detail_url, startUrl) }
        : null;

      const pool = candidates.length ? candidates : recCandidate ? [recCandidate] : [];
      const target = input.target;
      const decision = decideMatch(
        target ? { name: target.holder_name, number: target.number ?? query.number } : { name: query.name, number: query.number },
        pool,
      );

      const first = decision.matched[0];
      if (decision.outcome === "match" && first && recCandidate && decideMatch({ name: first.holder_name, number: first.number }, [recCandidate]).outcome === "match") {
        // Only a URL that is not the registry's search page proves this one record on its own.
        const ownPage = [recCandidate.detail_url, first.detail_url, startUrl].find((u): u is string => !!u && !sameUrl(u, src.url)) ?? null;
        const record: VerifiedRecord = {
          holder_name: rec.holder_name,
          record_type: rec.record_kind ?? label,
          status: normalizeStatus(rec.status_raw),
          status_raw: rec.status_raw ?? null,
          number: rec.number ?? first.number ?? null,
          issued_date: rec.issued_date ?? null,
          expiry_date: rec.expiry_date ?? null,
          disciplinary_actions: (rec.disciplinary_actions ?? []).filter((d: any) => d?.action).map((d: any) => ({ date: d.date ?? null, action: String(d.action), summary: d.summary ?? null, link: absolutize(d.link, startUrl) })),
          jurisdiction: [query.region, query.country].filter(Boolean).join(", "),
          address: rec.address ?? null,
          registry_name: src.name,
          source_url: ownPage ?? startUrl,
          source_url_type: ownPage ? "record_page" : "search_page",
          checked_at: now(),
        };
        done("match", null, record.checked_at);
        const result: VerificationResult = { schema_version: "auditfish.v1", query, outcome: "match", records: [record], candidates: [], sources_checked: checks, message: "", checked_at: record.checked_at };
        result.message = overallMessage(result);
        return result;
      }

      if (decision.outcome === "match" || decision.outcome === "multiple_matches") {
        // A single list match without a confirmed detail page is still shown as a choice,
        // so the user confirms it and AuditFish opens the detail page — never guessed.
        const n = decision.matched.length;
        done("multiple_matches", decision.confidence === "partial" ? `${n} entr${n === 1 ? "y" : "ies"} with a similar but not identical name — confirm the right one` : `${n} candidate(s) need confirmation`);
        lastCandidates = decision.matched.map((c) => ({ ...c, detail_url: c.detail_url ?? null }));
        lastOutcome = "multiple_matches";
        break;
      }

      done("no_match", pool.length ? `${pool.length} result(s) on the page, none matched the query` : "The registry returned no results");
      lastOutcome = "no_match";
      // keep checking the next official source for a no-match
    } catch (e) {
      if (e instanceof TinyFishError && e.status === 401) throw e;
      done("error", e instanceof Error ? e.message : "Unknown error");
    }
  }

  if (lastOutcome !== "multiple_matches" && checks.some((c) => c.result === "no_match")) lastOutcome = "no_match";
  const result: VerificationResult = {
    schema_version: "auditfish.v1",
    query,
    outcome: lastOutcome,
    records: [],
    candidates: lastOutcome === "multiple_matches" ? lastCandidates : [],
    sources_checked: checks,
    message: "",
    checked_at: new Date().toISOString(),
  };
  result.message = checks.length === 0 ? "No official source was found for this place and record type." : overallMessage(result);
  return result;
}

// ---------------- monitors ----------------

export async function createMonitor(apiKey: string, m: { name: string; url: string; purpose: string }) {
  return tf(apiKey, `${AGENT}/v1/monitors`, {
    method: "POST",
    body: JSON.stringify({ type: "fetch", name: m.name.slice(0, 100), config: { url: m.url, format: "markdown" }, schedule_cron: "0 9 * * *", purpose: m.purpose.slice(0, 2000) }),
  });
}
export const listMonitors = (apiKey: string) => tf(apiKey, `${AGENT}/v1/monitors`, { method: "GET" });
export const runMonitor = (apiKey: string, id: string) => tf(apiKey, `${AGENT}/v1/monitors/${encodeURIComponent(id)}/runs`, { method: "POST" });
export const patchMonitor = (apiKey: string, id: string, status: "active" | "paused") =>
  tf(apiKey, `${AGENT}/v1/monitors/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
export const deleteMonitor = (apiKey: string, id: string) => tf(apiKey, `${AGENT}/v1/monitors/${encodeURIComponent(id)}`, { method: "DELETE" });
