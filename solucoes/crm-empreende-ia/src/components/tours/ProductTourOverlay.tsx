import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, ArrowRight, Check, Compass, X } from 'lucide-react';
import type { ProductTourDefinition, ProductTourStep } from './types';
import { clippedTourRect, findTourTarget, isTourTargetVisible, otherDialogOpen, tourViewport } from './tour-dom';
import { placeTourCard, type TourRect } from './tour-state';

interface Props {
  tour: ProductTourDefinition;
  steps: ProductTourStep[];
  index: number;
  root: ParentNode;
  returnFocus: HTMLElement | null;
  onPause: () => void;
  onDismiss: () => void;
  onMove: (direction: 1 | -1) => void;
}

export function ProductTourOverlay({ tour, steps, index, root, returnFocus, onPause, onDismiss, onMove }: Props) {
  const step = steps[index];
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [position, setPosition] = useState<{ focus: TourRect; card: TourRect; maxHeight: number } | null>(null);
  const [missing, setMissing] = useState(false);

  useLayoutEffect(() => {
    const target = findTourTarget(step.target, root);
    setMissing(!target);
    // Instant scrolling is intentional: reduced motion must also apply to viewport movement.
    if (target) target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    headingRef.current?.focus({ preventScroll: true });
    let frame = 0;
    const measure = () => {
      const current = findTourTarget(step.target, root);
      setMissing(!current);
      const viewport = tourViewport();
      const focus = current ? clippedTourRect(current) : { top: viewport.top + 20, left: viewport.left + 20, width: 0, height: 0 };
      const card = placeTourCard(focus, viewport, { width: Math.min(360, viewport.width - 24), height: cardRef.current?.offsetHeight ?? 300 });
      setPosition((previous) => {
        const next = { focus, card, maxHeight: Math.max(0, viewport.height - 24) };
        return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
      });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (target) resize?.observe(target);
    if (cardRef.current) resize?.observe(cardRef.current);
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => !(mutation.target instanceof Element && mutation.target.closest('[data-tour-ui]')))) schedule();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'inert', 'class', 'style', 'data-state'] });
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    measure();
    return () => { cancelAnimationFrame(frame); resize?.disconnect(); observer.disconnect(); document.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule); };
  }, [step.id, step.target, root]);

  // Re-evaluate the position after the first portal mount and changed step text.
  useEffect(() => { window.dispatchEvent(new Event('resize')); }, [index]);

  const restoreFocus = () => {
    requestAnimationFrame(() => {
      // If another dialog caused the pause, its focus manager takes priority.
      if (otherDialogOpen()) return;
      // A person may already have focused a field during a route/scope transition.
      // The deferred restoration must not steal that newer, explicit focus.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== document.body && focused.isConnected && !focused.closest('[data-tour-ui]')) return;
      const canFocus = (element: HTMLElement) => isTourTargetVisible(element) && !element.matches(':disabled');
      const fallback = Array.from(document.querySelectorAll<HTMLElement>('[data-tour-launcher], [data-tour-focus-fallback], main h1, main')).find(canFocus);
      const destination = returnFocus?.isConnected && canFocus(returnFocus) && returnFocus !== document.body ? returnFocus : fallback;
      if (!destination) return;
      if (!destination.matches('button, a[href], input, textarea, select, [tabindex]')) {
        destination.tabIndex = -1;
        destination.addEventListener('blur', () => destination.removeAttribute('tabindex'), { once: true });
      }
      destination.focus({ preventScroll: true });
    });
  };

  return <Dialog.Root open onOpenChange={(open) => { if (!open) onPause(); }}>
    <Dialog.Portal>
      <Dialog.Overlay data-tour-ui className="product-tour-shield" />
      <div data-tour-ui className={`product-tour-focus${missing ? ' product-tour-focus--missing' : ''}`} aria-hidden="true" style={position ? { top: position.focus.top, left: position.focus.left, width: position.focus.width, height: position.focus.height } : { inset: 0 }} />
      <Dialog.Content
        data-tour-ui
        ref={cardRef}
        className="product-tour-card"
        style={position ? { top: position.card.top, left: position.card.left, width: position.card.width, maxHeight: position.maxHeight } : { visibility: 'hidden' }}
        onOpenAutoFocus={(event) => { event.preventDefault(); headingRef.current?.focus({ preventScroll: true }); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="product-tour-topline">
          <span className="product-tour-symbol" aria-hidden="true"><Compass /></span>
          <span>{tour.title}</span>
          <button type="button" className="product-tour-close" onClick={onPause} aria-label="Pausar tour"><X aria-hidden="true" /></button>
        </div>
        <p className="product-tour-counter" aria-live="polite" aria-atomic="true">Passo {index + 1} de {steps.length}</p>
        <div className="product-tour-dots" aria-hidden="true">{steps.map((item, point) => <span key={item.id} className={point <= index ? 'is-reached' : ''} />)}</div>
        <Dialog.Title ref={headingRef} tabIndex={-1} className="product-tour-title">{missing ? 'Este item mudou de lugar' : step.title}</Dialog.Title>
        <Dialog.Description className="product-tour-description">{missing ? 'Esta parte da tela não está disponível agora. Você pode avançar para a próxima explicação ou pausar e continuar depois.' : step.description}</Dialog.Description>
        <div className="product-tour-actions">
          <button type="button" className="product-tour-skip" onClick={onPause}>Pausar</button>
          <div>
            {index > 0 && <button type="button" className="product-tour-back" onClick={() => onMove(-1)} aria-label="Voltar ao passo anterior"><ArrowLeft aria-hidden="true" /></button>}
            <button type="button" className="product-tour-next" onClick={() => onMove(1)}>{index === steps.length - 1 ? <>Concluir <Check aria-hidden="true" /></> : <>Próximo <ArrowRight aria-hidden="true" /></>}</button>
          </div>
        </div>
        <div className="product-tour-footer"><p className="product-tour-reminder">Esc pausa. Continue deste passo quando quiser.</p><button type="button" className="product-tour-skip" onClick={onDismiss}>Pular tour</button></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
