export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    const drop = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "mc_cid",
      "mc_eid",
      "ref",
      "s",
    ];
    for (const key of drop) u.searchParams.delete(key);
    u.hostname = u.hostname.replace(/^www\./, "").toLowerCase();
    let path = u.pathname.replace(/\/+$/, "") || "/";
    u.pathname = path;
    return u.toString();
  } catch {
    return raw.trim();
  }
}

export function extractDomain(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/[^\w\s%-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
