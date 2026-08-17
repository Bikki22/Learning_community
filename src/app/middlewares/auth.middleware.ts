import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  req.userId = userId;

  next();
}
