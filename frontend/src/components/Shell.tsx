import { Link } from "react-router-dom";
import { DISCLAIMER } from "../lib/labels";

export function Shell({
  children,
  mockMode,
}: {
  children: React.ReactNode;
  mockMode?: boolean;
}) {
  return (
    <div className="min-h-screen grid-bg">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-ink/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <Link to="/" className="focus-ring flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-accent/40 bg-accent/10 text-accent shadow-[0_0_22px_rgba(61,214,140,.2)]">✦</span>
            <span><span className="block font-mono text-xs tracking-[0.28em] text-accent">ECO TRACE</span><span className="hidden text-[9px] tracking-[.2em] text-mist/70 sm:block">EVIDENCE INTELLIGENCE</span></span>
          </Link>
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-mist">
            {mockMode ? (
              <span className="rounded border border-warn/40 bg-warn/10 px-2 py-1 text-warn">Demo data</span>
            ) : null}
            <span className="hidden sm:inline">Multi-surface web intelligence</span>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-5 py-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-5 pb-10 text-xs leading-relaxed text-mist/80">{DISCLAIMER}</footer>
    </div>
  );
}
