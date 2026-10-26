import { ButtonType } from './types'

// Apenas tipos de botão suportados pela Meta API para templates de mensagem.
// Tipos como REMINDER, POSTBACK, EXTENSION, CATALOG, MPM, etc. NÃO são válidos
// para templates e causam erro "O botão de modelo contém um tipo inesperado".
export const REQUIRES_BUTTON_TEXT = new Set<ButtonType>([
  'QUICK_REPLY',
  'URL',
  'PHONE_NUMBER',
  'COPY_CODE',
  'FLOW',
  'OTP',
])

// Labels apenas para tipos VÁLIDOS que a Meta aceita em templates
export const BUTTON_TYPE_LABELS: Partial<Record<ButtonType, string>> = {
  QUICK_REPLY: 'Resposta rápida',
  URL: 'Acessar o site',
  PHONE_NUMBER: 'Ligar',
  COPY_CODE: 'Copiar código da oferta',
  OTP: 'OTP',
  FLOW: 'Concluir MiniApp',
}

export const TYPES_THAT_RESET_TEXT: ButtonType[] = [
  'QUICK_REPLY',
  'URL',
  'PHONE_NUMBER',
  'FLOW',
]
