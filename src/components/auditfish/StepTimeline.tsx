import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { DotLoader } from "@/components/auditfish/DotLoader";
import { cn } from "@/lib/utils";

/** Vertical checkpoint tree: each streamed action becomes a node; the newest one is "in progress" while running. */
export function StepTimeline({ steps, running }: { steps: string[]; running: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [steps.length]);

  if (steps.length === 0) {
    return <p className="mt-4 text-xs text-muted-foreground">{running ? "Starting the agent…" : "No actions recorded."}</p>;
  }

  return (
    <div ref={ref} className="mt-4 max-h-72 overflow-auto pr-1">
      <ol className="relative">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          const active = last && running;
          return (
            <li key={i} className="af-node relative flex gap-3 pb-3 last:pb-0">
              {!last && <span aria-hidden className="af-rail absolute left-[9px] top-5 bottom-0 w-px bg-border" />}
              <span
                className={cn(
                  "relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
                  active ? "border-primary/40 bg-card text-primary" : "border-primary bg-primary text-primary-foreground",
                )}
              >
                {active ? <DotLoader size={11} /> : <Check className="af-check h-3 w-3" strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-xs leading-5", active ? "af-glow-text font-medium" : "text-foreground")}>{s}</p>
                <p className="font-mono text-[10px] text-muted-foreground">Step {i + 1}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
