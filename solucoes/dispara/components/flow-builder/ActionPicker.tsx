"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PICKER_CATEGORIES, PICKER_ORDER, STEP_META } from "@/lib/builder/flow/meta";
import { isTerminalType, slotHasTail } from "@/lib/builder/flow/operations";
import type { StepType } from "@/lib/builder/flow/types";
import { stepChipStyle, stepIcon } from "./icons";
import { useFlowBuilderStore } from "./store";

const PICKER_W = 300;
const PICKER_MAX_H = 420;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function ActionPicker() {
  const picker = useFlowBuilderStore((s) => s.picker);
  const flow = useFlowBuilderStore((s) => s.flow);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery("");
  }, [picker]);

  // Terminal (End/Go To) no meio da cadeia descartaria a cauda inteira —
  // como no GHL, só oferecemos em pontas abertas (folha "+" / branch vazia).
  const hideTerminals = picker && flow ? slotHasTail(flow, picker.slot) : false;

  const groups = useMemo(() => {
    const q = normalize(query.trim());
    return PICKER_CATEGORIES.map((category) => ({
      category,
      items: PICKER_ORDER.filter((t) => STEP_META[t].category === category)
        .filter((t) => !hideTerminals || !isTerminalType(t))
        .filter(
          (t) =>
            !q ||
            normalize(STEP_META[t].label).includes(q) ||
            normalize(STEP_META[t].desc).includes(q)
        ),
    })).filter((g) => g.items.length > 0);
  }, [query, hideTerminals]);

  if (!picker || !flow) return null;

  const left = Math.max(
    12,
    Math.min(picker.x - PICKER_W / 2, window.innerWidth - PICKER_W - 12)
  );
  const top = Math.max(
    12,
    Math.min(picker.y + 10, window.innerHeight - PICKER_MAX_H - 12)
  );

  const insert = (type: StepType) => {
    if (!STEP_META[type].enabledV1) return; // "Em breve" não insere
    useFlowBuilderStore.getState().insertStep(type);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={() => useFlowBuilderStore.getState().closePicker()}
      />
      <div
        className="fixed z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        style={{ left, top, width: PICKER_W }}
      >
        <div className="border-b border-border p-2">
          <div className="flex items-center gap-2 rounded-lg bg-[var(--ds-bg-surface)]/60 px-2.5 py-1.5">
            <Search size={14} className="shrink-0 text-[var(--ds-text-muted)]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar ação..."
              className="w-full bg-transparent text-[13px] text-[var(--ds-text-primary)] outline-none placeholder:text-[var(--ds-text-muted)]"
            />
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {groups.length === 0 && (
            <div className="px-3 py-6 text-center text-[12px] text-[var(--ds-text-muted)]">
              Nenhuma ação encontrada
            </div>
          )}
          {groups.map((g) => (
            <div key={g.category}>
              <div className="px-2.5 pt-2.5 pb-1 text-[10px] font-semibold tracking-wider text-[var(--ds-text-muted)] uppercase">
                {g.category}
              </div>
              {g.items.map((t) => {
                const meta = STEP_META[t];
                const Icon = stepIcon(meta.icon);
                const disabled = !meta.enabledV1;
                return (
                  <button
                    type="button"
                    key={t}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
                      disabled
                        ? "cursor-not-allowed opacity-50"
                        : "hover:bg-[var(--ds-bg-hover)]"
                    }`}
                    onClick={() => insert(t)}
                    aria-disabled={disabled}
                  >
                    <span
                      className="step-chip flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={stepChipStyle(meta)}
                    >
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-[var(--ds-text-primary)]">
                        {meta.label}
                        {disabled && (
                          <span className="shrink-0 rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-1.5 py-px text-[9px] font-semibold tracking-wide text-[var(--ds-text-secondary)] uppercase">
                            {meta.badge ?? "Em breve"}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--ds-text-muted)]">
                        {meta.desc}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
