export type WhatsAppWebhookVerifyQuery = {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
};

export type WhatsAppWebhookPayload = {
  object: "whatsapp_business_account";
  entry: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: {
        messaging_product: "whatsapp";
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        contacts?: Array<{
          profile?: { name?: string };
          wa_id?: string;
        }>;
        messages?: Array<{
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          timestamp?: string;
          recipient_id?: string;
          errors?: Array<{
            code?: number;
            title?: string;
            message?: string;
            error_data?: { details?: string };
            href?: string;
          }>;
        }>;
      };
    }>;
  }>;
};

export type WhatsAppSendTextRequest = {
  messaging_product: "whatsapp";
  recipient_type?: "individual";
  to: string;
  type: "text";
  text: {
    body: string;
    preview_url?: boolean;
  };
};

export type WhatsAppSendMessageResponse = {
  messaging_product: "whatsapp";
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{
    id: string;
    group_id?: string;
    message_status?: string;
  }>;
};
