import { describe, expect, it } from "vitest";
import { cleanHolderName, decideMatch, diffRecords, fitsRecordType, isOfficialDomain, normalizeStatus, phoneticKey, preferFullLicences, sourceScore, type Candidate, type VerifiedRecord } from "./verification";

describe("discovered source ranking", () => {
  it("rejects documents, manuals and single-record pages (Bihar search results)", () => {
    expect(sourceScore("https://bcmr.net.in/wp-content/uploads/2025/07/User-manual-BMC-for-Applicant_New.pdf", "PowerPoint Presentation")).toBeNull();
    expect(sourceScore("https://example.gov.in/files/register.PPTX", "Register")).toBeNull();
    expect(sourceScore("https://doctor.ndhm.gov.in/en/home/dr-detail-page/MTM2MDcy", null)).toBeNull();
    expect(sourceScore("https://bcmr.net.in/fee-structure/", "Fee Structure")).toBeNull();
  });

  it("ranks register search pages above generic official pages", () => {
    const search = sourceScore("https://ayushedu.bisag-n.gov.in/BERISM/Search_Practitioner", "BERISM")!;
    const home = sourceScore("https://bcmr.net.in/", "Bihar Council of Medical Registration – Bihar Medical Council")!;
    expect(search).toBeGreaterThan(home);
    expect(home).toBe(0);
  });
});

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

describe("same name, different professions (Florida DOH 'Danielle Lee' search)", () => {
  // Real rows returned by the Florida Department of Health register.
  const row = (number: string, name: string, type: string): Candidate => ({ ...c(name, number), licence_type: type });
  const rows = [
    row("PA9117381", "Lee, Danielle", "Physician Assis"),
    row("RN9485744", "Lee, Danielle", "Registered Nurs"),
    row("EMT558540", "Lee, Danielle Ann", "EMT"),
    row("ND9857", "Lee, Danielle Y", "Dietitia"),
    row("ME163720", "LEE, DANIELLE NICOLE RENEE", "Medical Doctor"),
    row("TRN24949", "LEE, DANIELLE NICOLE RENEE", "Resident"),
    row("RPT17349", "LEE, DANIELLE NICOLE RENEE", "Reg Pharm Tech"),
  ];
  it("keeps only doctors, and the full licence over the same person's residency", () => {
    const pool = preferFullLicences(rows.filter((r) => fitsRecordType(r.licence_type, "medical")));
    const d = decideMatch({ name: "Danielle Lee", number: null }, pool);
    expect(d.outcome).toBe("match");
    expect(d.matched[0]?.number).toBe("ME163720");
  });
  it("two different doctors with the same name still need a person to choose", () => {
    const pool = [...rows, row("ME999999", "Lee, Danielle K", "Medical Doctor")].filter((r) => fitsRecordType(r.licence_type, "medical"));
    expect(decideMatch({ name: "Danielle Lee", number: null }, preferFullLicences(pool)).outcome).toBe("multiple_matches");
  });
  it("rows without a licence type are kept rather than dropped", () => {
    expect(fitsRecordType(null, "medical")).toBe(true);
    expect(fitsRecordType("Physician and Surgeon", "medical")).toBe(true);
    expect(fitsRecordType("Registered Nurse", "nurse")).toBe(true);
    expect(fitsRecordType("Certified Nursing Assistant", "nurse")).toBe(false);
  });
  it("does not treat a council, degree, serial number or father's name as another profession (NMC India)", () => {
    for (const v of ["Bihar Medical Council", "MBBS", "12", "RAM SHARAN"]) expect(fitsRecordType(v, "medical")).toBe(true);
  });
  it("matches a surname-first listing (NMC 'SHARAN ASHUTOSH')", () => {
    const rows = [{ ...c("SHARAN ASHUTOSH", "41234"), licence_type: "Bihar Medical Council" }, c("SHARAN KUMAR", "40001"), c("ASHUTOSH KUMAR", "40002")];
    const d = decideMatch({ name: "Ashutosh Sharan", number: null }, rows.filter((r) => fitsRecordType(r.licence_type, "medical")));
    expect(d.outcome).toBe("match");
    expect(d.matched[0]?.number).toBe("41234");
  });
  it("pulls the name out of a pasted result row", () => {
    expect(cleanHolderName("ME163720 | LEE, DANIELLE NICOLE RENEE | Medical Doctor | WINTER GARDEN | Clear/Active", "Danielle Lee")).toBe("LEE, DANIELLE NICOLE RENEE");
    expect(cleanHolderName("Jane Smith", "Jane Smith")).toBe("Jane Smith");
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
