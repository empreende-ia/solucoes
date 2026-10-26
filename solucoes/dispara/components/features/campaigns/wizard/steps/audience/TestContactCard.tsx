'use client';

import React from 'react';
import { FlaskConical } from 'lucide-react';
import { getPricingBreakdown } from '@/lib/whatsapp-pricing';
import { formatPhoneNumberDisplay } from '@/lib/phone-formatter';
import { CheckCircleFilled } from '@/components/ui/icons/CheckCircleFilled';
import { TestContactCardProps } from './types';

export function TestContactCard({
  testContact,
  isSelected,
  onSelect,
  selectedTemplate,
  exchangeRate,
}: TestContactCardProps) {
  return (
    <div className="mb-4">
      <button
        onClick={onSelect}
        className={`relative w-full p-4 rounded-2xl border transition-all duration-200 flex items-center gap-4 ${
          isSelected
            ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
            : 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50 text-amber-300'
        }`}
      >
        {isSelected && (
          <div className="absolute top-3 right-3 text-black">
            <CheckCircleFilled size={18} />
          </div>
        )}
        <div
          className={`p-3 rounded-xl ${
            isSelected
              ? 'bg-black/20 text-black'
              : 'bg-amber-500/20 text-amber-400'
          }`}
        >
          <FlaskConical size={20} />
        </div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm">Enviar para Contato de Teste</h3>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                isSelected ? 'bg-black/20' : 'bg-amber-500/20'
              }`}
            >
              RECOMENDADO
            </span>
          </div>
          <p
            className={`text-xs mt-0.5 ${
              isSelected ? 'text-black/70' : 'text-amber-400/70'
            }`}
          >
            {testContact.name || 'Contato de Teste'} • {formatPhoneNumberDisplay(testContact.phone, 'e164')}
          </p>
        </div>
        {isSelected && selectedTemplate && (
          <div className="text-right">
            <p className="text-xs font-bold text-black">
              {
                getPricingBreakdown(
                  selectedTemplate.category,
                  1,
                  0,
                  exchangeRate ?? 5.0
                ).totalBRLFormatted
              }
            </p>
          </div>
        )}
      </button>
    </div>
  );
}
