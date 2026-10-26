import "server-only";

import {
  buildListMessage,
  type ListSection,
} from "@/lib/whatsapp/interactive";
import { withStepLogging, type StepInput } from "../step-handler";
import {
  getCredentials,
  parseJsonArray,
  resolveRecipient,
  sendWhatsAppPayload,
} from "./shared";

type SendListResult =
  | { success: true; data: unknown }
  | { success: false; error: string; details?: unknown };

export type SendListInput = StepInput & {
  to?: string;
  toSource?: string;
  body?: string;
  buttonText?: string;
  headerText?: string;
  footer?: string;
  sections?: string;
  triggerData?: Record<string, unknown>;
};

export async function sendListStep(
  input: SendListInput
): Promise<SendListResult> {
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

    const body = String(input.body || "").trim();
    if (!body) {
      return { success: false, error: "Body is required" };
    }

    const buttonText = String(input.buttonText || "").trim();
    if (!buttonText) {
      return { success: false, error: "Button text is required" };
    }

    const sections = parseJsonArray<ListSection>(input.sections);
    if (!sections.length) {
      return { success: false, error: "Sections JSON is required" };
    }

    const payload = buildListMessage({
      to: recipient.to,
      body,
      buttonText,
      sections,
      header: input.headerText
        ? { type: "text", text: String(input.headerText) }
        : undefined,
      footer: input.footer ? String(input.footer) : undefined,
    });

    const result = await sendWhatsAppPayload(credentials, payload);
    if (!result.ok) {
      return { success: false, error: result.error, details: result.data };
    }

    return { success: true, data: result.data };
  });
}
sendListStep.maxRetries = 0;

export const _integrationType = "whatsapp";
