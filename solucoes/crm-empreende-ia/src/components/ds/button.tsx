import * as React from "react";
import { Button as PrimitiveButton, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export type { ButtonProps };
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "default", size = "default", ...props }, ref) => (
  <PrimitiveButton ref={ref} variant={variant} size={size} className={cn("eia-button", `eia-button-${variant}`, `eia-button-size-${size}`, className)} {...props} />
));
Button.displayName = "EiaButton";
