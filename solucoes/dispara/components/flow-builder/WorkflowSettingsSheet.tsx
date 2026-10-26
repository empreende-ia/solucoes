"use client";

// Configurações do workflow (aba Settings do GHL, adaptada ao WhatsApp):
//   - Permitir reentrada (allow re-entry) — governa /enroll e o gatilho
//     "Respondeu ao disparo".
//   - Parar ao responder (stop on response) — resposta do contato cancela os
//     waits de "Aguardar" deste fluxo.
//   - Janela de horário (time window) — passos de comunicação só enviam dentro
//     da janela; fora dela o fluxo pausa e retoma no próximo slot.
// Persistidas em workflows.settings via PATCH — separadas da árvore (não
// passam pelo autosave do canvas).

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type SavedWorkflow } from "@/lib/builder/api-client";
import type { WorkflowSettings } from "@/lib/builder/workflow-settings";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const inputCls =
  "rounded-lg border border-border bg-[var(--ds-bg-surface)]/60 px-2.5 py-1.5 text-[13px] text-[var(--ds-text-primary)] outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20";

function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:bg-[var(--ds-bg-hover)]"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? "bg-primary-500" : "bg-[var(--ds-border-strong)]"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-[var(--ds-text-primary)]">
          {label}
        </span>
        <span className="block text-[11px] leading-snug text-[var(--ds-text-muted)]">
          {desc}
        </span>
      </span>
    </button>
  );
}

export default function WorkflowSettingsSheet({
  workflowId,
  initialSettings,
  onClose,
}: {
  workflowId: string;
  initialSettings: WorkflowSettings;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [allowReentry, setAllowReentry] = useState(
    initialSettings.allowReentry !== false
  );
  const [stopOnResponse, setStopOnResponse] = useState(
    initialSettings.stopOnResponse === true
  );
  const tw = initialSettings.timeWindow;
  const [windowEnabled, setWindowEnabled] = useState(tw?.enabled === true);
  const [windowStart, setWindowStart] = useState(tw?.start ?? "09:00");
  const [windowEnd, setWindowEnd] = useState(tw?.end ?? "18:00");
  const [windowDays, setWindowDays] = useState<number[]>(
    tw?.days && tw.days.length > 0 ? tw.days : [1, 2, 3, 4, 5]
  );

  const toggleDay = (day: number) =>
    setWindowDays((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()
    );

  const save = async () => {
    if (windowEnabled && windowDays.length === 0) {
      toast.error("Selecione pelo menos um dia da semana para a janela");
      return;
    }
    setSaving(true);
    const settings: WorkflowSettings = {
      allowReentry,
      stopOnResponse,
      timeWindow: {
        enabled: windowEnabled,
        start: windowStart,
        end: windowEnd,
        days: windowDays,
      },
    };
    try {
      const updated = await api.workflow.update(workflowId, { settings });
      queryClient.setQueryData<SavedWorkflow>(
        ["builder-workflow", workflowId],
        (prev) => (prev ? { ...prev, settings: updated.settings } : prev)
      );
      toast.success("Configurações salvas");
      onClose();
    } catch (error) {
      console.error("Falha ao salvar configurações:", error);
      toast.error("Falha ao salvar as configurações");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex justify-end">
      {/* backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-label="Fechar configurações"
      />
      <div className="relative flex h-full w-[400px] flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div>
            <p className="text-[14px] font-semibold text-[var(--ds-text-primary)]">
              Configurações do workflow
            </p>
            <p className="text-[11px] text-[var(--ds-text-muted)]">
              Valem para todas as execuções deste fluxo
            </p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-secondary)]"
            onClick={onClose}
            aria-label="Fechar painel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <p className="text-[11px] font-semibold tracking-wide text-[var(--ds-text-secondary)] uppercase">
            Contato
          </p>
          <Toggle
            checked={allowReentry}
            onChange={setAllowReentry}
            label="Permitir reentrada"
            desc="Desligado: um contato que já passou por este fluxo não entra de novo (inscrição manual e gatilho de resposta a disparo)."
          />
          <Toggle
            checked={stopOnResponse}
            onChange={setStopOnResponse}
            label="Parar ao responder"
            desc="Quando o contato responde, os passos de espera (Aguardar) pendentes deste fluxo são cancelados. Perguntas continuam funcionando."
          />

          <p className="pt-2 text-[11px] font-semibold tracking-wide text-[var(--ds-text-secondary)] uppercase">
            Comunicação
          </p>
          <Toggle
            checked={windowEnabled}
            onChange={setWindowEnabled}
            label="Janela de horário"
            desc="Mensagens só saem dentro da janela; fora dela o fluxo pausa e retoma no próximo horário disponível. Tags e CRM não são afetados."
          />
          {windowEnabled && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] text-[var(--ds-text-muted)]">
                    Início
                  </label>
                  <input
                    type="time"
                    className={`${inputCls} w-full`}
                    value={windowStart}
                    onChange={(e) => setWindowStart(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] text-[var(--ds-text-muted)]">
                    Fim
                  </label>
                  <input
                    type="time"
                    className={`${inputCls} w-full`}
                    value={windowEnd}
                    onChange={(e) => setWindowEnd(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[var(--ds-text-muted)]">
                  Dias ativos
                </label>
                <div className="flex flex-wrap gap-1">
                  {DAY_LABELS.map((dayLabel, day) => {
                    const active = windowDays.includes(day);
                    return (
                      <button
                        key={dayLabel}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                          active
                            ? "bg-primary-500 text-white"
                            : "border border-border text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]"
                        }`}
                      >
                        {dayLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-[11px] leading-snug text-[var(--ds-text-muted)]">
                Fuso: America/Sao_Paulo. A janela vale para os passos WhatsApp
                deste fluxo.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <div className="flex-1" />
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-4 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50"
            onClick={save}
            disabled={saving}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Salvar configurações
          </button>
        </div>
      </div>
    </div>
  );
}
