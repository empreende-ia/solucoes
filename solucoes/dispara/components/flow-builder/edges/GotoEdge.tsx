"use client";

import { memo } from "react";
import { BaseEdge } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import { roundedOrthogonalPath } from "./path";
import type { Pt } from "./path";

/**
 * Edge do Go To: tracejada, violeta, roteada pela LATERAL direita da árvore
 * (desce 24px do source → vai até sideX → sobe/desce → entra no TOPO do target,
 * deslocada ENTRY_DX do centro para não cobrir o "+" da edge que chega no alvo).
 * Nunca participa do layout; sideX vem calculado do layoutFlow (maxX da árvore + offset).
 */

// O botão "+" das edges de branch fica em (targetX, targetY-16) com 24px de diâmetro;
// entrar 24px à direita do centro tira a seta da faixa x do botão (targetX ± 12).
const ENTRY_DX = 24;

const GotoEdge = memo(function GotoEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, markerEnd } = props;
  const data = (props.data ?? {}) as { sideX?: number };
  const sideX = data.sideX ?? Math.max(sourceX, targetX) + 120;
  const entryX = targetX + ENTRY_DX;

  const pts: Pt[] = [
    [sourceX, sourceY],
    [sourceX, sourceY + 24],
    [sideX, sourceY + 24],
    [sideX, targetY - 28],
    [entryX, targetY - 28],
    [entryX, targetY],
  ];
  const path = roundedOrthogonalPath(pts, 8);

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={{ stroke: "#8b5cf6", strokeWidth: 1.5, strokeDasharray: "6 4" }}
    />
  );
});

export default GotoEdge;
