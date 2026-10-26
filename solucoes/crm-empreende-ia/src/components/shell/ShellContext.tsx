import { createContext, useContext } from "react";

interface ShellContextType {
  /** Abre a paleta de comandos global (⌘K). */
  openSearch: () => void;
}

export const ShellContext = createContext<ShellContextType>({ openSearch: () => {} });

export const useShell = () => useContext(ShellContext);
