// Built-in list of official registries/licensing boards. Browser-safe.
import type { SourceInfo } from "./verification";

interface KnownRegistry {
  id: string;
  name: string;
  url: string;
  countries: string[]; // ISO-ish names, lower-case
  regions?: string[]; // lower-case state/province names or codes; omitted = whole country
  types: string[]; // record type values
  notes?: string;
}

export const KNOWN_REGISTRIES: KnownRegistry[] = [
  // United Kingdom
  { id: "uk-companies-house", name: "Companies House (UK)", url: "https://find-and-update.company-information.service.gov.uk/", countries: ["united kingdom"], types: ["company"] },
  { id: "uk-gmc", name: "General Medical Council – Medical Register", url: "https://www.gmc-uk.org/registration-and-licensing/the-medical-register", countries: ["united kingdom"], types: ["medical"] },
  { id: "uk-nmc", name: "Nursing & Midwifery Council Register", url: "https://www.nmc.org.uk/registration/search-the-register/", countries: ["united kingdom"], types: ["nurse"] },
  { id: "uk-sra", name: "Solicitors Regulation Authority Register", url: "https://www.sra.org.uk/consumers/register/", countries: ["united kingdom"], types: ["lawyer"] },
  // United States
  { id: "us-ca-mbc", name: "Medical Board of California (DCA License Search)", url: "https://search.dca.ca.gov/", countries: ["united states"], regions: ["california", "ca"], types: ["medical", "nurse"] },
  { id: "us-ca-cslb", name: "California Contractors State License Board", url: "https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx", countries: ["united states"], regions: ["california", "ca"], types: ["contractor"] },
  { id: "us-ca-sos", name: "California Secretary of State – Business Search", url: "https://bizfileonline.sos.ca.gov/search/business", countries: ["united states"], regions: ["california", "ca"], types: ["company"] },
  { id: "us-ca-bar", name: "State Bar of California – Attorney Search", url: "https://apps.calbar.ca.gov/attorney/LicenseeSearch/QuickSearch", countries: ["united states"], regions: ["california", "ca"], types: ["lawyer"] },
  { id: "us-tx-tmb", name: "Texas Medical Board – Look Up a License", url: "https://profile.tmb.state.tx.us/Search.aspx", countries: ["united states"], regions: ["texas", "tx"], types: ["medical"] },
  { id: "us-tx-tdlr", name: "Texas Dept. of Licensing & Regulation – License Search", url: "https://www.tdlr.texas.gov/LicenseSearch/", countries: ["united states"], regions: ["texas", "tx"], types: ["contractor"] },
  { id: "us-fl-dbpr", name: "Florida DBPR – Verify a License", url: "https://www.myfloridalicense.com/wl11.asp", countries: ["united states"], regions: ["florida", "fl"], types: ["contractor"] },
  { id: "us-fl-doh", name: "Florida Dept. of Health – License Verification", url: "https://mqa-internet.doh.state.fl.us/MQASearchServices/HealthCareProviders", countries: ["united states"], regions: ["florida", "fl"], types: ["medical", "nurse"] },
  { id: "us-ny-op", name: "New York State Education Dept. – Verify a Licence", url: "https://eservices.nysed.gov/professions/verification-search", countries: ["united states"], regions: ["new york", "ny"], types: ["medical", "nurse"] },
  { id: "us-fsmb-docinfo", name: "FSMB DocInfo – Physician Lookup (all US state medical boards)", url: "https://www.docinfo.org/", countries: ["united states"], types: ["medical"], notes: "Federation of State Medical Boards; includes board actions" },
  { id: "us-sec-edgar", name: "SEC EDGAR Company Search", url: "https://www.sec.gov/edgar/searchedgar/companysearch", countries: ["united states"], types: ["company"], notes: "Public companies only" },
  // India
  { id: "in-mca", name: "Ministry of Corporate Affairs – Company Master Data", url: "https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html", countries: ["india"], types: ["company"] },
  { id: "in-nmc", name: "National Medical Commission – Indian Medical Register", url: "https://www.nmc.org.in/information-desk/indian-medical-register/", countries: ["india"], types: ["medical"], notes: "Doctors registered with every State Medical Council (filter by council, e.g. Bihar Medical Council)" },
  { id: "in-ts-tsmc", name: "Telangana State Medical Council – Doctor Search", url: "https://regonlinetsmc.in/doctorsearch", countries: ["india"], regions: ["telangana", "ts"], types: ["medical"] },
  // Australia
  { id: "au-ahpra", name: "Ahpra – Register of Practitioners", url: "https://www.ahpra.gov.au/Registration/Registers-of-Practitioners.aspx", countries: ["australia"], types: ["medical", "nurse"] },
  { id: "au-asic", name: "ASIC Connect – Organisation & Business Names", url: "https://connectonline.asic.gov.au/RegistrySearch/faces/landing/SearchRegisters.jspx", countries: ["australia"], types: ["company"] },
  { id: "au-abr", name: "Australian Business Register – ABN Lookup", url: "https://abr.business.gov.au/", countries: ["australia"], types: ["company"] },
  // Canada
  { id: "ca-corp", name: "Corporations Canada – Federal Corporation Search", url: "https://ised-isde.canada.ca/cc/lgcy/fdrlCrpSrch.html", countries: ["canada"], types: ["company"] },
  { id: "ca-on-cpso", name: "College of Physicians and Surgeons of Ontario – Doctor Search", url: "https://doctors.cpso.on.ca/", countries: ["canada"], regions: ["ontario", "on"], types: ["medical"] },
  // Ireland, NZ, Singapore
  { id: "ie-cro", name: "Companies Registration Office (Ireland)", url: "https://core.cro.ie/", countries: ["ireland"], types: ["company"] },
  { id: "ie-mc", name: "Medical Council of Ireland – Register", url: "https://www.medicalcouncil.ie/public-information/check-the-register/", countries: ["ireland"], types: ["medical"] },
  { id: "nz-companies", name: "NZ Companies Office Register", url: "https://app.companiesoffice.govt.nz/co/", countries: ["new zealand"], types: ["company"] },
  { id: "nz-mcnz", name: "Medical Council of New Zealand – Register", url: "https://www.mcnz.org.nz/registration/register-of-doctors/", countries: ["new zealand"], types: ["medical"] },
  { id: "sg-smc", name: "Singapore Medical Council – Registered Doctors", url: "https://prs.moh.gov.sg/prs/internet/profSearch/main.action?hpe=SMC", countries: ["singapore"], types: ["medical"] },
];

export function knownSourcesFor(country: string, region: string | null, recordType: string): SourceInfo[] {
  const c = country.trim().toLowerCase();
  const r = (region ?? "").trim().toLowerCase();
  return KNOWN_REGISTRIES.filter((k) => {
    if (!k.countries.includes(c)) return false;
    if (!k.types.includes(recordType)) return false;
    if (k.regions) return r !== "" && k.regions.includes(r);
    return true;
  })
    // region-specific boards first
    .sort((a, b) => Number(!!b.regions) - Number(!!a.regions))
    .map((k) => ({
      id: k.id,
      name: k.name,
      url: k.url,
      domain: new URL(k.url).hostname.replace(/^www\./, ""),
      kind: "known" as const,
      notes: k.notes,
    }));
}

export const COUNTRIES = [
  "United States", "United Kingdom", "India", "Canada", "Australia", "Ireland", "New Zealand",
  "Singapore", "South Africa", "Germany", "France", "Netherlands", "Spain", "Italy", "Sweden",
  "Norway", "Denmark", "Finland", "Switzerland", "Austria", "Belgium", "Portugal", "Poland",
  "United Arab Emirates", "Saudi Arabia", "Israel", "Turkey", "Japan", "South Korea", "China",
  "Hong Kong", "Taiwan", "Malaysia", "Philippines", "Indonesia", "Thailand", "Vietnam",
  "Pakistan", "Bangladesh", "Sri Lanka", "Nepal", "Nigeria", "Kenya", "Ghana", "Egypt",
  "Brazil", "Mexico", "Argentina", "Chile", "Colombia", "Peru",
];
