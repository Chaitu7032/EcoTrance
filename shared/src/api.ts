import type {
  Audit,
  AuditEngineState,
  AuditMetrics,
  Claim,
  ClaimEvent,
  CompanyCandidate,
  CreditSnapshot,
  Evidence,
  EvidenceGap,
  EvidenceGraph,
  SearchRequestRecord,
  Subclaim,
} from "./models.js";
import type { AuditMode, AuditStage, ClaimStatus } from "./enums.js";

export interface CreateAuditRequest {
  company: string;
  mode: AuditMode;
  selectedDomain?: string;
}

export interface CreateAuditResponse {
  audit: Audit;
  candidates?: CompanyCandidate[];
  estimate: CreditSnapshot;
}

export interface AuditStatusResponse {
  audit: Audit;
  stage: AuditStage;
  engines: AuditEngineState[];
  credits: CreditSnapshot;
  notes: string[];
}

export interface AuditDetailResponse {
  audit: Audit;
  metrics: AuditMetrics | null;
  claims: Claim[];
  engines: AuditEngineState[];
  credits: CreditSnapshot;
  gaps: EvidenceGap[];
}

export interface ClaimDetailResponse {
  claim: Claim;
  subclaims: Subclaim[];
  evidence: Evidence[];
  gap: EvidenceGap | null;
  events: ClaimEvent[];
}

export interface SearchTraceResponse {
  requests: SearchRequestRecord[];
}

export interface ExportAuditResponse {
  markdown: string;
  filename: string;
}

export interface ClaimFilter {
  status?: ClaimStatus;
}
