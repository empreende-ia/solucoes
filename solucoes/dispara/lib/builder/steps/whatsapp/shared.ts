import "server-only";

import { getWhatsAppCredentials } from "@/lib/whatsapp-credentials";
import { normalizePhoneNumber } from "@/lib/phone-formatter";
import { fetchWithTimeout, safeJson, safeText } from "@/lib/server-http";

type WhatsAppCredentials = {
  accessToken: string;
  phoneNumberId: string;
};

export type ResolveRecipientInput = {
  to?: string;
  toSource?: string;
  triggerData?: Record<string, unknown>;
};

export function resolveRecipient(input: ResolveRecipientInput): {
  ok: true;
  to: string;
} | {
  ok: false;
  error: string;
} {
  const source =
    input.toSource || (input.triggerData?.from ? "inbound" : "manual");
  const triggerData = input.triggerData ?? {};
  const inbound =
    (triggerData.from as string | undefined) ||
    (triggerData.to as string | undefined) ||
    (triggerData.phone as string | undefined) ||
    "";
  const rawTo = source === "inbound" ? inbound : input.to || "";
  const normalized = normalizePhoneNumber(rawTo);
  if (!normalized || !/^\+\d{8,15}$/.test(normalized)) {
    return {
      ok: false,
      error: `Recipient phone number is invalid: "${rawTo}"`,
    };
  }
  return { ok: true, to: normalized };
}

export async function getCredentials(): Promise<WhatsAppCredentials | null> {
  const credentials = await getWhatsAppCredentials();
  if (!credentials?.accessToken || !credentials?.phoneNumberId) {
    return null;
  }
  return {
    accessToken: credentials.accessToken,
    phoneNumberId: credentials.phoneNumberId,
  };
}

export async function sendWhatsAppPayload(
  credentials: WhatsAppCredentials,
  payload: unknown
): Promise<{ ok: true; data: unknown } | { ok: false; error: string; data?: unknown }> {
  console.log("[WhatsApp] Payload preview:", {
    to: (payload as { to?: string })?.to,
    type: (payload as { type?: string })?.type,
    messaging_product: (payload as { messaging_product?: string })?.messaging_product,
    payload,
  });
  const response = await fetchWithTimeout(
    `https://graph.facebook.com/v24.0/${credentials.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      timeoutMs: 8000,
    }
  );

  const data = await safeJson(response);
  if (!response.ok) {
    const details = data ?? (await safeText(response));
    const metaError =
      typeof details === "object" && details !== null && "error" in details
        ? (details as { error?: { message?: string; code?: number; error_subcode?: number } }).error
        : undefined;
    const metaMessage = metaError?.message ? String(metaError.message) : "";
    const metaCode = metaError?.code ? `code ${metaError.code}` : "";
    const metaSubcode = metaError?.error_subcode
      ? `subcode ${metaError.error_subcode}`
      : "";
    const metaParts = [metaMessage, metaCode, metaSubcode].filter(Boolean).join(" | ");
    const errorMessage = metaParts
      ? `WhatsApp send failed: ${metaParts}`
      : "WhatsApp send failed";
    return {
      ok: false,
      error: errorMessage,
      data: {
        details: details ?? undefined,
        payload,
      },
    };
  }

  return { ok: true, data };
}

export function parseJsonArray<T>(
  raw: unknown,
  fallback: T[] = []
): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw !== "string" || raw.trim().length === 0) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}
