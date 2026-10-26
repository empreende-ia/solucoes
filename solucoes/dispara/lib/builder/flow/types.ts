// Modelo de dados do builder novo: árvore aninhada — ÚNICA fonte de verdade.
// Nodes/edges (formato do executor/React Flow) são 100% derivados:
//   - layoutFlow() deriva o grafo visual (lib/builder/flow/layout.ts)
//   - compileFlow() deriva o grafo executável (lib/builder/flow/compile.ts)
//
// Types recursivos escritos à mão (sem zod recursivo, por decisão de projeto).

export type StepType =
  | "whatsapp"
  | "interactive"
  | "wait"
  | "condition"
  | "split"
  | "tag"
  | "tag_remove"
  | "pipeline"
  | "goto"
  | "end";

export interface Branch {
  id: string;
  label: string;
  child: Step | null;
  /** split: porcentagem do path (soma deve dar 100) */
  percent?: number;
  /** contagem de contatos exibida na edge (badge azul) */
  count?: number;
  /** branches fixas não removíveis: "None", "Not Delivered", "Timeout" */
  locked?: boolean;
  /** condition: campo/operador/valor */
  field?: string;
  operator?: string;
  value?: string;
}

export interface Step {
  /** id estável (nanoid) — os ids compilados são derivados dele */
  id: string;
  type: StepType;
  /** renomeável ("Perfeito", "RETÉM") */
  name: string;
  config: Record<string, unknown>;
  /** sequência (lista ligada) */
  next: Step | null;
  /** só condition/split/interactive */
  branches?: Branch[];
}

/**
 * Tipos de gatilho (estilo GHL):
 *   - "none": sem gatilho — o fluxo só recebe contatos por inscrição manual/bulk
 *     ("Adicionar ao workflow" na lista de contatos) — válido e publicável.
 *   - "keywords": mensagem recebida bate com uma palavra-chave (comportamento v1).
 *   - "campaign_reply": contato respondeu a um disparo (campanha) — com filtro
 *     opcional por campanha específica e por frase contida na resposta.
 * Árvores antigas não têm `type`: tratar ausência como "keywords".
 */
export type FlowTriggerType = "none" | "keywords" | "campaign_reply";

export interface FlowTrigger {
  type?: FlowTriggerType;
  label: string;
  /** palavras-chave que disparam o fluxo (uma entrada por keyword) */
  keywords: string[];
  /** campaign_reply: id da campanha (null/"" = resposta a qualquer disparo) */
  campaignId?: string | null;
  /** campaign_reply: nome da campanha denormalizado para exibição */
  campaignName?: string | null;
  /** campaign_reply: a resposta precisa conter esta frase (opcional) */
  replyFilter?: string;
}

/** Ausência de `type` (árvores antigas) = keywords. */
export function triggerTypeOf(trigger: FlowTrigger): FlowTriggerType {
  return trigger.type ?? "keywords";
}

export interface Flow {
  /** versão do formato da árvore persistida em workflow_versions.tree */
  schemaVersion: 1;
  id: string;
  name: string;
  trigger: FlowTrigger;
  root: Step | null;
}

/** Onde inserir um novo step. */
export type Slot =
  | { kind: "root" } // entre o trigger e o root
  | { kind: "after"; stepId: string } // depois de um step (entre ele e o next)
  | { kind: "branch"; stepId: string; branchIndex: number }; // no início de uma branch
