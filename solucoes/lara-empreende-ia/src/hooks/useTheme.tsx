import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Tema do painel · DARK-FIRST, como manda o design system Empreende.IA
 * (Regra Zero: peça nova nasce escura; o claro existe completo no toggle).
 *
 * O <html> carrega DOIS marcadores porque o app tem duas fontes de estilo:
 *   · data-theme="dark" → tokens --eia-* (src/styles/eia-tokens.css)
 *   · class="dark"      → utilitários do Tailwind e componentes shadcn
 * Escrever só um deixa metade da interface no tema errado.
 *
 * O valor inicial já foi resolvido pelo script inline do index.html (evita
 * o flash de tema errado antes do React montar). Aqui só sincronizamos.
 */

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'lara-theme';

interface ThemeContextValue {
  /** O que o usuário escolheu — pode ser 'system' */
  mode: ThemeMode;
  /** O que está de fato na tela depois de resolver 'system' */
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function prefersDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
}

function applyTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  // Escrever o atributo explicitamente mantém tokens EIA e Tailwind na
  // mesma página, qualquer que seja o fallback do tokens.css.
  root.setAttribute('data-theme', resolved);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [systemDark, setSystemDark] = useState(prefersDark);

  // Só interessa enquanto o modo for 'system' — mas o listener fica sempre
  // ativo para que voltar a 'system' já pegue o valor atual do SO.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme precisa estar dentro de <ThemeProvider>');
  return ctx;
}
