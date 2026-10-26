// nodeTypes declarados FORA de qualquer componente (regra de performance do React Flow).
import type { NodeTypes } from "@xyflow/react";
import EndNode from "./EndNode";
import PlaceholderNode from "./PlaceholderNode";
import PlusLeafNode from "./PlusLeafNode";
import StepNode from "./StepNode";
import TriggerNode from "./TriggerNode";

export const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  step: StepNode,
  end: EndNode,
  placeholder: PlaceholderNode,
  plus: PlusLeafNode,
};
