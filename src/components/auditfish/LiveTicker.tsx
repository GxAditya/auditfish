import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { StepTimeline } from "@/components/auditfish/StepTimeline";
import { cn } from "@/lib/utils";

export interface LiveStep {
  source: string;
  message: string;
}

// Agent events arrive in bursts and gaps: hold each line long enough to read,
// and skip ahead rather than replaying a long backlog.
const MIN_DWELL_MS = 700;
const BACKLOG_JUMP = 3;

function useDwellIndex(count: number) {
  const [shown, setShown] = useState(-1);
  const shownAt = useRef(0);
  useEffect(() => {
    if (count === 0) {
      setShown(-1);
      return;
    }
    if (shown >= count - 1) return;
    const wait = Math.max(0, MIN_DWELL_MS - (Date.now() - shownAt.current));
    const t = setTimeout(() => {
      shownAt.current = Date.now();
      setShown((s) => (count - 1 - s > BACKLOG_JUMP ? count - 1 : s + 1));
    }, wait);
    return () => clearTimeout(t);
  }, [count, shown]);
  return Math.min(shown, count - 1);
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function formatElapsed(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

const shortName = (s: string) => s.split(/\s[–-]\s/)[0] ?? s;

/** One-line live status: the current agent action glows, then slides up as the next replaces it. */
export function LiveTicker({
  steps,
  running,
  status,
  startedAt,
  finishedAt,
  registries,
}: {
  steps: LiveStep[];
  running: boolean;
  status: string;
  startedAt: number | null;
  finishedAt: number | null;
  registries: number;
}) {
  const shown = useDwellIndex(steps.length);
  const now = useNow(running);
  const elapsed = startedAt ? (finishedAt ?? now) - startedAt : 0;
  const [open, setOpen] = useState(false);
  const [prev, setPrev] = useState<{ i: number; text: string } | null>(null);
  const last = useRef<{ i: number; text: string } | null>(null);
  const current = shown >= 0 ? steps[shown] : undefined;

  useEffect(() => {
    if (shown < 0 || !current) {
      last.current = null;
      return;
    }
    if (last.current && last.current.i !== shown) setPrev(last.current);
    last.current = { i: shown, text: current.message };
  }, [shown, current]);

  // The anchored panel belongs to the live run; the centred dialog to the finished one.
  useEffect(() => setOpen(false), [running]);

  const text = running ? (current?.message ?? status) : `Checked ${registries} registr${registries === 1 ? "y" : "ies"} · ${steps.length} step${steps.length === 1 ? "" : "s"}`;
  const meta = running ? [current ? shortName(current.source) : null, current ? `step ${shown + 1}` : null, formatElapsed(elapsed)].filter(Boolean).join(" · ") : formatElapsed(elapsed);

  const strip = (
    <div className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-card px-4 py-2.5">
      {!running && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
      <div className="min-w-0 flex-1">
        <div className="relative h-5 overflow-hidden" aria-hidden>
          {running && prev && (
            <span key={`p${prev.i}`} className="af-ticker-out absolute inset-0 truncate text-sm text-muted-foreground" onAnimationEnd={() => setPrev(null)}>
              {prev.text}
            </span>
          )}
          <span key={running ? `c${shown}` : "done"} className={cn("af-ticker-in absolute inset-0 truncate text-sm font-medium", running && "af-glow-text")}>
            {text}
          </span>
        </div>
        <p className="truncate font-mono text-[10px] text-muted-foreground">{meta}</p>
      </div>
      <span className="sr-only" aria-live="polite">
        {text}
      </span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={steps.length === 0}
        aria-label="Show all agent actions"
        aria-expanded={open}
        className="af-press flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && running && "rotate-180")} />
      </button>
    </div>
  );

  if (running) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>{strip}</PopoverAnchor>
        <PopoverContent align="end" sideOffset={6} className="w-[min(30rem,calc(100vw-2rem))] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
          <ActionTrail steps={steps} running className="max-h-[55vh] p-4" />
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <>
      {strip}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl gap-3 p-0">
          <div className="px-5 pt-5">
            <DialogTitle className="text-base">Agent actions</DialogTitle>
            <DialogDescription className="text-xs">
              {text} · {formatElapsed(elapsed)}
            </DialogDescription>
          </div>
          <ActionTrail steps={steps} running={false} className="max-h-[65vh] px-5 pb-5" />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Every agent action, grouped by the registry it was taken on. */
function ActionTrail({ steps, running, className }: { steps: LiveStep[]; running: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (running) ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [steps.length, running]);
  const groups: { source: string; messages: string[] }[] = [];
  for (const s of steps) {
    const g = groups[groups.length - 1];
    if (g && g.source === s.source) g.messages.push(s.message);
    else groups.push({ source: s.source, messages: [s.message] });
  }
  return (
    <div ref={ref} className={cn("space-y-4 overflow-auto", className)}>
      {groups.map((g, i) => (
        <section key={i}>
          <p className="mb-2 text-xs font-semibold">
            {g.source} <span className="font-normal text-muted-foreground">({g.messages.length} step{g.messages.length === 1 ? "" : "s"})</span>
          </p>
          <StepTimeline steps={g.messages} running={running && i === groups.length - 1} />
        </section>
      ))}
    </div>
  );
}
