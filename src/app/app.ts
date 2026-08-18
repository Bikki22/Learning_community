import express, { Request, Response, NextFunction } from "express";
import "dotenv/config";
import v1Router from "./routes/v1";
import clerkWebhookRouter from "./modules/webhooks/clerkWebhook.routes";
import { env } from "./config/env";
import { clerkMiddleware } from "@clerk/express";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import logger from "./lib/logger";

export const createApplication = () => {
  const app = express();

  // Webhook route - must use raw body before express.json() middleware
  app.post(
    "/webhooks/clerk",
    express.raw({ type: "application/json" }),
    clerkWebhookRouter,
  );

  // Middleware
  app.use(express.json());
  app.use(clerkMiddleware());

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;
      const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;

      if (res.statusCode >= 500) {
        logger.error(message);
      } else if (res.statusCode >= 400) {
        logger.warn(message);
      } else {
        logger.info(message);
      }
    });

    next();
  });

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      message: "Service healthy",
    });
  });

  // API routes
  app.use(env.API_PREFIX, v1Router);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler - must be last
  app.use(errorHandler);

  return app;
};