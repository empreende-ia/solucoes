'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Plus, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ButtonType } from './types'

interface AddButtonDropdownProps {
  addButton: (type: ButtonType) => void
  canAddButtonType: (type: ButtonType) => { ok: boolean; reason?: string }
}

interface DropdownItemConfig {
  type: ButtonType
  label: string
  shortcut?: string
}

const MAIN_ITEMS: DropdownItemConfig[] = [
  { type: 'QUICK_REPLY', label: 'Resposta rápida', shortcut: 'até 10' },
  { type: 'URL', label: 'Visitar site', shortcut: 'max 2' },
  { type: 'PHONE_NUMBER', label: 'Ligar', shortcut: 'max 1' },
  { type: 'COPY_CODE', label: 'Copiar código', shortcut: 'max 1' },
]

// Apenas tipos de botão que a Meta API realmente suporta em templates.
// Tipos como REMINDER, POSTBACK, EXTENSION, ORDER_DETAILS, SPM, SEND_LOCATION
// não são válidos para templates de mensagem e causam erro da Meta.
const ADVANCED_ITEMS: DropdownItemConfig[] = [
  { type: 'FLOW', label: 'MiniApp (requer Flow ID)' },
  { type: 'OTP', label: 'OTP (apenas Autenticação)' },
]

export function AddButtonDropdown({ addButton, canAddButtonType }: AddButtonDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] hover:bg-[var(--ds-bg-hover)]"
        >
          <Plus className="w-4 h-4" />
          Adicionar botão
          <ChevronDown className="w-4 h-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)] min-w-60">
        <DropdownMenuLabel className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wider">
          Ações
        </DropdownMenuLabel>
        
        {MAIN_ITEMS.map((item) => (
          <DropdownMenuItem
            key={item.type}
            onClick={() => addButton(item.type)}
            disabled={!canAddButtonType(item.type).ok}
            className="cursor-pointer hover:bg-[var(--ds-bg-hover)] focus:bg-[var(--ds-bg-hover)]"
          >
            {item.label}
            {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator className="bg-[var(--ds-border-default)]" />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer hover:bg-[var(--ds-bg-hover)] focus:bg-[var(--ds-bg-hover)]">
            Avançado
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)] min-w-56">
            {ADVANCED_ITEMS.map((item) => (
              <DropdownMenuItem
                key={item.type}
                onClick={() => addButton(item.type)}
                disabled={!canAddButtonType(item.type).ok}
                className="cursor-pointer hover:bg-[var(--ds-bg-hover)] focus:bg-[var(--ds-bg-hover)]"
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
