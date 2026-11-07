import { DotLoader } from "@/components/auditfish/DotLoader";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertOctagon, CheckCircle2, ExternalLink, Pause, Play, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KeyRequired } from "@/components/auditfish/KeyGate";
import { StatusPill } from "@/components/auditfish/RecordCard";
import { checkMonitorNow, getMonitors, removeMonitor, setMonitorStatus, type MonitorDTO } from "@/lib/auditfish.functions";
import { deleteSnapshot, loadSnapshots, saveSnapshot, useApiKey, type Snapshot } from "@/lib/local-store";
import { streamVerify } from "@/lib/stream-client";
import { diffRecords, type VerificationResult } from "@/lib/verification";

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "Watchlist — AuditFish" },
      { name: "description", content: "Licences and registrations AuditFish is monitoring for status, expiry and disciplinary changes." },
      { property: "og:title", content: "Watchlist — AuditFish" },
      { property: "og:description", content: "Monitored official records with change flags." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WatchlistPage,
});

function WatchlistPage() {
  const { apiKey, ready } = useApiKey();
  const list = useServerFn(getMonitors);
  const runNow = useServerFn(checkMonitorNow);
  const setStatus = useServerFn(setMonitorStatus);
  const del = useServerFn(removeMonitor);
  const [monitors, setMonitors] = useState<MonitorDTO[] | null>(null);
  const [snaps, setSnaps] = useState<Record<string, Snapshot>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!apiKey) return;
    setError(null);
    try {
      const all = await list({ data: { apiKey } });
      setMonitors(all.filter((m) => m.name.startsWith("AuditFish") || loadSnapshots()[m.id]));
      setSnaps(loadSnapshots());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load monitors");
    }
  }, [apiKey, list]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function check(m: MonitorDTO) {
    if (!apiKey) return;
    setBusy(m.id);
    try {
      const r = await runNow({ data: { apiKey, id: m.id } });
      const s = loadSnapshots()[m.id];
      if (s) saveSnapshot({ ...s, last_run: { outcome: r.outcome, relevant: r.relevant, summary: r.summary, ran_at: r.ran_at, diff: r.diff } });
      setSnaps(loadSnapshots());
      if (r.errors.length) toast.error(`Check finished with errors: ${r.errors[0]}`);
      else toast(r.outcome === "changed" ? "Change detected on the official page" : "No change since the last check");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check failed");
    } finally {
      setBusy(null);
    }
  }

  // Re-runs the live agent check against the registry and compares with the saved record.
  // Needed for registers with no per-record URL, where a page monitor cannot see the record.
  async function reverify(m: MonitorDTO, s: Snapshot) {
    if (!apiKey || !s.source) return;
    setBusy(m.id);
    const r = s.record;
    let outcome: VerificationResult | null = null;
    let failure: string | null = null;
    try {
      await streamVerify(
        apiKey,
        {
          ...s.query,
          sources: [s.source],
          target: { holder_name: r.holder_name, number: r.number, location: r.address, status_raw: r.status_raw, status: r.status, detail_url: r.source_url_type === "record_page" ? r.source_url : null },
        },
        (ev) => {
          if (ev.type === "result") outcome = ev.result;
          else if (ev.type === "error") failure = ev.message;
        },
      );
    } catch (e) {
      failure = e instanceof Error ? e.message : "Re-verification failed";
    }
    const ran_at = new Date().toISOString();
    const res = outcome as VerificationResult | null;
    const fresh = res?.outcome === "match" ? res.records[0] : undefined;
    if (fresh) {
      const changes = diffRecords(r, fresh);
      saveSnapshot({ ...s, previous: r, record: fresh, last_run: { outcome: changes.length ? "changed" : "unchanged", relevant: changes.length > 0, summary: changes.join("; ") || null, ran_at, diff: null } });
      toast(changes.length ? "Change found in the official record" : "Record unchanged on the official register");
    } else if (res?.outcome === "no_match") {
      saveSnapshot({ ...s, last_run: { outcome: "changed", relevant: true, summary: "The record could no longer be found on the official register.", ran_at, diff: null } });
      toast.error("Record no longer found on the register");
    } else {
      toast.error(failure ?? res?.message ?? "The register could not be checked right now");
    }
    setSnaps(loadSnapshots());
    setBusy(null);
  }

  if (ready && !apiKey) return <KeyRequired onOpen={() => window.dispatchEvent(new Event("auditfish:open-key"))} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl">Watchlist</h1>
          <p className="text-muted-foreground">Each record is re-fetched from its official page daily by TinyFish Monitor. Changes relevant to status, expiry or discipline are flagged.</p>
        </div>
        <Button variant="outline" onClick={refresh}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
      </div>

      {error && <p className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm">{error}</p>}
      {!monitors && !error && <div className="flex items-center gap-2 text-sm text-muted-foreground"><DotLoader size={20} className="text-primary" /><span className="af-glow-text">Loading monitors…</span></div>}
      {monitors && monitors.length === 0 && <p className="rounded-md border border-dashed border-rule p-8 text-center text-sm text-muted-foreground">Nothing watched yet. Verify a record and press “Watch for changes”.</p>}

      <ul className="space-y-3">
        {monitors?.map((m, idx) => {
          const s = snaps[m.id];
          const changed = s?.last_run?.outcome === "changed" && s.last_run.relevant !== false;
          return (
            <li key={m.id} style={{ ["--i" as string]: Math.min(idx, 6) }} className={`af-enter rounded-md border bg-card p-4 ${changed ? "border-danger" : "border-border"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg">{s?.record.holder_name ?? m.name}</h2>
                    {s && <StatusPill status={s.record.status} />}
                    {changed && <span className="inline-flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-xs font-medium text-destructive-foreground"><AlertOctagon className="h-3 w-3" />Status changed</span>}
                    {s?.last_run && !changed && <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3 w-3" />No relevant change</span>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {s ? <>{s.record.registry_name} · <span className="font-mono">{s.record.number ?? "—"}</span> · expires <span className="font-mono">{s.record.expiry_date ?? "n/a"}</span></> : m.url}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    Monitor {m.status}{s?.last_run ? ` · last checked ${new Date(s.last_run.ran_at).toLocaleString()}` : m.updated_at ? ` · updated ${m.updated_at}` : ""}
                    {m.last_error && <span className="text-danger"> · error: {m.last_error}</span>}
                  </p>
                  {s?.record.source_url_type === "search_page" && <p className="mt-1 text-xs text-muted-foreground">This register has no per-record page, so the daily monitor watches the register itself. Use “Re-verify live” to re-check this record.</p>}
                  {changed && s?.last_run?.summary && <p className="mt-2 rounded bg-danger-soft p-2 text-sm">{s.last_run.summary}</p>}
                  {changed && s?.last_run?.diff && (
                    <details className="mt-2"><summary className="cursor-pointer text-xs">Show what changed on the page</summary><pre className="mt-1 max-h-60 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">{s.last_run.diff}</pre></details>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={m.url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><ExternalLink className="h-4 w-4" /></Button></a>
                  <Button size="sm" variant="outline" disabled={busy === m.id} onClick={() => check(m)}>{busy === m.id ? <DotLoader /> : <RefreshCw className="h-4 w-4" />}<span className="ml-1">Check page</span></Button>
                  {s?.source && <Button size="sm" variant={s.record.source_url_type === "search_page" ? "default" : "outline"} disabled={busy === m.id} onClick={() => reverify(m, s)}><ShieldCheck className="h-4 w-4" /><span className="ml-1">Re-verify live</span></Button>}
                  <Button size="sm" variant="outline" onClick={async () => { await setStatus({ data: { apiKey: apiKey!, id: m.id, status: m.status === "paused" ? "active" : "paused" } }); refresh(); }}>
                    {m.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={async () => { if (!confirm("Stop watching this record?")) return; await del({ data: { apiKey: apiKey!, id: m.id } }); deleteSnapshot(m.id); refresh(); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
