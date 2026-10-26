"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { STEP_META } from "@/lib/builder/flow/meta";
import type { Step } from "@/lib/builder/flow/types";
import { stepChipStyle, stepIcon } from "../icons";
import { useFlowBuilderStore } from "../store";

const StepNode = memo(function StepNode({ data, selected }: NodeProps) {
  const { step, subtitle } = data as unknown as { step: Step; subtitle: string };
  const meta = STEP_META[step.type];
  const Icon = stepIcon(meta.icon);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commitRename = () => {
    const value = inputRef.current?.value.trim();
    if (value && value !== step.name) {
      useFlowBuilderStore.getState().patchStep(step.id, { name: value });
    }
    setEditing(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
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
    <div
      className={`step-card relative flex h-full w-full items-center gap-3 rounded-[10px] border bg-card px-3 shadow-sm transition-shadow ${
        selected
          ? "border-primary-500 ring-2 ring-primary-500/25"
          : "border-border hover:border-[var(--ds-border-strong)]"
      }`}
    >
      <Handle type="target" position={Position.Top} />
      <div
        className="step-chip flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={stepChipStyle(meta)}
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            defaultValue={step.name}
            className="nodrag w-full rounded border border-primary-500 bg-transparent px-1 py-0.5 text-[13px] font-medium text-[var(--ds-text-primary)] outline-none"
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <div className="truncate text-[13px] font-medium text-[var(--ds-text-primary)]">
            {step.name}
          </div>
        )}
        {subtitle && (
          <div className="truncate text-[11px] text-[var(--ds-text-muted)]">{subtitle}</div>
        )}
      </div>
      <button
        type="button"
        className="nodrag shrink-0 rounded p-1 text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-secondary)]"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        aria-label="Opções do passo"
      >
        <MoreHorizontal size={16} />
      </button>
      {menuOpen && (
        <div
          className="nodrag nopan absolute top-9 right-1 z-30 w-36 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
          onMouseLeave={() => setMenuOpen(false)}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              setEditing(true);
            }}
          >
            <Pencil size={12} /> Renomear
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-red-600 hover:bg-red-500/10 dark:text-red-400"
            onClick={handleDelete}
          >
            <Trash2 size={12} /> Deletar
          </button>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

export default StepNode;
