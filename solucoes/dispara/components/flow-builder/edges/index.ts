// edgeTypes declarados FORA de qualquer componente (regra de performance do React Flow).
import type { EdgeTypes } from "@xyflow/react";
import FlowEdge from "./FlowEdge";
import GotoEdge from "./GotoEdge";

export const edgeTypes: EdgeTypes = {
  flow: FlowEdge,
  goto: GotoEdge,
};
