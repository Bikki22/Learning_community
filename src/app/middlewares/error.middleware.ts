import { Request, Response, NextFunction } from "express";
import { ApiError } from "../lib/ApiError";
import logger from "../lib/logger";

export function errorHandler(
  err: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    logger.warn(`API Error: ${err.message}`, {
      statusCode: err.statusCode,
      path: req.originalUrl,
      method: req.method,
    });
    return res.status(err.statusCode).json({
      success: false,
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors,
    });
  }

  // Unknown error
  logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  });

  return res.status(500).json({
    success: false,
    statusCode: 500,
    message: "Internal Server Error",
    errors: [],
  });
}

export function notFoundHandler(req: Request, res: Response) {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: "Route not found",
    errors: [],
  });
}