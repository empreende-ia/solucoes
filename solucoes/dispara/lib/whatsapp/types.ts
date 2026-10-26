export type MetaComponentType = 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS' | 'CAROUSEL' | 'LIMITED_TIME_OFFER';
export type MetaHeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'GIF' | 'DOCUMENT' | 'LOCATION';
// Tipos de botão suportados pela Meta API para templates de mensagem.
export type MetaButtonType =
  | 'QUICK_REPLY'
  | 'URL'
  | 'PHONE_NUMBER'
  | 'OTP'
  | 'COPY_CODE'
  | 'FLOW';

export interface MetaExample {
  header_text?: string[];
  body_text?: string[][];
  header_text_named_params?: Array<{ param_name: string; example: string }>;
  body_text_named_params?: Array<{ param_name: string; example: string }>;
  header_handle?: string[];
}

export interface MetaHeaderComponent {
  type: 'HEADER';
  format: MetaHeaderFormat;
  text?: string;
  example?: {
    header_text?: string[];
    header_text_named_params?: Array<{ param_name: string; example: string }>;
    header_handle?: string[];
  };
}

export interface MetaBodyComponent {
  type: 'BODY';
  text: string;
  example?: {
    body_text?: string[][];
    body_text_named_params?: Array<{ param_name: string; example: string }>;
  };
  add_security_recommendation?: boolean;
}

export interface MetaFooterComponent {
  type: 'FOOTER';
  text: string;
  code_expiration_minutes?: number;
}

export interface MetaButton {
  type: MetaButtonType;
  text?: string;
  url?: string;
  phone_number?: string;
  example?: string[];
  otp_type?: string;
  autofill_text?: string;
  package_name?: string;
  signature_hash?: string;
  flow_id?: string;
  flow_action?: string;
  navigate_screen?: string;
  action?: Record<string, unknown>;
  payload?: string | Record<string, unknown>;
}

export interface MetaButtonsComponent {
  type: 'BUTTONS';
  buttons: MetaButton[];
}

export interface MetaCarouselCard {
  components: (MetaHeaderComponent | MetaBodyComponent | MetaButtonsComponent)[];
}

export interface MetaCarouselComponent {
  type: 'CAROUSEL';
  cards: MetaCarouselCard[];
}

export interface MetaLimitedTimeOfferComponent {
  type: 'LIMITED_TIME_OFFER';
  limited_time_offer: {
    text: string;
    has_expiration?: boolean;
  };
}

export type MetaComponent =
  | MetaHeaderComponent
  | MetaBodyComponent
  | MetaFooterComponent
  | MetaButtonsComponent
  | MetaCarouselComponent
  | MetaLimitedTimeOfferComponent;

export interface MetaTemplatePayload {
  name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  components: MetaComponent[];
  parameter_format?: 'NAMED' | 'POSITIONAL';
  message_send_ttl_seconds?: number;
}

// =============================================================================
// INTERACTIVE MESSAGE TYPES
// =============================================================================

export interface InteractiveHeader {
  type: 'text' | 'image' | 'video' | 'document';
  text?: string;
  image?: { id?: string; link?: string };
  video?: { id?: string; link?: string };
  document?: { id?: string; link?: string; filename?: string };
}

export interface ReplyButtonAction {
  buttons: Array<{
    type: 'reply';
    reply: { id: string; title: string };
  }>;
}

export interface ListAction {
  button: string;
  sections: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
}

export interface CtaUrlAction {
  name: 'cta_url';
  parameters: {
    display_text: string;
    url: string;
  };
}

export interface InteractiveMessagePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'interactive';
  interactive: {
    type: 'button' | 'list' | 'cta_url' | 'location_request_message';
    header?: InteractiveHeader;
    body: { text: string };
    footer?: { text: string };
    action: ReplyButtonAction | ListAction | CtaUrlAction | { name: 'send_location' };
  };
  context?: { message_id: string };
}

// =============================================================================
// MEDIA MESSAGE TYPES
// =============================================================================

export interface ImageMessagePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'image';
  image: { id?: string; link?: string; caption?: string };
  context?: { message_id: string };
}

export interface VideoMessagePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'video';
  video: { id?: string; link?: string; caption?: string };
  context?: { message_id: string };
}

export interface AudioMessagePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'audio';
  audio: { id?: string; link?: string };
  context?: { message_id: string };
}

export interface DocumentMessagePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'document';
  document: { id?: string; link?: string; filename: string; caption?: string };
  context?: { message_id: string };
}

export interface StickerMessagePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'sticker';
  sticker: { id?: string; link?: string };
  context?: { message_id: string };
}

export interface LocationMessagePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'location';
  location: { latitude: number; longitude: number; name?: string; address?: string };
  context?: { message_id: string };
}

export interface ReactionMessagePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'reaction';
  reaction: { message_id: string; emoji: string };
}

// =============================================================================
// TEMPLATE SERVICE TYPES
// =============================================================================

export interface CreateTemplateInput {
  // DB fields
  projectId?: string;
  itemId?: string;

  // Required
  name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

  // Meta template parameter format
  parameter_format?: 'positional' | 'named';

  // Content
  content?: string;
  body?: {
    text: string;
    example?: {
      body_text?: string[][];
      body_text_named_params?: Array<{ param_name: string; example: string }>;
    };
  };

  // Components (accept null for Zod compatibility)
  header?: {
    format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'GIF' | 'DOCUMENT' | 'LOCATION';
    text?: string;
    example?: {
      header_text?: string[];
      header_text_named_params?: Array<{ param_name: string; example: string }>;
      header_handle?: string[];
    } | null;
  } | null;
  footer?: { text: string } | null;
  buttons?: Array<{
    type:
      | 'QUICK_REPLY'
      | 'URL'
      | 'PHONE_NUMBER'
      | 'COPY_CODE'
      | 'OTP'
      | 'FLOW';
    text?: string;
    url?: string;
    phone_number?: string;
    example?: string | string[];
    action?: Record<string, unknown>;
    payload?: string | Record<string, unknown>;
    [key: string]: unknown;
  }> | null;

  // Carousel
  carousel?: { cards: unknown[] } | null;

  // LTO
  limited_time_offer?: { text: string; has_expiration?: boolean } | null;

  // Helpers
  exampleVariables?: string[];
  message_send_ttl_seconds?: number;
  add_security_recommendation?: boolean;
  code_expiration_minutes?: number;
}

export interface TemplateCreationResult {
  success: boolean;
  name: string;
  id: string;
  status: string;
  category: string;
}

// =============================================================================
// TEXT MESSAGE TYPE
// =============================================================================

export interface TextMessagePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'text';
  text: { body: string; preview_url?: boolean };
  context?: { message_id: string };
}
