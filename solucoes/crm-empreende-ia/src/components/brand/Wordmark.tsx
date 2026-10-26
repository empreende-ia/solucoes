import { cn } from "@/lib/utils";

interface WordmarkProps {
  variant?: "full" | "compact" | "wordmark" | "icon";
  className?: string;
  wordClassName?: string;
  onDark?: boolean;
}
export function BrandGlyph({ className }: { className?: string }) {
  return <span className={cn("eia-brand-icon inline-flex shrink-0", className)} aria-hidden="true">
    <img src="/brand/original/eia-app-icon.svg" alt="" className="h-full w-full object-contain" />
  </span>;
}
/** Assinatura oficial: proporções e desenho preservados nos SVGs do DS. */
export default function Wordmark({ variant = "full", className, wordClassName, onDark = false }: WordmarkProps) {
  if (variant === "icon") return <BrandGlyph className={cn("h-10 w-10", className)} />;
  return <span className={cn("eia-wordmark inline-flex flex-col items-start", onDark && "eia-wordmark-on-dark", className)}>
    <span className={cn("relative block", variant === "compact" ? "w-32" : "w-44", wordClassName)}>
      <img src="/brand/eia-light.svg" alt="Empreende.IA" className="eia-logo-for-dark h-auto w-full" />
      <img src="/brand/eia-dark.svg" alt="Empreende.IA" className="eia-logo-for-light h-auto w-full" />
    </span>
    {variant === "full" && <span className="mt-2 text-xs font-medium text-muted-foreground">CRM</span>}
  </span>;
}
