'use client';

import React from 'react';
import { Container } from '@/components/ui/container';
import { StatusBadge } from '@/components/ui/status-badge';
import { CampaignTelemetryPanelProps } from './types';

export const CampaignTelemetryPanel: React.FC<CampaignTelemetryPanelProps> = ({
  telemetry,
}) => {
  return (
    <Container variant="glass" padding="lg" className="mt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[var(--ds-text-primary)] font-bold">Debug - Telemetria de latencia</h3>
          <p className="text-xs text-[var(--ds-text-muted)]">
            Best-effort. Util para entender se o atraso esta no broadcast, no realtime do DB ou no refetch.
          </p>
        </div>
        <StatusBadge status="warning" size="sm">experimental</StatusBadge>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Container variant="subtle" padding="sm">
          <div className="text-[var(--ds-text-muted)] text-xs">Broadcast - UI</div>
          {telemetry.broadcast ? (
            <div className="mt-2 text-xs text-[var(--ds-text-secondary)] space-y-1">
              <div>
                server-client: <span className="font-mono text-[var(--ds-text-primary)]">{Math.round(telemetry.broadcast.serverToClientMs)}ms</span>
              </div>
              <div>
                client-paint: <span className="font-mono text-[var(--ds-text-primary)]">{Math.round(telemetry.broadcast.handlerToPaintMs)}ms</span>
              </div>
              <div>
                total: <span className="font-mono text-[var(--ds-text-primary)]">{Math.round(telemetry.broadcast.serverToPaintMs)}ms</span>
              </div>
              <div className="pt-1 text-[11px] text-[var(--ds-text-muted)]">
                trace: <span className="font-mono">{telemetry.broadcast.traceId || '—'}</span> - seq:{' '}
                <span className="font-mono">{telemetry.broadcast.seq}</span>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-[var(--ds-text-muted)]">Aguardando evento...</div>
          )}
        </Container>

        <Container variant="subtle" padding="sm">
          <div className="text-[var(--ds-text-muted)] text-xs">DB realtime - UI</div>
          {telemetry.dbChange ? (
            <div className="mt-2 text-xs text-[var(--ds-text-secondary)] space-y-1">
              <div>
                commit-client: <span className="font-mono text-[var(--ds-text-primary)]">{Math.round(telemetry.dbChange.commitToClientMs)}ms</span>
              </div>
              <div>
                client-paint: <span className="font-mono text-[var(--ds-text-primary)]">{Math.round(telemetry.dbChange.handlerToPaintMs)}ms</span>
              </div>
              <div>
                total: <span className="font-mono text-[var(--ds-text-primary)]">{Math.round(telemetry.dbChange.commitToPaintMs)}ms</span>
              </div>
              <div className="pt-1 text-[11px] text-[var(--ds-text-muted)]">
                {telemetry.dbChange.table} - {telemetry.dbChange.eventType}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-[var(--ds-text-muted)]">Aguardando mudanca...</div>
          )}
        </Container>

        <Container variant="subtle" padding="sm">
          <div className="text-[var(--ds-text-muted)] text-xs">Refetch (React Query)</div>
          {telemetry.refetch ? (
            <div className="mt-2 text-xs text-[var(--ds-text-secondary)] space-y-1">
              <div>
                duracao: <span className="font-mono text-[var(--ds-text-primary)]">{Math.round(telemetry.refetch.durationMs ?? 0)}ms</span>
              </div>
              <div className="pt-1 text-[11px] text-[var(--ds-text-muted)]">
                motivo: <span className="font-mono">{telemetry.refetch.reason || '—'}</span>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-[var(--ds-text-muted)]">Sem refetch recente</div>
          )}
        </Container>
      </div>
    </Container>
  );
};
