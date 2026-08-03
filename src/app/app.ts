import express, { Request, Response } from "express";
import "dotenv/config";
import v1Router from "../app/routes/v1";
import { env } from "./config/env";

export const createApplication = () => {
  const app = express();

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      message: "Service healthy",
    });
  });

  app.use(env.API_PREFIX, v1Router);

  return app;
};
