import React from 'react';
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Adapter sobre os tokens do design system Empreende.IA.
// Mantém a API legada (primary/secondary/outline/ghost/danger + sm/md/lg/icon)
// usada nas telas de negócio; novos componentes devem preferir ui/button.
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-[-0.005em] transition-all duration-200 ease-eia-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "eia-btn-primary",
        secondary: "bg-card/80 text-foreground border border-border shadow-xs backdrop-blur-sm hover:-translate-y-px hover:border-primary/20 hover:bg-card hover:shadow-sm",
        outline: "border border-border bg-transparent text-foreground hover:-translate-y-px hover:border-primary/20 hover:bg-accent/70",
        ghost: "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
        danger: "bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20",
        default: "bg-secondary text-secondary-foreground border border-border hover:bg-accent",
      },
      size: {
        sm: "h-8 px-4 text-xs",
        md: "h-10 px-5 py-2 text-sm",
        lg: "h-12 px-8 text-sm",
        icon: "h-10 w-10 p-2",
        default: "h-10 px-4 py-2 text-sm",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  className?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant, size, className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
