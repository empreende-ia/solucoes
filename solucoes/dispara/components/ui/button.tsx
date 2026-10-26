import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Button variants usando Design System
 *
 * Mudanças do DS:
 * - Transição usando --ds-transition-fast (150ms ease-out)
 * - Sombras compostas do DS ao invés de shadow-black/5
 * - glow emerald no hover para variante default (primary)
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: [
          "bg-primary text-primary-foreground",
          "[box-shadow:var(--ds-shadow-button)]",
          "hover:bg-primary/90 hover:[box-shadow:var(--ds-shadow-button-hover)]",
          "[transition:var(--ds-transition-fast)]",
        ].join(" "),
        destructive: [
          "bg-destructive text-destructive-foreground",
          "[box-shadow:var(--ds-shadow-button)]",
          "hover:bg-destructive/90 hover:[box-shadow:var(--ds-shadow-button-hover)]",
          "[transition:var(--ds-transition-fast)]",
        ].join(" "),
        outline: [
          "border border-input bg-background",
          "[box-shadow:var(--ds-shadow-button)]",
          "hover:bg-accent hover:text-accent-foreground hover:[box-shadow:var(--ds-shadow-button-hover)]",
          "[transition:var(--ds-transition-fast)]",
        ].join(" "),
        secondary: [
          "bg-secondary text-secondary-foreground",
          "[box-shadow:var(--ds-shadow-button)]",
          "hover:bg-secondary/80 hover:[box-shadow:var(--ds-shadow-button-hover)]",
          "[transition:var(--ds-transition-fast)]",
        ].join(" "),
        ghost: [
          "hover:bg-accent hover:text-accent-foreground",
          "[transition:var(--ds-transition-fast)]",
        ].join(" "),
        // Ghost destructive para ações destrutivas sutis (ex: botão de lixeira)
        "ghost-destructive": [
          "text-[var(--ds-text-secondary)] hover:text-red-400 hover:bg-red-500/10",
          "[transition:var(--ds-transition-fast)]",
        ].join(" "),
        link: "text-primary underline-offset-4 hover:underline",
        // Nova variante brand com glow emerald
        brand: [
          "bg-primary-600 text-white border border-primary-600",
          "[box-shadow:var(--ds-shadow-button-primary)]",
          "hover:bg-primary-500 hover:border-primary-500 hover:[box-shadow:var(--ds-shadow-button-primary-hover)]",
          "[transition:var(--ds-transition-fast)]",
        ].join(" "),
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-lg px-8",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
