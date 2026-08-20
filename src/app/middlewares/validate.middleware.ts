import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { ApiError } from "../lib/ApiError";

type Source = "body" | "query" | "params";

export function validate(schema: ZodSchema, source: Source = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => issue.message);
      throw new ApiError(400, "Validation failed", errors);
    }
    req[source] = result.data;
    next();
  };
}
