"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Plus, Zap } from "lucide-react";
import type { FlowTriggerType } from "@/lib/builder/flow/types";

const TriggerNode = memo(function TriggerNode({ data, selected }: NodeProps) {
  const { label, keywords, triggerType, campaignName, replyFilter } =
    data as unknown as {
      label: string;
      keywords?: string[];
      triggerType?: FlowTriggerType;
      campaignName?: string;
      replyFilter?: string;
    };
  const type: FlowTriggerType = triggerType ?? "keywords";

  // Slot vazio estilo GHL: "Add New Trigger" pontilhado com "+".
  const isEmpty = type === "none";

  let title = label;
  let subtitle = "";
  if (isEmpty) {
    title = "Adicionar novo gatilho";
    subtitle = "Sem gatilho — inscrição manual pela lista de contatos";
  } else if (type === "campaign_reply") {
    title = label || "Respondeu ao disparo";
    subtitle = campaignName
      ? `Campanha: ${campaignName}`
      : "Resposta a qualquer disparo";
    if (replyFilter) subtitle += ` · contém "${replyFilter}"`;
  } else {
    title = label || "Palavras-chave";
    const count = keywords?.length ?? 0;
    subtitle =
      count > 0
        ? `${count} ${count === 1 ? "palavra-chave" : "palavras-chave"}`
        : "Definir palavras-chave";
  }

  return (
    <div
      className={`flex h-full w-full items-center gap-3 rounded-[10px] border-2 border-dashed px-3 ${
        selected
          ? "border-primary-500 bg-card/80 ring-2 ring-primary-500/25"
          : "border-[var(--ds-border-default)] bg-card/60 hover:border-[var(--ds-border-strong)]"
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          isEmpty
            ? "border border-dashed border-[var(--ds-border-strong)] text-[var(--ds-text-muted)]"
            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        }`}
      >
        {isEmpty ? <Plus size={16} /> : <Zap size={16} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-[var(--ds-text-secondary)]">
          {title}
        </div>
        <div className="truncate text-[11px] text-[var(--ds-text-muted)]">{subtitle}</div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

export default TriggerNode;
