"use client";

// Painel de configuração do passo selecionado (porte do protótipo zapflow,
// re-skin dark + forms reais do v1):
//   - whatsapp: template REAL (React Query ['templates'], aprovados), media URL,
//     mensagem com hint {{var.nome}} — sem select de telefone (single-tenant).
//   - interactive: "Perguntar (aguardar resposta)" — pergunta + botões (1..3,
//     ≤20 chars); branches locked (Not Delivered/Timeout) não aparecem no v1.
//   - condition: campo fixo "Mensagem recebida" + operador + valor.
//   - wait: minutos com CAP de 5 (esperas longas = fase 2); modo "até resposta" oculto.
//   - trigger: keywords (uma por linha).
//   - split/tag/goto: estado "Em breve".
// Estado local + commit no "Salvar" (autosave dispara via store.patchStep).

import { useQuery } from "@tanstack/react-query";
import { Hand, MessageCircleReply, Plus, Trash2, X, Zap } from "lucide-react";
import { useState } from "react";
import {
  CONDITION_OPERATORS,
  STEP_META,
  WAIT_UNITS,
} from "@/lib/builder/flow/meta";
import { findStep } from "@/lib/builder/flow/operations";
import {
  triggerTypeOf,
  type Branch,
  type Flow,
  type FlowTriggerType,
  type Step,
} from "@/lib/builder/flow/types";
import { campaignService } from "@/services/campaignService";
import { contactService } from "@/services/contactService";
import { templateService } from "@/services/templateService";
import type { Template } from "@/types";
import { stepChipStyle, stepIcon } from "./icons";
import { TRIGGER_SELECTION_ID, useFlowBuilderStore } from "./store";

// ─── Primitivos de form ────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-semibold tracking-wide text-[var(--ds-text-secondary)] uppercase">
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] leading-snug text-[var(--ds-text-muted)]">{children}</p>;
}

const inputCls =
  "w-full rounded-lg border border-border bg-[var(--ds-bg-surface)]/60 px-2.5 py-1.5 text-[13px] text-[var(--ds-text-primary)] outline-none placeholder:text-[var(--ds-text-muted)] focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50";

const MAX_BUTTONS = 3;
const MAX_BUTTON_CHARS = 20;
const MAX_WAIT_MINUTES = 5;

// ─── Painel ────────────────────────────────────────────────────────────────────

export default function ConfigPanel() {
  const selectedId = useFlowBuilderStore((s) => s.selectedStepId);
  const flow = useFlowBuilderStore((s) => s.flow);
  const isTrigger = selectedId === TRIGGER_SELECTION_ID;
  const step = flow && selectedId && !isTrigger ? findStep(flow, selectedId) : null;
  const open = Boolean(flow && (step || isTrigger));

  return (
    <div
      className={`absolute top-0 right-0 z-30 flex h-full w-[400px] transform flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {flow && isTrigger && <TriggerPanelBody key="__trigger" flow={flow} />}
      {step && <PanelBody key={step.id} step={step} />}
    </div>
  );
}

// ─── Painel do trigger ─────────────────────────────────────────────────────────

const TRIGGER_OPTIONS: Array<{
  type: FlowTriggerType;
  label: string;
  desc: string;
  icon: typeof Zap;
}> = [
  {
    type: "none",
    label: "Sem gatilho",
    desc: "Contatos entram manualmente — “Adicionar ao workflow” na lista de contatos",
    icon: Hand,
  },
  {
    type: "keywords",
    label: "Palavra-chave",
    desc: "Mensagem recebida é exatamente uma das palavras-chave",
    icon: Zap,
  },
  {
    type: "campaign_reply",
    label: "Respondeu ao disparo",
    desc: "Contato respondeu a uma campanha (qualquer uma ou uma específica)",
    icon: MessageCircleReply,
  },
];

const TRIGGER_LABELS: Record<FlowTriggerType, string> = {
  none: "",
  keywords: "Palavras-chave",
  campaign_reply: "Respondeu ao disparo",
};

function TriggerPanelBody({ flow }: { flow: Flow }) {
  const [type, setType] = useState<FlowTriggerType>(triggerTypeOf(flow.trigger));
  const [keywordsText, setKeywordsText] = useState(flow.trigger.keywords.join("\n"));
  const [campaignId, setCampaignId] = useState(flow.trigger.campaignId ?? "");
  const [replyFilter, setReplyFilter] = useState(flow.trigger.replyFilter ?? "");

  // O Flow inteiro é clonado a cada mutação — re-sincroniza quando o trigger
  // muda por fora do form (undo etc.).
  const [syncedTrigger, setSyncedTrigger] = useState(flow.trigger);
  if (flow.trigger !== syncedTrigger) {
    setSyncedTrigger(flow.trigger);
    setType(triggerTypeOf(flow.trigger));
    setKeywordsText(flow.trigger.keywords.join("\n"));
    setCampaignId(flow.trigger.campaignId ?? "");
    setReplyFilter(flow.trigger.replyFilter ?? "");
  }

  const campaignsQuery = useQuery({
    queryKey: ["campaigns"],
    queryFn: campaignService.getAll,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: type === "campaign_reply",
  });
  const campaigns = campaignsQuery.data ?? [];
  const selectedCampaign = campaigns.find((c) => c.id === campaignId);

  const save = () => {
    useFlowBuilderStore.getState().patchTrigger({
      type,
      label: TRIGGER_LABELS[type],
      keywords: keywordsText.split("\n"),
      campaignId: type === "campaign_reply" ? campaignId || null : null,
      campaignName:
        type === "campaign_reply" ? (selectedCampaign?.name ?? "") : "",
      replyFilter: type === "campaign_reply" ? replyFilter : "",
    });
  };

  const cancel = () => {
    setType(triggerTypeOf(flow.trigger));
    setKeywordsText(flow.trigger.keywords.join("\n"));
    setCampaignId(flow.trigger.campaignId ?? "");
    setReplyFilter(flow.trigger.replyFilter ?? "");
  };

  return (
    <>
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Zap size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="px-1 text-[14px] font-semibold text-[var(--ds-text-primary)]">
              Gatilho do fluxo
            </p>
            <p className="px-1 text-[11px] text-[var(--ds-text-muted)]">
              Define como os contatos entram neste workflow
            </p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-secondary)]"
            onClick={() => useFlowBuilderStore.getState().select(null)}
            aria-label="Fechar painel"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <Label>Tipo de gatilho</Label>
          <div className="space-y-2">
            {TRIGGER_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = type === opt.type;
              return (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setType(opt.type)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    active
                      ? "border-primary-500 bg-primary-500/5 ring-2 ring-primary-500/20"
                      : "border-border hover:border-[var(--ds-border-strong)] hover:bg-[var(--ds-bg-hover)]"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                      active
                        ? "bg-primary-500/15 text-primary-600 dark:text-primary-400"
                        : "bg-[var(--ds-bg-surface)] text-[var(--ds-text-muted)]"
                    }`}
                  >
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[var(--ds-text-primary)]">
                      {opt.label}
                    </p>
                    <p className="text-[11px] leading-snug text-[var(--ds-text-muted)]">
                      {opt.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {type === "keywords" && (
          <div>
            <Label>Palavras-chave (uma por linha)</Label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={6}
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder={"quero\ninscrever\noi"}
            />
            <Hint>
              O fluxo dispara quando a mensagem recebida for exatamente uma das
              palavras-chave (match exato, normalizado — ignora
              maiúsculas/acentos/espaços nas bordas).
            </Hint>
          </div>
        )}

        {type === "campaign_reply" && (
          <>
            <div>
              <Label>Campanha</Label>
              <select
                className={inputCls}
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                disabled={campaignsQuery.isLoading}
              >
                <option value="">Qualquer disparo</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Hint>
                {campaignsQuery.isLoading
                  ? "Carregando campanhas..."
                  : "Dispara quando o contato responde ao disparo desta campanha (ou de qualquer uma)."}
              </Hint>
            </div>
            <div>
              <Label>A resposta contém (opcional)</Label>
              <input
                className={inputCls}
                value={replyFilter}
                onChange={(e) => setReplyFilter(e.target.value)}
                placeholder="ex.: quero"
              />
              <Hint>
                Se preenchido, o fluxo só dispara quando a resposta contiver esta
                frase (ignora maiúsculas/acentos).
              </Hint>
            </div>
          </>
        )}

        {type === "none" && (
          <div className="rounded-lg border border-dashed border-border bg-[var(--ds-bg-surface)]/40 p-3 text-[12px] leading-relaxed text-[var(--ds-text-muted)]">
            O fluxo não dispara sozinho. Depois de{" "}
            <span className="font-medium text-[var(--ds-text-secondary)]">publicar</span>,
            selecione contatos na página{" "}
            <span className="font-medium text-[var(--ds-text-secondary)]">Contatos</span> e
            use <span className="font-medium text-[var(--ds-text-secondary)]">Adicionar ao workflow</span>.
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <div className="flex-1" />
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]"
          onClick={cancel}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="rounded-lg bg-primary-500 px-4 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-primary-600"
          onClick={save}
        >
          Salvar gatilho
        </button>
      </div>
    </>
  );
}

// ─── Painel de step ────────────────────────────────────────────────────────────

function PanelBody({ step }: { step: Step }) {
  const meta = STEP_META[step.type];
  const Icon = stepIcon(meta.icon);
  const comingSoon = !meta.enabledV1;
  const [name, setName] = useState(step.name);
  const [config, setConfig] = useState<Record<string, unknown>>({ ...step.config });
  const [branches, setBranches] = useState<Branch[]>(() =>
    (step.branches ?? []).map((b) => ({ ...b }))
  );

  // Toda mutação da árvore clona o Flow inteiro (structuredClone), então o objeto
  // do step muda de identidade sempre que o store muda por fora do form (undo,
  // deleção/branch pelo canvas). Re-sincroniza pra não "Salvar" estado obsoleto.
  const [syncedStep, setSyncedStep] = useState(step);
  if (step !== syncedStep) {
    setSyncedStep(step);
    setName(step.name);
    setConfig({ ...step.config });
    setBranches((step.branches ?? []).map((b) => ({ ...b })));
  }

  const set = (key: string, value: unknown) =>
    setConfig((c) => ({ ...c, [key]: value }));

  const save = () => {
    if (comingSoon) return;
    const patch: { name: string; config: Record<string, unknown>; branches?: Branch[] } = {
      name,
      config: normalizeConfigForSave(step, config),
    };
    if (step.branches) {
      // Reanexa as sub-árvores (child) pelo id; branches locked sem child são
      // descartadas no v1 (interactive) — compat com dados antigos do createStep.
      const edited = branches.map((d) => ({
        ...d,
        child: step.branches!.find((b) => b.id === d.id)?.child ?? null,
      }));
      const keptLocked =
        step.type === "interactive"
          ? step.branches.filter((b) => b.locked && b.child)
          : [];
      patch.branches = [...edited, ...keptLocked];
    }
    useFlowBuilderStore.getState().patchStep(step.id, patch);
  };

  const cancel = () => {
    setName(step.name);
    setConfig({ ...step.config });
    setBranches((step.branches ?? []).map((b) => ({ ...b })));
  };

  const remove = () => {
    const hasSubtrees = !!step.branches?.some((b) => b.child);
    if (
      hasSubtrees &&
      !window.confirm("Este passo contém branches com sub-árvores. Excluir tudo?")
    ) {
      return;
    }
    useFlowBuilderStore.getState().removeStep(step.id);
  };

  return (
    <>
      {/* Header */}
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-start gap-3">
          <div
            className="step-chip mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={stepChipStyle(meta)}
          >
            <Icon size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[14px] font-semibold text-[var(--ds-text-primary)] outline-none hover:border-border focus:border-primary-500"
              aria-label="Nome da ação"
              disabled={comingSoon}
            />
            <p className="px-1 text-[11px] text-[var(--ds-text-muted)]">
              {step.type === "interactive" ? "Perguntar (aguardar resposta)" : meta.desc}
            </p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-secondary)]"
            onClick={() => useFlowBuilderStore.getState().select(null)}
            aria-label="Fechar painel"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Corpo */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {comingSoon ? (
            <ComingSoonForm label={meta.label} />
          ) : (
            <>
              {step.type === "whatsapp" && <WhatsappForm config={config} set={set} />}
              {step.type === "wait" && <WaitForm config={config} set={set} />}
              {step.type === "condition" && (
                <ConditionForm branches={branches} setBranches={setBranches} />
              )}
              {step.type === "interactive" && (
                <InteractiveForm
                  config={config}
                  set={set}
                  branches={branches}
                  setBranches={setBranches}
                />
              )}
              {(step.type === "tag" || step.type === "tag_remove") && (
                <TagForm config={config} set={set} remove={step.type === "tag_remove"} />
              )}
              {step.type === "pipeline" && <PipelineForm config={config} set={set} />}
              {step.type === "end" && (
                <p className="text-[13px] text-[var(--ds-text-secondary)]">
                  Este passo encerra o fluxo para o contato. Sem configurações.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
          onClick={remove}
        >
          <Trash2 size={13} /> Excluir
        </button>
        <div className="flex-1" />
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] disabled:opacity-50"
          onClick={cancel}
          disabled={comingSoon}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="rounded-lg bg-primary-500 px-4 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={comingSoon}
          onClick={save}
        >
          Salvar ação
        </button>
      </div>
    </>
  );
}

/** Normalizações de config no commit (ex.: cap de espera do v1). */
function normalizeConfigForSave(
  step: Step,
  config: Record<string, unknown>
): Record<string, unknown> {
  if (step.type === "wait") {
    const raw = Number(config.value ?? 1);
    const clamped = Math.min(
      MAX_WAIT_MINUTES,
      Math.max(1, Number.isFinite(raw) ? Math.round(raw) : 1)
    );
    return { ...config, mode: "duration", unit: "minutes", value: clamped };
  }
  return config;
}

// ─── Forms por tipo ────────────────────────────────────────────────────────────

interface FormProps {
  config: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
}

function ComingSoonForm({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-[var(--ds-bg-surface)]/40 p-4 text-center">
      <span className="inline-block rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--ds-text-secondary)] uppercase">
        Em breve
      </span>
      <p className="mt-2 text-[13px] text-[var(--ds-text-secondary)]">
        O passo <span className="font-medium text-[var(--ds-text-primary)]">{label}</span> ainda
        não está disponível nesta versão do builder.
      </p>
    </div>
  );
}

function highlightVars(text: string): React.ReactNode {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((p, i) =>
    p.startsWith("{{") ? (
      <span
        key={i}
        className="rounded bg-primary-500/15 px-0.5 font-medium text-primary-600 dark:text-primary-400"
      >
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

function WhatsappForm({ config, set }: FormProps) {
  const message = String(config.message ?? "");
  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: templateService.getAll,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const approved = (templatesQuery.data ?? []).filter(
    (t: Template) => t.status === "APPROVED"
  );
  const selected = String(config.template ?? "");
  const selectedMissing =
    Boolean(selected) && !approved.some((t) => t.name === selected);

  return (
    <>
      <div>
        <Label>Selecionar template do WhatsApp</Label>
        <select
          className={inputCls}
          value={selected}
          onChange={(e) => set("template", e.target.value)}
          disabled={templatesQuery.isLoading}
        >
          <option value="">Nenhum — mensagem livre</option>
          {selectedMissing && <option value={selected}>{selected} (não aprovado?)</option>}
          {approved.map((t) => (
            <option key={`${t.name}-${t.language}`} value={t.name}>
              {t.name} ({t.language}) - {t.category}
            </option>
          ))}
        </select>
        <Hint>
          {templatesQuery.isLoading
            ? "Carregando templates aprovados..."
            : templatesQuery.isError
              ? "Falha ao carregar templates — verifique as credenciais da Meta."
              : "Somente templates aprovados na Meta aparecem aqui."}
        </Hint>
      </div>

      <div>
        <Label>Media URL</Label>
        <input
          className={inputCls}
          value={String(config.mediaUrl ?? "")}
          onChange={(e) => set("mediaUrl", e.target.value)}
          placeholder="https://..."
        />
        <Hint>Substitui a mídia aprovada na Meta no momento do disparo.</Hint>
      </div>

      <div>
        <Label>Mensagem</Label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={5}
          value={message}
          onChange={(e) => set("message", e.target.value)}
          placeholder="Digite a mensagem a ser enviada..."
        />
        {message && (
          <div className="mt-2 rounded-lg border border-border bg-[var(--ds-bg-surface)]/50 p-2.5 text-[12px] leading-relaxed whitespace-pre-wrap text-[var(--ds-text-secondary)]">
            {highlightVars(message)}
          </div>
        )}
        <Hint>
          Use variáveis do fluxo no formato {"{{var.nome}}"}. Com template
          selecionado, o template tem prioridade sobre a mensagem livre.
        </Hint>
      </div>
    </>
  );
}

function WaitForm({ config, set }: FormProps) {
  const raw = Number(config.value ?? 1);
  const value = Number.isFinite(raw) ? raw : 1;
  const overCap = value > MAX_WAIT_MINUTES || value < 1;
  return (
    <div>
      <Label>Duração</Label>
      <div className="flex gap-2">
        <input
          type="number"
          min={1}
          max={MAX_WAIT_MINUTES}
          className={`${inputCls} w-24 ${
            overCap ? "border-red-400 focus:border-red-500 focus:ring-red-500/20" : ""
          }`}
          value={value}
          onChange={(e) => set("value", Number(e.target.value))}
        />
        <select
          className={inputCls}
          value="minutes"
          onChange={() => set("unit", "minutes")}
        >
          <option value="minutes">{WAIT_UNITS.minutes.label}</option>
          <option value="hours" disabled>
            {WAIT_UNITS.hours.label} (fase 2)
          </option>
          <option value="days" disabled>
            {WAIT_UNITS.days.label} (fase 2)
          </option>
        </select>
      </div>
      <Hint>
        Máximo de {MAX_WAIT_MINUTES} minutos por enquanto — esperas longas chegam
        na fase 2.
      </Hint>
      {overCap && (
        <p className="mt-1 text-[12px] font-medium text-red-600 dark:text-red-400">
          Valor ajustado para 1–{MAX_WAIT_MINUTES} minutos ao salvar.
        </p>
      )}
    </div>
  );
}

/** Tags configuradas no step (array novo; `tagName` legado vira array de 1). */
function configTags(config: Record<string, unknown>): string[] {
  const raw = config.tags;
  const list = Array.isArray(raw)
    ? raw.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (list.length > 0) return list;
  const legacy = String(config.tagName ?? "").trim();
  return legacy ? [legacy] : [];
}

function TagForm({
  config,
  set,
  remove,
}: FormProps & { remove: boolean }) {
  const tags = configTags(config);
  const [draft, setDraft] = useState("");

  const tagsQuery = useQuery({
    queryKey: ["contact-tags"],
    queryFn: contactService.getTags,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const suggestions = (tagsQuery.data ?? []).filter((t) => !tags.includes(t));

  // Zera o tagName legado junto — senão o compile ressuscitaria a tag antiga
  // quando o array ficasse vazio.
  const setTags = (next: string[]) => {
    set("tags", next);
    set("tagName", "");
  };

  const commitDraft = () => {
    const value = draft.trim();
    if (!value) return;
    if (!tags.includes(value)) setTags([...tags, value]);
    setDraft("");
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  return (
    <div>
      <Label>{remove ? "Tags a remover" : "Tags a adicionar"}</Label>
      {tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full border border-primary-500/30 bg-primary-500/10 py-0.5 pr-1 pl-2.5 text-[12px] font-medium text-primary-600 dark:text-primary-400"
            >
              {tag}
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-primary-500/20"
                onClick={() => removeTag(tag)}
                aria-label={`Remover tag ${tag}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className={inputCls}
        value={draft}
        list="flow-tag-suggestions"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commitDraft();
          }
        }}
        onBlur={commitDraft}
        placeholder="Digite a tag e pressione Enter"
      />
      <datalist id="flow-tag-suggestions">
        {suggestions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <Hint>
        {remove
          ? "As tags são removidas do contato quando o fluxo passa por aqui."
          : "As tags são aplicadas ao contato quando o fluxo passa por aqui. Tags novas são criadas automaticamente."}
      </Hint>
    </div>
  );
}

type PipelineOption = {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string }>;
};

function PipelineForm({ config, set }: FormProps) {
  const pipelinesQuery = useQuery({
    queryKey: ["pipelines"],
    queryFn: async (): Promise<PipelineOption[]> => {
      const response = await fetch("/api/pipelines", { cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao buscar pipelines");
      return response.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const pipelines = pipelinesQuery.data ?? [];
  const pipelineId = String(config.pipelineId ?? "");
  const stageId = String(config.stageId ?? "");
  const selected = pipelines.find((p) => p.id === pipelineId);

  const choosePipeline = (id: string) => {
    const pipeline = pipelines.find((p) => p.id === id);
    // Denormaliza os nomes junto (exibição no card/logs); etapa reseta.
    set("pipelineId", id);
    set("pipelineName", pipeline?.name ?? "");
    set("stageId", "");
    set("stageName", "");
  };

  const chooseStage = (id: string) => {
    const stage = selected?.stages.find((s) => s.id === id);
    set("stageId", id);
    set("stageName", stage?.name ?? "");
  };

  if (!pipelinesQuery.isLoading && pipelines.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-[var(--ds-bg-surface)]/40 p-4 text-[13px] leading-relaxed text-[var(--ds-text-secondary)]">
        Nenhum pipeline criado ainda. Crie um na página{" "}
        <a
          href="/crm"
          className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          CRM
        </a>{" "}
        e volte aqui para configurar este passo.
      </div>
    );
  }

  return (
    <>
      <div>
        <Label>Pipeline</Label>
        <select
          className={inputCls}
          value={pipelineId}
          onChange={(e) => choosePipeline(e.target.value)}
          disabled={pipelinesQuery.isLoading}
        >
          <option value="">Selecionar pipeline…</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Etapa de destino</Label>
        <select
          className={inputCls}
          value={stageId}
          onChange={(e) => chooseStage(e.target.value)}
          disabled={!selected}
        >
          <option value="">Selecionar etapa…</option>
          {(selected?.stages ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Status da oportunidade</Label>
        <select
          className={inputCls}
          value={String(config.oppStatus ?? "open")}
          onChange={(e) => set("oppStatus", e.target.value)}
        >
          <option value="open">Aberta</option>
          <option value="won">Ganha</option>
          <option value="lost">Perdida</option>
          <option value="abandoned">Abandonada</option>
        </select>
        <Hint>
          Se o contato já tem uma oportunidade aberta neste pipeline, ela é
          movida para a etapa; senão, uma nova é criada.
        </Hint>
      </div>
    </>
  );
}

interface BranchesFormProps {
  branches: Branch[];
  setBranches: React.Dispatch<React.SetStateAction<Branch[]>>;
}

function ConditionForm({ branches, setBranches }: BranchesFormProps) {
  const editBranch = (id: string, patch: Partial<Branch>) =>
    setBranches((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const buttonCount = branches.filter((b) => !b.locked).length;

  const removeBranch = (b: Branch) => {
    if (
      b.child &&
      !window.confirm(`A branch "${b.label}" tem uma sub-árvore. Excluir tudo?`)
    ) {
      return;
    }
    setBranches((bs) => bs.filter((x) => x.id !== b.id));
  };

  const add = () =>
    setBranches((bs) => {
      const nb: Branch = {
        id: `nb-${Date.now()}-${bs.length}`,
        label: `Branch ${bs.length}`,
        child: null,
        field: "Replied message",
        operator: "contains",
        value: "",
      };
      const lockedIdx = bs.findIndex((b) => b.locked);
      if (lockedIdx === -1) return [...bs, nb];
      return [...bs.slice(0, lockedIdx), nb, ...bs.slice(lockedIdx)]; // antes do "None"
    });

  return (
    <>
      <Label>Branches</Label>
      <div className="space-y-3">
        {branches
          .filter((b) => !b.locked)
          .map((b) => (
            <div key={b.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <input
                  className={inputCls}
                  value={b.label}
                  onChange={(e) => editBranch(b.id, { label: e.target.value })}
                  placeholder="Nome da branch"
                />
                <button
                  type="button"
                  className="shrink-0 rounded p-1 text-[var(--ds-text-muted)] hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 disabled:invisible"
                  disabled={buttonCount <= 1}
                  onClick={() => removeBranch(b)}
                  aria-label="Remover branch"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex gap-2">
                <input className={inputCls} value="Mensagem recebida" disabled />
                <select
                  className={inputCls}
                  value={b.operator ?? "contains"}
                  onChange={(e) => editBranch(b.id, { operator: e.target.value })}
                >
                  {Object.entries(CONDITION_OPERATORS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <input
                className={inputCls}
                value={b.value ?? ""}
                onChange={(e) => editBranch(b.id, { value: e.target.value })}
                placeholder="Valor (ex.: Confirmar Presença)"
              />
            </div>
          ))}
        <div className="rounded-lg border border-dashed border-border bg-[var(--ds-bg-surface)]/40 p-3 text-[12px] text-[var(--ds-text-muted)]">
          <span className="font-medium text-[var(--ds-text-secondary)]">None</span> — quando nenhuma
          condição for atendida (fixa, não removível)
        </div>
      </div>
      <Hint>A comparação é sensível a maiúsculas e acentos.</Hint>
      <button
        type="button"
        className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        onClick={add}
      >
        <Plus size={13} /> Adicionar branch
      </button>
    </>
  );
}

function InteractiveForm({
  config,
  set,
  branches,
  setBranches,
}: FormProps & BranchesFormProps) {
  const editBranch = (id: string, patch: Partial<Branch>) =>
    setBranches((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  // v1: 1 a 3 botões, ≤20 caracteres cada (limite dos botões do WhatsApp).
  const buttons = branches.filter((b) => !b.locked);
  const buttonCount = buttons.length;

  const removeBranch = (b: Branch) => {
    if (
      b.child &&
      !window.confirm(`O botão "${b.label}" tem uma sub-árvore. Excluir tudo?`)
    ) {
      return;
    }
    setBranches((bs) => bs.filter((x) => x.id !== b.id));
  };

  const add = () =>
    setBranches((bs) => {
      const current = bs.filter((b) => !b.locked);
      if (current.length >= MAX_BUTTONS) return bs;
      const locked = bs.filter((b) => b.locked);
      const nb: Branch = {
        id: `nb-${Date.now()}-${bs.length}`,
        label: `Botão ${current.length + 1}`,
        child: null,
      };
      return [...current, nb, ...locked];
    });

  return (
    <>
      <div>
        <Label>Pergunta</Label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={4}
          value={String(config.message ?? "")}
          onChange={(e) => set("message", e.target.value)}
          placeholder="Texto da pergunta enviada ao contato..."
        />
        <Hint>O fluxo pausa e aguarda a resposta do contato.</Hint>
      </div>
      <div>
        <Label>Botões / opções (1 branch por botão)</Label>
        <div className="space-y-2">
          {buttons.map((b) => (
            <div key={b.id} className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  className={`${inputCls} pr-12`}
                  value={b.label}
                  maxLength={MAX_BUTTON_CHARS}
                  onChange={(e) => editBranch(b.id, { label: e.target.value })}
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[10px] text-[var(--ds-text-muted)]">
                  {b.label.length}/{MAX_BUTTON_CHARS}
                </span>
              </div>
              <button
                type="button"
                className="shrink-0 rounded p-1 text-[var(--ds-text-muted)] hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 disabled:invisible"
                disabled={buttonCount <= 1}
                onClick={() => removeBranch(b)}
                aria-label="Remover botão"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={add}
          disabled={buttonCount >= MAX_BUTTONS}
        >
          <Plus size={13} /> Adicionar botão{" "}
          {buttonCount >= MAX_BUTTONS && `(máx. ${MAX_BUTTONS})`}
        </button>
        <div className="mt-3 rounded-lg border border-dashed border-border bg-[var(--ds-bg-surface)]/40 p-3 text-[12px] text-[var(--ds-text-muted)]">
          O fluxo reconhece a resposta pelo <span className="font-medium text-[var(--ds-text-secondary)]">texto</span>{" "}
          do botão — respostas fora dos botões seguem pela continuação do fluxo.
        </div>
      </div>
    </>
  );
}
