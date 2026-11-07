import { Link, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const TABS = [
  { to: "/", label: "Verify" },
  { to: "/watchlist", label: "Watchlist" },
  { to: "/api", label: "API & schema" },
] as const;

/** clip-path inset distances: top, right, bottom, left (px) around the active tab. */
type Rect = { t: number; r: number; b: number; l: number };

/**
 * Tab bar whose active pill is a clipped copy of the label row: on tab change the
 * pill wipes from the old tab to the new one, so background and text colour morph
 * together instead of snapping.
 */
export function NavTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navRef = useRef<HTMLElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [instant, setInstant] = useState(false);

  const found = TABS.findIndex((t) =>
    t.to === "/" ? pathname === "/" : pathname === t.to || pathname.startsWith(`${t.to}/`),
  );
  const active = found === -1 ? 0 : found;

  const measure = useCallback(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLAnchorElement>(`[data-tab="${active}"]`);
    if (!nav || !el) return;
    setRect({
      l: el.offsetLeft,
      t: el.offsetTop,
      r: nav.clientWidth - el.offsetLeft - el.offsetWidth,
      b: nav.clientHeight - el.offsetTop - el.offsetHeight,
    });
  }, [active]);

  // Measured before paint so the first frame already shows the pill in the right place.
  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const onResize = () => {
      setInstant(true);
      measure();
      requestAnimationFrame(() => setInstant(false));
    };
    window.addEventListener("resize", onResize);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    ro?.observe(nav);
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(() => measure()).catch(() => {});
    }
    return () => {
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [measure]);

  const clip = rect
    ? `inset(${rect.t}px ${rect.r}px ${rect.b}px ${rect.l}px round 6px)`
    : "inset(0 100% 0 0 round 6px)";

  return (
    <div className="min-w-0 flex-1 overflow-x-auto">
      <nav ref={navRef} className="relative flex w-full min-w-max items-center justify-center gap-1">
        {TABS.map((t, i) => (
          <Link
            key={t.to}
            to={t.to}
            data-tab={i}
            activeOptions={{ exact: t.to === "/" }}
            className="af-press shrink-0 rounded-md px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground"
          >
            {t.label}
          </Link>
        ))}
        <span
          aria-hidden
          className="af-tab-clip pointer-events-none absolute inset-0 flex items-center justify-center gap-1"
          style={{ clipPath: clip, transitionDuration: instant ? "0ms" : undefined }}
        >
          {TABS.map((t) => (
            <span
              key={t.to}
              className="shrink-0 rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground"
            >
              {t.label}
            </span>
          ))}
        </span>
      </nav>
    </div>
  );
}
