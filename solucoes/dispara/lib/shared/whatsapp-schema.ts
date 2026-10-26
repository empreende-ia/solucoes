import { z } from "zod";

export const WhatsAppWebhookVerifyQuerySchema = z.object({
  "hub.mode": z.string().optional(),
  "hub.verify_token": z.string().optional(),
  "hub.challenge": z.string().optional(),
});

export const WhatsAppWebhookPayloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            messaging_product: z.literal("whatsapp"),
            metadata: z
              .object({
                display_phone_number: z.string().optional(),
                phone_number_id: z.string().optional(),
              })
              .optional(),
            contacts: z
              .array(
                z.object({
                  profile: z
                    .object({
                      name: z.string().optional(),
                    })
                    .optional(),
                  wa_id: z.string().optional(),
                })
              )
              .optional(),
            messages: z
              .array(
                z.object({
                  from: z.string().optional(),
                  timestamp: z.string().optional(),
                  type: z.string().optional(),
                  text: z
                    .object({
                      body: z.string().optional(),
                    })
                    .optional(),
                })
              )
              .optional(),
            statuses: z
              .array(
                z.object({
                  id: z.string().optional(),
                  status: z.string().optional(),
                  timestamp: z.string().optional(),
                  recipient_id: z.string().optional(),
                  errors: z
                    .array(
                      z.object({
                        code: z.number().optional(),
                        title: z.string().optional(),
                        message: z.string().optional(),
                        error_data: z
                          .object({
                            details: z.string().optional(),
                          })
                          .optional(),
                        href: z.string().optional(),
                      })
                    )
                    .optional(),
                })
              )
              .optional(),
          }),
        })
      ),
    })
  ),
});

export const WhatsAppSendTextRequestSchema = z.object({
  messaging_product: z.literal("whatsapp"),
  recipient_type: z.literal("individual").optional(),
  to: z.string().min(1),
  type: z.literal("text"),
  text: z.object({
    body: z.string().min(1),
    preview_url: z.boolean().optional(),
  }),
});

export const WhatsAppSendMessageResponseSchema = z.object({
  messaging_product: z.literal("whatsapp"),
  contacts: z
    .array(
      z.object({
        input: z.string(),
        wa_id: z.string(),
      })
    )
    .optional(),
  messages: z
    .array(
      z.object({
        id: z.string(),
        group_id: z.string().optional(),
        message_status: z.string().optional(),
      })
    )
    .optional(),
});
