'use client';

import React from 'react';
import { Users } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CustomFieldDefinition } from '@/types';
import type { FixedValueDialogSlot, MissingSummaryItem } from './types';

interface QuickFillDropdownProps {
  item: MissingSummaryItem;
  recipientSource: 'all' | 'specific' | 'test' | null;
  customFields: CustomFieldDefinition[];
  onApplyQuickFill: (slot: FixedValueDialogSlot, value: string) => void;
  onOpenFixedValueDialog: (slot: FixedValueDialogSlot) => void;
}

export function QuickFillDropdown({
  item,
  recipientSource,
  customFields,
  onApplyQuickFill,
  onOpenFixedValueDialog,
}: QuickFillDropdownProps) {
  const slot: FixedValueDialogSlot = {
    where: item.where,
    key: item.key,
    buttonIndex: item.buttonIndex,
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="px-3 py-1.5 rounded-md text-[11px] font-bold bg-[var(--ds-bg-hover)] hover:bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]"
          title="Preencher esta variável"
        >
          Preencher com...
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)] min-w-55"
      >
        {recipientSource !== 'test' && (
          <>
            <DropdownMenuLabel className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wider px-2 py-1.5">
              Dados do Contato
            </DropdownMenuLabel>
            <DropdownMenuItem
              className="text-sm cursor-pointer hover:bg-[var(--ds-bg-hover)] focus:bg-[var(--ds-bg-hover)] px-2 py-1.5 rounded-sm flex items-center gap-2 outline-none"
              onClick={() => onApplyQuickFill(slot, '{{nome}}')}
            >
              <Users size={14} className="text-primary-400" />
              <span>Nome</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              className="text-sm cursor-pointer hover:bg-[var(--ds-bg-hover)] focus:bg-[var(--ds-bg-hover)] px-2 py-1.5 rounded-sm flex items-center gap-2 outline-none"
              onClick={() => onApplyQuickFill(slot, '{{telefone}}')}
            >
              <div className="text-green-400 font-mono text-[10px] w-3.5 text-center">
                Ph
              </div>
              <span>Telefone</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              className="text-sm cursor-pointer hover:bg-[var(--ds-bg-hover)] focus:bg-[var(--ds-bg-hover)] px-2 py-1.5 rounded-sm flex items-center gap-2 outline-none"
              onClick={() => onApplyQuickFill(slot, '{{email}}')}
            >
              <div className="text-blue-400 font-mono text-[10px] w-3.5 text-center">
                @
              </div>
              <span>Email</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-[var(--ds-border-default)] my-1" />
          </>
        )}

        <DropdownMenuLabel className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wider px-2 py-1.5">
          {recipientSource === 'test'
            ? 'Preencher manualmente (teste)'
            : 'Valor fixo (teste)'}
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="text-sm cursor-pointer hover:bg-[var(--ds-bg-hover)] focus:bg-[var(--ds-bg-hover)] px-2 py-1.5 rounded-sm flex items-center gap-2 outline-none"
          onClick={() => onOpenFixedValueDialog(slot)}
        >
          <div className="text-[var(--ds-text-secondary)] font-mono text-[10px] w-3.5 text-center">
            T
          </div>
          <span>Texto...</span>
        </DropdownMenuItem>

        {recipientSource !== 'test' && (
          <>
            <DropdownMenuSeparator className="bg-[var(--ds-border-default)] my-1" />

            {customFields.length > 0 && (
              <>
                <DropdownMenuLabel className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wider px-2 py-1.5 mt-2">
                  Campos Personalizados
                </DropdownMenuLabel>
                {customFields.slice(0, 10).map((field) => (
                  <DropdownMenuItem
                    key={field.id}
                    className="text-sm cursor-pointer hover:bg-[var(--ds-bg-hover)] focus:bg-[var(--ds-bg-hover)] px-2 py-1.5 rounded-sm flex items-center gap-2 outline-none"
                    onClick={() =>
                      onApplyQuickFill(slot, '{{' + field.key + '}}')
                    }
                  >
                    <div className="text-amber-400 font-mono text-[10px] w-3.5 text-center">
                      #
                    </div>
                    <span>{field.label}</span>
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
