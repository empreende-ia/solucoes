import * as React from "react";
import * as Primitive from "@/components/ui/textarea";
import { cn } from "@/lib/utils";


export const Textarea = React.forwardRef<React.ElementRef<typeof Primitive.Textarea>, React.ComponentPropsWithoutRef<typeof Primitive.Textarea>>(({ className, ...props }, ref) => (
  <Primitive.Textarea ref={ref} className={cn("eia-input", className)} {...props} />
));
Textarea.displayName = "EiaTextarea";
