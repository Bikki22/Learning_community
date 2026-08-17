import { Router } from "express";
import { ClerkWebhookController } from "./clerkWebhook.controller";

const router = Router();
const clerkWebhookController = new ClerkWebhookController();

router.post("/", clerkWebhookController.handleWebhook);

export default router;
