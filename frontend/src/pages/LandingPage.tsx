import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { api } from "../api";
import { Shell } from "../components/Shell";
import { MethodologyModal } from "../components/MethodologyModal";

export function LandingPage() {
  const nav = useNavigate();
  const [company, setCompany] = useState("");
  const [mode, setMode] = useState<"quick" | "deep">("quick");
  const [confirmDeep, setConfirmDeep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState(false);

  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const estimate = useQuery({
    queryKey: ["estimate", mode],
    queryFn: () => api.estimate(mode),
  });

  async function start(nextMode: "quick" | "deep") {
    setError(null);
    if (!company.trim()) {
      setError("Please enter a company name or corporate entity to audit.");
      return;
    }
    if (nextMode === "deep" && !confirmDeep) {
      setMode("deep");
      setConfirmDeep(true);
      return;
    }
    setBusy(true);
    try {
      const res = await api.createAudit(company.trim(), nextMode);
      nav(`/audit/${res.audit.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not initialize audit session");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void start(mode);
  }

  return (
    <Shell mockMode={health.data?.mockMode}>
      <div className="py-6 sm:py-10">
        {/* Editorial Headline */}
        <section className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#34d399]">
                RESEARCH WORKBENCH
              </span>
              <span className="text-[#8e99a2]">·</span>
              <span className="text-[11px] text-[#8e99a2]">Evidence Verification</span>
            </div>

            <h1 className="mt-4 font-serif text-3xl font-medium tracking-tight text-[#f4f1ea] sm:text-5xl sm:leading-[1.15]">
              Companies publish corporate narratives.
              <br />
              <span className="text-[#8e99a2]">EcoTrace verifies them against public evidence.</span>
            </h1>

            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-[#8e99a2]">
              An analytical research workbench that discovers environmental claims from public web sources, decomposes them into testable subclaims, and gathers multi-engine corroboration across news, science, and public disclosures.
            </p>

            {/* Audit Launch Terminal Card */}
            <form
              onSubmit={onSubmit}
              className="mt-8 rounded border border-[#22303a] bg-[#121a20] p-6 text-[#f4f1ea] shadow-sm"
            >
              <label htmlFor="company" className="block font-mono text-[11px] tracking-wider text-[#8e99a2] uppercase">
                TARGET COMPANY OR ENTITY NAME
              </label>

              <div className="mt-2.5 flex flex-col sm:flex-row gap-3">
                <input
                  id="company"
                  type="text"
                  className="w-full rounded border border-[#22303a] bg-[#0c1216] px-3.5 py-2.5 text-sm text-[#f4f1ea] placeholder-[#8e99a2]/50 focus-ring"
                  placeholder="e.g. IKEA, Unilever, Patagonia, H&M"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  autoComplete="off"
                />

                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void start("quick")}
                    className="flex items-center justify-center gap-1.5 rounded border border-[#22303a] bg-[#162028] px-4 py-2.5 text-xs font-medium text-[#f4f1ea] hover:border-[#34d399] transition-colors focus-ring disabled:opacity-50"
                  >
                    Quick Audit
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void start("deep")}
                    className="flex items-center justify-center gap-1.5 rounded border border-[#2d5a43] bg-[#14231b] px-4 py-2.5 text-xs font-medium text-emerald-300 hover:bg-[#1a3025] transition-colors focus-ring disabled:opacity-50"
                  >
                    Deep Audit
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
              <div className="mt-3.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setMethod(true)}
                  className="text-[11px] text-[#34d399] hover:underline"
                >
                  View Scoring Rules
                </button>
              </div>

              {confirmDeep && mode === "deep" ? (
                <div className="mt-4 rounded border border-amber-800/40 bg-amber-950/20 p-3.5 text-xs text-amber-200">
                  <p className="font-medium text-amber-100">Deep Audit Confirmation</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80">
                    Allocates up to {estimate.data?.estimate.estimated ?? 16} search requests across Web, News, Scholar, Shopping, and Google Trends. Cached queries consume zero search credits. Click <strong>Deep Audit</strong> again to proceed.
                  </p>
                </div>
              ) : null}

              {error ? (
                <p className="mt-3 text-xs text-rose-400 font-medium">{error}</p>
              ) : null}

              {busy ? (
                <p className="mt-3 text-xs font-mono text-[#34d399]">
                  Initializing evidence collection pipeline…
                </p>
              ) : null}
            </form>
          </div>

          {/* Editorial Workbench Architecture Panel */}
          <aside className="rounded border border-[#22303a] bg-[#121a20] p-6 text-xs text-[#8e99a2]">
            <p className="font-mono text-[10px] tracking-widest uppercase text-[#34d399]">
              INVESTIGATION PROTOCOL
            </p>

            <ul className="mt-4 space-y-3.5 leading-relaxed">
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 font-mono text-[10px] text-stone-500">01</span>
                <span>
                  <strong className="text-[#f4f1ea] font-medium">Source-Grounded Extraction:</strong> Discovers published corporate claims while filtering out questions, site navigation, and ungrounded slogans.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 font-mono text-[10px] text-stone-500">02</span>
                <span>
                  <strong className="text-[#f4f1ea] font-medium">Query Planning:</strong> Generates targeted queries to locate both supportive documentation and independent criticism.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 font-mono text-[10px] text-stone-500">03</span>
                <span>
                  <strong className="text-[#f4f1ea] font-medium">Independence Clustering:</strong> Prevents syndicated wire releases and same-publisher articles from artificially inflating corroboration.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 font-mono text-[10px] text-stone-500">04</span>
                <span>
                  <strong className="text-[#f4f1ea] font-medium">Claim Integrity Indicator:</strong> A weighted composite of coverage, independence, consistency, freshness, and claim specificity.
                </span>
              </li>
            </ul>


          </aside>
        </section>
      </div>

      <MethodologyModal open={method} onClose={() => setMethod(false)} />
    </Shell>
  );
}
