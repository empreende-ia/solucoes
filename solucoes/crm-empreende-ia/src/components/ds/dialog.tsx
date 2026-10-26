import * as React from "react";
import * as Primitive from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const DialogContent = React.forwardRef<React.ElementRef<typeof Primitive.DialogContent>, React.ComponentPropsWithoutRef<typeof Primitive.DialogContent>>(({ className, ...props }, ref) => (
  <Primitive.DialogContent ref={ref} className={cn("eia-overlay", className)} {...props} />
));
DialogContent.displayName = "EiaDialogContent";
