import { createHash } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function cacheKey(engine: string, query: string, params: Record<string, unknown> = {}): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k] ?? "")}`)
    .join("&");
  return sha256(`${engine}|${query}|${sorted}`);
}
