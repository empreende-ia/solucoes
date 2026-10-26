/**
 * Carousel Validation Rules
 *
 * Pure functions and constants for validating WhatsApp carousel templates
 * according to Meta's specifications.
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Represents a carousel card component.
 */
export interface CarouselCardComponent {
  /** Component type */
  type: 'HEADER' | 'BODY' | 'BUTTONS'
  /** Header format (for HEADER type) */
  format?: 'IMAGE' | 'VIDEO' | 'TEXT' | 'DOCUMENT'
  /** Text content (for BODY type) */
  text?: string
  /** Buttons array (for BUTTONS type) */
  buttons?: CarouselButton[]
}

/**
 * Represents a button in a carousel card.
 */
export interface CarouselButton {
  /** Button type */
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'
  /** Button display text */
  text: string
  /** URL for URL type buttons */
  url?: string
  /** Phone number for PHONE_NUMBER type buttons */
  phone_number?: string
}

/**
 * Represents a single carousel card.
 */
export interface CarouselCard {
  /** Card components */
  components: CarouselCardComponent[]
}

/**
 * Represents a complete carousel structure.
 */
export interface Carousel {
  /** Array of carousel cards */
  cards: CarouselCard[]
}

/**
 * Validation error for carousel templates.
 */
export interface CarouselValidationError {
  /** Field or component that has the error */
  field: string
  /** Human-readable error message */
  message: string
  /** Card index (0-based) if error is specific to a card */
  cardIndex?: number
}

/**
 * Result of carousel validation.
 */
export interface CarouselValidationResult {
  /** Whether the carousel is valid */
  isValid: boolean
  /** Array of validation errors */
  errors: CarouselValidationError[]
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * WhatsApp carousel template validation rules.
 * Based on Meta's specifications for carousel templates.
 */
export const CAROUSEL_RULES = {
  /** Minimum number of cards required */
  MIN_CARDS: 2,
  /** Maximum number of cards allowed */
  MAX_CARDS: 10,
  /** Maximum length of body text per card */
  MAX_BODY_LENGTH: 160,
  /** Maximum length of button text */
  MAX_BUTTON_TEXT: 25,
  /** Maximum number of buttons per card */
  MAX_BUTTONS_PER_CARD: 2,
  /** Allowed header formats for carousel cards */
  ALLOWED_HEADER_FORMATS: ['IMAGE', 'VIDEO'] as const,
} as const

/**
 * Type for allowed carousel header formats.
 */
export type CarouselHeaderFormat = (typeof CAROUSEL_RULES.ALLOWED_HEADER_FORMATS)[number]

// =============================================================================
// FUNCTIONS
// =============================================================================

/**
 * Checks if a carousel card count is within valid range.
 *
 * @param count - The number of cards to validate
 * @returns True if the count is between MIN_CARDS and MAX_CARDS (inclusive)
 *
 * @example
 * isValidCarouselCardCount(1)  // false
 * isValidCarouselCardCount(2)  // true
 * isValidCarouselCardCount(10) // true
 * isValidCarouselCardCount(11) // false
 */
export function isValidCarouselCardCount(count: number): boolean {
  return count >= CAROUSEL_RULES.MIN_CARDS && count <= CAROUSEL_RULES.MAX_CARDS
}

/**
 * Validates a single carousel card.
 *
 * @param card - The card to validate
 * @param cardIndex - The 0-based index of the card (for error messages)
 * @returns Array of validation errors (empty if valid)
 *
 * @example
 * const card = {
 *   components: [
 *     { type: 'HEADER', format: 'TEXT' },
 *     { type: 'BODY', text: 'Hello' }
 *   ]
 * }
 * validateCarouselCard(card, 0)
 * // Returns: [{ field: "header.format", message: "...", cardIndex: 0 }]
 */
export function validateCarouselCard(
  card: CarouselCard,
  cardIndex: number
): CarouselValidationError[] {
  const errors: CarouselValidationError[] = []
  const cardNum = cardIndex + 1
  const components = Array.isArray(card?.components) ? card.components : []

  // Find header component
  const header = components.find(
    (c) => String(c?.type || '').toUpperCase() === 'HEADER'
  )

  // Header is required
  if (!header) {
    errors.push({
      field: 'header',
      message: `Card ${cardNum}: header é obrigatório.`,
      cardIndex,
    })
  } else {
    // Header format must be IMAGE or VIDEO
    const format = String(header?.format || '').toUpperCase()
    if (!CAROUSEL_RULES.ALLOWED_HEADER_FORMATS.includes(format as CarouselHeaderFormat)) {
      errors.push({
        field: 'header.format',
        message: `Card ${cardNum}: header deve ser IMAGE ou VIDEO.`,
        cardIndex,
      })
    }
  }

  // Find body component
  const body = components.find(
    (c) => String(c?.type || '').toUpperCase() === 'BODY'
  )

  // Body is required
  if (!body) {
    errors.push({
      field: 'body',
      message: `Card ${cardNum}: body é obrigatório.`,
      cardIndex,
    })
  } else if (body.text && body.text.length > CAROUSEL_RULES.MAX_BODY_LENGTH) {
    errors.push({
      field: 'body.text',
      message: `Card ${cardNum}: body excede ${CAROUSEL_RULES.MAX_BODY_LENGTH} caracteres.`,
      cardIndex,
    })
  }

  // Find buttons component
  const buttonsComponent = components.find(
    (c) => String(c?.type || '').toUpperCase() === 'BUTTONS'
  )

  if (buttonsComponent) {
    const buttons = Array.isArray(buttonsComponent.buttons) ? buttonsComponent.buttons : []

    // Max buttons per card
    if (buttons.length > CAROUSEL_RULES.MAX_BUTTONS_PER_CARD) {
      errors.push({
        field: 'buttons',
        message: `Card ${cardNum}: máximo de ${CAROUSEL_RULES.MAX_BUTTONS_PER_CARD} botões.`,
        cardIndex,
      })
    }

    // Validate each button text length
    buttons.forEach((btn, btnIndex) => {
      if (btn.text && btn.text.length > CAROUSEL_RULES.MAX_BUTTON_TEXT) {
        errors.push({
          field: `buttons[${btnIndex}].text`,
          message: `Card ${cardNum}: botão ${btnIndex + 1} excede ${CAROUSEL_RULES.MAX_BUTTON_TEXT} caracteres.`,
          cardIndex,
        })
      }
    })
  }

  return errors
}

/**
 * Validates a complete carousel structure.
 *
 * @param carousel - The carousel object to validate (can be null/undefined)
 * @returns Array of validation errors (empty if valid)
 *
 * @example
 * const carousel = {
 *   cards: [
 *     { components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Card 1' }] },
 *     { components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Card 2' }] }
 *   ]
 * }
 * validateCarousel(carousel.cards)
 * // Returns: []
 */
export function validateCarousel(cards: CarouselCard[] | null | undefined): CarouselValidationError[] {
  // Handle null/undefined
  if (!cards) {
    return []
  }

  const errors: CarouselValidationError[] = []

  // Validate that cards is an array
  if (!Array.isArray(cards)) {
    errors.push({
      field: 'cards',
      message: 'Carousel precisa de uma lista "cards".',
    })
    return errors
  }

  // Validate card count
  if (!isValidCarouselCardCount(cards.length)) {
    errors.push({
      field: 'cards',
      message: `Carousel precisa ter entre ${CAROUSEL_RULES.MIN_CARDS} e ${CAROUSEL_RULES.MAX_CARDS} cards.`,
    })
  }

  // Validate each card
  cards.forEach((card, index) => {
    const cardErrors = validateCarouselCard(card, index)
    errors.push(...cardErrors)
  })

  return errors
}

/**
 * Validates a carousel and returns a structured result.
 *
 * @param cards - The carousel cards to validate
 * @returns Validation result with isValid flag and errors array
 *
 * @example
 * const result = validateCarouselWithResult(cards)
 * if (!result.isValid) {
 *   console.log(result.errors)
 * }
 */
export function validateCarouselWithResult(
  cards: CarouselCard[] | null | undefined
): CarouselValidationResult {
  const errors = validateCarousel(cards)
  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Gets the remaining cards that can be added to a carousel.
 *
 * @param currentCount - Current number of cards
 * @returns Number of cards that can still be added (0 if at max)
 *
 * @example
 * getRemainingCardSlots(5)  // 5
 * getRemainingCardSlots(10) // 0
 * getRemainingCardSlots(12) // 0
 */
export function getRemainingCardSlots(currentCount: number): number {
  return Math.max(0, CAROUSEL_RULES.MAX_CARDS - currentCount)
}

/**
 * Checks if more cards can be added to the carousel.
 *
 * @param currentCount - Current number of cards
 * @returns True if more cards can be added
 *
 * @example
 * canAddMoreCards(5)  // true
 * canAddMoreCards(10) // false
 */
export function canAddMoreCards(currentCount: number): boolean {
  return currentCount < CAROUSEL_RULES.MAX_CARDS
}

/**
 * Checks if cards can be removed from the carousel.
 *
 * @param currentCount - Current number of cards
 * @returns True if cards can be removed while maintaining minimum
 *
 * @example
 * canRemoveCards(3) // true
 * canRemoveCards(2) // false
 */
export function canRemoveCards(currentCount: number): boolean {
  return currentCount > CAROUSEL_RULES.MIN_CARDS
}

/**
 * Calculates remaining characters for body text.
 *
 * @param currentLength - Current text length
 * @returns Remaining characters (can be negative if over limit)
 *
 * @example
 * getRemainingBodyChars(100) // 60
 * getRemainingBodyChars(160) // 0
 * getRemainingBodyChars(170) // -10
 */
export function getRemainingBodyChars(currentLength: number): number {
  return CAROUSEL_RULES.MAX_BODY_LENGTH - currentLength
}

/**
 * Calculates remaining characters for button text.
 *
 * @param currentLength - Current text length
 * @returns Remaining characters (can be negative if over limit)
 *
 * @example
 * getRemainingButtonChars(20) // 5
 * getRemainingButtonChars(25) // 0
 */
export function getRemainingButtonChars(currentLength: number): number {
  return CAROUSEL_RULES.MAX_BUTTON_TEXT - currentLength
}
