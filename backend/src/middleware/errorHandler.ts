import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";
import { ZodError } from "zod";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", details: err.flatten() });
    return;
  }
  const message = err instanceof Error ? err.message : "Internal error";
  logger.error({ msg: "request_error", error: message });
  res.status(500).json({ error: env.NODE_ENV === "production" ? "Internal server error" : message });
}
