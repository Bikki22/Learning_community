import express, { Request, Response } from "express";
import "dotenv/config";
import v1Router from "./routes/v1";
import clerkWebhookRouter from "./modules/webhooks/clerkWebhook.routes";
import { env } from "./config/env";
import { clerkMiddleware } from "@clerk/express";

export const createApplication = () => {
  const app = express();

  app.post(
    "/webhooks/clerk",
    express.raw({ type: "application/json" }),
    clerkWebhookRouter,
  );

  app.use(express.json());
  app.use(clerkMiddleware());

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      message: "Service healthy",
    });
  });

  app.use(env.API_PREFIX, v1Router);

  return app;
};