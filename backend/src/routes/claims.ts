import { Router } from "express";
import { getClaim, getClaimEvidence, reanalyzeClaim } from "../controllers/auditController.js";

export const claimRouter = Router();

claimRouter.get("/:id", getClaim);
claimRouter.get("/:id/evidence", getClaimEvidence);
claimRouter.post("/:id/reanalyze", reanalyzeClaim);
