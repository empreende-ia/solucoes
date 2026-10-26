"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Loader2,
  Pencil,
  Rocket,
  Settings2,
  Undo2,
} from "lucide-react";
import { useFlowBuilderStore } from "./store";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface BuilderHeaderProps {
  saveState: SaveState;
  publishedVersion: number | null;
  publishing: boolean;
  onPublish: () => void;
  onOpenSettings: () => void;
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1 px-1 text-[12px] text-[var(--ds-text-secondary)]">
        <Loader2 size={13} className="animate-spin" /> Salvando…
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex items-center gap-1 px-1 text-[12px] text-red-600 dark:text-red-400">
        <CircleAlert size={13} /> Erro ao salvar
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 px-1 text-[12px] text-[var(--ds-text-muted)]">
      <Check size={13} className="text-primary-500" /> Salvo
    </span>
  );
}

export default function BuilderHeader({
  saveState,
  publishedVersion,
  publishing,
  onPublish,
  onOpenSettings,
}: BuilderHeaderProps) {
  const name = useFlowBuilderStore((s) => s.flow?.name ?? "");
  const canUndo = useFlowBuilderStore((s) => s.past.length > 0);
  const hasFlow = useFlowBuilderStore((s) => s.flow !== null);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const value = inputRef.current?.value.trim();
    if (value && value !== name) useFlowBuilderStore.getState().renameFlow(value);
    setEditing(false);
  };

  return (
    <header className="z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <Link
        href="/workflows"
        className="flex shrink-0 items-center gap-1.5 text-[13px] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
      >
        <ArrowLeft size={15} /> Workflows
      </Link>
      <div className="h-5 w-px shrink-0 bg-border" />

      {editing ? (
        <input
          ref={inputRef}
          defaultValue={name}
          autoFocus
          className="w-[320px] rounded-lg border border-primary-500 bg-transparent px-2 py-1 text-[13px] font-medium text-[var(--ds-text-primary)] outline-none"
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="group flex min-w-0 items-center gap-1.5"
          onClick={() => hasFlow && setEditing(true)}
          title={name}
        >
          <span className="max-w-[300px] truncate text-[13px] font-medium text-[var(--ds-text-primary)]">
            {name || "Carregando…"}
          </span>
          <Pencil
            size={12}
            className="shrink-0 text-[var(--ds-text-muted)] group-hover:text-[var(--ds-text-secondary)]"
          />
        </button>
      )}

      {publishedVersion != null && (
        <span className="shrink-0 rounded-full border border-primary-500/30 bg-primary-500/10 px-2 py-0.5 text-[11px] font-medium text-primary-600 dark:text-primary-400">
          v{publishedVersion} publicada
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="rounded p-1.5 text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] disabled:opacity-30"
          disabled={!canUndo}
          onClick={() => useFlowBuilderStore.getState().undo()}
          title="Desfazer (Cmd+Z)"
        >
          <Undo2 size={15} />
        </button>
        <button
          type="button"
          className="rounded p-1.5 text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)]"
          onClick={onOpenSettings}
          title="Configurações do workflow"
        >
          <Settings2 size={15} />
        </button>
        {/* Botão Refazer oculto até o store ter redo — um ícone permanentemente
            desabilitado lê como quebrado. */}

        <SaveIndicator state={saveState} />

        <span title="Em breve" className="inline-block">
          <button
            type="button"
            className="cursor-not-allowed rounded-lg border border-border px-3 py-1.5 text-[13px] text-[var(--ds-text-muted)] opacity-60"
            disabled
          >
            Testar workflow
          </button>
        </span>

        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3.5 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onPublish}
          disabled={publishing || !hasFlow}
        >
          {publishing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Rocket size={13} />
          )}
          {publishing ? "Publicando…" : "Publicar"}
        </button>
      </div>
    </header>
  );
}
