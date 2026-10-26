import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface DemoModeContextValue {
  /** Indica se a instância está exibindo dados de demonstração. */
  isDemoMode: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const DemoModeContext = createContext<DemoModeContextValue | undefined>(undefined);

export const DemoModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const refresh = useCallback(async () => {
    if (!user) {
      setIsDemoMode(false);
      setLoading(false);
      return;
    }
    try {
      const { data } = await (supabase as any)
        .from('lara_settings_public')
        .select('demo_mode_enabled')
        .limit(1)
        .maybeSingle();
      setIsDemoMode((data as { demo_mode_enabled?: boolean } | null)?.demo_mode_enabled === true);
    } catch (error) {
      console.error('[useDemoMode] erro ao ler o modo demonstração:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <DemoModeContext.Provider value={{ isDemoMode, loading, refresh }}>
      {children}
    </DemoModeContext.Provider>
  );
};

export const useDemoMode = (): DemoModeContextValue => {
  const context = useContext(DemoModeContext);
  if (!context) throw new Error('useDemoMode must be used within a DemoModeProvider');
  return context;
};
