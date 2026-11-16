import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api")({
  head: () => ({
    meta: [
      { title: "API & schema | AuditFish" },
      { name: "description", content: "Call AuditFish from your own tools and get a structured auditfish.v1 verification record." },
      { property: "og:title", content: "API & schema | AuditFish" },
      { property: "og:description", content: "JSON endpoint and output schema for official licence and registry checks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApiPage,
});

const EXAMPLE_REQ = `curl -X POST https://<your-auditfish-domain>/api/public/verify \\
  -H "Content-Type: application/json" \\
  -H "X-TinyFish-Key: $TINYFISH_API_KEY" \\
  -d '{
    "name": "Jane Smith",
    "record_type": "medical",
    "country": "United States",
    "region": "California",
    "number": null
  }'`;

const SCHEMA = `{
  "schema_version": "auditfish.v1",
  "query":   { "name", "record_type", "country", "region", "number" },
  "outcome": "match" | "multiple_matches" | "no_match" | "source_error",
  "message": string,
  "checked_at": ISO-8601,
  "records": [{
    "holder_name": string,
    "record_type": string,
    "status": "active" | "expired" | "suspended" | "revoked" | "inactive" | "unknown",
    "status_raw": string | null,          // exact wording on the registry
    "number": string | null,              // licence / registration number
    "issued_date": string | null,
    "expiry_date": string | null,
    "disciplinary_actions": [{ "date", "action", "summary", "link" }],
    "jurisdiction": string,
    "address": string | null,
    "registry_name": string,
    "source_url": string,                 // the official page that proves it
    "source_url_type": "record_page" | "search_page", // search_page = register has no per-record link
    "checked_at": ISO-8601
  }],
  "candidates": [{                         // only when outcome = multiple_matches
    "holder_name", "number", "location", "status_raw", "status", "detail_url"
  }],                                      // also used for near-name matches (e.g. Sharan/Saran), never auto-picked
  "sources_checked": [{ "registry_name", "url", "result", "message", "searches", "checked_at" }]
}`;

function ApiPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl">API & schema</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Every AuditFish result uses the same JSON shape, so HR systems, onboarding flows or compliance scripts can consume it directly. Calls use your own TinyFish key.</p>
      </div>
      <section>
        <h2 className="text-xl">Request</h2>
        <p className="text-sm text-muted-foreground">Record types: medical, nurse, contractor, lawyer, company, or other (with <code className="font-mono">record_type_other</code>). To resolve a multiple match, send the chosen candidate back as <code className="font-mono">target</code>.</p>
        <pre className="mt-2 overflow-auto rounded-md border border-border bg-card p-4 font-mono text-xs">{EXAMPLE_REQ}</pre>
      </section>
      <section>
        <h2 className="text-xl">Response</h2>
        <pre className="mt-2 overflow-auto rounded-md border border-border bg-card p-4 font-mono text-xs">{SCHEMA}</pre>
      </section>
      <section className="text-sm text-muted-foreground">
        <h2 className="text-xl text-foreground">Guarantees</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Only government and statutory regulator websites are used as sources.</li>
          <li>If a licence number is given it must match exactly; otherwise all name parts must match.</li>
          <li>When more than one entry matches, the result is <code className="font-mono">multiple_matches</code>, never an automatic pick.</li>
          <li>Fields not shown on the registry are <code className="font-mono">null</code>, never filled in.</li>
        </ul>
      </section>
    </div>
  );
}
