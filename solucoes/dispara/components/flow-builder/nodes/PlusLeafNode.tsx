"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import type { Slot } from "@/lib/builder/flow/types";
import { useFlowBuilderStore } from "../store";

/** "+" folha no fim de uma cadeia aberta (sem END e sem convergência). */
const PlusLeafNode = memo(function PlusLeafNode({ data }: NodeProps) {
  const { slot } = data as unknown as { slot: Slot };
  return (
    <div className="h-full w-full">
      <Handle type="target" position={Position.Top} />
      <button
        type="button"
        className="nodrag nopan flex h-full w-full items-center justify-center rounded-full border border-[var(--ds-border-default)] bg-card text-[var(--ds-text-secondary)] shadow-sm transition-all hover:scale-110 hover:border-primary-500 hover:bg-primary-500 hover:text-white"
        onClick={(e) => {
          e.stopPropagation();
          useFlowBuilderStore
            .getState()
            .openPicker(slot, { x: e.clientX, y: e.clientY });
        }}
        aria-label="Adicionar ação"
      >
        <Plus size={16} />
      </button>
    </div>
  );
});

export default PlusLeafNode;
