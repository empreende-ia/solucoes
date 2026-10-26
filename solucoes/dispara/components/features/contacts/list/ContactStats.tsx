'use client';

import React from 'react';
import { Users, UserCheck, UserX } from 'lucide-react';
import type { ContactStatsData } from './types';

export interface ContactStatsProps {
  stats: ContactStatsData;
}

export const ContactStats: React.FC<ContactStatsProps> = ({ stats }) => {
  const total = stats?.total ?? 0;
  const optIn = stats?.optIn ?? 0;
  const optOut = stats?.optOut ?? 0;
  const optInPct = total > 0 ? Math.round((optIn / total) * 100) : 0;

  return (
    <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {/* Hero Card — Total de Contatos */}
      <div className="col-span-1 md:col-span-2 ds-gradient-hero p-8 group">
        <div className="relative z-10">
          <p className="text-primary-200 text-sm font-bold uppercase tracking-widest mb-2">
            Total de Contatos
          </p>
          <h3 className="text-4xl font-extrabold text-[var(--ds-text-primary)] font-[var(--ds-font-display)] mb-4">
            {total.toLocaleString()}
          </h3>
          <div className="flex items-center gap-2 text-primary-200 font-bold text-sm">
            <UserCheck size={16} />
            <span>{optInPct}% ativos (opt-in)</span>
          </div>
        </div>
        {/* Ghost icon */}
        <div className="absolute -right-6 -bottom-6 opacity-[0.06] group-hover:scale-110 transition-transform duration-700 pointer-events-none">
          <Users size={180} strokeWidth={1} />
        </div>
      </div>

      {/* Stat — Opt-in Ativos */}
      <div className="ds-stat-card p-6 flex flex-col justify-between">
        <div>
          <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-lg flex items-center justify-center mb-4">
            <UserCheck size={20} />
          </div>
          <p className="text-[var(--ds-text-muted)] text-xs font-semibold mb-1">Opt-in Ativos</p>
          <h4 className="text-2xl font-bold text-[var(--ds-text-primary)] font-[var(--ds-font-display)]">
            {optIn.toLocaleString()}
          </h4>
        </div>
        <div className="h-1 bg-[var(--ds-bg-surface)] rounded-full mt-4 overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${optInPct}%` }}
          />
        </div>
      </div>

      {/* Stat — Inativos / Opt-out */}
      <div className="ds-stat-card p-6 flex flex-col justify-between">
        <div>
          <div className="w-10 h-10 bg-slate-500/10 text-[var(--ds-text-secondary)] rounded-lg flex items-center justify-center mb-4">
            <UserX size={20} />
          </div>
          <p className="text-[var(--ds-text-muted)] text-xs font-semibold mb-1">Inativos / Opt-out</p>
          <h4 className="text-2xl font-bold text-[var(--ds-text-primary)] font-[var(--ds-font-display)]">
            {optOut.toLocaleString()}
          </h4>
        </div>
        <p className="text-[10px] text-[var(--ds-text-muted)] font-bold mt-4 uppercase tracking-tight">
          Não receberão mensagens
        </p>
      </div>
    </section>
  );
};
