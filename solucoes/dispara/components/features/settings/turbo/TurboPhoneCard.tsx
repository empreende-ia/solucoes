'use client';

import React from 'react';

export interface TurboPhoneCardProps {
  phoneNumberId?: string | null;
  settingsPhoneNumberId?: string | null;
}

export function TurboPhoneCard({
  phoneNumberId,
  settingsPhoneNumberId,
}: TurboPhoneCardProps) {
  const id = phoneNumberId || settingsPhoneNumberId;

  return (
    <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl p-4 flex flex-col">
      <div className="text-xs text-[var(--ds-text-muted)] mb-2">Identificação do número de telefone</div>
      <div className="flex-1 flex items-center">
        <span className="text-lg font-mono font-medium text-[var(--ds-text-primary)] break-all">
          {id || '-'}
        </span>
      </div>
    </div>
  );
}
