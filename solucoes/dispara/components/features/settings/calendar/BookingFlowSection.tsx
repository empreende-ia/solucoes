'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Workflow, Check, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/ui/status-badge';

interface FlowOption {
  id: string;
  name: string;
  meta_flow_id: string | null;
  meta_status: string | null;
  template_key: string | null;
}

interface BookingFlowConfig {
  bookingFlowId: string | null;
  flowDetails: FlowOption | null;
}

export function BookingFlowSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<BookingFlowConfig>({ bookingFlowId: null, flowDetails: null });
  const [availableFlows, setAvailableFlows] = useState<FlowOption[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string>('');

  const fetchBookingConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/booking');
      const data = await res.json();

      if (data.ok) {
        setConfig(data.config);
        setAvailableFlows(data.availableFlows || []);
        setSelectedFlowId(data.config.bookingFlowId || '');
      }
    } catch (error) {
      console.error('Error fetching booking config:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookingConfig();
  }, [fetchBookingConfig]);

  const handleSave = async () => {
    if (!selectedFlowId && !config.bookingFlowId) return;

    try {
      setSaving(true);
      const res = await fetch('/api/settings/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowId: selectedFlowId || null }),
      });

      const data = await res.json();

      if (data.ok) {
        setConfig(data.config);
        toast.success(selectedFlowId ? 'Flow de agendamento configurado!' : 'Configuração removida');
      } else {
        toast.error(data.error || 'Erro ao salvar');
      }
    } catch (error) {
      console.error('Error saving booking flow:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const hasChanged = selectedFlowId !== (config.bookingFlowId || '');
  const isConfigured = Boolean(config.bookingFlowId && config.flowDetails?.meta_flow_id);

  // Filter to only show flows with meta_flow_id (published)
  const publishedFlows = availableFlows.filter(f => f.meta_flow_id);

  if (loading) {
    return (
      <div className="mt-6 p-4 rounded-xl bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)]">
        <div className="flex items-center gap-2 text-[var(--ds-text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Carregando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 p-4 rounded-xl bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)]">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center">
            <Workflow size={16} className="text-primary-400" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-[var(--ds-text-primary)]">Flow de Agendamento</h4>
            <p className="text-xs text-[var(--ds-text-muted)]">
              Selecione qual MiniApp usar para agendamentos
            </p>
          </div>
        </div>
        {isConfigured && (
          <StatusBadge status="success" showDot>Configurado</StatusBadge>
        )}
      </div>

      {publishedFlows.length === 0 ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertCircle size={16} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200">
            Nenhum Flow publicado disponível. Crie e publique um Flow de agendamento primeiro.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <select
            value={selectedFlowId}
            onChange={(e) => setSelectedFlowId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] text-sm text-[var(--ds-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          >
            <option value="">Selecione um Flow...</option>
            {publishedFlows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.name} {flow.template_key === 'booking-calendar' ? '(Agendamento)' : ''}
              </option>
            ))}
          </select>

          {hasChanged && (
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="h-9 px-4 rounded-lg bg-primary-500 hover:bg-primary-400 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                Salvar
              </button>
            </div>
          )}

          {config.flowDetails && (
            <p className="text-xs text-[var(--ds-text-muted)]">
              Flow atual: <span className="text-[var(--ds-text-primary)]">{config.flowDetails.name}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
