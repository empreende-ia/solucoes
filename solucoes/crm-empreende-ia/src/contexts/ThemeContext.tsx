import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "light" | "dark" | "system";
type Density = "compact" | "normal" | "comfortable";
interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  density: Density;
  setDensity: (density: Density) => void;
}
const THEME_KEY = "empreende-ia-theme";
const DENSITY_KEY = "empreende-crm-density";
const ThemeContext = createContext<ThemeContextType>({
  theme: "dark", setTheme: () => {}, density: "normal", setDensity: () => {},
});
export const useTheme = () => useContext(ThemeContext);

function readPreference<T extends string>(key: string, values: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key) as T;
    return values.includes(value) ? value : fallback;
  } catch { return fallback; }
}
function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Preferência mantida nesta sessão. */ }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readPreference(THEME_KEY, ["dark", "light", "system"], "dark"));
  const [density, setDensityState] = useState<Density>(() => readPreference(DENSITY_KEY, ["compact", "normal", "comfortable"], "normal"));
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      const root = document.documentElement;
      root.dataset.eiaTheme = resolved;
      root.classList.toggle("dark", resolved === "dark");
      root.classList.toggle("light", resolved === "light");
      root.style.colorScheme = resolved;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => { document.documentElement.dataset.density = density; }, [density]);
  const setTheme = (value: Theme) => { setThemeState(value); savePreference(THEME_KEY, value); };
  const setDensity = (value: Density) => { setDensityState(value); savePreference(DENSITY_KEY, value); };
  return <ThemeContext.Provider value={{ theme, setTheme, density, setDensity }}>{children}</ThemeContext.Provider>;
}
