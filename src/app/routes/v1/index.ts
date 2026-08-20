import { Router } from "express";
import userRoutes from "../../modules/users/user.routes";
import communityRoutes from "../../modules/community/community.routes";

const router = Router();

router.use("/users", userRoutes);
router.use("/communities", communityRoutes);

export default router;
