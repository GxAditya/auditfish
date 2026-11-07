import { describe, expect, it } from "vitest";
import { decideMatch, diffRecords, isOfficialDomain, normalizeStatus, phoneticKey, type Candidate, type VerifiedRecord } from "./verification";

const c = (holder_name: string, number: string | null = null): Candidate => ({ holder_name, number, location: null, status_raw: null, status: "unknown", detail_url: null });

describe("status normalization", () => {
  it("maps registry wording to fixed statuses", () => {
    expect(normalizeStatus("License Renewed & Current")).toBe("active");
    expect(normalizeStatus("Expired")).toBe("expired");
    expect(normalizeStatus("Suspended - interim order")).toBe("suspended");
    expect(normalizeStatus("Revoked")).toBe("revoked");
    expect(normalizeStatus("Dissolved")).toBe("revoked");
    expect(normalizeStatus(null)).toBe("unknown");
  });
});

describe("matching never guesses", () => {
  it("returns no_match when no candidate has every name token", () => {
    expect(decideMatch({ name: "Jane Smith", number: null }, [c("John Smith")]).outcome).toBe("no_match");
  });
  it("returns multiple_matches when two people share the name", () => {
    expect(decideMatch({ name: "Jane Smith", number: null }, [c("SMITH, JANE A", "A1"), c("Jane Smith", "B2")]).outcome).toBe("multiple_matches");
  });
  it("a given licence number must match exactly", () => {
    const r = decideMatch({ name: "Jane Smith", number: "a-1" }, [c("Jane Smith", "A1"), c("Jane Smith", "B2")]);
    expect(r.outcome).toBe("match");
    expect(r.matched[0]?.number).toBe("A1");
  });
  it("matches registry formatting: titles, surname-first, extra middle names", () => {
    expect(decideMatch({ name: "Ashutosh Sharan", number: null }, [c("DR. SHARAN ASHUTOSH", "12345")]).outcome).toBe("match");
    expect(decideMatch({ name: "Ashutosh Sharan", number: null }, [c("Ashutosh Kumar Sharan", "12345")]).outcome).toBe("match");
  });
  it("spelling variants and initials need confirmation, even when only one", () => {
    const variant = decideMatch({ name: "Ashutosh Sharan", number: null }, [c("ASHUTOSH SARAN", "12345")]);
    expect(variant).toMatchObject({ outcome: "multiple_matches", confidence: "partial" });
    expect(decideMatch({ name: "Ashutosh Sharan", number: null }, [c("A. Sharan", "9")]).outcome).toBe("multiple_matches");
  });
  it("a different surname is never a partial match", () => {
    expect(decideMatch({ name: "Ashutosh Sharan", number: null }, [c("Ashutosh Sinha")]).outcome).toBe("no_match");
  });
  it("number given but the list shows none: same-name rows need confirmation", () => {
    expect(decideMatch({ name: "Jane Smith", number: "A1" }, [c("Jane Smith")]).outcome).toBe("multiple_matches");
  });
});

describe("phonetic key", () => {
  it("treats common transliterations as equal", () => {
    expect(phoneticKey("sharan")).toBe(phoneticKey("saran"));
    expect(phoneticKey("mohammed")).toBe(phoneticKey("muhammad"));
    expect(phoneticKey("sharan")).not.toBe(phoneticKey("sinha"));
  });
});

describe("record diff for monitoring", () => {
  const base: VerifiedRecord = { holder_name: "A", record_type: "x", status: "active", status_raw: "Active", number: "1", issued_date: null, expiry_date: "2027-01-01", disciplinary_actions: [], jurisdiction: "", address: null, registry_name: "R", source_url: "https://r.gov", source_url_type: "search_page", checked_at: "" };
  it("reports status, expiry and new disciplinary actions", () => {
    expect(diffRecords(base, { ...base })).toEqual([]);
    const after = { ...base, status: "suspended" as const, status_raw: "Suspended", expiry_date: "2026-01-01", disciplinary_actions: [{ date: "2026-10-01", action: "Interim order", summary: null, link: null }] };
    expect(diffRecords(base, after)).toEqual(["Status: active → suspended", "Expiry: 2027-01-01 → 2026-01-01", "New action: Interim order (2026-10-01)"]);
  });
});

describe("official sources only", () => {
  it("accepts government and statutory regulator domains", () => {
    expect(isOfficialDomain("https://www.cslb.ca.gov/x")).toBe(true);
    expect(isOfficialDomain("https://www.gmc-uk.org/register")).toBe(true);
    expect(isOfficialDomain("https://www.mca.gov.in/")).toBe(true);
  });
  it("rejects third-party aggregators", () => {
    expect(isOfficialDomain("https://opencorporates.com/companies")).toBe(false);
    expect(isOfficialDomain("https://www.healthgrades.com/")).toBe(false);
  });
});
