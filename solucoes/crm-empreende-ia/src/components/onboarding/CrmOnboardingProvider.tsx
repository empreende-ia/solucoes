import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCrmOnboarding } from '@/hooks/useCrmOnboarding';
import { ProductTourProvider } from '@/components/tours';
import { CrmOnboardingContext } from './CrmOnboardingContext';
import { CrmSetupGuide } from './CrmSetupGuide';
import { nextSetupStep, parseGuideStep, setupGuideKey, type SetupStepId } from './setup-state';

const sessionSteps = new Map<string, SetupStepId>();

/** Shares one set of live checks between the guide and the Help checklist. */
export function CrmOnboardingProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  const key = user && orgId ? setupGuideKey(orgId, user.id) : null;
  const setup = useCrmOnboarding();
  const refresh = setup.refresh;
  const location = useLocation();
  const route = `${location.pathname}${location.search}`;
  const [session, setSession] = useState<{ key: string | null; open: boolean; stepId: SetupStepId; route: string }>({ key, open: false, stepId: 'identity', route });
  const evidenceRef = useRef(setup.evidence);
  evidenceRef.current = setup.evidence;
  const open = session.key === key && session.route === route && session.open;

  const selectStep = useCallback((stepId: SetupStepId) => {
    if (!key) return;
    sessionSteps.set(key, stepId);
    try { localStorage.setItem(key, JSON.stringify({ version: 1, stepId })); } catch { /* Keep the same position for this session. */ }
    setSession({ key, open: true, stepId, route });
  }, [key, route]);

  const openGuide = useCallback((explicitStep?: SetupStepId) => {
    if (!key) return;
    let saved = sessionSteps.get(key);
    try { saved = parseGuideStep(localStorage.getItem(key)) ?? saved; } catch { /* Session memory still works. */ }
    const stepId = explicitStep ?? saved ?? nextSetupStep(evidenceRef.current);
    selectStep(stepId);
    void refresh();
  }, [key, selectStep, refresh]);
  const closeGuide = useCallback(() => setSession((current) => ({ ...current, open: false })), []);

  useEffect(() => { closeGuide(); }, [key, route, closeGuide]);
  useEffect(() => {
    const openRequested = () => openGuide();
    window.addEventListener('empreende-crm:open-onboarding', openRequested);
    return () => window.removeEventListener('empreende-crm:open-onboarding', openRequested);
  }, [openGuide]);

  const value = useMemo(() => ({ ...setup, open, stepId: session.key === key ? session.stepId : nextSetupStep(setup.evidence), openGuide, closeGuide, selectStep }), [setup, open, session.key, session.stepId, key, openGuide, closeGuide, selectStep]);
  return <CrmOnboardingContext.Provider value={value}>
    <ProductTourProvider scope={user && orgId ? { userId: user.id, orgId } : null} blocked={open}>
      {children}
      <CrmSetupGuide />
    </ProductTourProvider>
  </CrmOnboardingContext.Provider>;
}
