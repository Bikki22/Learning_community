import { Router } from "express";
import { UserController } from "./user.controller";
import { requireUser } from "../../middlewares/auth.middleware";

const router = Router();
const userController = new UserController();

router.get("/", userController.getAllUsers);
router.get("/me", requireUser, userController.getMe);

export default router;