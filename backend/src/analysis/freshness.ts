import type { FreshnessBand } from "@ecotrace/shared";

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;
  const year = value.match(/\b(19|20)\d{2}\b/);
  if (year) return new Date(`${year[0]}-06-15`);
  return null;
}

export function freshnessBand(publishedAt: string | null, now = new Date()): FreshnessBand {
  const d = parseDate(publishedAt);
  if (!d) return "UNKNOWN";
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 90) return "FRESH";
  if (days < 365) return "RECENT";
  if (days < 365 * 3) return "OLDER";
  return "HISTORICAL";
}

export function freshnessScore(publishedAt: string | null, now = new Date()): number {
  const band = freshnessBand(publishedAt, now);
  switch (band) {
    case "FRESH":
      return 1;
    case "RECENT":
      return 0.75;
    case "OLDER":
      return 0.45;
    case "HISTORICAL":
      return 0.2;
    default:
      return 0.35;
  }
}
