"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";

const EndNode = memo(function EndNode({ selected }: NodeProps) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] text-[11px] font-semibold tracking-[0.2em] text-[var(--ds-text-primary)] shadow-sm ${
        selected ? "ring-2 ring-primary-500/40" : ""
      }`}
    >
      END
      <Handle type="target" position={Position.Top} />
    </div>
  );
});

export default EndNode;
