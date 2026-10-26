import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import {
  // Schemas
  CampaignStatusSchema,
  ContactStatusSchema,
  MessageStatusSchema,
  TemplateCategorySchema,
  TemplateStatusSchema,
  TemplateButtonSchema,
  TemplateComponentSchema,
  TemplateSchema,
  CampaignSchema,
  ContactSchema,
  MessageSchema,
  AppSettingsSchema,
  CampaignsArraySchema,
  ContactsArraySchema,
  TemplatesArraySchema,
  MessagesArraySchema,
  // Functions
  validateData,
  validateOrDefault,
  validateCampaigns,
  validateContacts,
  validateTemplates,
  validateSettings,
  safeParseFromStorage,
  safeSaveToStorage,
  migrateAndValidate,
} from './storage-validation'
import { CampaignStatus, ContactStatus, MessageStatus } from '../types'

// Mock the logger module
vi.mock('./logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

// ============================================================================
// Test Fixtures
// ============================================================================

const validCampaign = {
  id: 'campaign-1',
  name: 'Test Campaign',
  status: CampaignStatus.DRAFT,
  recipients: 100,
  delivered: 50,
  read: 25,
  createdAt: '2024-01-01T00:00:00Z',
  templateName: 'test-template',
}

const validContact = {
  id: 'contact-1',
  name: 'John Doe',
  phone: '+5511999999999',
  status: ContactStatus.OPT_IN,
  tags: ['customer', 'vip'],
  lastActive: '2024-01-01T00:00:00Z',
}

const validTemplate = {
  id: 'template-1',
  name: 'Welcome Template',
  category: 'MARKETING' as const,
  language: 'pt_BR',
  status: 'APPROVED' as const,
  content: 'Hello {{1}}!',
  preview: 'Hello John!',
  lastUpdated: '2024-01-01T00:00:00Z',
}

const validMessage = {
  id: 'message-1',
  campaignId: 'campaign-1',
  contactName: 'John Doe',
  contactPhone: '+5511999999999',
  status: MessageStatus.SENT,
  sentAt: '2024-01-01T00:00:00Z',
}

const validAppSettings = {
  phoneNumberId: '123456789',
  businessAccountId: '987654321',
  accessToken: 'token-abc',
  isConnected: true,
  displayPhoneNumber: '+5511999999999',
  qualityRating: 'HIGH',
  verifiedName: 'My Business',
}

// ============================================================================
// Base Schema Tests
// ============================================================================

describe('CampaignStatusSchema', () => {
  it('accepts valid campaign statuses', () => {
    expect(CampaignStatusSchema.safeParse(CampaignStatus.DRAFT).success).toBe(true)
    expect(CampaignStatusSchema.safeParse(CampaignStatus.SENDING).success).toBe(true)
    expect(CampaignStatusSchema.safeParse(CampaignStatus.COMPLETED).success).toBe(true)
    expect(CampaignStatusSchema.safeParse(CampaignStatus.PAUSED).success).toBe(true)
    expect(CampaignStatusSchema.safeParse(CampaignStatus.FAILED).success).toBe(true)
    expect(CampaignStatusSchema.safeParse(CampaignStatus.CANCELLED).success).toBe(true)
    expect(CampaignStatusSchema.safeParse(CampaignStatus.SCHEDULED).success).toBe(true)
  })

  it('rejects invalid campaign statuses', () => {
    expect(CampaignStatusSchema.safeParse('INVALID').success).toBe(false)
    expect(CampaignStatusSchema.safeParse(null).success).toBe(false)
    expect(CampaignStatusSchema.safeParse(undefined).success).toBe(false)
    expect(CampaignStatusSchema.safeParse(123).success).toBe(false)
  })
})

describe('ContactStatusSchema', () => {
  it('accepts valid contact statuses', () => {
    expect(ContactStatusSchema.safeParse(ContactStatus.OPT_IN).success).toBe(true)
    expect(ContactStatusSchema.safeParse(ContactStatus.OPT_OUT).success).toBe(true)
    expect(ContactStatusSchema.safeParse(ContactStatus.UNKNOWN).success).toBe(true)
  })

  it('rejects invalid contact statuses', () => {
    expect(ContactStatusSchema.safeParse('INVALID').success).toBe(false)
    expect(ContactStatusSchema.safeParse(null).success).toBe(false)
    expect(ContactStatusSchema.safeParse(undefined).success).toBe(false)
  })
})

describe('MessageStatusSchema', () => {
  it('accepts valid message statuses', () => {
    expect(MessageStatusSchema.safeParse(MessageStatus.PENDING).success).toBe(true)
    expect(MessageStatusSchema.safeParse(MessageStatus.SENT).success).toBe(true)
    expect(MessageStatusSchema.safeParse(MessageStatus.DELIVERED).success).toBe(true)
    expect(MessageStatusSchema.safeParse(MessageStatus.READ).success).toBe(true)
    expect(MessageStatusSchema.safeParse(MessageStatus.FAILED).success).toBe(true)
    expect(MessageStatusSchema.safeParse(MessageStatus.SKIPPED).success).toBe(true)
  })

  it('rejects invalid message statuses', () => {
    expect(MessageStatusSchema.safeParse('INVALID').success).toBe(false)
    expect(MessageStatusSchema.safeParse(null).success).toBe(false)
  })
})

describe('TemplateCategorySchema', () => {
  it('accepts valid categories', () => {
    expect(TemplateCategorySchema.safeParse('MARKETING').success).toBe(true)
    expect(TemplateCategorySchema.safeParse('UTILIDADE').success).toBe(true)
    expect(TemplateCategorySchema.safeParse('AUTENTICACAO').success).toBe(true)
  })

  it('rejects invalid categories', () => {
    expect(TemplateCategorySchema.safeParse('UTILITY').success).toBe(false)
    expect(TemplateCategorySchema.safeParse('AUTHENTICATION').success).toBe(false)
    expect(TemplateCategorySchema.safeParse('').success).toBe(false)
    expect(TemplateCategorySchema.safeParse(null).success).toBe(false)
  })
})

describe('TemplateStatusSchema', () => {
  it('accepts valid statuses', () => {
    expect(TemplateStatusSchema.safeParse('APPROVED').success).toBe(true)
    expect(TemplateStatusSchema.safeParse('PENDING').success).toBe(true)
    expect(TemplateStatusSchema.safeParse('REJECTED').success).toBe(true)
  })

  it('rejects invalid statuses', () => {
    expect(TemplateStatusSchema.safeParse('DRAFT').success).toBe(false)
    expect(TemplateStatusSchema.safeParse('approved').success).toBe(false)
    expect(TemplateStatusSchema.safeParse(null).success).toBe(false)
  })
})

// ============================================================================
// Entity Schema Tests
// ============================================================================

describe('TemplateButtonSchema', () => {
  it('accepts valid QUICK_REPLY button', () => {
    const button = { type: 'QUICK_REPLY', text: 'Yes' }
    expect(TemplateButtonSchema.safeParse(button).success).toBe(true)
  })

  it('accepts valid URL button', () => {
    const button = { type: 'URL', text: 'Visit', url: 'https://example.com' }
    expect(TemplateButtonSchema.safeParse(button).success).toBe(true)
  })

  it('accepts valid PHONE_NUMBER button', () => {
    const button = { type: 'PHONE_NUMBER', text: 'Call', phone_number: '+5511999999999' }
    expect(TemplateButtonSchema.safeParse(button).success).toBe(true)
  })

  it('accepts OTP button with otp_type', () => {
    const button = { type: 'OTP', otp_type: 'COPY_CODE' }
    expect(TemplateButtonSchema.safeParse(button).success).toBe(true)
  })

  it('accepts button with example as string', () => {
    const button = { type: 'URL', text: 'Visit', example: 'https://example.com/page' }
    expect(TemplateButtonSchema.safeParse(button).success).toBe(true)
  })

  it('accepts button with example as array', () => {
    const button = { type: 'URL', text: 'Visit', example: ['https://example.com/1', 'https://example.com/2'] }
    expect(TemplateButtonSchema.safeParse(button).success).toBe(true)
  })

  it('rejects unsupported button type POSTBACK', () => {
    const button = { type: 'POSTBACK', text: 'Click', payload: 'my-payload' }
    expect(TemplateButtonSchema.safeParse(button).success).toBe(false)
  })

  it('rejects unsupported button type CATALOG', () => {
    const button = { type: 'CATALOG', text: 'Ver catálogo' }
    expect(TemplateButtonSchema.safeParse(button).success).toBe(false)
  })

  it('rejects invalid button type', () => {
    const button = { type: 'INVALID_TYPE', text: 'Test' }
    expect(TemplateButtonSchema.safeParse(button).success).toBe(false)
  })

  it('rejects button without type', () => {
    const button = { text: 'Test' }
    expect(TemplateButtonSchema.safeParse(button).success).toBe(false)
  })
})

describe('TemplateComponentSchema', () => {
  it('accepts valid HEADER component with TEXT format', () => {
    const component = { type: 'HEADER', format: 'TEXT', text: 'Welcome!' }
    expect(TemplateComponentSchema.safeParse(component).success).toBe(true)
  })

  it('accepts valid HEADER component with IMAGE format', () => {
    const component = { type: 'HEADER', format: 'IMAGE' }
    expect(TemplateComponentSchema.safeParse(component).success).toBe(true)
  })

  it('accepts valid BODY component', () => {
    const component = { type: 'BODY', text: 'Hello {{1}}!' }
    expect(TemplateComponentSchema.safeParse(component).success).toBe(true)
  })

  it('accepts valid FOOTER component', () => {
    const component = { type: 'FOOTER', text: 'Reply STOP to opt out' }
    expect(TemplateComponentSchema.safeParse(component).success).toBe(true)
  })

  it('accepts valid BUTTONS component', () => {
    const component = {
      type: 'BUTTONS',
      buttons: [
        { type: 'QUICK_REPLY', text: 'Yes' },
        { type: 'QUICK_REPLY', text: 'No' },
      ],
    }
    expect(TemplateComponentSchema.safeParse(component).success).toBe(true)
  })

  it('accepts LIMITED_TIME_OFFER component', () => {
    const component = {
      type: 'LIMITED_TIME_OFFER',
      limited_time_offer: { text: '50% off!', has_expiration: true },
    }
    expect(TemplateComponentSchema.safeParse(component).success).toBe(true)
  })

  it('rejects invalid component type', () => {
    const component = { type: 'INVALID' }
    expect(TemplateComponentSchema.safeParse(component).success).toBe(false)
  })

  it('rejects invalid format', () => {
    const component = { type: 'HEADER', format: 'AUDIO' }
    expect(TemplateComponentSchema.safeParse(component).success).toBe(false)
  })
})

describe('TemplateSchema', () => {
  it('accepts valid template', () => {
    expect(TemplateSchema.safeParse(validTemplate).success).toBe(true)
  })

  it('accepts template with optional fields', () => {
    const template = {
      ...validTemplate,
      headerMediaId: 'media-123',
      headerMediaHash: 'hash-abc',
      headerMediaPreviewUrl: 'https://example.com/preview.jpg',
      headerMediaPreviewExpiresAt: '2024-12-31T23:59:59Z',
      components: [{ type: 'BODY', text: 'Hello!' }],
    }
    expect(TemplateSchema.safeParse(template).success).toBe(true)
  })

  it('rejects template with empty id', () => {
    const template = { ...validTemplate, id: '' }
    expect(TemplateSchema.safeParse(template).success).toBe(false)
  })

  it('rejects template with empty name', () => {
    const template = { ...validTemplate, name: '' }
    expect(TemplateSchema.safeParse(template).success).toBe(false)
  })

  it('rejects template with invalid category', () => {
    const template = { ...validTemplate, category: 'UTILITY' }
    expect(TemplateSchema.safeParse(template).success).toBe(false)
  })

  it('rejects template with invalid status', () => {
    const template = { ...validTemplate, status: 'DRAFT' }
    expect(TemplateSchema.safeParse(template).success).toBe(false)
  })

  it('rejects template missing required fields', () => {
    const { content, ...incomplete } = validTemplate
    expect(TemplateSchema.safeParse(incomplete).success).toBe(false)
  })
})

describe('CampaignSchema', () => {
  it('accepts valid campaign', () => {
    expect(CampaignSchema.safeParse(validCampaign).success).toBe(true)
  })

  it('rejects campaign with empty id', () => {
    const campaign = { ...validCampaign, id: '' }
    expect(CampaignSchema.safeParse(campaign).success).toBe(false)
  })

  it('rejects campaign with empty name', () => {
    const campaign = { ...validCampaign, name: '' }
    expect(CampaignSchema.safeParse(campaign).success).toBe(false)
  })

  it('rejects campaign with negative recipients', () => {
    const campaign = { ...validCampaign, recipients: -1 }
    expect(CampaignSchema.safeParse(campaign).success).toBe(false)
  })

  it('rejects campaign with negative delivered', () => {
    const campaign = { ...validCampaign, delivered: -5 }
    expect(CampaignSchema.safeParse(campaign).success).toBe(false)
  })

  it('rejects campaign with invalid status', () => {
    const campaign = { ...validCampaign, status: 'INVALID' }
    expect(CampaignSchema.safeParse(campaign).success).toBe(false)
  })

  it('rejects campaign missing required fields', () => {
    const { templateName, ...incomplete } = validCampaign
    expect(CampaignSchema.safeParse(incomplete).success).toBe(false)
  })
})

describe('ContactSchema', () => {
  it('accepts valid contact', () => {
    expect(ContactSchema.safeParse(validContact).success).toBe(true)
  })

  it('accepts contact with empty tags array', () => {
    const contact = { ...validContact, tags: [] }
    expect(ContactSchema.safeParse(contact).success).toBe(true)
  })

  it('rejects contact with empty id', () => {
    const contact = { ...validContact, id: '' }
    expect(ContactSchema.safeParse(contact).success).toBe(false)
  })

  it('rejects contact with empty name', () => {
    const contact = { ...validContact, name: '' }
    expect(ContactSchema.safeParse(contact).success).toBe(false)
  })

  it('rejects contact with empty phone', () => {
    const contact = { ...validContact, phone: '' }
    expect(ContactSchema.safeParse(contact).success).toBe(false)
  })

  it('rejects contact with invalid status', () => {
    const contact = { ...validContact, status: 'INVALID' }
    expect(ContactSchema.safeParse(contact).success).toBe(false)
  })

  it('rejects contact with non-array tags', () => {
    const contact = { ...validContact, tags: 'customer' }
    expect(ContactSchema.safeParse(contact).success).toBe(false)
  })
})

describe('MessageSchema', () => {
  it('accepts valid message', () => {
    expect(MessageSchema.safeParse(validMessage).success).toBe(true)
  })

  it('accepts message with optional error field', () => {
    const message = { ...validMessage, error: 'Delivery failed' }
    expect(MessageSchema.safeParse(message).success).toBe(true)
  })

  it('rejects message with empty id', () => {
    const message = { ...validMessage, id: '' }
    expect(MessageSchema.safeParse(message).success).toBe(false)
  })

  it('rejects message with empty campaignId', () => {
    const message = { ...validMessage, campaignId: '' }
    expect(MessageSchema.safeParse(message).success).toBe(false)
  })

  it('rejects message with invalid status', () => {
    const message = { ...validMessage, status: 'INVALID' }
    expect(MessageSchema.safeParse(message).success).toBe(false)
  })
})

describe('AppSettingsSchema', () => {
  it('accepts valid settings', () => {
    expect(AppSettingsSchema.safeParse(validAppSettings).success).toBe(true)
  })

  it('accepts minimal settings', () => {
    const settings = {
      phoneNumberId: '123',
      businessAccountId: '456',
      accessToken: 'token',
      isConnected: false,
    }
    expect(AppSettingsSchema.safeParse(settings).success).toBe(true)
  })

  it('accepts settings with empty strings', () => {
    const settings = {
      phoneNumberId: '',
      businessAccountId: '',
      accessToken: '',
      isConnected: false,
    }
    expect(AppSettingsSchema.safeParse(settings).success).toBe(true)
  })

  it('rejects settings missing phoneNumberId', () => {
    const { phoneNumberId, ...incomplete } = validAppSettings
    expect(AppSettingsSchema.safeParse(incomplete).success).toBe(false)
  })

  it('rejects settings with non-boolean isConnected', () => {
    const settings = { ...validAppSettings, isConnected: 'yes' }
    expect(AppSettingsSchema.safeParse(settings).success).toBe(false)
  })
})

// ============================================================================
// Collection Schema Tests
// ============================================================================

describe('CampaignsArraySchema', () => {
  it('accepts empty array', () => {
    expect(CampaignsArraySchema.safeParse([]).success).toBe(true)
  })

  it('accepts array with valid campaigns', () => {
    const campaigns = [validCampaign, { ...validCampaign, id: 'campaign-2' }]
    expect(CampaignsArraySchema.safeParse(campaigns).success).toBe(true)
  })

  it('rejects array with invalid campaign', () => {
    const campaigns = [validCampaign, { id: '' }]
    expect(CampaignsArraySchema.safeParse(campaigns).success).toBe(false)
  })

  it('rejects non-array', () => {
    expect(CampaignsArraySchema.safeParse(validCampaign).success).toBe(false)
    expect(CampaignsArraySchema.safeParse(null).success).toBe(false)
  })
})

describe('ContactsArraySchema', () => {
  it('accepts empty array', () => {
    expect(ContactsArraySchema.safeParse([]).success).toBe(true)
  })

  it('accepts array with valid contacts', () => {
    const contacts = [validContact, { ...validContact, id: 'contact-2' }]
    expect(ContactsArraySchema.safeParse(contacts).success).toBe(true)
  })

  it('rejects array with invalid contact', () => {
    const contacts = [validContact, { name: 'Test' }]
    expect(ContactsArraySchema.safeParse(contacts).success).toBe(false)
  })
})

describe('TemplatesArraySchema', () => {
  it('accepts empty array', () => {
    expect(TemplatesArraySchema.safeParse([]).success).toBe(true)
  })

  it('accepts array with valid templates', () => {
    const templates = [validTemplate, { ...validTemplate, id: 'template-2' }]
    expect(TemplatesArraySchema.safeParse(templates).success).toBe(true)
  })

  it('rejects array with invalid template', () => {
    const templates = [validTemplate, { id: 'test' }]
    expect(TemplatesArraySchema.safeParse(templates).success).toBe(false)
  })
})

describe('MessagesArraySchema', () => {
  it('accepts empty array', () => {
    expect(MessagesArraySchema.safeParse([]).success).toBe(true)
  })

  it('accepts array with valid messages', () => {
    const messages = [validMessage, { ...validMessage, id: 'message-2' }]
    expect(MessagesArraySchema.safeParse(messages).success).toBe(true)
  })

  it('rejects array with invalid message', () => {
    const messages = [validMessage, { status: 'INVALID' }]
    expect(MessagesArraySchema.safeParse(messages).success).toBe(false)
  })
})

// ============================================================================
// Validation Function Tests
// ============================================================================

describe('validateData', () => {
  const simpleSchema = z.object({
    name: z.string(),
    age: z.number(),
  })

  it('returns success with valid data', () => {
    const result = validateData(simpleSchema, { name: 'John', age: 30 })
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ name: 'John', age: 30 })
    expect(result.errors).toBeUndefined()
  })

  it('returns failure with invalid data', () => {
    const result = validateData(simpleSchema, { name: 'John', age: 'thirty' })
    expect(result.success).toBe(false)
    expect(result.data).toBeUndefined()
    expect(result.errors).toBeDefined()
  })

  it('returns failure for null', () => {
    const result = validateData(simpleSchema, null)
    expect(result.success).toBe(false)
  })

  it('returns failure for undefined', () => {
    const result = validateData(simpleSchema, undefined)
    expect(result.success).toBe(false)
  })

  it('returns failure for wrong type', () => {
    const result = validateData(simpleSchema, 'not an object')
    expect(result.success).toBe(false)
  })

  it('returns failure for missing fields', () => {
    const result = validateData(simpleSchema, { name: 'John' })
    expect(result.success).toBe(false)
  })
})

describe('validateOrDefault', () => {
  const simpleSchema = z.object({
    name: z.string(),
    count: z.number(),
  })
  const defaultValue = { name: 'Default', count: 0 }

  it('returns validated data when valid', () => {
    const result = validateOrDefault(simpleSchema, { name: 'Test', count: 5 }, defaultValue)
    expect(result).toEqual({ name: 'Test', count: 5 })
  })

  it('returns default value when invalid', () => {
    const result = validateOrDefault(simpleSchema, { name: 'Test' }, defaultValue)
    expect(result).toEqual(defaultValue)
  })

  it('returns default value for null', () => {
    const result = validateOrDefault(simpleSchema, null, defaultValue)
    expect(result).toEqual(defaultValue)
  })

  it('returns default value for undefined', () => {
    const result = validateOrDefault(simpleSchema, undefined, defaultValue)
    expect(result).toEqual(defaultValue)
  })

  it('returns default value for wrong type', () => {
    const result = validateOrDefault(simpleSchema, 'string', defaultValue)
    expect(result).toEqual(defaultValue)
  })

  it('returns default value for array when expecting object', () => {
    const result = validateOrDefault(simpleSchema, [], defaultValue)
    expect(result).toEqual(defaultValue)
  })
})

describe('validateCampaigns', () => {
  it('returns valid campaigns array', () => {
    const campaigns = [validCampaign]
    const result = validateCampaigns(campaigns)
    expect(result).toEqual(campaigns)
  })

  it('returns empty array for invalid data', () => {
    const result = validateCampaigns({ invalid: true })
    expect(result).toEqual([])
  })

  it('returns empty array for null', () => {
    const result = validateCampaigns(null)
    expect(result).toEqual([])
  })

  it('returns empty array for undefined', () => {
    const result = validateCampaigns(undefined)
    expect(result).toEqual([])
  })

  it('returns empty array for string', () => {
    const result = validateCampaigns('not an array')
    expect(result).toEqual([])
  })

  it('returns empty array when any campaign is invalid', () => {
    const campaigns = [validCampaign, { id: '' }]
    const result = validateCampaigns(campaigns)
    expect(result).toEqual([])
  })
})

describe('validateContacts', () => {
  it('returns valid contacts array', () => {
    const contacts = [validContact]
    const result = validateContacts(contacts)
    expect(result).toEqual(contacts)
  })

  it('returns empty array for invalid data', () => {
    const result = validateContacts({ invalid: true })
    expect(result).toEqual([])
  })

  it('returns empty array for null', () => {
    const result = validateContacts(null)
    expect(result).toEqual([])
  })

  it('returns empty array for undefined', () => {
    const result = validateContacts(undefined)
    expect(result).toEqual([])
  })
})

describe('validateTemplates', () => {
  it('returns valid templates array', () => {
    const templates = [validTemplate]
    const result = validateTemplates(templates)
    expect(result).toEqual(templates)
  })

  it('returns empty array for invalid data', () => {
    const result = validateTemplates({ invalid: true })
    expect(result).toEqual([])
  })

  it('returns empty array for null', () => {
    const result = validateTemplates(null)
    expect(result).toEqual([])
  })

  it('returns empty array for undefined', () => {
    const result = validateTemplates(undefined)
    expect(result).toEqual([])
  })
})

describe('validateSettings', () => {
  it('returns valid settings', () => {
    const result = validateSettings(validAppSettings)
    expect(result).toEqual(validAppSettings)
  })

  it('returns default settings for invalid data', () => {
    const result = validateSettings({ invalid: true })
    expect(result).toEqual({
      phoneNumberId: '',
      businessAccountId: '',
      accessToken: '',
      isConnected: false,
    })
  })

  it('returns default settings for null', () => {
    const result = validateSettings(null)
    expect(result).toEqual({
      phoneNumberId: '',
      businessAccountId: '',
      accessToken: '',
      isConnected: false,
    })
  })

  it('returns default settings for undefined', () => {
    const result = validateSettings(undefined)
    expect(result).toEqual({
      phoneNumberId: '',
      businessAccountId: '',
      accessToken: '',
      isConnected: false,
    })
  })

  it('returns default settings for empty object', () => {
    const result = validateSettings({})
    expect(result).toEqual({
      phoneNumberId: '',
      businessAccountId: '',
      accessToken: '',
      isConnected: false,
    })
  })
})

// ============================================================================
// Storage Helper Tests
// ============================================================================

describe('safeParseFromStorage', () => {
  const simpleSchema = z.object({ value: z.string() })
  const defaultValue = { value: 'default' }

  beforeEach(() => {
    // Mock window and localStorage
    const localStorageMock: Storage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    }
    vi.stubGlobal('window', { localStorage: localStorageMock })
    vi.stubGlobal('localStorage', localStorageMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns default value when localStorage is empty', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    const result = safeParseFromStorage('test-key', simpleSchema, defaultValue)
    expect(result).toEqual(defaultValue)
  })

  it('returns parsed data when valid', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify({ value: 'stored' }))
    const result = safeParseFromStorage('test-key', simpleSchema, defaultValue)
    expect(result).toEqual({ value: 'stored' })
  })

  it('returns default value when stored data is invalid', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify({ value: 123 }))
    const result = safeParseFromStorage('test-key', simpleSchema, defaultValue)
    expect(result).toEqual(defaultValue)
  })

  it('returns default value when JSON is malformed', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('not valid json {')
    const result = safeParseFromStorage('test-key', simpleSchema, defaultValue)
    expect(result).toEqual(defaultValue)
  })

  it('returns default value when localStorage throws', () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error('Storage error')
    })
    const result = safeParseFromStorage('test-key', simpleSchema, defaultValue)
    expect(result).toEqual(defaultValue)
  })
})

describe('safeParseFromStorage (SSR)', () => {
  it('returns default value in SSR environment', () => {
    // Temporarily remove window
    const originalWindow = global.window
    // @ts-expect-error - intentionally setting to undefined for test
    delete global.window

    const simpleSchema = z.object({ value: z.string() })
    const defaultValue = { value: 'default' }
    const result = safeParseFromStorage('test-key', simpleSchema, defaultValue)
    expect(result).toEqual(defaultValue)

    // Restore window
    global.window = originalWindow
  })
})

describe('safeSaveToStorage', () => {
  const simpleSchema = z.object({ value: z.string() })

  beforeEach(() => {
    const localStorageMock: Storage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    }
    vi.stubGlobal('window', { localStorage: localStorageMock })
    vi.stubGlobal('localStorage', localStorageMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves valid data and returns true', () => {
    const result = safeSaveToStorage('test-key', simpleSchema, { value: 'test' })
    expect(result).toBe(true)
    expect(localStorage.setItem).toHaveBeenCalledWith('test-key', JSON.stringify({ value: 'test' }))
  })

  it('returns false when data is invalid', () => {
    // @ts-expect-error - intentionally passing invalid data for test
    const result = safeSaveToStorage('test-key', simpleSchema, { value: 123 })
    expect(result).toBe(false)
    expect(localStorage.setItem).not.toHaveBeenCalled()
  })

  it('returns false when localStorage throws', () => {
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new Error('Storage full')
    })
    const result = safeSaveToStorage('test-key', simpleSchema, { value: 'test' })
    expect(result).toBe(false)
  })
})

describe('safeSaveToStorage (SSR)', () => {
  it('returns false in SSR environment', () => {
    const originalWindow = global.window
    // @ts-expect-error - intentionally setting to undefined for test
    delete global.window

    const simpleSchema = z.object({ value: z.string() })
    const result = safeSaveToStorage('test-key', simpleSchema, { value: 'test' })
    expect(result).toBe(false)

    global.window = originalWindow
  })
})

// ============================================================================
// Migration Helper Tests
// ============================================================================

describe('migrateAndValidate', () => {
  const itemSchema = z.object({
    id: z.string().min(1),
    name: z.string(),
  })

  it('returns empty array for non-array input', () => {
    // @ts-expect-error - intentionally passing non-array for test
    const result = migrateAndValidate({ not: 'array' }, itemSchema)
    expect(result).toEqual([])
  })

  it('returns empty array for empty input', () => {
    const result = migrateAndValidate([], itemSchema)
    expect(result).toEqual([])
  })

  it('returns all valid items', () => {
    const data = [
      { id: '1', name: 'First' },
      { id: '2', name: 'Second' },
    ]
    const result = migrateAndValidate(data, itemSchema)
    expect(result).toEqual(data)
  })

  it('filters out invalid items', () => {
    const data = [
      { id: '1', name: 'Valid' },
      { id: '', name: 'Invalid - empty id' },
      { id: '3', name: 'Also Valid' },
    ]
    const result = migrateAndValidate(data, itemSchema)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: '1', name: 'Valid' })
    expect(result[1]).toEqual({ id: '3', name: 'Also Valid' })
  })

  it('filters out items with missing fields', () => {
    const data = [
      { id: '1', name: 'Valid' },
      { id: '2' }, // missing name
      { name: 'No ID' }, // missing id
    ]
    const result = migrateAndValidate(data, itemSchema)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ id: '1', name: 'Valid' })
  })

  it('filters out items with wrong types', () => {
    const data = [
      { id: '1', name: 'Valid' },
      { id: 123, name: 'Invalid - numeric id' },
      { id: '3', name: null },
    ]
    const result = migrateAndValidate(data, itemSchema)
    expect(result).toHaveLength(1)
  })

  it('handles null items in array', () => {
    const data = [
      { id: '1', name: 'Valid' },
      null,
      { id: '2', name: 'Also Valid' },
    ]
    const result = migrateAndValidate(data, itemSchema)
    expect(result).toHaveLength(2)
  })

  it('handles undefined items in array', () => {
    const data = [
      { id: '1', name: 'Valid' },
      undefined,
      { id: '2', name: 'Also Valid' },
    ]
    const result = migrateAndValidate(data, itemSchema)
    expect(result).toHaveLength(2)
  })
})

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('Edge Cases', () => {
  describe('validateData with complex nested structures', () => {
    it('validates deeply nested valid data', () => {
      const template = {
        ...validTemplate,
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'Welcome!',
          },
          {
            type: 'BODY',
            text: 'Hello {{1}}!',
          },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'QUICK_REPLY', text: 'Yes' },
              { type: 'URL', text: 'Visit', url: 'https://example.com' },
            ],
          },
        ],
      }
      const result = validateData(TemplateSchema, template)
      expect(result.success).toBe(true)
    })

    it('rejects deeply nested invalid data', () => {
      const template = {
        ...validTemplate,
        components: [
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'INVALID_BUTTON_TYPE', text: 'Test' },
            ],
          },
        ],
      }
      const result = validateData(TemplateSchema, template)
      expect(result.success).toBe(false)
    })
  })

  describe('Large arrays', () => {
    it('handles large valid arrays', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({
        ...validCampaign,
        id: `campaign-${i}`,
      }))
      const result = validateCampaigns(largeArray)
      expect(result).toHaveLength(1000)
    })

    it('filters invalid items from large arrays in migration', () => {
      const largeArray = Array.from({ length: 100 }, (_, i) => ({
        id: i % 2 === 0 ? `campaign-${i}` : '', // Every other item is invalid
        name: 'Test',
        status: CampaignStatus.DRAFT,
        recipients: 10,
        delivered: 5,
        read: 2,
        createdAt: '2024-01-01T00:00:00Z',
        templateName: 'test',
      }))
      const result = migrateAndValidate(largeArray, CampaignSchema)
      expect(result).toHaveLength(50)
    })
  })

  describe('Special string values', () => {
    it('handles unicode in strings', () => {
      const contact = {
        ...validContact,
        name: '\u4e2d\u6587\u540d\u5b57',
        tags: ['\ud83c\udf89', '\u2764\ufe0f'],
      }
      const result = validateData(ContactSchema, contact)
      expect(result.success).toBe(true)
    })

    it('handles very long strings', () => {
      const longString = 'a'.repeat(10000)
      const template = {
        ...validTemplate,
        content: longString,
      }
      const result = validateData(TemplateSchema, template)
      expect(result.success).toBe(true)
    })
  })

  describe('Number edge cases', () => {
    it('accepts zero for numeric fields', () => {
      const campaign = {
        ...validCampaign,
        recipients: 0,
        delivered: 0,
        read: 0,
      }
      const result = validateData(CampaignSchema, campaign)
      expect(result.success).toBe(true)
    })

    it('accepts large numbers', () => {
      const campaign = {
        ...validCampaign,
        recipients: Number.MAX_SAFE_INTEGER,
      }
      const result = validateData(CampaignSchema, campaign)
      expect(result.success).toBe(true)
    })

    it('rejects NaN', () => {
      const campaign = {
        ...validCampaign,
        recipients: NaN,
      }
      const result = validateData(CampaignSchema, campaign)
      expect(result.success).toBe(false)
    })

    it('rejects Infinity', () => {
      const campaign = {
        ...validCampaign,
        recipients: Infinity,
      }
      const result = validateData(CampaignSchema, campaign)
      expect(result.success).toBe(false)
    })
  })

  describe('Boolean edge cases', () => {
    it('rejects truthy non-boolean values', () => {
      const settings = {
        ...validAppSettings,
        isConnected: 1,
      }
      const result = validateData(AppSettingsSchema, settings)
      expect(result.success).toBe(false)
    })

    it('rejects falsy non-boolean values', () => {
      const settings = {
        ...validAppSettings,
        isConnected: 0,
      }
      const result = validateData(AppSettingsSchema, settings)
      expect(result.success).toBe(false)
    })

    it('rejects string boolean', () => {
      const settings = {
        ...validAppSettings,
        isConnected: 'true',
      }
      const result = validateData(AppSettingsSchema, settings)
      expect(result.success).toBe(false)
    })
  })
})
