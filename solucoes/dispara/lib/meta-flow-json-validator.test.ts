import { describe, expect, it } from 'vitest'
import { validateMetaFlowJson } from '@/lib/meta-flow-json-validator'

describe('meta-flow-json-validator validateMetaFlowJson', () => {
  it('deve falhar para tipos legados BasicText/TextEntry', () => {
    const res = validateMetaFlowJson({
      version: '7.3',
      screens: [
        {
          id: 'FORM',
          terminal: true,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              { type: 'BasicText', text: 'intro' },
              { type: 'TextEntry', name: 'nome', label: 'Nome', required: true },
              { type: 'Footer', label: 'Enviar', 'on-click-action': { name: 'complete' } },
            ],
          },
        },
      ],
    })

    expect(res.isValid).toBe(false)
    expect(res.errors.some((e) => e.message.includes('BasicText'))).toBe(true)
    expect(res.errors.some((e) => e.message.includes('TextEntry'))).toBe(true)
  })

  it('deve validar um Flow JSON mínimo compatível', () => {
    const res = validateMetaFlowJson({
      version: '7.3',
      screens: [
        {
          id: 'FORM',
          title: 'Cadastro',
          terminal: true,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              { type: 'TextBody', text: 'Preencha os dados' },
              { type: 'TextInput', name: 'nome', label: 'Nome', required: true },
              {
                type: 'Dropdown',
                name: 'estado',
                label: 'Estado',
                required: true,
                'data-source': [
                  { id: 'sp', title: 'São Paulo' },
                  { id: 'rj', title: 'Rio de Janeiro' },
                ],
              },
              { type: 'Footer', label: 'Enviar', 'on-click-action': { name: 'complete' } },
            ],
          },
        },
      ],
    })

    expect(res.isValid).toBe(true)
    expect(res.errors).toHaveLength(0)
  })

  it('deve exigir data-source (e não options) para Dropdown/Radio/Checkbox', () => {
    const res = validateMetaFlowJson({
      version: '7.3',
      screens: [
        {
          id: 'FORM',
          terminal: true,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              {
                type: 'Dropdown',
                name: 'uf',
                label: 'UF',
                required: true,
                options: [{ id: 'sp', title: 'SP' }],
              },
              { type: 'Footer', label: 'Enviar', 'on-click-action': { name: 'complete' } },
            ],
          },
        },
      ],
    })

    expect(res.isValid).toBe(false)
    expect(res.errors.some((e) => e.path.includes('data-source'))).toBe(true)
  })
})
