import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Input com Design System
 *
 * Mudanças do DS:
 * - Focus ring usando --ds-shadow-input-focus (glow emerald)
 * - Border focus usando --ds-border-focus
 * - Transição suave usando --ds-transition-fast
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Classes do Langflow para impedir que ReactFlow capture eventos
        "nopan nodelete nodrag noflow nowheel",
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "[transition:var(--ds-transition-fast)]",
        "focus-visible:[border-color:var(--ds-border-focus)] focus-visible:[box-shadow:var(--ds-shadow-input-focus)]",
        "aria-invalid:[box-shadow:var(--ds-glow-error-ring)] aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
