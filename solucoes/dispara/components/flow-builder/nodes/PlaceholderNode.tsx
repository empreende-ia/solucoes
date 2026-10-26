"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import type { Slot } from "@/lib/builder/flow/types";
import { useFlowBuilderStore } from "../store";

/** Branch vazia: botão grande tracejado que reserva a largura da coluna. */
const PlaceholderNode = memo(function PlaceholderNode({ data }: NodeProps) {
  const { slot } = data as unknown as { slot: Slot };
  return (
    <div className="h-full w-full">
      <Handle type="target" position={Position.Top} />
      <button
        type="button"
        className="nodrag nopan flex h-full w-full items-center justify-center gap-2 rounded-[10px] border-2 border-dashed border-[var(--ds-border-default)] bg-card/40 text-[13px] font-medium text-[var(--ds-text-muted)] transition-colors hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
        onClick={(e) => {
          e.stopPropagation();
          useFlowBuilderStore
            .getState()
            .openPicker(slot, { x: e.clientX, y: e.clientY });
        }}
      >
        <Plus size={14} /> Adicionar ação
      </button>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

export default PlaceholderNode;
