import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface ShortcutHandlers {
  onNewContact?: () => void;
  onNewDeal?: () => void;
  onNewTask?: () => void;
  onOpenSearch?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers = {}) {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable) return;

      switch (e.key.toLowerCase()) {
        case "n":
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); handlers.onNewContact?.(); }
          break;
        case "d":
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); handlers.onNewDeal?.(); }
          break;
        case "t":
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); handlers.onNewTask?.(); }
          break;
        case "/":
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); handlers.onOpenSearch?.(); }
          break;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handlers, navigate]);
}
