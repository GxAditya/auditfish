import { ExternalLink, Copy, Download, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NormalizedStatus, VerifiedRecord } from "@/lib/verification";

const STATUS_STYLE: Record<NormalizedStatus, string> = {
  active: "bg-success-soft text-success border-success/30",
  expired: "bg-warning-soft text-warning border-warning/30",
  suspended: "bg-danger-soft text-danger border-danger/30",
  revoked: "bg-danger-soft text-danger border-danger/30",
  inactive: "bg-muted text-muted-foreground border-border",
  unknown: "bg-muted text-muted-foreground border-border",
};

export function StatusPill({ status, className }: { status: NormalizedStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-xs uppercase tracking-wider", STATUS_STYLE[status], className)}>
      {status}
    </span>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2.5">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-sm font-medium", mono && "font-mono", !value && "text-muted-foreground")}>{value ?? "Not shown on registry"}</dd>
    </div>
  );
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function RecordCard({
  record,
  json,
  onWatch,
  onRecheck,
  watching,
  busy,
}: {
  record: VerifiedRecord;
  json: unknown;
  onWatch?: () => void;
  onRecheck?: () => void;
  watching?: boolean;
  busy?: boolean;
}) {
  return (
    <article className="rounded-md border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{record.registry_name}</p>
          <h3 className="mt-1 text-2xl">{record.holder_name}</h3>
          <p className="text-sm text-muted-foreground">{record.record_type} · {record.jurisdiction}</p>
        </div>
        <div className="text-right">
          <StatusPill status={record.status} />
          {record.status_raw && <p className="mt-1 text-xs text-muted-foreground">Registry says: “{record.status_raw}”</p>}
        </div>
      </header>
      <dl className="grid gap-2 px-5 sm:grid-cols-3">
        <Field label="Licence / registration no." value={record.number} mono />
        <Field label="Issued" value={record.issued_date} mono />
        <Field label="Expires" value={record.expiry_date} mono />
        <Field label="Address" value={record.address} />
        <Field label="Checked" value={new Date(record.checked_at).toLocaleString()} mono />
        <div className="rounded-md bg-muted/50 px-3 py-2.5">
          <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Source</dt>
          <dd className="mt-1 text-sm font-medium">
            <a href={record.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-primary underline">
              {record.source_url_type === "search_page" ? "Open official register" : "Open official record"} <ExternalLink className="h-3 w-3" />
            </a>
            {record.source_url_type === "search_page" && (
              <p className="mt-1 text-[11px] font-normal leading-snug text-muted-foreground">This register has no per-record link. Search {record.number ? <span className="font-mono">{record.number}</span> : "the name"} there to see it.</p>
            )}
          </dd>
        </div>
      </dl>
      <section className="px-5 pt-6 pb-2">
        <h4 className="text-sm font-semibold">Disciplinary & enforcement actions</h4>
        {record.disciplinary_actions.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">None shown on the registry.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {record.disciplinary_actions.map((d, i) => (
              <li key={i} className="rounded border border-danger/30 bg-danger-soft p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-danger">{d.action}</span>
                  {d.date && <span className="font-mono text-xs">{d.date}</span>}
                </div>
                {d.summary && <p className="mt-1">{d.summary}</p>}
                {d.link && <a className="mt-1 inline-block text-xs underline" href={d.link} target="_blank" rel="noreferrer">View document</a>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <footer className="flex flex-wrap gap-2 px-5 pt-4 pb-5">
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(JSON.stringify(json, null, 2))}><Copy className="mr-1 h-4 w-4" />Copy JSON</Button>
        <Button size="sm" variant="outline" onClick={() => downloadJson(`auditfish-${(record.number ?? record.holder_name).replace(/\W+/g, "-")}.json`, json)}><Download className="mr-1 h-4 w-4" />Download JSON</Button>
        {onRecheck && <Button size="sm" variant="outline" disabled={busy} onClick={onRecheck}><RefreshCw className="mr-1 h-4 w-4" />Re-check now</Button>}
        {onWatch && <Button size="sm" disabled={busy || watching} onClick={onWatch}><Eye className="mr-1 h-4 w-4" />{watching ? "Watching" : "Watch for changes"}</Button>}
      </footer>
    </article>
  );
}
