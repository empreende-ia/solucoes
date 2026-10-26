import * as React from "react";
import * as Primitive from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
export { Tabs, TabsContent } from "@/components/ui/tabs";

export const TabsList = React.forwardRef<React.ElementRef<typeof Primitive.TabsList>, React.ComponentPropsWithoutRef<typeof Primitive.TabsList>>(({ className, ...props }, ref) => (
  <Primitive.TabsList ref={ref} className={cn("eia-tabs-list", className)} {...props} />
));
TabsList.displayName = "EiaTabsList";

export const TabsTrigger = React.forwardRef<React.ElementRef<typeof Primitive.TabsTrigger>, React.ComponentPropsWithoutRef<typeof Primitive.TabsTrigger>>(({ className, ...props }, ref) => (
  <Primitive.TabsTrigger ref={ref} className={cn("eia-tabs-trigger", className)} {...props} />
));
TabsTrigger.displayName = "EiaTabsTrigger";
