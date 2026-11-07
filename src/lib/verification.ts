// Shared, browser-safe types and pure logic for AuditFish verification results.

export const RECORD_TYPES = [
  { value: "medical", label: "Medical licence (doctor)" },
  { value: "nurse", label: "Nursing licence" },
  { value: "contractor", label: "Contractor licence" },
  { value: "lawyer", label: "Lawyer / bar licence" },
  { value: "company", label: "Company registration" },
  { value: "other", label: "Other (describe)" },
] as const;

export type RecordTypeValue = (typeof RECORD_TYPES)[number]["value"];

export type NormalizedStatus =
  | "active"
  | "expired"
  | "suspended"
  | "revoked"
  | "inactive"
  | "unknown";

export interface DisciplinaryAction {
  date: string | null;
  action: string;
  summary: string | null;
  link: string | null;
}

export interface VerifiedRecord {
  holder_name: string;
  record_type: string;
  status: NormalizedStatus;
  status_raw: string | null;
  number: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  disciplinary_actions: DisciplinaryAction[];
  jurisdiction: string;
  address: string | null;
  registry_name: string;
  source_url: string;
  /** "record_page" = a URL that shows this record alone; "search_page" = the registry search page (record shown in a popup or result row). */
  source_url_type: "record_page" | "search_page";
  checked_at: string;
}

export interface Candidate {
  holder_name: string;
  number: string | null;
  location: string | null;
  status_raw: string | null;
  status: NormalizedStatus;
  detail_url: string | null;
}

export interface SourceInfo {
  id: string;
  name: string;
  url: string;
  domain: string;
  kind: "known" | "discovered";
  notes?: string | undefined;
}

export interface SourceCheck {
  registry_name: string;
  url: string;
  result: "match" | "multiple_matches" | "no_match" | "error";
  message: string | null;
  /** Search terms the agent actually typed into the registry, for audit. */
  searches: string[];
  checked_at: string;
}

export type Outcome = "match" | "multiple_matches" | "no_match" | "source_error";

export interface VerifyQuery {
  name: string;
  record_type: string;
  country: string;
  region: string | null;
  number: string | null;
}

export interface VerificationResult {
  schema_version: "auditfish.v1";
  query: VerifyQuery;
  outcome: Outcome;
  records: VerifiedRecord[];
  candidates: Candidate[];
  sources_checked: SourceCheck[];
  message: string;
  checked_at: string;
}

// ---------- status normalization ----------

export function normalizeStatus(raw: string | null | undefined): NormalizedStatus {
  if (!raw) return "unknown";
  const s = raw.toLowerCase();
  if (/revok|cancel+ed|struck off|strike off|erased|disbar|dissolved|removed from/.test(s)) return "revoked";
  if (/suspend|interim order|restrict|probation|conditions? imposed/.test(s)) return "suspended";
  if (/expir|lapse|delinquent|not renewed/.test(s)) return "expired";
  if (/inactive|retired|dormant|voluntar|surrender|liquidat|closed|ceased|not current|non-?current/.test(s)) return "inactive";
  if (/\bactive\b|current|in good standing|good standing|registered|licensed|valid|clear|live|full registration|practising/.test(s)) return "active";
  return "unknown";
}

// ---------- name matching ----------

const STOP = new Set([
  "dr", "mr", "mrs", "ms", "md", "do", "the", "inc", "llc", "ltd", "limited", "plc", "co",
  "corp", "corporation", "company", "pvt", "private", "pty", "gmbh", "sa", "llp", "lp", "and", "of",
]);

export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

/** 0..1 share of query tokens present in the candidate name (order-insensitive). */
export function nameScore(query: string, candidate: string): number {
  const q = nameTokens(query);
  const c = new Set(nameTokens(candidate));
  if (q.length === 0 || c.size === 0) return 0;
  const hit = q.filter((t) => c.has(t) || [...c].some((x) => x.length > 2 && (x.startsWith(t) || t.startsWith(x)))).length;
  return hit / q.length;
}

export function normalizeNumber(n: string | null | undefined): string {
  return (n ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Rough phonetic key so transliteration variants (Sharan/Saran, Mohammed/Muhammad) compare equal. */
export function phoneticKey(token: string): string {
  return token
    .replace(/([bcdgjkpstz])h/g, "$1")
    .replace(/ph/g, "f")
    .replace(/w/g, "v")
    .replace(/[aeiouy]+/g, "a")
    .replace(/(.)\1+/g, "$1");
}

function tokenMatches(q: string, cand: string[]): boolean {
  return cand.some((c) => c === q || (c.length === 1 && q.startsWith(c)) || (q.length > 2 && c.length > 2 && phoneticKey(c) === phoneticKey(q)));
}

/** Surname must match (spelling variants allowed); other names may match by initial or variant spelling. */
export function partialNameMatch(query: string, candidate: string): boolean {
  const q = nameTokens(query);
  const c = nameTokens(candidate);
  if (q.length === 0 || c.length === 0) return false;
  const surname = q[q.length - 1]!;
  if (!c.some((t) => t === surname || (surname.length > 2 && t.length > 2 && phoneticKey(t) === phoneticKey(surname)))) return false;
  return q.slice(0, -1).every((t) => tokenMatches(t, c));
}

export interface MatchDecision {
  outcome: "match" | "multiple_matches" | "no_match";
  /** "exact" = every name token (or the licence number) matched; "partial" = only a variant/initial match, so a person must confirm. */
  confidence: "exact" | "partial";
  matched: Candidate[];
}

/**
 * Decide strictly: a licence number, when given, must match exactly.
 * Otherwise every name token must be present. Spelling-variant or initial
 * matches, and anything with more than one survivor, are returned as
 * multiple_matches for a person to confirm — never auto-picked.
 */
export function decideMatch(query: { name: string; number: string | null }, candidates: Candidate[]): MatchDecision {
  const wantNum = normalizeNumber(query.number);
  let confidence: MatchDecision["confidence"] = "exact";
  let matched = wantNum
    ? candidates.filter((c) => normalizeNumber(c.number) === wantNum)
    : candidates.filter((c) => nameScore(query.name, c.holder_name) >= 1);
  if (matched.length === 0) {
    confidence = "partial";
    // A number was given but the list shows none: same-name rows still need confirmation.
    matched = wantNum
      ? candidates.filter((c) => !c.number && nameScore(query.name, c.holder_name) >= 1)
      : candidates.filter((c) => partialNameMatch(query.name, c.holder_name));
  }
  // de-duplicate by number+name
  const seen = new Set<string>();
  matched = matched.filter((c) => {
    const k = normalizeNumber(c.number) + "|" + nameTokens(c.holder_name).join(" ");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (matched.length === 0) return { outcome: "no_match", confidence, matched };
  if (matched.length === 1 && confidence === "exact") return { outcome: "match", confidence, matched };
  return { outcome: "multiple_matches", confidence, matched };
}

// ---------- official source checks ----------

const OFFICIAL_SUFFIXES = [
  ".gov", ".mil", ".gov.uk", ".gov.in", ".nic.in", ".gov.au", ".govt.nz", ".gc.ca", ".gov.sg",
  ".gov.ie", ".gov.za", ".gov.ph", ".gov.my", ".go.jp", ".go.kr", ".gov.br", ".gob.mx", ".gob.es",
  ".gouv.fr", ".gv.at", ".admin.ch", ".bund.de", ".europa.eu", ".gov.ae", ".gov.sa", ".gov.hk",
  ".gov.ng", ".go.ke", ".gov.pk", ".gov.bd", ".gov.lk", ".gov.it", ".overheid.nl", ".gov.pl",
  ".gov.cn", ".gov.tw", ".gov.il", ".gov.tr", ".gob.ar", ".gob.cl", ".gov.co", ".gob.pe",
];

// Statutory regulators that do not sit on a government domain.
export const OFFICIAL_REGULATOR_DOMAINS = [
  "gmc-uk.org", "nmc.org.uk", "sra.org.uk", "solicitors.lawsociety.org.uk", "hcpc-uk.org",
  "nmc.org.in", "mciindia.org", "indiannursingcouncil.org", "barcouncilofindia.org",
  "bcmr.net.in", "regonlinetsmc.in",
  "ahpra.gov.au", "cpso.on.ca", "cno.org", "lso.ca", "cpsbc.ca", "collegeofphysicians.org",
  "mcnz.org.nz", "medicalcouncil.ie", "smc.gov.sg", "hpcsa.co.za", "calbar.ca.gov",
  "nysed.gov", "fsmb.org", "docinfo.org", "ncsbn.org", "nursys.com", "bbb.org-excluded",
  "find-and-update.company-information.service.gov.uk", "companieshouse.gov.uk",
  "cro.ie", "kvk.nl", "handelsregister.de", "unternehmensregister.de", "infogreffe.fr",
  "opencorporates-excluded", "abr.business.gov.au", "acra.gov.sg", "bizfile.gov.sg",
  "ic.gc.ca", "ised-isde.canada.ca", "canada.ca", "ontario.ca", "alberta.ca", "bc.ca",
  "registry.companies.govt.nz", "mca.gov.in", "fca.org.uk", "register.fca.org.uk",
  "finra.org", "brokercheck.finra.org", "sec.gov", "cipc.co.za", "bdc.ca-excluded",
];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isOfficialDomain(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (OFFICIAL_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s))) return true;
  // US state domains like "ca.gov", "state.tx.us"
  if (/(^|\.)state\.[a-z]{2}\.us$/.test(host) || /(^|\.)[a-z]{2}\.us$/.test(host)) return true;
  return OFFICIAL_REGULATOR_DOMAINS.some((d) => !d.endsWith("-excluded") && (host === d || host.endsWith("." + d)));
}

/** Human-readable list of the compliance-relevant fields that differ between two checks of the same record. */
export function diffRecords(before: VerifiedRecord, after: VerifiedRecord): string[] {
  const changes: string[] = [];
  const cmp = (label: string, a: string | null, b: string | null) => {
    if ((a ?? "").trim().toLowerCase() !== (b ?? "").trim().toLowerCase()) changes.push(`${label}: ${a ?? "not shown"} → ${b ?? "not shown"}`);
  };
  if (before.status !== after.status) changes.push(`Status: ${before.status} → ${after.status}`);
  else cmp("Registry status text", before.status_raw, after.status_raw);
  cmp("Number", before.number, after.number);
  cmp("Expiry", before.expiry_date, after.expiry_date);
  const key = (d: DisciplinaryAction) => `${d.date ?? ""}|${d.action}`.toLowerCase();
  const old = new Set(before.disciplinary_actions.map(key));
  for (const d of after.disciplinary_actions) if (!old.has(key(d))) changes.push(`New action: ${d.action}${d.date ? ` (${d.date})` : ""}`);
  return changes;
}

export function overallMessage(result: Pick<VerificationResult, "outcome" | "records" | "candidates" | "sources_checked">): string {
  const src = result.sources_checked.map((s) => s.registry_name).join(", ") || "the official source";
  switch (result.outcome) {
    case "match":
      return `One matching record found in ${result.records[0]?.registry_name ?? src}.`;
    case "multiple_matches":
      return `${result.candidates.length} possible matches in ${src}. Pick the right one — AuditFish will not guess.`;
    case "no_match":
      return `No matching record found in ${src}.`;
    default:
      return `The official source could not be checked right now.`;
  }
}
