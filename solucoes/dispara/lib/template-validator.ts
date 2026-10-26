/**
 * Template Component Validator
 *
 * Validates template components and parameters before sending
 * Ported from NossoFlow with improvements
 */

import { logger } from './logger';
import { handleValidationError, AppError, ErrorType } from './errors';
import type { Template, TemplateComponent } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  component: string;
  field: string;
  message: string;
}

export interface ValidationWarning {
  component: string;
  field: string;
  message: string;
}

export interface TemplateParameterValues {
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    value?: string;  // URL or text
    filename?: string;  // For documents
  };
  body: string[];  // Array of body variable values
  buttons?: {
    type: 'url' | 'quick_reply';
    index: number;
    value?: string;  // URL suffix or payload
  }[];
}

// ============================================================================
// Validators
// ============================================================================

/**
 * Validates that all required template parameters are provided
 */
export function validateTemplateParameters(
  template: Template,
  values: TemplateParameterValues
): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  // Validate header if template has header
  const components = template.components || [];
  const headerComponent = components.find(c => c.type === 'HEADER');
  if (headerComponent) {
    validateHeader(headerComponent, values.header, result);
  }

  // Validate body parameters
  const bodyComponent = components.find(c => c.type === 'BODY');
  if (bodyComponent) {
    validateBody(bodyComponent, values.body, result);
  }

  // Validate button parameters
  const buttonComponents = components.filter(c => c.type === 'BUTTONS');
  buttonComponents.forEach(buttons => {
    validateButtons(buttons, values.buttons, result);
  });

  result.isValid = result.errors.length === 0;

  if (!result.isValid) {
    logger.warn('Template validation failed', {
      templateId: template.id,
      templateName: template.name,
      errors: result.errors,
    });
  }

  return result;
}

/**
 * Validates header component
 */
function validateHeader(
  header: TemplateComponent,
  value: TemplateParameterValues['header'],
  result: ValidationResult
): void {
  if (!header.format) return;

  switch (header.format) {
    case 'TEXT':
      // Text header may have variables
      if (header.text?.includes('{{')) {
        if (!value?.value) {
          result.errors.push({
            component: 'header',
            field: 'text',
            message: 'Valor do header é obrigatório',
          });
        }
      }
      break;

    case 'IMAGE':
      if (!value?.value) {
        result.errors.push({
          component: 'header',
          field: 'image',
          message: 'URL da imagem é obrigatória',
        });
      } else if (!isValidMediaUrl(value.value, 'image')) {
        result.warnings.push({
          component: 'header',
          field: 'image',
          message: 'URL da imagem pode não ser válida. Verifique se é acessível publicamente.',
        });
      }
      break;

    case 'VIDEO':
      if (!value?.value) {
        result.errors.push({
          component: 'header',
          field: 'video',
          message: 'URL do vídeo é obrigatória',
        });
      } else if (!isValidMediaUrl(value.value, 'video')) {
        result.warnings.push({
          component: 'header',
          field: 'video',
          message: 'URL do vídeo pode não ser válida. Formatos suportados: MP4, 3GPP.',
        });
      }
      break;

    case 'DOCUMENT':
      if (!value?.value) {
        result.errors.push({
          component: 'header',
          field: 'document',
          message: 'URL do documento é obrigatória',
        });
      }
      if (!value?.filename) {
        result.warnings.push({
          component: 'header',
          field: 'document',
          message: 'Nome do arquivo não especificado. Será usado nome padrão.',
        });
      }
      break;
  }
}

/**
 * Validates body component parameters
 */
function validateBody(
  body: TemplateComponent,
  values: string[],
  result: ValidationResult
): void {
  if (!body.text) return;

  // Count variables in body text
  const varMatches = body.text.match(/\{\{\d+\}\}/g) || [];
  const requiredCount = varMatches.length;

  if (values.length < requiredCount) {
    result.errors.push({
      component: 'body',
      field: 'parameters',
      message: `Template requer ${requiredCount} variáveis, mas apenas ${values.length} foram fornecidas`,
    });
  }

  // Check for empty values
  values.forEach((value, index) => {
    if (!value || value.trim() === '') {
      result.errors.push({
        component: 'body',
        field: `parameter_${index + 1}`,
        message: `Variável {{${index + 1}}} não pode estar vazia`,
      });
    }
  });

  // Warn about very long values
  values.forEach((value, index) => {
    if (value && value.length > 1024) {
      result.warnings.push({
        component: 'body',
        field: `parameter_${index + 1}`,
        message: `Variável {{${index + 1}}} é muito longa (${value.length} caracteres). Pode ser truncada.`,
      });
    }
  });
}

/**
 * Validates button components
 */
function validateButtons(
  buttons: TemplateComponent,
  values: TemplateParameterValues['buttons'],
  result: ValidationResult
): void {
  if (!buttons.buttons) return;

  buttons.buttons.forEach((button, index) => {
    if (button.type === 'URL' && button.url?.includes('{{')) {
      // Button has dynamic URL suffix
      const buttonValue = values?.find(v => v.index === index);
      if (!buttonValue?.value) {
        result.errors.push({
          component: 'buttons',
          field: `button_${index}`,
          message: `Botão "${button.text}" requer valor de URL dinâmica`,
        });
      }
    }
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if URL looks valid for media type
 */
function isValidMediaUrl(url: string, type: 'image' | 'video' | 'document'): boolean {
  try {
    const parsed = new URL(url);

    // Must be https
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Check extension (basic validation)
    const path = parsed.pathname.toLowerCase();

    switch (type) {
      case 'image':
        return /\.(jpg|jpeg|png|webp)$/.test(path) || path.includes('image');
      case 'video':
        return /\.(mp4|3gpp|3gp)$/.test(path) || path.includes('video');
      case 'document':
        return /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/.test(path);
    }
  } catch {
    return false;
  }
}

/**
 * Counts required variables in template
 */
export function countTemplateVariables(template: Template): {
  header: number;
  body: number;
  buttons: number;
  total: number;
} {
  let header = 0;
  let body = 0;
  let buttons = 0;

  const components = template.components || [];
  components.forEach(component => {
    switch (component.type) {
      case 'HEADER':
        if (component.format === 'TEXT' && component.text?.includes('{{')) {
          header = (component.text.match(/\{\{\d+\}\}/g) || []).length;
        } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(component.format || '')) {
          header = 1; // Media requires URL
        }
        break;

      case 'BODY':
        if (component.text) {
          body = (component.text.match(/\{\{\d+\}\}/g) || []).length;
        }
        break;

      case 'BUTTONS':
        if (component.buttons) {
          component.buttons.forEach(button => {
            if (button.type === 'URL' && button.url?.includes('{{')) {
              buttons++;
            }
          });
        }
        break;
    }
  });

  return {
    header,
    body,
    buttons,
    total: header + body + buttons,
  };
}

/**
 * Builds WhatsApp API component payload from values
 */
export function buildComponentPayload(
  template: Template,
  values: TemplateParameterValues
): unknown[] {
  const components: unknown[] = [];

  // Header component
  const templateComponents = template.components || [];
  const headerComponent = templateComponents.find(c => c.type === 'HEADER');
  if (headerComponent && values.header) {
    const headerPayload: {
      type: string;
      parameters: unknown[];
    } = {
      type: 'header',
      parameters: [],
    };

    switch (headerComponent.format) {
      case 'TEXT':
        if (values.header.value) {
          headerPayload.parameters.push({
            type: 'text',
            text: values.header.value,
          });
        }
        break;

      case 'IMAGE':
        headerPayload.parameters.push({
          type: 'image',
          image: { link: values.header.value },
        });
        break;

      case 'VIDEO':
        headerPayload.parameters.push({
          type: 'video',
          video: { link: values.header.value },
        });
        break;

      case 'DOCUMENT':
        headerPayload.parameters.push({
          type: 'document',
          document: {
            link: values.header.value,
            filename: values.header.filename || 'document',
          },
        });
        break;
    }

    if (headerPayload.parameters.length > 0) {
      components.push(headerPayload);
    }
  }

  // Body component
  if (values.body && values.body.length > 0) {
    components.push({
      type: 'body',
      parameters: values.body.map(text => ({
        type: 'text',
        text,
      })),
    });
  }

  // Button components
  if (values.buttons && values.buttons.length > 0) {
    values.buttons.forEach(button => {
      components.push({
        type: 'button',
        sub_type: button.type,
        index: button.index.toString(),
        parameters: [{
          type: button.type === 'url' ? 'text' : 'payload',
          [button.type === 'url' ? 'text' : 'payload']: button.value,
        }],
      });
    });
  }

  return components;
}

/**
 * Validates template before dispatch
 * Throws AppError if validation fails
 */
export function validateTemplateForDispatch(
  template: Template,
  values: TemplateParameterValues
): void {
  const validation = validateTemplateParameters(template, values);

  if (!validation.isValid) {
    const errorMessages = validation.errors.map(e => e.message).join('; ');
    throw new AppError(
      ErrorType.VALIDATION_ERROR,
      `Template validation failed: ${errorMessages}`,
      `Erro de validação: ${errorMessages}`,
      400,
      { templateId: template.id, errors: validation.errors }
    );
  }

  // Log warnings but don't fail
  if (validation.warnings.length > 0) {
    logger.warn('Template validation warnings', {
      templateId: template.id,
      warnings: validation.warnings,
    });
  }
}
