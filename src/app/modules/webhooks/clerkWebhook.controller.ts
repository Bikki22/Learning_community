import { Request, Response } from "express";
import { Webhook } from "svix";
import { env } from "../../config/env";
import { UserRepository } from "../users/user.repository";
import { AsyncHandler } from "../../lib/AsyncHandler";
import { ApiResponse } from "../../lib/ApiResponse";
import { ApiError } from "../../lib/ApiError";

type ClerkWebhookEvent = {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{
      email_address: string;
      id: string;
    }>;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
    deleted?: boolean;
  };
};

export class ClerkWebhookController {
  private userRepository = new UserRepository();

  /**
   * Handles Clerk webhooks (user.created, user.updated, user.deleted).
   * Verifies the Svix signature and syncs users to our Postgres DB.
   * NOTE: This route is mounted with express.raw() so req.body is a Buffer
   * containing the exact raw payload needed for signature verification.
   */
  handleWebhook = AsyncHandler(async (req: Request, res: Response) => {
    // express.raw() gives us a Buffer; convert to the original string payload
    const payload =
      typeof req.body === "string"
        ? req.body
        : req.body instanceof Buffer
          ? req.body.toString()
          : JSON.stringify(req.body);

    const headers = req.headers;

    const svixId = headers["svix-id"] as string;
    const svixTimestamp = headers["svix-timestamp"] as string;
    const svixSignature = headers["svix-signature"] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new ApiError(400, "Missing svix headers");
    }

    const wh = new Webhook(env.CLERK_WEBHOOK_SIGNING_SECRET);
    let evt: ClerkWebhookEvent;

    try {
      evt = wh.verify(payload, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as ClerkWebhookEvent;
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      throw new ApiError(400, "Invalid webhook signature");
    }

    const eventType = evt.type;
    const { id, email_addresses, first_name, last_name, image_url, deleted } =
      evt.data;

    const primaryEmail = email_addresses?.[0]?.email_address;

    if (eventType === "user.created" || eventType === "user.updated") {
      if (!id || !primaryEmail) {
        throw new ApiError(400, "Missing user id or email in webhook payload");
      }

      await this.userRepository.upsertClerkUser({
        id,
        email: primaryEmail,
        firstName: first_name,
        lastName: last_name,
        imageUrl: image_url,
      });
    }

    if (eventType === "user.deleted") {
      if (!id) {
        throw new ApiError(400, "Missing user id in webhook payload");
      }

      if (deleted) {
        await this.userRepository.softDeleteByClerkId(id);
      }
    }

    res.status(200).json(new ApiResponse(200, null, "Webhook processed"));
  });
}
