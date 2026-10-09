import { STATUS_LABELS } from "../lib/labels";

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, " ");

  const styles: Record<string, string> = {
    SUPPORTED: "border-emerald-800/60 bg-emerald-950/40 text-emerald-300",
    PARTIALLY_SUPPORTED: "border-amber-800/60 bg-amber-950/40 text-amber-200",
    EVIDENCE_CONFLICT: "border-rose-800/60 bg-rose-950/40 text-rose-300",
    NEEDS_HUMAN_REVIEW: "border-orange-800/60 bg-orange-950/40 text-orange-200",
    INSUFFICIENT_EVIDENCE: "border-stone-700/60 bg-stone-900/60 text-stone-300",
    PENDING: "border-stone-700/60 bg-stone-900/50 text-stone-400",
  };

  const currentStyle = styles[status] ?? "border-stone-700/60 bg-stone-900/50 text-stone-400";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase font-medium ${currentStyle}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}
