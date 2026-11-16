// Shared, browser-safe types and pure logic for AuditFish verification results.

export const RECORD_TYPES = [
  { value: "medical", label: "Medical licence (doctor)", profession: "Medical Doctor / Physician (MD or DO)" },
  { value: "nurse", label: "Nursing licence", profession: "Nurse (RN, LPN, APRN)" },
  { value: "contractor", label: "Contractor licence", profession: "Contractor" },
  { value: "lawyer", label: "Lawyer / bar licence", profession: "Attorney / Lawyer" },
  { value: "company", label: "Company registration", profession: null },
  { value: "other", label: "Other (describe)", profession: null },
] as const;

// Licence-type wording that fits each record type. Registers such as Florida's list every
// health profession together, so a "Danielle Lee" search mixes doctors, nurses and EMTs.
const PROFESSION_FIT: Partial<Record<string, { fits: RegExp; excludes?: RegExp }>> = {
  medical: { fits: /medical doctor|physician|osteopath|surgeon|medicine|medical practitioner|resident|intern\b|\bm\.?d\b|\bd\.?o\b/i, excludes: /assis|\bpa\b|nurs|techn/i }, // registers truncate labels ("Physician Assis")
  nurse: { fits: /nurs|\brn\b|\blpn\b|\baprn\b|\bnp\b|midwi/i, excludes: /assis|\bcna\b|aide/i },
  lawyer: { fits: /attorney|lawyer|solicitor|barrister|advocate|bar\b|law/i },
};

// Values agents put in licence_type when the register has no profession column
// (NMC India: "Bihar Medical Council", "MBBS", a year or serial number). They say nothing about profession.
const NOT_A_LICENCE_TYPE = /council|board|commission|authority|college|ministry|department|registry|register\b|^[\W\d_]*$/i;
const ANY_PROFESSION = /doctor|physician|surgeon|osteopath|medic(al|ine)|nurs|\brn\b|\blpn\b|aprn|midwi|assis|\bpa\b|techn|therap|pharm|dent|diet|nutri|optom|chiro|podiat|psycholog|paramedic|\bemt\b|aide|\bcna\b|attorney|lawyer|solicitor|barrister|advocate|contractor|resident|intern\b/i;

/** False only when the row states a licence type that clearly isn't the one asked for; unknown types are kept. */
export function fitsRecordType(licenceType: string | null | undefined, recordType: string): boolean {
  const rule = PROFESSION_FIT[recordType];
  if (!rule || !licenceType?.trim() || NOT_A_LICENCE_TYPE.test(licenceType) || !ANY_PROFESSION.test(licenceType)) return true;
  return rule.fits.test(licenceType) && !(rule.excludes?.test(licenceType) ?? false);
}

/** Agents sometimes paste a whole result row ("ME163720 | LEE, DANIELLE | Medical Doctor | …") as the name. */
export function cleanHolderName(raw: string, queryName: string): string {
  const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return raw.trim();
  return parts.reduce((best, p) => (nameScore(queryName, p) > nameScore(queryName, best) ? p : best), parts[0]!);
}

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
  /** Profession / licence type exactly as the register shows it, e.g. "Medical Doctor". */
  licence_type?: string | null | undefined;
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

const sameName = (a: string, b: string) => nameTokens(a).sort().join(" ") === nameTokens(b).sort().join(" ");
const TRAINING_LICENCE = /resident|intern\b|training|provisional|temporary|student/i;

/** When one person holds a full licence and a training one (e.g. Medical Doctor + Resident), keep the full licence. */
export function preferFullLicences(candidates: Candidate[]): Candidate[] {
  const isTraining = (c: Candidate) => TRAINING_LICENCE.test(c.licence_type ?? "");
  return candidates.filter((c) => !isTraining(c) || !candidates.some((f) => !isTraining(f) && sameName(f.holder_name, c.holder_name)));
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
 * multiple_matches for a person to confirm. Never auto-picked.
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

const DOCUMENT_URL = /\.(pdf|docx?|pptx?|xlsx?|csv|rtf|odt|ods|odp|zip)$|\/wp-content\/uploads\//i;
const REGISTER_HINT = /search|\bregist(er|ry)s?\b|verif|look-?up|\bfind\b|directory|\bcheck\b|enquir/i;
const NOT_A_REGISTER = /manual|powerpoint|presentation|notification|notice|circular|\bnews\b|press release|gazette|tender|recruit|career|sign-?up|log-?in|\bapply\b|application form|renewal|fee structure|download|annual report|\bfaq\b/i;
const SINGLE_RECORD_PATH = /detail|profile\/|\/view\//i;

/**
 * How likely a search hit is the official register's search page: higher is better,
 * null = not usable (documents, manuals, notices, sign-up pages, one person's detail page).
 */
export function sourceScore(url: string, title: string | null | undefined): number | null {
  let path = "";
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
  const t = title ?? "";
  if (DOCUMENT_URL.test(path) || NOT_A_REGISTER.test(path) || NOT_A_REGISTER.test(t) || SINGLE_RECORD_PATH.test(path)) return null;
  return (REGISTER_HINT.test(path) ? 2 : 0) + (REGISTER_HINT.test(t) ? 1 : 0);
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
      return `${result.candidates.length} possible matches in ${src}. Pick the right one; AuditFish will not guess.`;
    case "no_match":
      return `No matching record found in ${src}.`;
    default:
      return `The official source could not be checked right now.`;
  }
}
