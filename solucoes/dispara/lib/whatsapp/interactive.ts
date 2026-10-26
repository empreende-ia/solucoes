/**
 * WhatsApp Interactive Message Builders
 * 
 * Builders for Reply Buttons, Lists, CTA URL, and Location Request
 */

import { 
  InteractiveMessagePayload, 
  InteractiveHeader,
  ReplyButtonAction,
  ListAction,
  CtaUrlAction,
} from './types'

// =============================================================================
// REPLY BUTTONS (Max 3 buttons)
// =============================================================================

export interface ButtonOption {
  id: string
  title: string // Max 20 characters
}

export interface BuildReplyButtonsOptions {
  to: string
  body: string
  buttons: ButtonOption[]
  header?: {
    type: 'text' | 'image' | 'video' | 'document'
    text?: string
    mediaId?: string
    mediaUrl?: string
    filename?: string
  }
  footer?: string // Max 60 characters
  replyToMessageId?: string
}

/**
 * Build a reply buttons message payload
 * WhatsApp limit: Max 3 buttons, 20 chars per button title
 */
export function buildReplyButtons(options: BuildReplyButtonsOptions): InteractiveMessagePayload {
  if (options.buttons.length > 3) {
    throw new Error('Reply buttons support max 3 buttons. Use list message for more options.')
  }

  // Validate button titles
  for (const button of options.buttons) {
    if (button.title.length > 20) {
      throw new Error(`Button title "${button.title}" exceeds 20 character limit`)
    }
  }

  const action: ReplyButtonAction = {
    buttons: options.buttons.map(btn => ({
      type: 'reply' as const,
      reply: {
        id: btn.id,
        title: btn.title,
      },
    })),
  }

  const payload: InteractiveMessagePayload = {
    messaging_product: 'whatsapp',
    to: options.to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: options.body },
      action,
    },
  }

  // Add header if provided
  if (options.header) {
    payload.interactive.header = buildHeader(options.header)
  }

  // Add footer if provided
  if (options.footer) {
    if (options.footer.length > 60) {
      throw new Error('Footer text exceeds 60 character limit')
    }
    payload.interactive.footer = { text: options.footer }
  }

  if (options.replyToMessageId) {
    payload.context = { message_id: options.replyToMessageId }
  }

  return payload
}

// =============================================================================
// LIST MESSAGE (Max 10 items per section, max 10 sections)
// =============================================================================

export interface ListRow {
  id: string
  title: string // Max 24 characters
  description?: string // Max 72 characters
}

export interface ListSection {
  title?: string
  rows: ListRow[]
}

export interface BuildListMessageOptions {
  to: string
  body: string
  buttonText: string // Max 20 characters
  sections: ListSection[]
  header?: {
    type: 'text'
    text: string
  }
  footer?: string
  replyToMessageId?: string
}

/**
 * Build a list message payload
 * WhatsApp limits: 24 chars title, 72 chars description, 10 items per section
 */
export function buildListMessage(options: BuildListMessageOptions): InteractiveMessagePayload {
  // Validate button text
  if (options.buttonText.length > 20) {
    throw new Error('List button text exceeds 20 character limit')
  }

  // Validate rows
  let totalRows = 0
  for (const section of options.sections) {
    for (const row of section.rows) {
      if (row.title.length > 24) {
        throw new Error(`Row title "${row.title}" exceeds 24 character limit`)
      }
      if (row.description && row.description.length > 72) {
        throw new Error(`Row description exceeds 72 character limit`)
      }
      totalRows++
    }
    if (section.rows.length > 10) {
      throw new Error('Each section can have max 10 rows')
    }
  }

  if (totalRows > 10) {
    throw new Error('List message can have max 10 total items')
  }

  const action: ListAction = {
    button: options.buttonText,
    sections: options.sections.map(section => ({
      title: section.title,
      rows: section.rows.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description,
      })),
    })),
  }

  const payload: InteractiveMessagePayload = {
    messaging_product: 'whatsapp',
    to: options.to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: options.body },
      action,
    },
  }

  // Add header if provided (text only for lists)
  if (options.header) {
    payload.interactive.header = {
      type: 'text',
      text: options.header.text,
    }
  }

  // Add footer if provided
  if (options.footer) {
    if (options.footer.length > 60) {
      throw new Error('Footer text exceeds 60 character limit')
    }
    payload.interactive.footer = { text: options.footer }
  }

  if (options.replyToMessageId) {
    payload.context = { message_id: options.replyToMessageId }
  }

  return payload
}

// =============================================================================
// CTA URL BUTTON
// =============================================================================

export interface BuildCtaUrlOptions {
  to: string
  body: string
  buttonText: string // Max 20 characters
  url: string
  header?: {
    type: 'text' | 'image' | 'video' | 'document'
    text?: string
    mediaId?: string
    mediaUrl?: string
    filename?: string
  }
  footer?: string
  replyToMessageId?: string
}

/**
 * Build a CTA URL button message
 */
export function buildCtaUrl(options: BuildCtaUrlOptions): InteractiveMessagePayload {
  if (options.buttonText.length > 20) {
    throw new Error('CTA button text exceeds 20 character limit')
  }

  const action: CtaUrlAction = {
    name: 'cta_url',
    parameters: {
      display_text: options.buttonText,
      url: options.url,
    },
  }

  const payload: InteractiveMessagePayload = {
    messaging_product: 'whatsapp',
    to: options.to,
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: options.body },
      action,
    },
  }

  if (options.header) {
    payload.interactive.header = buildHeader(options.header)
  }

  if (options.footer) {
    if (options.footer.length > 60) {
      throw new Error('Footer text exceeds 60 character limit')
    }
    payload.interactive.footer = { text: options.footer }
  }

  if (options.replyToMessageId) {
    payload.context = { message_id: options.replyToMessageId }
  }

  return payload
}

// =============================================================================
// LOCATION REQUEST
// =============================================================================

export interface BuildLocationRequestOptions {
  to: string
  body: string
  replyToMessageId?: string
}

/**
 * Build a location request message
 */
export function buildLocationRequest(options: BuildLocationRequestOptions): InteractiveMessagePayload {
  const payload: InteractiveMessagePayload = {
    messaging_product: 'whatsapp',
    to: options.to,
    type: 'interactive',
    interactive: {
      type: 'location_request_message',
      body: { text: options.body },
      action: {
        name: 'send_location',
      },
    },
  }

  if (options.replyToMessageId) {
    payload.context = { message_id: options.replyToMessageId }
  }

  return payload
}

// =============================================================================
// AUTO-SELECT: Buttons vs List based on option count
// =============================================================================

export interface MenuOption {
  id: string
  label: string
  description?: string
}

export interface BuildMenuOptions {
  to: string
  body: string
  options: MenuOption[]
  header?: {
    type: 'text' | 'image' | 'video' | 'document'
    text?: string
    mediaId?: string
    mediaUrl?: string
    filename?: string
  }
  footer?: string
  listButtonText?: string // For list, defaults to "Ver opções"
  replyToMessageId?: string
}

/**
 * Automatically choose between Reply Buttons (≤3 options) or List (4-10 options)
 */
export function buildMenu(options: BuildMenuOptions): InteractiveMessagePayload {
  if (options.options.length === 0) {
    throw new Error('Menu must have at least one option')
  }

  if (options.options.length > 10) {
    throw new Error('Menu can have max 10 options')
  }

  // Use Reply Buttons for 1-3 options
  if (options.options.length <= 3) {
    // For buttons, header can be any type
    return buildReplyButtons({
      to: options.to,
      body: options.body,
      buttons: options.options.map(opt => ({
        id: opt.id,
        title: opt.label.substring(0, 20), // Truncate to 20 chars
      })),
      header: options.header,
      footer: options.footer,
      replyToMessageId: options.replyToMessageId,
    })
  }

  // Use List for 4-10 options
  // For lists, header must be text only
  const listHeader = options.header?.type === 'text' 
    ? { type: 'text' as const, text: options.header.text || '' }
    : undefined

  return buildListMessage({
    to: options.to,
    body: options.body,
    buttonText: options.listButtonText || 'Ver opções',
    sections: [{
      rows: options.options.map(opt => ({
        id: opt.id,
        title: opt.label.substring(0, 24), // Truncate to 24 chars
        description: opt.description?.substring(0, 72), // Truncate to 72 chars
      })),
    }],
    header: listHeader,
    footer: options.footer,
    replyToMessageId: options.replyToMessageId,
  })
}

// =============================================================================
// HELPERS
// =============================================================================

function buildHeader(header: {
  type: 'text' | 'image' | 'video' | 'document'
  text?: string
  mediaId?: string
  mediaUrl?: string
  filename?: string
}): InteractiveHeader {
  switch (header.type) {
    case 'text':
      return { type: 'text', text: header.text }
    case 'image':
      return { 
        type: 'image', 
        image: header.mediaId ? { id: header.mediaId } : { link: header.mediaUrl }
      }
    case 'video':
      return { 
        type: 'video', 
        video: header.mediaId ? { id: header.mediaId } : { link: header.mediaUrl }
      }
    case 'document':
      return { 
        type: 'document', 
        document: { 
          ...(header.mediaId ? { id: header.mediaId } : { link: header.mediaUrl }),
          filename: header.filename,
        }
      }
  }
}
