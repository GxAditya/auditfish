import { StepTimeline } from "@/components/auditfish/StepTimeline";
import { DotLoader } from "@/components/auditfish/DotLoader";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronRight, ExternalLink, History, SearchX, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { KeyRequired } from "@/components/auditfish/KeyGate";
import { RecordCard, StatusPill } from "@/components/auditfish/RecordCard";
import { findSources, watchRecord } from "@/lib/auditfish.functions";
import { addHistory, clearHistory, loadHistory, saveSnapshot, useApiKey, type HistoryItem } from "@/lib/local-store";
import { COUNTRIES } from "@/lib/registries";
import { streamVerify, type StreamEvent } from "@/lib/stream-client";
import { RECORD_TYPES, type Candidate, type SourceCheck, type SourceInfo, type VerificationResult } from "@/lib/verification";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AuditFish — Verify a licence or company registration" },
      { name: "description", content: "Check if a doctor, contractor, lawyer or company is licensed and in good standing — live from the official registry, with proof." },
      { property: "og:title", content: "AuditFish — Verify a licence or company registration" },
      { property: "og:description", content: "Live checks against official licensing boards and company registries, with a source link and change monitoring." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VerifyPage,
});

interface FormState {
  name: string;
  record_type: string;
  record_type_other: string;
  country: string;
  region: string;
  number: string;
}

function VerifyPage() {
  const { apiKey, ready } = useApiKey();
  const findSourcesFn = useServerFn(findSources);
  const watchFn = useServerFn(watchRecord);
  const [form, setForm] = useState<FormState>({ name: "", record_type: "medical", record_type_other: "", country: "United States", region: "", number: "" });
  const [sources, setSources] = useState<SourceInfo[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [finding, setFinding] = useState(false);
  const [running, setRunning] = useState(false);
  const [statusLine, setStatusLine] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [checks, setChecks] = useState<SourceCheck[]>([]);
  const [liveUrl, setLiveUrl] = useState<{ url: string; source: string } | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => setHistory(loadHistory()), []);
  const openKey = () => window.dispatchEvent(new Event("auditfish:open-key"));
  const set = (k: keyof FormState) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (k !== "name" && k !== "number") setSources(null);
  };

  async function locateSources(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey) { openKey(); return; }
    setFinding(true);
    setError(null);
    try {
      const list = await findSourcesFn({ data: { apiKey, country: form.country, region: form.region || null, record_type: form.record_type, record_type_other: form.record_type_other || null } });
      setSources(list);
      setSelected(list.slice(0, 2).map((s) => s.id));
      if (list.length === 0) setError("No official registry was found for this place and record type. Try adding a state/region or a more specific record type.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not find sources");
    } finally {
      setFinding(false);
    }
  }

  async function run(target: Candidate | null = null, srcOverride?: SourceInfo[]) {
    if (!apiKey || !sources) return;
    const chosen = srcOverride ?? sources.filter((s) => selected.includes(s.id));
    if (chosen.length === 0) { toast.error("Choose at least one official source"); return; }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setResult(null);
    setError(null);
    setWatched(null);
    setSteps([]);
    setChecks([]);
    setLiveUrl(null);
    setStatusLine("Starting…");
    try {
      await streamVerify(
        apiKey,
        {
          name: form.name,
          record_type: form.record_type,
          record_type_other: form.record_type_other || null,
          country: form.country,
          region: form.region || null,
          number: form.number || null,
          sources: chosen,
          target,
        },
        (ev: StreamEvent) => {
          if (ev.type === "status") setStatusLine(ev.message);
          else if (ev.type === "progress") setSteps((s) => [...s.slice(-30), ev.message]);
          else if (ev.type === "streaming_url") setLiveUrl({ url: ev.url, source: ev.source });
          else if (ev.type === "source_done") setChecks((c) => [...c, ev.check]);
          else if (ev.type === "result") {
            setResult(ev.result);
            addHistory(ev.result);
            setHistory(loadHistory());
          } else if (ev.type === "error") setError(ev.message);
        },
        ac.signal,
      );
    } catch (err) {
      if (!ac.signal.aborted) setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setRunning(false);
    }
  }

  async function watch() {
    const rec = result?.records[0];
    if (!apiKey || !rec || !result) return;
    try {
      const { id } = await watchFn({
        data: {
          apiKey,
          name: `AuditFish: ${rec.holder_name}${rec.number ? ` #${rec.number}` : ""}`,
          url: rec.source_url,
          purpose: `Flag when the registry record for ${rec.holder_name}${rec.number ? ` (${rec.number})` : ""} changes status (currently "${rec.status_raw ?? rec.status}"), expiry date (currently ${rec.expiry_date ?? "not shown"}), or gains any disciplinary action, suspension, revocation or condition.`,
        },
      });
      saveSnapshot({ monitor_id: id, record: rec, query: result.query, source: sources?.find((s) => s.name === rec.registry_name) });
      setWatched(id);
      toast.success("Watching this record daily. See your Watchlist.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create monitor");
    }
  }

  const recheck = () => {
    const rec = result?.records[0];
    if (!rec || !sources) return;
    const src = sources.find((s) => s.name === rec.registry_name);
    run({ holder_name: rec.holder_name, number: rec.number, location: rec.address, status_raw: rec.status_raw, status: rec.status, detail_url: rec.source_url }, src ? [src] : undefined);
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl">Verify a licence or registration</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Checked live against the official licensing board or company registry, with a link to prove it.</p>
        </div>
        <Button variant="outline" onClick={() => setHistoryOpen(true)}>
          <History className="mr-2 h-4 w-4" />Recent checks
          {history.length > 0 && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{history.length}</span>}
        </Button>
      </section>
      <div className="min-w-0 space-y-6">

      {ready && !apiKey ? (
        <KeyRequired onOpen={openKey} />
      ) : (
        <form onSubmit={locateSources} className="grid gap-4 rounded-lg border border-border bg-card p-5 shadow-sm md:grid-cols-6">
          <StepHeader n={1} title="Who are you checking?" className="md:col-span-6" />
          <div className="md:col-span-3">
            <Label htmlFor="name">Person or business name</Label>
            <Input id="name" required minLength={2} value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Jane Smith or Acme Builders Ltd" />
          </div>
          <div className="md:col-span-3">
            <Label>Licence or record type</Label>
            <Select value={form.record_type} onValueChange={set("record_type")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RECORD_TYPES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.record_type === "other" && (
            <div className="md:col-span-6">
              <Label htmlFor="other">Describe the licence or record</Label>
              <Input id="other" required value={form.record_type_other} onChange={(e) => set("record_type_other")(e.target.value)} placeholder="e.g. pharmacist licence, real estate broker, electrician" />
            </div>
          )}
          <div className="md:col-span-2">
            <Label>Country</Label>
            <Select value={form.country} onValueChange={set("country")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="region">State / province / region</Label>
            <Input id="region" value={form.region} onChange={(e) => set("region")(e.target.value)} placeholder="Optional, e.g. California" />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="num">Licence / registration no.</Label>
            <Input id="num" className="font-mono" value={form.number} onChange={(e) => set("number")(e.target.value)} placeholder="Optional, narrows the match" />
          </div>
          <div className="md:col-span-6">
            <Button type="submit" disabled={finding || running}>
              {finding && <DotLoader className="mr-2" />}Find official sources
            </Button>
          </div>
        </form>
      )}

      {sources && sources.length > 0 && (
        <section className="af-enter rounded-lg border border-border bg-card p-5 shadow-sm">
          <StepHeader n={2} title="Official sources to check" />
          <p className="mt-1 text-sm text-muted-foreground">Up to two are searched in order. Only government and statutory regulator sites are used.</p>
          <ul className="mt-4 space-y-2">
            {sources.map((s, idx) => {
              const on = selected.includes(s.id);
              const order = on ? selected.indexOf(s.id) + 1 : null;
              return (
                <li key={s.id} className="af-enter" style={{ ["--i" as string]: idx + 1 }}>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-md px-3.5 py-3 transition-colors duration-150 ${on ? "bg-primary/[0.07]" : "bg-muted/50 hover:bg-muted"}`}>
                    <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]" checked={on} onChange={(e) => setSelected((sel) => (e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id)))} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold leading-5">{s.name}</p>
                        <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${s.kind === "known" ? "bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`}>{s.kind === "known" ? "verified list" : "found by search"}</span>
                      </div>
                      <a href={s.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-0.5 inline-block font-mono text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">{s.domain}</a>
                      {s.notes && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/80">{s.notes}</p>}
                    </div>
                    {order && <span className="shrink-0 font-mono text-[10px] text-primary">#{order}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
          <Button className="mt-4" disabled={running || !form.name.trim()} onClick={() => run(null)}>
            {running && <DotLoader className="mr-2" />}Verify now
          </Button>
        </section>
      )}

      {(running || liveUrl || checks.length > 0) && (
        <section className="af-enter grid gap-4 md:grid-cols-5">
          <div className="rounded-md border border-border bg-card p-4 md:col-span-2">
            <h3 className="text-lg">Live check</h3>
            <div className="mt-1 flex items-center gap-2 text-sm">{running && <DotLoader size={20} className="text-primary" />}{running ? <span className="af-glow-text font-medium">{statusLine}</span> : "Finished"}</div>
            {checks.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {checks.map((c, i) => (
                  <li key={i} className="af-enter rounded-md bg-muted/50 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold">{c.registry_name}</p>
                      <span className="shrink-0 rounded bg-background px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{c.result.replace("_", " ")}</span>
                    </div>
                    {c.message && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{c.message}</p>}
                    {c.searches?.length > 0 && <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted-foreground/80">Searched: {c.searches.join(" → ")}</p>}
                  </li>
                ))}
              </ul>
            )}
            <StepTimeline steps={steps} running={running} />
          </div>
          <div className="overflow-hidden rounded-md border border-border bg-muted md:col-span-3">
            {liveUrl ? (
              <>
                <p className="bg-card px-3 py-1.5 text-xs text-muted-foreground">Agent browser on {liveUrl.source}</p>
                <iframe title="Live agent browser" src={liveUrl.url} className="h-80 w-full" />
              </>
            ) : (
              <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">Waiting for the browser to open…</div>
            )}
          </div>
        </section>
      )}

      {error && (
        <div className="af-enter flex gap-3 rounded-md border border-danger/30 bg-danger-soft p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-danger" />
          <p>{error}</p>
        </div>
      )}

      {result && <ResultView result={result} onPick={(c) => run(c)} onWatch={watch} onRecheck={recheck} watched={!!watched} running={running} />}

      </div>
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-2 pr-12">
            <div>
              <SheetTitle className="font-display text-base font-bold tracking-tight">Recent checks</SheetTitle>
              <SheetDescription className="text-xs">Open a past check to show its result again.</SheetDescription>
            </div>
            {history.length > 0 && (
              <button onClick={() => { clearHistory(); setHistory([]); }} className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Clear</button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            {history.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <History className="mx-auto h-5 w-5 text-muted-foreground/40" />
                <p className="mt-2 text-xs text-muted-foreground">Checks you run will be listed here.</p>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {history.map((h) => (
                  <li key={h.id}>
                    <button className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted" onClick={() => { setResult(h.result); setHistoryOpen(false); }}>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${historyDot(h)}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{h.result.query.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[h.result.query.record_type, h.result.query.region, h.result.query.country].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{timeAgo(h.saved_at)}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function historyDot(h: HistoryItem): string {
  const key = h.result.records[0]?.status ?? h.result.outcome;
  if (key === "active" || key === "match") return "bg-success";
  if (key === "expired" || key === "multiple_matches") return "bg-warning";
  if (key === "suspended" || key === "revoked" || key === "source_error") return "bg-danger";
  return "bg-muted-foreground/40";
}

function StepHeader({ n, title, className }: { n: number; title: string; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary font-display text-xs font-bold text-primary-foreground">{n}</span>
      <h2 className="text-lg">{title}</h2>
    </div>
  );
}

function ResultView({ result, onPick, onWatch, onRecheck, watched, running }: { result: VerificationResult; onPick: (c: Candidate) => void; onWatch: () => void; onRecheck: () => void; watched: boolean; running: boolean }) {
  const icon = { match: CheckCircle2, multiple_matches: Users, no_match: SearchX, source_error: AlertTriangle }[result.outcome];
  const Icon = icon;
  return (
    <section className="af-enter space-y-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-1 h-5 w-5 text-primary" />
        <div>
          <h2 className="text-2xl">{{ match: "Verified record", multiple_matches: "Several possible matches", no_match: "No matching record", source_error: "Source could not be checked" }[result.outcome]}</h2>
          <p className="text-sm text-muted-foreground">{result.message}</p>
        </div>
      </div>

      {result.records.map((r, i) => (
        <RecordCard key={i} record={r} json={result} onWatch={onWatch} onRecheck={onRecheck} watching={watched} busy={running} />
      ))}

      {result.outcome === "multiple_matches" && (
        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-sm font-semibold">Several possible matches</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Choose the right entry. AuditFish will open its official detail page and extract the full record.</p>
          <ul className="mt-3 space-y-2">
            {result.candidates.map((c, i) => (
              <li key={i} className="af-enter flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 px-3.5 py-3" style={{ ["--i" as string]: i }}>
                <div>
                  <p className="text-sm font-semibold">{c.holder_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground"><span className="font-mono">{c.number ?? "no number shown"}</span>{c.location && ` · ${c.location}`}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={c.status} />
                  <Button size="sm" variant="outline" disabled={running} onClick={() => onPick(c)}>This one</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(result.outcome === "no_match" || result.outcome === "source_error") && (
        <div className="rounded-md border border-border bg-card p-4 text-sm">
          <p className="mb-2">Searched for <span className="font-medium">“{result.query.name}”</span>{result.query.number && <> with number <span className="font-mono">{result.query.number}</span></>}. Open the registry to check manually:</p>
          <ul className="space-y-2">
            {result.sources_checked.map((s, i) => (
              <li key={i} className="rounded-md bg-muted/50 px-3.5 py-2.5">
                <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">{s.registry_name}<ExternalLink className="h-3 w-3" /></a>
                {s.message && <p className="mt-0.5 text-xs text-muted-foreground">{s.message}</p>}
                {s.searches?.length > 0 && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/80">Searched: {s.searches.join(" → ")}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="rounded-md border border-border bg-card">
        <summary className="cursor-pointer px-4 py-2 text-sm"><ShieldCheck className="mr-1 inline h-4 w-4" />Structured JSON (auditfish.v1) — <Link to="/api" className="underline">schema</Link></summary>
        <pre className="mx-3 mb-3 max-h-96 overflow-auto rounded-md bg-muted/50 p-4 font-mono text-xs">{JSON.stringify(result, null, 2)}</pre>
      </details>
    </section>
  );
}
