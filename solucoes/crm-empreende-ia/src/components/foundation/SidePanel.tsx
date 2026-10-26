import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const WIDTHS = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
} as const;

interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Rótulo pequeno acima do título (contexto, ex.: "Serviços") */
  kicker?: string;
  footer?: React.ReactNode;
  width?: keyof typeof WIDTHS;
  children: React.ReactNode;
  contentClassName?: string;
}

/**
 * Painel lateral padrão pra criar/editar/detalhar — substitui o modal central de CRUD.
 * Header fixo, corpo scrollável, footer sticky com ações à direita.
 */
export const SidePanel: React.FC<SidePanelProps> = ({
  open,
  onOpenChange,
  title,
  description,
  kicker,
  footer,
  width = 'md',
  children,
  contentClassName,
}) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className={cn('eia-side-panel flex w-full flex-col gap-0 p-0', WIDTHS[width])}>
      <SheetHeader className="shrink-0 space-y-0.5 border-b border-border px-6 py-4 text-left">
        {kicker && (
          <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
            {kicker}
          </span>
        )}
        <SheetTitle className="text-base font-semibold">{title}</SheetTitle>
        {description && <SheetDescription className="text-xs">{description}</SheetDescription>}
      </SheetHeader>
      <div className={cn('flex-1 overflow-y-auto px-6 py-5', contentClassName)}>{children}</div>
      {footer && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-4">
          {footer}
        </div>
      )}
    </SheetContent>
  </Sheet>
);

export default SidePanel;
