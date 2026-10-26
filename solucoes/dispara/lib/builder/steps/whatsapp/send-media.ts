import "server-only";

import {
  buildAudioMessage,
  buildDocumentMessage,
  buildImageMessage,
  buildStickerMessage,
  buildVideoMessage,
} from "@/lib/whatsapp/media";
import { withStepLogging, type StepInput } from "../step-handler";
import {
  getCredentials,
  resolveRecipient,
  sendWhatsAppPayload,
} from "./shared";

type SendMediaResult =
  | { success: true; data: unknown }
  | { success: false; error: string; details?: unknown };

export type SendMediaInput = StepInput & {
  to?: string;
  toSource?: string;
  mediaType?: string;
  mediaUrl?: string;
  mediaId?: string;
  caption?: string;
  filename?: string;
  triggerData?: Record<string, unknown>;
};

export async function sendMediaStep(
  input: SendMediaInput
): Promise<SendMediaResult> {
  "use step";

  return withStepLogging(input, async () => {
    const credentials = await getCredentials();
    if (!credentials) {
      return { success: false, error: "WhatsApp not configured" };
    }

    const recipient = resolveRecipient(input);
    if (!recipient.ok) {
      return { success: false, error: recipient.error };
    }

    const mediaType = String(input.mediaType || "image");
    const mediaUrl = input.mediaUrl ? String(input.mediaUrl) : undefined;
    const mediaId = input.mediaId ? String(input.mediaId) : undefined;
    const caption = input.caption ? String(input.caption) : undefined;
    const filename = input.filename ? String(input.filename) : undefined;
    const resolvedFilename =
      mediaType === "document" ? filename || "document" : filename;

    if (!mediaUrl && !mediaId) {
      return { success: false, error: "Media URL or Media ID is required" };
    }

    let payload: unknown;
    switch (mediaType) {
      case "video":
        payload = buildVideoMessage({
          to: recipient.to,
          mediaUrl,
          mediaId,
          caption,
        });
        break;
      case "audio":
        payload = buildAudioMessage({
          to: recipient.to,
          mediaUrl,
          mediaId,
        });
        break;
      case "document":
        payload = buildDocumentMessage({
          to: recipient.to,
          mediaUrl,
          mediaId,
          caption,
          filename: resolvedFilename || "document",
        });
        break;
      case "sticker":
        payload = buildStickerMessage({
          to: recipient.to,
          mediaUrl,
          mediaId,
        });
        break;
      case "image":
      default:
        payload = buildImageMessage({
          to: recipient.to,
          mediaUrl,
          mediaId,
          caption,
        });
        break;
    }

    const result = await sendWhatsAppPayload(credentials, payload);
    if (!result.ok) {
      return { success: false, error: result.error, details: result.data };
    }

    return { success: true, data: result.data };
  });
}
sendMediaStep.maxRetries = 0;

export const _integrationType = "whatsapp";
