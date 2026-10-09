import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PlusCircle, Clock, CheckCircle, AlertTriangle, XCircle, Loader } from "lucide-react";
import { api } from "../api";
import { Shell } from "../components/Shell";
import { STAGE_LABELS } from "../lib/labels";

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle size={14} className="text-emerald-400" />;
    case "partial":
      return <AlertTriangle size={14} className="text-amber-300" />;
    case "failed":
      return <XCircle size={14} className="text-rose-400" />;
    case "running":
    case "queued":
      return <Loader size={14} className="text-sky-400 animate-spin" />;
    default:
      return <Clock size={14} className="text-stone-400" />;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "completed": return "text-emerald-400";
    case "partial": return "text-amber-300";
    case "failed": return "text-rose-400";
    case "running":
    case "queued": return "text-sky-400";
    default: return "text-stone-400";
  }
}

export function AuditsPage() {
  const audits = useQuery({
    queryKey: ["audits"],
    queryFn: () => api.listAudits(),
    refetchInterval: (q) => {
      const hasRunning = (q.state.data?.audits ?? []).some(
        (a) => a.status === "running" || a.status === "queued",
      );
      return hasRunning ? 2000 : false;
    },
  });

  return (
    <Shell>
      <div className="space-y-6">
        {/* Page header */}
        <header className="border-b border-[#22303a] pb-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#34d399]">
                INVESTIGATION ARCHIVE
              </span>
              <h1 className="mt-2 font-serif text-3xl font-medium tracking-tight text-[#f4f1ea]">
                Audit History
              </h1>
              <p className="mt-1 text-xs text-[#8e99a2]">
                All evidence audits run in this session, most recent first.
              </p>
            </div>
            <Link
              to="/"
              className="flex items-center gap-1.5 rounded border border-[#2d5a43] bg-[#14231b] px-3.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-[#1a3025] transition-colors"
            >
              <PlusCircle size={13} />
              New Audit
            </Link>
          </div>
        </header>

        {/* Audit list */}
        {audits.isLoading ? (
          <div className="py-16 text-center">
            <p className="font-mono text-xs text-[#34d399] uppercase tracking-widest">Loading archive…</p>
          </div>
        ) : audits.data?.audits.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-[#8e99a2]">No audits run yet.</p>
            <Link to="/" className="mt-4 inline-block text-xs text-[#34d399] hover:underline">
              Start your first audit →
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {(audits.data?.audits ?? [])
              .slice()
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((audit) => (
                <Link
                  key={audit.id}
                  to={`/audit/${audit.id}`}
                  className="group flex items-center justify-between gap-4 rounded border border-[#22303a] bg-[#121a20] px-5 py-4 text-xs transition-colors hover:border-[#3e7b5c] hover:bg-[#0e171c]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusIcon status={audit.status} />
                    <div className="min-w-0">
                      <p className="font-serif text-base font-medium text-[#f4f1ea] group-hover:text-emerald-300 truncate">
                        {audit.companyName}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] text-[#8e99a2]">
                        <span className="uppercase">{audit.mode} mode</span>
                        <span>·</span>
                        <span>ID: {audit.id.slice(0, 8)}</span>
                        <span>·</span>
                        <span>{new Date(audit.createdAt).toLocaleString()}</span>
                        {audit.mockMode ? (
                          <>
                            <span>·</span>
                            <span className="text-amber-400">demo data</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className={`font-mono text-xs font-medium uppercase ${statusColor(audit.status)}`}>
                      {audit.status}
                    </p>
                    {audit.status === "running" || audit.status === "queued" ? (
                      <p className="mt-0.5 text-[10px] text-[#8e99a2]">
                        {STAGE_LABELS[audit.stage] ?? audit.stage.replace(/_/g, " ")}
                      </p>
                    ) : audit.completedAt ? (
                      <p className="mt-0.5 font-mono text-[10px] text-[#8e99a2]">
                        Concluded {new Date(audit.completedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                </Link>
              ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
