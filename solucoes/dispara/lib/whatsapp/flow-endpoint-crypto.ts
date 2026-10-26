/**
 * WhatsApp Flow Endpoint - Criptografia
 *
 * Implementa decriptografia de requests e criptografia de responses
 * para WhatsApp Flows com data_exchange.
 *
 * Refs:
 * - https://developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint
 * - https://github.com/WhatsApp/WhatsApp-Flows-Tools/tree/main/examples/endpoint/nodejs
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-128-gcm'
const AUTH_TAG_LENGTH = 16

export interface DecryptedRequest {
  decryptedBody: Record<string, unknown>
  aesKeyBuffer: Buffer
  initialVectorBuffer: Buffer
}

export interface FlowDataExchangeRequest {
  action: 'ping' | 'INIT' | 'data_exchange' | 'BACK'
  screen?: string
  data?: Record<string, unknown>
  flow_token?: string
  version?: string
}

/**
 * Descriptografa uma request do WhatsApp Flow
 *
 * @param body - Body da request com encrypted_flow_data, encrypted_aes_key, initial_vector
 * @param privateKeyPem - Chave privada RSA em formato PEM
 * @returns Objeto com body descriptografado, AES key e IV (para usar na response)
 */
export function decryptRequest(
  body: {
    encrypted_flow_data: string
    encrypted_aes_key: string
    initial_vector: string
  },
  privateKeyPem: string
): DecryptedRequest {
  const { encrypted_flow_data, encrypted_aes_key, initial_vector } = body

  // 1. Descriptografa a AES key usando RSA
  const encryptedAesKeyBuffer = Buffer.from(encrypted_aes_key, 'base64')

  const aesKeyBuffer = crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    encryptedAesKeyBuffer
  )

  // 2. Descriptografa o flow_data usando AES-128-GCM
  const initialVectorBuffer = Buffer.from(initial_vector, 'base64')
  const encryptedFlowDataBuffer = Buffer.from(encrypted_flow_data, 'base64')

  // Separa ciphertext e auth tag (ultimos 16 bytes)
  const authTag = encryptedFlowDataBuffer.subarray(-AUTH_TAG_LENGTH)
  const ciphertext = encryptedFlowDataBuffer.subarray(0, -AUTH_TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, aesKeyBuffer, initialVectorBuffer)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext, undefined, 'utf8')
  decrypted += decipher.final('utf8')

  const decryptedBody = JSON.parse(decrypted) as Record<string, unknown>

  return {
    decryptedBody,
    aesKeyBuffer,
    initialVectorBuffer,
  }
}

/**
 * Inverte o IV para usar na response (XOR com 0xFF em cada byte)
 */
function flipIV(iv: Buffer): Buffer {
  const flipped = Buffer.alloc(iv.length)
  for (let i = 0; i < iv.length; i++) {
    flipped[i] = iv[i] ^ 0xff
  }
  return flipped
}

/**
 * Criptografa a response para o WhatsApp Flow
 *
 * @param response - Objeto de response a ser criptografado
 * @param aesKeyBuffer - AES key recebida na request
 * @param initialVectorBuffer - IV recebido na request (sera invertido)
 * @returns String base64 do response criptografado
 */
export function encryptResponse(
  response: Record<string, unknown>,
  aesKeyBuffer: Buffer,
  initialVectorBuffer: Buffer
): string {
  // Inverte o IV para a response
  const flippedIV = flipIV(initialVectorBuffer)

  const cipher = crypto.createCipheriv(ALGORITHM, aesKeyBuffer, flippedIV)

  const responseJson = JSON.stringify(response)
  let encrypted = cipher.update(responseJson, 'utf8')
  const final = cipher.final()
  const authTag = cipher.getAuthTag()

  // Concatena ciphertext + authTag
  const encryptedBuffer = Buffer.concat([encrypted, final, authTag])

  return encryptedBuffer.toString('base64')
}

/**
 * Gera um par de chaves RSA para usar com WhatsApp Flows
 *
 * @returns Objeto com publicKey e privateKey em formato PEM
 */
export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  })

  return { publicKey, privateKey }
}

/**
 * Valida se a chave privada e valida
 */
export function isValidPrivateKey(privateKeyPem: string): boolean {
  try {
    crypto.createPrivateKey(privateKeyPem)
    return true
  } catch {
    return false
  }
}

/**
 * Response de erro para o WhatsApp Flow
 */
export function createErrorResponse(errorMessage: string): Record<string, unknown> {
  return {
    version: '3.0',
    data: {
      error: true,
      error_message: errorMessage,
    },
  }
}

/**
 * Response de sucesso para o WhatsApp Flow
 */
export function createSuccessResponse(
  screen: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  return {
    version: '3.0',
    screen,
    data,
  }
}

/**
 * Response para finalizar o flow (close)
 */
export function createCloseResponse(data?: Record<string, unknown>): Record<string, unknown> {
  return {
    version: '3.0',
    screen: 'SUCCESS',
    data: {
      extension_message_response: {
        params: data || {},
      },
    },
  }
}
