import { STATUS_LABELS, statusColor } from "../lib/labels";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`font-mono text-[11px] tracking-[0.12em] ${statusColor(status)}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
