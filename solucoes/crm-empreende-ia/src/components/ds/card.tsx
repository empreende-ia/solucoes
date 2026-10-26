import * as React from "react";
import * as Primitive from "@/components/ui/card";
import { cn } from "@/lib/utils";
export { CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export const Card = React.forwardRef<React.ElementRef<typeof Primitive.Card>, React.ComponentPropsWithoutRef<typeof Primitive.Card>>(({ className, ...props }, ref) => (
  <Primitive.Card ref={ref} className={cn("eia-panel", className)} {...props} />
));
Card.displayName = "EiaCard";
