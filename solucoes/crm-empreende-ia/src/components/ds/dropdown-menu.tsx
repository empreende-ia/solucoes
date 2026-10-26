import * as React from "react";
import * as Primitive from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuRadioGroup } from "@/components/ui/dropdown-menu";

export const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof Primitive.DropdownMenuContent>, React.ComponentPropsWithoutRef<typeof Primitive.DropdownMenuContent>>(({ className, ...props }, ref) => (
  <Primitive.DropdownMenuContent ref={ref} className={cn("eia-overlay", className)} {...props} />
));
DropdownMenuContent.displayName = "EiaDropdownMenuContent";

export const DropdownMenuSubContent = React.forwardRef<React.ElementRef<typeof Primitive.DropdownMenuSubContent>, React.ComponentPropsWithoutRef<typeof Primitive.DropdownMenuSubContent>>(({ className, ...props }, ref) => (
  <Primitive.DropdownMenuSubContent ref={ref} className={cn("eia-overlay", className)} {...props} />
));
DropdownMenuSubContent.displayName = "EiaDropdownMenuSubContent";
