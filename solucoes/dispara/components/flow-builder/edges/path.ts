// Helper compartilhado de path ortogonal com cantos arredondados,
// usado pela goto-edge (rota lateral) e pela flow-edge em modo bypass.

export type Pt = [number, number];

export function roundedOrthogonalPath(pts: Pt[], r: number): string {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const len1 = Math.hypot(x1 - x0, y1 - y0) || 1;
    const len2 = Math.hypot(x2 - x1, y2 - y1) || 1;
    const r1 = Math.min(r, len1 / 2);
    const r2 = Math.min(r, len2 / 2);
    const p1x = x1 - ((x1 - x0) / len1) * r1;
    const p1y = y1 - ((y1 - y0) / len1) * r1;
    const p2x = x1 + ((x2 - x1) / len2) * r2;
    const p2y = y1 + ((y2 - y1) / len2) * r2;
    d += ` L ${p1x} ${p1y} Q ${x1} ${y1} ${p2x} ${p2y}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  d += ` L ${lx} ${ly}`;
  return d;
}
