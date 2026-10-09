import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ShieldCheck } from "lucide-react";
import { DISCLAIMER } from "../lib/labels";
import { MethodologyModal } from "./MethodologyModal";

export function Shell({
  children,
  mockMode,
}: {
  children: React.ReactNode;
  mockMode?: boolean;
}) {
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0c1216] text-[#f4f1ea]">
      <header 
        className="sticky top-0 z-30 border-b border-[#22303a] backdrop-blur-sm"
        style={{ backgroundImage: 'url(/bg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundBlendMode: 'overlay', backgroundColor: 'rgba(12, 18, 22, 0.90)' }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <Link to="/" className="focus-ring flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded border border-[#2d5a43] bg-[#14231b] text-emerald-400 font-mono text-xs font-bold tracking-tighter">
              ET
            </div>
            <div>
              <span className="block font-mono text-xs font-semibold tracking-[0.25em] text-[#f4f1ea]">
                ECOTRACE
              </span>
              <span className="hidden font-mono text-[9px] tracking-widest text-[#8e99a2] sm:block">
                ENVIRONMENTAL CLAIM INVESTIGATION ENGINE
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3 text-xs">
            {mockMode ? (
              <span className="rounded border border-amber-800/60 bg-amber-950/40 px-2 py-0.5 font-mono text-[10px] text-amber-200 uppercase tracking-wider">
                Deterministic Mock Data
              </span>
            ) : (
              <span className="hidden items-center gap-1 rounded border border-[#22303a] bg-[#121a20] px-2 py-0.5 font-mono text-[10px] text-[#8e99a2] sm:flex">
                <ShieldCheck size={12} className="text-emerald-400" /> Live Search Mode
              </span>
            )}

            <button
              type="button"
              onClick={() => setMethodologyOpen(true)}
              className="flex items-center gap-1.5 rounded border border-[#22303a] bg-[#121a20] px-2.5 py-1 text-xs text-[#8e99a2] hover:border-[#384d5c] hover:text-[#f4f1ea] transition-colors focus-ring"
            >
              <BookOpen size={13} />
              <span>Methodology</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-5 py-6">{children}</main>

      <footer className="mx-auto max-w-7xl px-5 pt-8 pb-12 border-t border-[#22303a]/60 text-[11px] leading-relaxed text-[#8e99a2]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-3">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#8e99a2]">
            EcoTrace Investigation Terminal
          </span>
          <button
            type="button"
            onClick={() => setMethodologyOpen(true)}
            className="text-[11px] text-[#34d399] hover:underline"
          >
            Review Audit Scoring Methodology
          </button>
        </div>
        <p className="max-w-4xl text-[#8e99a2]/80">{DISCLAIMER}</p>
      </footer>

      <MethodologyModal open={methodologyOpen} onClose={() => setMethodologyOpen(false)} />
    </div>
  );
}
