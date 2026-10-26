'use client';

import React from 'react';
import { Calendar, CheckCircle, Clock, Zap } from 'lucide-react';

interface SchedulingOptionsProps {
  scheduleMode: 'now' | 'scheduled';
  scheduledDate: string;
  scheduledTime: string;
  setScheduleMode: (mode: 'now' | 'scheduled') => void;
  setScheduledDate: (date: string) => void;
  setScheduledTime: (time: string) => void;
}

export function SchedulingOptions({
  scheduleMode,
  scheduledDate,
  scheduledTime,
  setScheduleMode,
  setScheduledDate,
  setScheduledTime,
}: SchedulingOptionsProps) {
  const formatScheduledDateTime = () => {
    if (!scheduledDate || !scheduledTime) return '';
    const dateStr = scheduledDate + 'T' + scheduledTime;
    return new Date(dateStr).toLocaleString('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
  };

  return (
    <div className="border-t border-[var(--ds-border-subtle)] pt-6 space-y-4">
      <h3 className="text-sm font-bold text-[var(--ds-text-primary)] mb-4 flex items-center gap-2">
        <Clock size={16} className="text-primary-400" />
        Quando enviar?
      </h3>

      <div className="grid grid-cols-2 gap-4">
        {/* Send Now Option */}
        <button
          type="button"
          onClick={() => setScheduleMode('now')}
          className={
            'relative p-4 rounded-xl border transition-all duration-200 flex flex-col items-center justify-center gap-3 ' +
            (scheduleMode === 'now'
              ? 'bg-primary-600 text-white dark:bg-white dark:text-black border-primary-500 dark:border-white shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)] dark:shadow-[0_0_20px_rgba(255,255,255,0.1)]'
              : 'bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] hover:bg-[var(--ds-bg-surface)] hover:border-[var(--ds-border-strong)] text-[var(--ds-text-secondary)]')
          }
        >
          {scheduleMode === 'now' && (
            <div className="absolute top-2 right-2 text-white dark:text-black">
              <CheckCircle size={16} />
            </div>
          )}
          <div
            className={
              'p-2 rounded-lg ' +
              (scheduleMode === 'now'
                ? 'bg-white/20 text-white dark:bg-slate-200 dark:text-black'
                : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]')
            }
          >
            <Zap size={18} />
          </div>
          <div className="text-center">
            <h4 className="font-bold text-sm">Enviar Agora</h4>
            <p
              className={
                'text-xs mt-1 ' +
                (scheduleMode === 'now' ? 'text-white/70 dark:text-slate-600' : 'text-[var(--ds-text-muted)]')
              }
            >
              Disparo imediato
            </p>
          </div>
        </button>

        {/* Schedule Option */}
        <button
          type="button"
          onClick={() => setScheduleMode('scheduled')}
          className={
            'relative p-4 rounded-xl border transition-all duration-200 flex flex-col items-center justify-center gap-3 ' +
            (scheduleMode === 'scheduled'
              ? 'bg-primary-600 text-white dark:bg-white dark:text-black border-primary-500 dark:border-white shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)] dark:shadow-[0_0_20px_rgba(255,255,255,0.1)]'
              : 'bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] hover:bg-[var(--ds-bg-surface)] hover:border-[var(--ds-border-strong)] text-[var(--ds-text-secondary)]')
          }
        >
          {scheduleMode === 'scheduled' && (
            <div className="absolute top-2 right-2 text-white dark:text-black">
              <CheckCircle size={16} />
            </div>
          )}
          <div
            className={
              'p-2 rounded-lg ' +
              (scheduleMode === 'scheduled'
                ? 'bg-white/20 text-white dark:bg-slate-200 dark:text-black'
                : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]')
            }
          >
            <Calendar size={18} />
          </div>
          <div className="text-center">
            <h4 className="font-bold text-sm">Agendar</h4>
            <p
              className={
                'text-xs mt-1 ' +
                (scheduleMode === 'scheduled' ? 'text-white/70 dark:text-slate-600' : 'text-[var(--ds-text-muted)]')
              }
            >
              Escolher data e hora
            </p>
          </div>
        </button>
      </div>

      {/* Date/Time Picker (shown when scheduled) */}
      {scheduleMode === 'scheduled' && (
        <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl p-4 mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--ds-text-muted)] mb-2">Data</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={new Date().toLocaleDateString('en-CA')}
                className="w-full px-4 py-3 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] rounded-lg text-[var(--ds-text-primary)] text-sm focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ds-text-muted)] mb-2">Horário</label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] rounded-lg text-[var(--ds-text-primary)] text-sm focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none"
              />
            </div>
          </div>
          {scheduledDate && scheduledTime && (
            <div className="mt-3 p-3 bg-primary-500/10 border border-primary-500/20 rounded-lg">
              <p className="text-xs text-primary-400 flex items-center gap-2">
                <Calendar size={14} />
                Campanha será enviada em{' '}
                <span className="font-bold text-[var(--ds-text-primary)]">
                  {formatScheduledDateTime()}
                </span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
