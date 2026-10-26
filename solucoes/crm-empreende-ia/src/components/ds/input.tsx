import * as React from "react";
import * as Primitive from "@/components/ui/input";
import { cn } from "@/lib/utils";


export const Input = React.forwardRef<React.ElementRef<typeof Primitive.Input>, React.ComponentPropsWithoutRef<typeof Primitive.Input>>(({ className, ...props }, ref) => (
  <Primitive.Input ref={ref} className={cn("eia-input", className)} {...props} />
));
Input.displayName = "EiaInput";
