import * as React from "react";
import * as Primitive from "@/components/ui/select";
import { cn } from "@/lib/utils";
export { Select, SelectGroup, SelectValue, SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton } from "@/components/ui/select";

export const SelectTrigger = React.forwardRef<React.ElementRef<typeof Primitive.SelectTrigger>, React.ComponentPropsWithoutRef<typeof Primitive.SelectTrigger>>(({ className, ...props }, ref) => (
  <Primitive.SelectTrigger ref={ref} className={cn("eia-input", className)} {...props} />
));
SelectTrigger.displayName = "EiaSelectTrigger";

export const SelectContent = React.forwardRef<React.ElementRef<typeof Primitive.SelectContent>, React.ComponentPropsWithoutRef<typeof Primitive.SelectContent>>(({ className, ...props }, ref) => (
  <Primitive.SelectContent ref={ref} className={cn("eia-overlay", className)} {...props} />
));
SelectContent.displayName = "EiaSelectContent";
