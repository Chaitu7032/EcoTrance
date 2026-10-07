import { Router } from "express";
import {
  createAudit,
  estimate,
  exportAudit,
  getAudit,
  getClaims,
  getEvidence,
  getGraph,
  getMetrics,
  getSearchTrace,
  getStatus,
  getTimeline,
} from "../controllers/auditController.js";

export const auditRouter = Router();

auditRouter.get("/estimate", estimate);
auditRouter.post("/", createAudit);
auditRouter.get("/:id", getAudit);
auditRouter.get("/:id/status", getStatus);
auditRouter.get("/:id/claims", getClaims);
auditRouter.get("/:id/evidence", getEvidence);
auditRouter.get("/:id/graph", getGraph);
auditRouter.get("/:id/timeline", getTimeline);
auditRouter.get("/:id/search-trace", getSearchTrace);
auditRouter.get("/:id/metrics", getMetrics);
auditRouter.get("/:id/export", exportAudit);
