// Meta por tipo de step — SERVER-SAFE: sem JSX e sem componentes React.
// `icon` é o NOME do ícone lucide (string); a UI resolve pro componente
// (ex.: import { icons } from "lucide-react"; icons[meta.icon]).

import type { StepType } from "./types";

export type PickerCategory = "Mensagem" | "Lógica" | "Dados" | "CRM";

export interface StepMeta {
  label: string;
  desc: string;
  /** nome do ícone lucide-react (ex.: "MessageCircle") */
  icon: string;
  iconBg: string;
  iconFg: string;
  category: PickerCategory;
  /** habilitado na v1 do builder novo (false → badge "Em breve") */
  enabledV1: boolean;
  /** badge exibida no Action Picker quando desabilitado */
  badge?: string;
}

const COMING_SOON = "Em breve";

export const STEP_META: Record<StepType, StepMeta> = {
  whatsapp: {
    label: "WhatsApp",
    desc: "Envia template aprovado, mídia ou mensagem livre",
    icon: "MessageCircle",
    iconBg: "#dcfce7",
    iconFg: "#16a34a",
    category: "Mensagem",
    enabledV1: true,
  },
  interactive: {
    label: "Perguntar",
    desc: "Envia uma pergunta e ramifica pela resposta",
    icon: "MessagesSquare",
    iconBg: "#d1fae5",
    iconFg: "#047857",
    category: "Mensagem",
    enabledV1: true,
  },
  condition: {
    label: "Condição",
    desc: "Ramifica o fluxo por condições (If/Else)",
    icon: "GitBranch",
    iconBg: "#f3e8ff",
    iconFg: "#9333ea",
    category: "Lógica",
    enabledV1: true,
  },
  split: {
    label: "Split",
    desc: "Divide contatos aleatoriamente por %",
    icon: "Shuffle",
    iconBg: "#dbeafe",
    iconFg: "#2563eb",
    category: "Lógica",
    enabledV1: false,
    badge: COMING_SOON,
  },
  wait: {
    label: "Aguardar",
    desc: "Pausa o fluxo por um período de tempo",
    icon: "Clock",
    iconBg: "#ede9fe",
    iconFg: "#7c3aed",
    category: "Lógica",
    enabledV1: true,
  },
  goto: {
    label: "Ir para (Go To)",
    desc: "Salta para outro passo do fluxo",
    icon: "CornerDownRight",
    iconBg: "#e0e7ff",
    iconFg: "#4f46e5",
    category: "Lógica",
    enabledV1: false,
    badge: COMING_SOON,
  },
  end: {
    label: "Encerrar (End)",
    desc: "Encerra o fluxo para o contato",
    icon: "Square",
    iconBg: "#f3f4f6",
    iconFg: "#4b5563",
    category: "Lógica",
    enabledV1: true,
  },
  tag: {
    label: "Adicionar tag",
    desc: "Adiciona uma ou mais tags ao contato",
    icon: "Tag",
    iconBg: "#ccfbf1",
    iconFg: "#0d9488",
    category: "Dados",
    enabledV1: true,
  },
  tag_remove: {
    label: "Remover tag",
    desc: "Remove uma ou mais tags do contato",
    icon: "Tags",
    iconBg: "#ffe4e6",
    iconFg: "#e11d48",
    category: "Dados",
    enabledV1: true,
  },
  pipeline: {
    label: "Mover no pipeline",
    desc: "Cria/move a oportunidade do contato para uma etapa do CRM",
    icon: "KanbanSquare",
    iconBg: "#fef3c7",
    iconFg: "#d97706",
    category: "CRM",
    enabledV1: true,
  },
};

export const PICKER_CATEGORIES: PickerCategory[] = [
  "Mensagem",
  "Lógica",
  "Dados",
  "CRM",
];

export const PICKER_ORDER: StepType[] = [
  "whatsapp",
  "interactive",
  "condition",
  "split",
  "wait",
  "goto",
  "end",
  "tag",
  "tag_remove",
  "pipeline",
];

export function isStepTypeEnabledV1(type: StepType): boolean {
  return STEP_META[type].enabledV1;
}

export const WAIT_UNITS: Record<
  string,
  { singular: string; plural: string; label: string; ms: number }
> = {
  minutes: { singular: "minuto", plural: "minutos", label: "Minutos", ms: 60_000 },
  hours: { singular: "hora", plural: "horas", label: "Horas", ms: 3_600_000 },
  days: { singular: "dia", plural: "dias", label: "Dias", ms: 86_400_000 },
};

export const CONDITION_FIELDS = ["Replied message"];

export const CONDITION_OPERATORS: Record<string, string> = {
  contains: "contém",
  not_contains: "não contém",
  equals: "é igual a",
};
