import * as React from "react";
import * as Primitive from "@/components/ui/popover";
import { cn } from "@/lib/utils";
export { Popover, PopoverTrigger } from "@/components/ui/popover";

export const PopoverContent = React.forwardRef<React.ElementRef<typeof Primitive.PopoverContent>, React.ComponentPropsWithoutRef<typeof Primitive.PopoverContent>>(({ className, ...props }, ref) => (
  <Primitive.PopoverContent ref={ref} className={cn("eia-overlay", className)} {...props} />
));
PopoverContent.displayName = "EiaPopoverContent";
