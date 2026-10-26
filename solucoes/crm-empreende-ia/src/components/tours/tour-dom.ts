import type { ProductTourDefinition, ProductTourStep } from './types';
import type { TourRect } from './tour-state';

export function isTourTargetVisible(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected || !element.getClientRects().length) return false;
  if (element.closest('[hidden], [inert]')) return false;
  const style = getComputedStyle(element);
  const bounds = element.getBoundingClientRect();
  return style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.display !== 'none' && bounds.width > 0 && bounds.height > 0;
}

export function findTourTarget(selector: string, root: ParentNode = document): HTMLElement | null {
  try {
    return Array.from(root.querySelectorAll(selector)).find(isTourTargetVisible) ?? null;
  } catch {
    return null;
  }
}

export function visibleTourSteps(tour: ProductTourDefinition, root: ParentNode = document): ProductTourStep[] {
  return tour.steps.filter((step) => findTourTarget(step.target, root));
}

export function tourViewport(): TourRect {
  const viewport = window.visualViewport;
  return { top: viewport?.offsetTop ?? 0, left: viewport?.offsetLeft ?? 0, width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight };
}

/** Clip the spotlight to the actual scrollable parents, not hidden content below them. */
export function clippedTourRect(element: HTMLElement): TourRect {
  const rect = element.getBoundingClientRect();
  const viewport = tourViewport();
  let left = Math.max(viewport.left + 4, rect.left - 5);
  let top = Math.max(viewport.top + 4, rect.top - 5);
  let right = Math.min(viewport.left + viewport.width - 4, rect.right + 5);
  let bottom = Math.min(viewport.top + viewport.height - 4, rect.bottom + 5);
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const bounds = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
  }
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function otherDialogOpen(): boolean {
  return Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]'))
    .some((element) => !element.closest('[data-tour-ui]') && isTourTargetVisible(element));
}
