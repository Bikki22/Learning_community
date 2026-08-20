import { Router } from "express";
import userRoutes from "../../modules/users/user.routes";
import communityRoutes from "../../modules/community/community.routes";
import chatRoutes from "../../modules/chat/chat.routes";

const router = Router();

router.use("/users", userRoutes);
router.use("/communities", communityRoutes);
router.use("/chats", chatRoutes);

export default router;
