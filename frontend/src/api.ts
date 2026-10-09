import type {
  AuditDetailResponse,
  AuditStatusResponse,
  ClaimDetailResponse,
  CreateAuditResponse,
  CreditSnapshot,
  Evidence,
  EvidenceGraph,
  ExportAuditResponse,
  SearchTraceResponse,
} from "@ecotrace/shared";
import type { ClaimEvent } from "@ecotrace/shared";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => json<{ ok: boolean; mockMode: boolean; serpapiConfigured: boolean }>("/api/health"),
  estimate: (mode: "quick" | "deep") =>
    json<{ estimate: CreditSnapshot; engines: string[] }>(`/api/audits/estimate?mode=${mode}`),
  createAudit: (company: string, mode: "quick" | "deep") =>
    json<CreateAuditResponse>("/api/audits", {
      method: "POST",
      body: JSON.stringify({ company, mode }),
    }),
  getAudit: (id: string) => json<AuditDetailResponse>(`/api/audits/${id}`),
  getStatus: (id: string) => json<AuditStatusResponse>(`/api/audits/${id}/status`),
  getGraph: (id: string) => json<EvidenceGraph>(`/api/audits/${id}/graph`),
  getTimeline: (id: string) => json<{ events: ClaimEvent[] }>(`/api/audits/${id}/timeline`),
  getTrace: (id: string) => json<SearchTraceResponse>(`/api/audits/${id}/search-trace`),
  getClaim: (id: string) => json<ClaimDetailResponse>(`/api/claims/${id}`),
  getEvidence: (id: string) => json<{ evidence: Evidence[] }>(`/api/audits/${id}/evidence`),
  exportAudit: (id: string) => json<ExportAuditResponse>(`/api/audits/${id}/export`),
  listAudits: () => json<{ audits: import("@ecotrace/shared").Audit[] }>("/api/audits"),
};
