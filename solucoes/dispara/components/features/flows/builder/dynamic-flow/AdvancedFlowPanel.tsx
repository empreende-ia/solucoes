'use client'

import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

type FlowScreen = {
  id: string
  title: string
  terminal?: boolean
  data?: Record<string, unknown>
  layout?: {
    type?: string
    children?: any[]
  }
}

type AdvancedFlowPanelProps = {
  screens: FlowScreen[]
  routingModel: Record<string, string[]>
  onScreensChange: (screens: FlowScreen[]) => void
  onRoutingChange: (routing: Record<string, string[]>) => void
  onClose: () => void
}

export function AdvancedFlowPanel({
  screens,
  routingModel,
  onScreensChange,
  onRoutingChange,
  onClose,
}: AdvancedFlowPanelProps) {
  const [selectedScreenId, setSelectedScreenId] = React.useState(screens[0]?.id || '')

  const selectedScreen = screens.find((s) => s.id === selectedScreenId)
  const selectedIndex = selectedScreen ? screens.indexOf(selectedScreen) : -1
  const nextScreenId = routingModel[selectedScreenId]?.[0] || ''

  const handleScreenPatch = (patch: Partial<FlowScreen>) => {
    if (selectedIndex < 0) return
    const next = [...screens]
    next[selectedIndex] = { ...next[selectedIndex], ...patch }
    onScreensChange(next)
  }

  const handleNextScreenChange = (nextId: string) => {
    const nextRouting: Record<string, string[]> = { ...routingModel }
    nextRouting[selectedScreenId] = nextId ? [nextId] : []
    onRoutingChange(nextRouting)
  }

  const handleAddScreen = () => {
    const nextId = `SCREEN_${screens.length + 1}`
    const next = [
      ...screens,
      {
        id: nextId,
        title: `Tela ${screens.length + 1}`,
        terminal: false,
        layout: {
          type: 'SingleColumnLayout',
          children: [
            { type: 'TextBody', text: 'Nova tela' },
            { type: 'Footer', label: 'Continuar', 'on-click-action': { name: 'navigate', payload: { screen: nextId } } },
          ],
        },
        data: {},
      },
    ]
    onScreensChange(next)
    setSelectedScreenId(nextId)
  }

  const handleRemoveScreen = () => {
    if (selectedIndex < 0) return
    const next = screens.filter((_, idx) => idx !== selectedIndex)
    onScreensChange(next)
    setSelectedScreenId(next[0]?.id || '')
  }

  return (
    <div data-advanced-panel-root="true" className="fixed inset-y-0 right-0 w-[600px] bg-slate-900 border-l border-[var(--ds-border-subtle)] shadow-2xl z-50 overflow-auto">
      <div className="sticky top-0 bg-slate-900 border-b border-[var(--ds-border-subtle)] p-4 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-white">Modo Avançado</div>
          <div className="text-xs text-slate-400">Manutenção de telas (o normal é editar em “Caminhos”).</div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
        >
          ← Voltar
        </Button>
      </div>

      <div className="p-6 space-y-6">
        <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-white">Telas</div>
            <Button type="button" onClick={handleAddScreen} className="bg-white text-black hover:bg-slate-200">
              <Plus className="w-4 h-4" />
              Adicionar tela
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {screens.map((screen) => (
              <button
                key={screen.id}
                type="button"
                onClick={() => setSelectedScreenId(screen.id)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  screen.id === selectedScreenId
                    ? 'border-primary-400/40 bg-primary-500/10 text-primary-100'
                    : 'border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 text-slate-300 hover:text-white'
                }`}
              >
                {screen.id}
              </button>
            ))}
          </div>

          {selectedScreen && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Screen ID</label>
                  <Input
                    value={selectedScreen.id}
                    onChange={(e) => handleScreenPatch({ id: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Título</label>
                  <Input
                    value={selectedScreen.title}
                    onChange={(e) => handleScreenPatch({ title: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 px-3 py-2">
                <div>
                  <div className="text-xs font-medium text-slate-300">Terminal</div>
                  <div className="text-[11px] text-slate-500">Marca a última tela do flow</div>
                </div>
                <Switch
                  checked={!!selectedScreen.terminal}
                  onCheckedChange={(checked) => {
                    handleScreenPatch({ terminal: checked })
                    if (checked) {
                      handleNextScreenChange('')
                    }
                  }}
                />
              </div>

              <div className="rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 px-3 py-3 space-y-2">
                <div className="text-xs font-medium text-slate-300">Ir para (próxima tela)</div>
                <div className="text-[11px] text-slate-500">
                  Escolha para onde o botão principal leva. Se a tela for terminal, deixe vazio.
                </div>
                <select
                  value={nextScreenId}
                  onChange={(e) => handleNextScreenChange(e.target.value)}
                  disabled={!!selectedScreen.terminal}
                  className="h-11 w-full rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-3 text-[14px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-400/40 disabled:opacity-50"
                >
                  <option value="">— Nenhuma (terminal) —</option>
                  {screens
                    .filter((s) => s.id !== selectedScreenId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
                  onClick={handleRemoveScreen}
                >
                  <Trash2 className="w-4 h-4" />
                  Remover tela
                </Button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
