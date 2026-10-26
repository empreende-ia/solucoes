"use client";

// Resolve os nomes de ícone (string) de lib/builder/flow/meta.ts para
// componentes lucide-react. Mapa local explícito (em vez de `icons` do pacote)
// para manter o tree-shaking do bundle.

import type { CSSProperties } from "react";
import {
  CircleHelp,
  Clock,
  CornerDownRight,
  GitBranch,
  MessageCircle,
  MessagesSquare,
  Shuffle,
  Square,
  SquareKanban,
  Tag,
  Tags,
  type LucideIcon,
} from "lucide-react";
import type { StepMeta } from "@/lib/builder/flow/meta";

const STEP_ICONS: Record<string, LucideIcon> = {
  MessageCircle,
  MessagesSquare,
  GitBranch,
  Shuffle,
  Clock,
  CornerDownRight,
  Square,
  Tag,
  Tags,
  KanbanSquare: SquareKanban,
};

export function stepIcon(name: string): LucideIcon {
  return STEP_ICONS[name] ?? CircleHelp;
}

/** Mistura um hex com branco (0..1) — clareia o iconFg para leitura no dark. */
function lighten(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const num = Number.parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((num >> 16) & 0xff);
  const g = mix((num >> 8) & 0xff);
  const b = mix(num & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * Chip de ícone theme-aware: expõe os dois pares como custom properties e a
 * classe `step-chip` (flow-builder.css) escolhe por tema — pastéis iconBg/
 * iconFg do meta no claro (visual do protótipo/GHL), iconFg translúcido +
 * clareado no escuro.
 */
export function stepChipStyle(
  meta: Pick<StepMeta, "iconBg" | "iconFg">
): CSSProperties {
  return {
    "--chip-bg-light": meta.iconBg,
    "--chip-fg-light": meta.iconFg,
    "--chip-bg-dark": `${meta.iconFg}26`, // ~15% alpha
    "--chip-fg-dark": lighten(meta.iconFg, 0.45),
  } as CSSProperties;
}
