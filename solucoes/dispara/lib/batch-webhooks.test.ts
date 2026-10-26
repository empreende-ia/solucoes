import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies before importing the module
vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('./event-stats', () => ({
  recordMessageDelivered: vi.fn(),
  recordMessageRead: vi.fn(),
  recordMessageFailed: vi.fn(),
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    get store() {
      return store
    },
  }
})()

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// Import after mocks are set up
import {
  webhookBatcher,
  handleWebhookStatus,
  parseMetaWebhook,
  processMetaWebhook,
  flushBeforeShutdown,
  type WebhookUpdate,
} from './batch-webhooks'
import { logger } from './logger'
import {
  recordMessageDelivered,
  recordMessageRead,
  recordMessageFailed,
} from './event-stats'

describe('batch-webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    localStorageMock.clear()
    webhookBatcher.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('WebhookBatchManager', () => {
    describe('add', () => {
      it('deve adicionar update ao batch', () => {
        const update: WebhookUpdate = {
          messageId: 'msg-1',
          phone: '5511999999999',
          campaignId: 'camp-1',
          status: 'delivered',
          timestamp: Date.now(),
        }

        webhookBatcher.add(update)

        expect(webhookBatcher.getPendingCount()).toBe(1)
      })

      it('deve iniciar timer de flush quando batch esta vazio', () => {
        const update: WebhookUpdate = {
          messageId: 'msg-1',
          phone: '5511999999999',
          status: 'delivered',
          timestamp: Date.now(),
        }

        webhookBatcher.add(update)

        expect(webhookBatcher.getPendingCount()).toBe(1)

        // Avanca 5 segundos (flushIntervalMs default)
        vi.advanceTimersByTime(5000)

        expect(webhookBatcher.getPendingCount()).toBe(0)
      })

      it('deve forcar flush quando batch atinge maxBatchSize', () => {
        // Adiciona 100 updates (maxBatchSize default)
        for (let i = 0; i < 100; i++) {
          webhookBatcher.add({
            messageId: `msg-${i}`,
            phone: `551199999${String(i).padStart(4, '0')}`,
            campaignId: 'camp-1',
            status: 'delivered',
            timestamp: Date.now(),
          })
        }

        // Batch deve ter sido flushed automaticamente
        expect(webhookBatcher.getPendingCount()).toBe(0)
        expect(logger.info).toHaveBeenCalledWith('Flushing webhook batch', { count: 100 })
      })
    })

    describe('flush', () => {
      it('nao deve fazer nada se batch esta vazio', () => {
        webhookBatcher.flush()

        expect(logger.info).not.toHaveBeenCalledWith(
          'Flushing webhook batch',
          expect.anything()
        )
      })

      it('deve processar updates e limpar batch', () => {
        webhookBatcher.add({
          messageId: 'msg-1',
          phone: '5511999999999',
          campaignId: 'camp-1',
          status: 'delivered',
          timestamp: Date.now(),
        })

        webhookBatcher.flush()

        expect(webhookBatcher.getPendingCount()).toBe(0)
        expect(logger.info).toHaveBeenCalledWith('Flushing webhook batch', { count: 1 })
      })

      it('deve cancelar timer pendente ao fazer flush', () => {
        webhookBatcher.add({
          messageId: 'msg-1',
          phone: '5511999999999',
          status: 'delivered',
          timestamp: Date.now(),
        })

        webhookBatcher.flush()

        // Avanca timer e verifica que nao houve segundo flush
        vi.advanceTimersByTime(5000)

        expect(logger.info).toHaveBeenCalledTimes(1)
      })

      it('deve agrupar updates por campaignId', () => {
        localStorageMock.setItem(
          'dispara_campaigns',
          JSON.stringify([
            { id: 'camp-1', delivered: 0, read: 0 },
            { id: 'camp-2', delivered: 0, read: 0 },
          ])
        )

        webhookBatcher.add({
          messageId: 'msg-1',
          phone: '5511999999999',
          campaignId: 'camp-1',
          status: 'delivered',
          timestamp: Date.now(),
        })
        webhookBatcher.add({
          messageId: 'msg-2',
          phone: '5511888888888',
          campaignId: 'camp-2',
          status: 'read',
          timestamp: Date.now(),
        })
        webhookBatcher.add({
          messageId: 'msg-3',
          phone: '5511777777777',
          campaignId: 'camp-1',
          status: 'delivered',
          timestamp: Date.now(),
        })

        webhookBatcher.flush()

        expect(recordMessageDelivered).toHaveBeenCalledTimes(2)
        expect(recordMessageRead).toHaveBeenCalledTimes(1)
      })

      it('deve logar warning para updates orfaos (sem campaignId)', () => {
        webhookBatcher.add({
          messageId: 'msg-1',
          phone: '5511999999999',
          status: 'delivered',
          timestamp: Date.now(),
        })

        webhookBatcher.flush()

        expect(logger.warn).toHaveBeenCalledWith('Orphan webhook updates', { count: 1 })
      })

      it('deve chamar recordMessageDelivered para status delivered', () => {
        localStorageMock.setItem(
          'dispara_campaigns',
          JSON.stringify([{ id: 'camp-1', delivered: 0, read: 0 }])
        )

        webhookBatcher.add({
          messageId: 'msg-1',
          phone: '5511999999999',
          campaignId: 'camp-1',
          status: 'delivered',
          timestamp: Date.now(),
        })

        webhookBatcher.flush()

        expect(recordMessageDelivered).toHaveBeenCalledWith(
          'camp-1',
          'msg-1',
          '5511999999999'
        )
      })

      it('deve chamar recordMessageRead para status read', () => {
        localStorageMock.setItem(
          'dispara_campaigns',
          JSON.stringify([{ id: 'camp-1', delivered: 0, read: 0 }])
        )

        webhookBatcher.add({
          messageId: 'msg-1',
          phone: '5511999999999',
          campaignId: 'camp-1',
          status: 'read',
          timestamp: Date.now(),
        })

        webhookBatcher.flush()

        expect(recordMessageRead).toHaveBeenCalledWith(
          'camp-1',
          'msg-1',
          '5511999999999'
        )
      })

      it('deve chamar recordMessageFailed para status failed com erro', () => {
        localStorageMock.setItem(
          'dispara_campaigns',
          JSON.stringify([{ id: 'camp-1', delivered: 0, read: 0 }])
        )

        webhookBatcher.add({
          messageId: 'msg-1',
          phone: '5511999999999',
          campaignId: 'camp-1',
          status: 'failed',
          timestamp: Date.now(),
          error: 'Invalid phone number',
        })

        webhookBatcher.flush()

        expect(recordMessageFailed).toHaveBeenCalledWith(
          'camp-1',
          'msg-1',
          '5511999999999',
          'Invalid phone number'
        )
      })

      it('deve usar "Unknown error" quando error nao esta presente', () => {
        localStorageMock.setItem(
          'dispara_campaigns',
          JSON.stringify([{ id: 'camp-1', delivered: 0, read: 0 }])
        )

        webhookBatcher.add({
          messageId: 'msg-1',
          phone: '5511999999999',
          campaignId: 'camp-1',
          status: 'failed',
          timestamp: Date.now(),
        })

        webhookBatcher.flush()

        expect(recordMessageFailed).toHaveBeenCalledWith(
          'camp-1',
          'msg-1',
          '5511999999999',
          'Unknown error'
        )
      })

      it('deve atualizar stats da campanha no localStorage', () => {
        localStorageMock.setItem(
          'dispara_campaigns',
          JSON.stringify([{ id: 'camp-1', delivered: 5, read: 2 }])
        )

        webhookBatcher.add({
          messageId: 'msg-1',
          phone: '5511999999999',
          campaignId: 'camp-1',
          status: 'delivered',
          timestamp: Date.now(),
        })
        webhookBatcher.add({
          messageId: 'msg-2',
          phone: '5511888888888',
          campaignId: 'camp-1',
          status: 'read',
          timestamp: Date.now(),
        })

        webhookBatcher.flush()

        const stored = JSON.parse(localStorageMock.getItem('dispara_campaigns') || '[]')
        expect(stored[0].delivered).toBe(6) // 5 + 1
        expect(stored[0].read).toBe(3) // 2 + 1
      })

      it('deve logar warning quando campanha nao e encontrada', () => {
        localStorageMock.setItem(
          'dispara_campaigns',
          JSON.stringify([{ id: 'other-camp', delivered: 0, read: 0 }])
        )

        webhookBatcher.add({
          messageId: 'msg-1',
          phone: '5511999999999',
          campaignId: 'camp-not-found',
          status: 'delivered',
          timestamp: Date.now(),
        })

        webhookBatcher.flush()

        expect(logger.warn).toHaveBeenCalledWith('Campaign not found for batch update', {
          campaignId: 'camp-not-found',
        })
      })

      it('deve tratar erro ao atualizar localStorage', () => {
        localStorageMock.setItem('dispara_campaigns', 'invalid-json')

        webhookBatcher.add({
          messageId: 'msg-1',
          phone: '5511999999999',
          campaignId: 'camp-1',
          status: 'delivered',
          timestamp: Date.now(),
        })

        webhookBatcher.flush()

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to update campaign stats',
          expect.objectContaining({
            campaignId: 'camp-1',
            error: expect.any(String),
          })
        )
      })

      it('nao deve fazer nada quando localStorage esta vazio', () => {
        webhookBatcher.add({
          messageId: 'msg-1',
          phone: '5511999999999',
          campaignId: 'camp-1',
          status: 'delivered',
          timestamp: Date.now(),
        })

        webhookBatcher.flush()

        // Nao deve logar erro, apenas sair silenciosamente
        expect(logger.error).not.toHaveBeenCalled()
        expect(logger.debug).not.toHaveBeenCalled()
      })
    })

    describe('getPendingCount', () => {
      it('deve retornar 0 quando batch esta vazio', () => {
        expect(webhookBatcher.getPendingCount()).toBe(0)
      })

      it('deve retornar numero correto de updates pendentes', () => {
        webhookBatcher.add({
          messageId: 'msg-1',
          phone: '5511999999999',
          status: 'delivered',
          timestamp: Date.now(),
        })
        webhookBatcher.add({
          messageId: 'msg-2',
          phone: '5511888888888',
          status: 'read',
          timestamp: Date.now(),
        })

        expect(webhookBatcher.getPendingCount()).toBe(2)
      })
    })

    describe('clear', () => {
      it('deve limpar todos os updates pendentes', () => {
        webhookBatcher.add({
          messageId: 'msg-1',
          phone: '5511999999999',
          status: 'delivered',
          timestamp: Date.now(),
        })

        webhookBatcher.clear()

        expect(webhookBatcher.getPendingCount()).toBe(0)
      })

      it('deve cancelar timer pendente', () => {
        webhookBatcher.add({
          messageId: 'msg-1',
          phone: '5511999999999',
          status: 'delivered',
          timestamp: Date.now(),
        })

        webhookBatcher.clear()

        // Avanca timer e verifica que nao houve flush
        vi.advanceTimersByTime(5000)

        expect(logger.info).not.toHaveBeenCalled()
      })
    })
  })

  describe('handleWebhookStatus', () => {
    it('deve ignorar status "sent"', () => {
      handleWebhookStatus('msg-1', '5511999999999', 'sent', 'camp-1')

      expect(webhookBatcher.getPendingCount()).toBe(0)
    })

    it('deve adicionar status "delivered" ao batch', () => {
      handleWebhookStatus('msg-1', '5511999999999', 'delivered', 'camp-1')

      expect(webhookBatcher.getPendingCount()).toBe(1)
    })

    it('deve adicionar status "read" ao batch', () => {
      handleWebhookStatus('msg-1', '5511999999999', 'read', 'camp-1')

      expect(webhookBatcher.getPendingCount()).toBe(1)
    })

    it('deve adicionar status "failed" ao batch com erro', () => {
      handleWebhookStatus('msg-1', '5511999999999', 'failed', 'camp-1', 'Connection error')

      expect(webhookBatcher.getPendingCount()).toBe(1)
    })

    it('deve funcionar sem campaignId', () => {
      handleWebhookStatus('msg-1', '5511999999999', 'delivered')

      expect(webhookBatcher.getPendingCount()).toBe(1)
    })
  })

  describe('parseMetaWebhook', () => {
    it('deve parsear payload de webhook Meta com status "delivered"', () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'wamid.123',
                      recipient_id: '5511999999999',
                      status: 'delivered',
                      timestamp: '1700000000',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      const result = parseMetaWebhook(payload)

      expect(result).toEqual({
        messageId: 'wamid.123',
        phone: '5511999999999',
        status: 'delivered',
        timestamp: 1700000000000,
        error: undefined,
      })
    })

    it('deve parsear payload com status "read"', () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'wamid.456',
                      recipient_id: '5511888888888',
                      status: 'read',
                      timestamp: '1700000000',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      const result = parseMetaWebhook(payload)

      expect(result).toEqual({
        messageId: 'wamid.456',
        phone: '5511888888888',
        status: 'read',
        timestamp: 1700000000000,
        error: undefined,
      })
    })

    it('deve parsear payload com status "failed" e erro', () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'wamid.789',
                      recipient_id: '5511777777777',
                      status: 'failed',
                      timestamp: '1700000000',
                      errors: [{ message: 'Invalid phone number' }],
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      const result = parseMetaWebhook(payload)

      expect(result).toEqual({
        messageId: 'wamid.789',
        phone: '5511777777777',
        status: 'failed',
        timestamp: 1700000000000,
        error: 'Invalid phone number',
      })
    })

    it('deve retornar null para status "sent"', () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'wamid.123',
                      recipient_id: '5511999999999',
                      status: 'sent',
                      timestamp: '1700000000',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      const result = parseMetaWebhook(payload)

      expect(result).toBeNull()
    })

    it('deve retornar null para status "pending"', () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'wamid.123',
                      recipient_id: '5511999999999',
                      status: 'pending',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      const result = parseMetaWebhook(payload)

      expect(result).toBeNull()
    })

    it('deve retornar null para payload vazio', () => {
      expect(parseMetaWebhook({})).toBeNull()
      expect(parseMetaWebhook(null)).toBeNull()
      expect(parseMetaWebhook(undefined)).toBeNull()
    })

    it('deve retornar null quando entry esta vazio', () => {
      const payload = { entry: [] }
      expect(parseMetaWebhook(payload)).toBeNull()
    })

    it('deve retornar null quando changes esta vazio', () => {
      const payload = { entry: [{ changes: [] }] }
      expect(parseMetaWebhook(payload)).toBeNull()
    })

    it('deve retornar null quando statuses esta vazio', () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [],
                },
              },
            ],
          },
        ],
      }
      expect(parseMetaWebhook(payload)).toBeNull()
    })

    it('deve usar Date.now() quando timestamp nao esta presente', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'wamid.123',
                      recipient_id: '5511999999999',
                      status: 'delivered',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      const result = parseMetaWebhook(payload)

      expect(result?.timestamp).toBe(now)
    })

    it('deve logar erro e retornar null para payload invalido', () => {
      // Força um erro acessando propriedade de undefined
      const payload = { entry: [{ changes: [{ value: null }] }] }

      const result = parseMetaWebhook(payload)

      expect(result).toBeNull()
    })
  })

  describe('processMetaWebhook', () => {
    it('deve processar webhook e adicionar ao batch', () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'wamid.123',
                      recipient_id: '5511999999999',
                      status: 'delivered',
                      timestamp: '1700000000',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      processMetaWebhook(payload, 'camp-1')

      expect(webhookBatcher.getPendingCount()).toBe(1)
    })

    it('deve adicionar campaignId ao update', () => {
      localStorageMock.setItem(
        'dispara_campaigns',
        JSON.stringify([{ id: 'my-campaign', delivered: 0, read: 0 }])
      )

      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'wamid.123',
                      recipient_id: '5511999999999',
                      status: 'delivered',
                      timestamp: '1700000000',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      processMetaWebhook(payload, 'my-campaign')
      webhookBatcher.flush()

      expect(recordMessageDelivered).toHaveBeenCalledWith(
        'my-campaign',
        'wamid.123',
        '5511999999999'
      )
    })

    it('nao deve adicionar nada ao batch se parseMetaWebhook retorna null', () => {
      processMetaWebhook({})

      expect(webhookBatcher.getPendingCount()).toBe(0)
    })

    it('deve funcionar sem campaignId', () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'wamid.123',
                      recipient_id: '5511999999999',
                      status: 'read',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      processMetaWebhook(payload)

      expect(webhookBatcher.getPendingCount()).toBe(1)
    })
  })

  describe('flushBeforeShutdown', () => {
    it('deve logar e chamar flush', () => {
      webhookBatcher.add({
        messageId: 'msg-1',
        phone: '5511999999999',
        status: 'delivered',
        timestamp: Date.now(),
      })

      flushBeforeShutdown()

      expect(logger.info).toHaveBeenCalledWith('Flushing webhook batch before shutdown')
      expect(webhookBatcher.getPendingCount()).toBe(0)
    })

    it('deve funcionar mesmo com batch vazio', () => {
      flushBeforeShutdown()

      expect(logger.info).toHaveBeenCalledWith('Flushing webhook batch before shutdown')
    })
  })

  describe('integracao: fluxo completo de webhook', () => {
    it('deve processar multiplos webhooks Meta e atualizar campanhas', () => {
      localStorageMock.setItem(
        'dispara_campaigns',
        JSON.stringify([
          { id: 'campaign-a', delivered: 10, read: 5 },
          { id: 'campaign-b', delivered: 20, read: 10 },
        ])
      )

      // Simula varios webhooks chegando
      const webhooks = [
        { status: 'delivered', campaignId: 'campaign-a' },
        { status: 'delivered', campaignId: 'campaign-a' },
        { status: 'read', campaignId: 'campaign-a' },
        { status: 'delivered', campaignId: 'campaign-b' },
        { status: 'read', campaignId: 'campaign-b' },
        { status: 'read', campaignId: 'campaign-b' },
      ]

      webhooks.forEach((wh, i) => {
        const payload = {
          entry: [
            {
              changes: [
                {
                  value: {
                    statuses: [
                      {
                        id: `wamid.${i}`,
                        recipient_id: `55119999${String(i).padStart(5, '0')}`,
                        status: wh.status,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        }
        processMetaWebhook(payload, wh.campaignId)
      })

      // Flush manualmente
      webhookBatcher.flush()

      // Verifica que as estatisticas foram atualizadas
      const campaigns = JSON.parse(localStorageMock.getItem('dispara_campaigns') || '[]')

      expect(campaigns[0].delivered).toBe(12) // 10 + 2
      expect(campaigns[0].read).toBe(6) // 5 + 1
      expect(campaigns[1].delivered).toBe(21) // 20 + 1
      expect(campaigns[1].read).toBe(12) // 10 + 2
    })

    it('deve fazer flush automatico apos timeout', () => {
      localStorageMock.setItem(
        'dispara_campaigns',
        JSON.stringify([{ id: 'camp-1', delivered: 0, read: 0 }])
      )

      handleWebhookStatus('msg-1', '5511999999999', 'delivered', 'camp-1')
      handleWebhookStatus('msg-2', '5511888888888', 'read', 'camp-1')

      expect(webhookBatcher.getPendingCount()).toBe(2)

      // Avanca 5 segundos
      vi.advanceTimersByTime(5000)

      expect(webhookBatcher.getPendingCount()).toBe(0)
      expect(logger.info).toHaveBeenCalledWith('Flushing webhook batch', { count: 2 })
    })
  })
})
