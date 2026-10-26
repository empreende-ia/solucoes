'use client';

import React from 'react';
import { ArrowDown, CheckCircle2, Circle, Lock, Zap, Trash2, Loader2 } from 'lucide-react';
import { WebhookFunnelLevel } from './types';
import { getFunnelLevelColorClasses } from './utils';

interface WebhookFunnelVisualizationProps {
  funnelLevels: WebhookFunnelLevel[];
  // Ações para o nível #1 (Número)
  onActivateNumber?: () => void;
  onDeactivateNumber?: () => void;
  isNumberBusy?: boolean;
  // Ações para o nível #2 (WABA)
  onActivateWaba?: () => void;
  onDeactivateWaba?: () => void;
  isWabaBusy?: boolean;
}

export function WebhookFunnelVisualization({
  funnelLevels,
  onActivateNumber,
  onDeactivateNumber,
  isNumberBusy,
  onActivateWaba,
  onDeactivateWaba,
  isWabaBusy,
}: WebhookFunnelVisualizationProps) {
  return (
    <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
      <div className="bg-[var(--ds-bg-elevated)] rounded-xl p-4 border border-[var(--ds-border-subtle)]">
        <div className="text-xs text-[var(--ds-text-muted)] mb-3 flex items-center gap-2">
          <ArrowDown size={12} />
          Fluxo de eventos (primeiro que existir, captura)
        </div>

        <div className="space-y-0">
          {funnelLevels.map((level, index) => {
            const isLast = index === funnelLevels.length - 1;
            const colors = getFunnelLevelColorClasses(level.color);
            const activeClasses = level.isActive ? colors.active : colors.inactive;
            const ringClasses = level.isActive
              ? 'ring-2 ring-offset-2 ring-offset-slate-900 ' + colors.ring
              : '';

            // Determinar ações e estado para este nível
            const isLevel1 = level.level === 1;
            const isLevel2 = level.level === 2;
            const isLevel3 = level.level === 3;

            const isBusy = isLevel1 ? isNumberBusy : isLevel2 ? isWabaBusy : false;
            const hasOverride = !!level.url;
            const canActivate = isLevel1
              ? (onActivateNumber && !level.isDispara)
              : isLevel2
                ? (onActivateWaba && !level.isDispara)
                : false;
            const canDeactivate = isLevel1
              ? (onDeactivateNumber && hasOverride)
              : isLevel2
                ? (onDeactivateWaba && hasOverride)
                : false;

            const handleActivate = () => {
              if (isLevel1 && onActivateNumber) onActivateNumber();
              if (isLevel2 && onActivateWaba) onActivateWaba();
            };

            const handleDeactivate = () => {
              if (isLevel1 && onDeactivateNumber) onDeactivateNumber();
              if (isLevel2 && onDeactivateWaba) onDeactivateWaba();
            };

            return (
              <div key={level.level}>
                <div
                  className={
                    'relative rounded-lg border p-3 transition-all ' +
                    activeClasses +
                    ' ' +
                    ringClasses
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {level.isActive ? (
                        <CheckCircle2
                          size={16}
                          className={level.isDispara ? 'text-primary-400' : ''}
                        />
                      ) : level.url ? (
                        <Circle size={16} className="opacity-40" />
                      ) : (
                        <Circle size={16} className="opacity-20" />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm">#{level.level}</span>
                          <span className="font-medium text-sm">{level.name}</span>
                          {level.isActive && level.isDispara && (
                            <span className="px-1.5 py-0.5 bg-primary-500/30 text-primary-300 text-[10px] font-bold rounded">
                              DISPARA
                            </span>
                          )}
                          {level.isActive && !level.isDispara && level.url && (
                            <span className="px-1.5 py-0.5 bg-amber-500/30 text-amber-300 text-[10px] font-bold rounded">
                              OUTRO
                            </span>
                          )}
                          {level.isLocked && (
                            <span
                              className="flex items-center gap-1 px-1.5 py-0.5 bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] text-[10px] font-medium rounded"
                              title="Configurado no Meta Dashboard"
                            >
                              <Lock size={10} />
                              FIXO
                            </span>
                          )}
                        </div>
                        {level.url ? (
                          <code className="text-[10px] opacity-60 block mt-0.5 break-all">
                            {level.url}
                          </code>
                        ) : (
                          <span className="text-[10px] opacity-40 block mt-0.5">
                            Não configurado
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ações inline */}
                    <div className="flex items-center gap-2 shrink-0">
                      {level.isActive && (
                        <div className="flex items-center gap-1 text-[10px] font-medium bg-[var(--ds-bg-hover)] px-2 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                          ATIVO
                        </div>
                      )}

                      {/* Botões de ação para níveis 1 e 2 (não para o 3 que é fixo) */}
                      {!isLevel3 && (
                        <>
                          {/* Botão Ativar Dispara */}
                          {canActivate && !hasOverride && (
                            <button
                              onClick={handleActivate}
                              disabled={isBusy}
                              className="h-8 px-2.5 text-[10px] font-medium bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-1"
                              title={`Ativar Dispara no nível #${level.level}`}
                            >
                              {isBusy ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Zap size={12} />
                              )}
                              Ativar
                            </button>
                          )}

                          {/* Botão Substituir quando há outro sistema */}
                          {canActivate && hasOverride && !level.isDispara && (
                            <button
                              onClick={handleActivate}
                              disabled={isBusy}
                              className="h-8 px-2.5 text-[10px] font-medium bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-1"
                              title={`Substituir por Dispara`}
                            >
                              {isBusy ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Zap size={12} />
                              )}
                              Dispara
                            </button>
                          )}

                          {/* Botão Remover quando configurado */}
                          {canDeactivate && (
                            <button
                              onClick={handleDeactivate}
                              disabled={isBusy}
                              className="h-8 w-8 flex items-center justify-center text-[var(--ds-text-secondary)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                              title={`Remover override #${level.level}`}
                            >
                              {isBusy ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Trash2 size={12} />
                              )}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {!isLast && (
                  <div className={'flex justify-center py-1 ' + colors.arrow}>
                    <ArrowDown size={16} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-[var(--ds-border-subtle)] flex items-center justify-between text-[10px] text-[var(--ds-text-muted)]">
          <span>A Meta verifica de cima para baixo</span>
          <span className="flex items-center gap-1">
            <CheckCircle2 size={10} />
            = Capturando eventos
          </span>
        </div>
      </div>
    </div>
  );
}
