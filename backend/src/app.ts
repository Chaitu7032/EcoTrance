import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { auditRouter } from "./routes/audits.js";
import { claimRouter } from "./routes/claims.js";
import { health, healthSerpApi } from "./controllers/auditController.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get("/api/health", health);
  app.get("/api/health/serpapi", healthSerpApi);
  app.use("/api/audits", auditRouter);
  app.use("/api/claims", claimRouter);
  app.use(errorHandler);
  return app;
}
