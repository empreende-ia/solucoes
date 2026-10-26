import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Compass, RotateCcw, X } from 'lucide-react';
import { getProductTour, productTours } from './catalog';
import { ProductTourOverlay } from './ProductTourOverlay';
import { findTourTarget, isTourTargetVisible, otherDialogOpen, visibleTourSteps } from './tour-dom';
import { emptyTourPreferences, pausedTour, readTourPreferences, recordTourVisit, resumeTourIndex, shouldAutomaticallyStartTour, shouldOfferTour, tourStorageKey, writeTourPreferences } from './tour-state';
import type { ProductTourDefinition, ProductTourStep, TourPreferences, TourScope } from './types';
import './ProductTour.css';

interface Scene { tour?: ProductTourDefinition; blocked: boolean; count: number }
interface ActiveTour { tour: ProductTourDefinition; steps: ProductTourStep[]; index: number; key: string; route: string }
interface TourContextValue {
  tour?: ProductTourDefinition;
  available: boolean;
  unavailableReason: string;
  active: boolean;
  paused: boolean;
  invitation: boolean;
  preferences: TourPreferences;
  hasScope: boolean;
  start: (restart?: boolean) => void;
  dismissInvitation: () => void;
  setPreference: (key: 'automatic' | 'invitations', enabled: boolean) => void;
}
const TourContext = createContext<TourContextValue | null>(null);

/** A page must explicitly opt in. A route name alone cannot activate a stale guide. */
function detectTourScene(): Scene {
  const markers = Array.from(document.querySelectorAll<HTMLElement>('[data-product-tour]')).filter(isTourTargetVisible);
  const marker = markers.at(-1);
  const tour = getProductTour(marker?.dataset.productTour || '');
  return { tour, blocked: otherDialogOpen(), count: tour ? visibleTourSteps(tour).length : 0 };
}

export function ProductTourProvider({ children, scope, blocked = false }: { children: ReactNode; scope: TourScope | null; blocked?: boolean }) {
  const location = useLocation();
  const route = `${location.pathname}${location.search}${location.hash}`;
  const storageKey = tourStorageKey(scope);
  const [stored, setStored] = useState(() => ({ key: storageKey, preferences: readTourPreferences(storageKey) }));
  const storedRef = useRef(stored);
  const [scene, setScene] = useState<Scene>({ blocked: true, count: 0 });
  const [active, setActive] = useState<ActiveTour | null>(null);
  const attempted = useRef(new Set<string>());
  const returnFocus = useRef<HTMLElement | null>(null);
  const loaded = stored.key === storageKey;
  const preferences = loaded ? stored.preferences : emptyTourPreferences();
  const currentActive = active && active.key === storageKey && active.route === route && !blocked ? active : null;

  useEffect(() => {
    const next = { key: storageKey, preferences: readTourPreferences(storageKey) };
    storedRef.current = next;
    setStored(next);
    setActive(null);
    attempted.current.clear();
    returnFocus.current = null;
  }, [storageKey]);

  const savePreferences = useCallback((update: (value: TourPreferences) => TourPreferences) => {
    if (!storageKey || storedRef.current.key !== storageKey) return;
    const next = { key: storageKey, preferences: update(storedRef.current.preferences) };
    storedRef.current = next;
    writeTourPreferences(storageKey, next.preferences);
    setStored(next);
  }, [storageKey]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (storageKey && (event.key === storageKey || event.key === null)) {
        const next = { key: storageKey, preferences: readTourPreferences(storageKey) };
        storedRef.current = next;
        setStored(next);
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [storageKey]);

  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = detectTourScene();
        setScene((current) => current.tour?.id === next.tour?.id && current.blocked === next.blocked && current.count === next.count ? current : next);
      });
    };
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => !(mutation.target instanceof Element && mutation.target.closest('[data-tour-ui]')))) refresh();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-product-tour', 'data-tour', 'data-state', 'hidden', 'inert', 'class', 'style', 'role'] });
    window.addEventListener('resize', refresh);
    document.addEventListener('visibilitychange', refresh);
    refresh();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [route]);

  // Every viewed step is already persisted as paused, including a reload or navigation.
  // Scope and route checks also suppress the old overlay synchronously, before effects run.
  useEffect(() => {
    if (active && (active.key !== storageKey || active.route !== route || blocked || scene.blocked || scene.tour?.id !== active.tour.id)) setActive(null);
  }, [active, storageKey, route, blocked, scene]);

  const start = useCallback((restart = false) => {
    if (!storageKey || !loaded || blocked || active) return;
    const latest = detectTourScene();
    if (!latest.tour || latest.blocked || !latest.count || document.hidden) return;
    const steps = visibleTourSteps(latest.tour);
    const index = restart ? 0 : resumeTourIndex(storedRef.current.preferences, latest.tour, steps);
    const focused = document.activeElement;
    returnFocus.current = focused instanceof HTMLElement && focused !== document.body ? focused : null;
    attempted.current.add(`${latest.tour.id}:${latest.tour.version}`);
    savePreferences((current) => recordTourVisit(current, latest.tour!, 'paused', steps[index].id));
    setActive({ tour: latest.tour, steps, index, key: storageKey, route });
  }, [storageKey, loaded, blocked, active, savePreferences, route]);

  useEffect(() => {
    if (!storageKey || !loaded || blocked || active || scene.blocked || !scene.tour || !scene.count || document.hidden) return;
    const attemptKey = `${scene.tour.id}:${scene.tour.version}`;
    if (!shouldAutomaticallyStartTour(preferences, scene.tour) || attempted.current.has(attemptKey)) return;
    const timer = window.setTimeout(() => {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.matches('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
        attempted.current.add(attemptKey);
        return;
      }
      start();
    }, 1200);
    return () => clearTimeout(timer);
  }, [storageKey, loaded, blocked, active, scene, preferences, start]);

  const finish = useCallback((status: 'completed' | 'dismissed' | 'paused') => {
    if (currentActive) savePreferences((current) => recordTourVisit(current, currentActive.tour, status, currentActive.steps[currentActive.index].id));
    setActive(null);
  }, [currentActive, savePreferences]);

  const move = useCallback((direction: 1 | -1) => {
    if (!currentActive) return;
    let index = currentActive.index + direction;
    while (index >= 0 && index < currentActive.steps.length && !findTourTarget(currentActive.steps[index].target)) index += direction;
    if (index >= currentActive.steps.length) finish('completed');
    else if (index >= 0) {
      savePreferences((current) => recordTourVisit(current, currentActive.tour, 'paused', currentActive.steps[index].id));
      setActive({ ...currentActive, index });
    }
  }, [currentActive, finish, savePreferences]);

  const setPreference = useCallback((key: 'automatic' | 'invitations', enabled: boolean) => {
    savePreferences((current) => ({ ...current, [key]: enabled }));
  }, [savePreferences]);

  const unavailableReason = !storageKey ? 'Entre em uma organização para usar os tours.'
    : blocked || scene.blocked ? 'Feche o formulário ou conclua a etapa de configuração para iniciar o tour.'
    : !scene.tour ? 'Esta tela ainda não possui um tour. Consulte os roteiros na Ajuda.'
    : !scene.count ? 'O tour estará disponível quando os recursos desta tela estiverem visíveis para seu acesso.'
    : '';
  const context = useMemo<TourContextValue>(() => ({
    tour: scene.tour,
    available: !unavailableReason && loaded,
    unavailableReason,
    active: Boolean(currentActive),
    paused: Boolean(scene.tour && pausedTour(preferences, scene.tour)),
    invitation: Boolean(scene.tour && shouldOfferTour(preferences, scene.tour)),
    preferences,
    hasScope: Boolean(storageKey && loaded),
    start,
    dismissInvitation: () => { if (scene.tour) savePreferences((current) => recordTourVisit(current, scene.tour!, 'dismissed')); },
    setPreference,
  }), [scene.tour, unavailableReason, loaded, currentActive, preferences, storageKey, start, savePreferences, setPreference]);

  return <TourContext.Provider value={context}>
    {children}
    {currentActive && <ProductTourOverlay
      tour={currentActive.tour} steps={currentActive.steps} index={currentActive.index} root={document}
      returnFocus={returnFocus.current}
      onPause={() => finish('paused')} onDismiss={() => finish('dismissed')} onMove={move}
    />}
  </TourContext.Provider>;
}

/** Inline invitation, without focus capture or a competing floating card. */
export function TourLauncher({ className = '' }: { className?: string }) {
  const context = useContext(TourContext);
  if (!context) return null;
  const label = context.paused ? 'Continuar tour' : context.invitation ? 'Conhecer esta tela' : 'Tour desta tela';
  return <span className={`product-tour-launcher-group ${className}`} data-tour-ui>
    <button type="button" data-tour-launcher className="product-tour-launcher" disabled={!context.available || context.active}
      title={context.unavailableReason || label} aria-label={context.unavailableReason ? `${label}. ${context.unavailableReason}` : label} onClick={() => context.start()}>
      <Compass aria-hidden="true" /><span className="product-tour-label">{label}</span><span className="product-tour-short-label" aria-hidden="true">{context.paused ? 'Continuar' : 'Tour'}</span>
    </button>
    {context.paused && context.available && !context.active && <button type="button" className="product-tour-launcher product-tour-restart" onClick={() => context.start(true)} title="Recomeçar tour" aria-label="Recomeçar tour"><RotateCcw aria-hidden="true" /></button>}
    {context.invitation && context.available && !context.active && <button type="button" className="product-tour-launcher product-tour-restart" onClick={context.dismissInvitation} title="Dispensar convite desta tela" aria-label="Dispensar convite desta tela"><X aria-hidden="true" /></button>}
    {!context.available && context.tour && <span className="sr-only" role="status">{context.unavailableReason}</span>}
  </span>;
}

export function TourHelpCatalog({ onNavigate }: { onNavigate?: () => void } = {}) {
  const context = useContext(TourContext);
  const navigate = useNavigate();
  if (!context) return null;
  return <section className="product-tour-catalog" aria-labelledby="product-tour-catalog-title" data-tour-ui>
    <div><h2 id="product-tour-catalog-title">Conheça as principais ferramentas</h2><p>Roteiros curtos para explorar o CRM no seu ritmo. Abra a tela e escolha “Tour desta tela” ou “Continuar tour”. Os passos disponíveis respeitam seu acesso.</p></div>
    <div className="product-tour-catalog-grid">
      {productTours.map((tour) => {
        const visit = context.preferences.visits[tour.id];
        const current = visit?.version === tour.version ? visit : undefined;
        const status = current?.status === 'completed' ? 'Concluído' : current?.status === 'paused' ? 'Pausado' : current?.status === 'dismissed' ? 'Disponível para rever' : visit ? 'Atualizado' : `${tour.steps.length} passos`;
        return <article key={tour.id} className="product-tour-catalog-item">
          <span className="product-tour-catalog-status">{current?.status === 'completed' && <Check aria-hidden="true" />}{status}</span>
          <h3>{tour.title}</h3><p>{tour.description}</p>
          <button type="button" className="product-tour-catalog-open" onClick={() => { onNavigate?.(); navigate(tour.path); }} aria-label={`Abrir tela: ${tour.title}`}>Abrir tela <ArrowRight aria-hidden="true" /></button>
        </article>;
      })}
    </div>
    <fieldset className="product-tour-catalog-preferences" disabled={!context.hasScope}>
      <legend>Como você prefere conhecer o CRM?</legend>
      <label><input type="checkbox" checked={context.preferences.invitations} onChange={(event) => context.setPreference('invitations', event.target.checked)} /><span>Mostrar convites discretos nas telas novas</span></label>
      <label><input type="checkbox" checked={context.preferences.automatic} onChange={(event) => context.setPreference('automatic', event.target.checked)} /><span>Abrir novos tours automaticamente quando a tela estiver pronta</span></label>
      <p>A orientação automática vem desativada. Você pode pausar com Esc e retomar pelo passo salvo. O progresso fica neste navegador, separado por conta e organização.</p>
    </fieldset>
  </section>;
}
