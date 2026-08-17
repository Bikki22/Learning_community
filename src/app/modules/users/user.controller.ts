import { Request, Response } from "express";
import { UserRepository } from "../../repository/user.repository";
import { AsyncHandler } from "../../lib/AsyncHandler";
import { ApiResponse } from "../../lib/ApiResponse";
import { ApiError } from "../../lib/ApiError";

export class UserController {
  private userRepository = new UserRepository();

  /**
   * GET /users - returns all non-deleted users.
   */
  getAllUsers = AsyncHandler(async (_req: Request, res: Response) => {
    const users = await this.userRepository.getAllUsers();
    res.status(200).json(new ApiResponse(200, users, "Users fetched"));
  });

  /**
   * GET /users/me - returns the authenticated user's profile.
   * Requires the requireUser middleware to have populated req.userId.
   */
  getMe = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const user = await this.userRepository.getCurrentUser(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found in database");
    }

    res.status(200).json(new ApiResponse(200, user, "User fetched"));
  });
}
