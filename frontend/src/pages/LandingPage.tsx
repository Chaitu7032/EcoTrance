import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api } from "../api";
import { Shell } from "../components/Shell";
import { MethodologyModal } from "../components/MethodologyModal";

export function LandingPage() {
  const nav = useNavigate();
  const [company, setCompany] = useState("");
  const [mode, setMode] = useState<"quick" | "deep">("deep");
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
      setError("Enter a company or environmental claim.");
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
      setError(err instanceof Error ? err.message : "Could not start audit");
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
      <section className="aurora grid gap-10 rounded-2xl py-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div>
          <p className="eyebrow">Environmental claim stress-testing engine</p>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl"
          >
            Companies publish the narrative.
            <br />
            EcoTrace stress-tests it against the evidence.
          </motion.h1>
          <p className="mt-5 max-w-2xl text-mist">
            Investigate environmental claims using live web, news, scientific, product and search-trend evidence.
          </p>
          <p className="mt-3 font-mono text-[11px] tracking-[0.14em] text-mist/70">
            We don&apos;t ask AI whether a company is green. We ask the web.
          </p>

          <form onSubmit={onSubmit} className="mt-8 glass rounded-md p-4">
            <label htmlFor="company" className="font-mono text-[11px] tracking-[0.16em] text-mist">
              Company or environmental claim
            </label>
            <input
              id="company"
              className="focus-ring mt-2 w-full rounded border border-line bg-ink px-3 py-3 text-base"
              placeholder="e.g. Nike, Patagonia, Unilever"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              autoComplete="off"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className="focus-ring rounded border border-line px-4 py-2 text-sm hover:border-accent"
                disabled={busy}
                onClick={() => void start("quick")}
              >
                Start Quick Audit
              </button>
              <button
                type="button"
                className="glow-button focus-ring rounded-lg bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90"
                disabled={busy}
                onClick={() => void start("deep")}
              >
                Start Deep Audit
              </button>
              <button type="button" className="focus-ring text-sm text-mist underline" onClick={() => setMethod(true)}>
                Methodology
              </button>
            </div>
            {confirmDeep && mode === "deep" ? (
              <div className="mt-4 rounded border border-accent/20 bg-accent/5 p-3 text-sm text-mist">
                <p className="font-medium text-white">Estimated SerpApi usage</p>
                <p className="mt-1">
                  ~{estimate.data?.estimate.estimated ?? 52} searches · Engines:{" "}
                  {(estimate.data?.engines ?? []).join(", ")}
                </p>
                <p className="mt-1 text-xs">Cached hits do not consume credits. Click Start Deep Audit again to confirm.</p>
              </div>
            ) : null}
            {error ? <p className="mt-3 text-sm text-conflict">{error}</p> : null}
            {busy ? <p className="mt-3 text-sm text-accent">Opening investigation…</p> : null}
          </form>
        </div>
        <aside className="glass rounded-2xl p-6">
          <p className="font-mono text-[11px] tracking-[0.2em] text-accent">INVESTIGATION LOOP</p>
          <ul className="mt-4 space-y-3 text-sm text-mist">
            <li>Claim discovery → atomic decomposition</li>
            <li>Multi-engine SerpApi retrieval</li>
            <li>Independence clustering + conflict detection</li>
            <li>Evidence gaps + Claim Integrity Indicator</li>
            <li>Graph, timeline, and full search trace</li>
          </ul>
          <p className="mt-6 text-xs uppercase tracking-[0.16em] text-mist/60">Powered by multi-surface web intelligence</p>
        </aside>
      </section>
      <MethodologyModal open={method} onClose={() => setMethod(false)} />
    </Shell>
  );
}
