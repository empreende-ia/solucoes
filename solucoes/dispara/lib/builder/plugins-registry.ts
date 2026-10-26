export type IntegrationDescriptions = Record<string, string>;

export function getIntegrationDescriptions(): IntegrationDescriptions {
  return {
    whatsapp: "Send WhatsApp messages",
  };
}
