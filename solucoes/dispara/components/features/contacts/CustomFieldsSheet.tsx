import React, { useState } from 'react';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { Type } from 'lucide-react';
import { CustomFieldsManager } from './CustomFieldsManager';
import type { CustomFieldDefinition } from '@/types';

interface CustomFieldsSheetProps {
    children?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    entityType?: 'contact' | 'deal';
    onFieldCreated?: (field: CustomFieldDefinition) => void;
    onFieldDeleted?: (id: string) => void;
}

export function CustomFieldsSheet({
    children,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    entityType = 'contact',
    onFieldCreated,
    onFieldDeleted
}: CustomFieldsSheetProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? controlledOnOpenChange : setInternalOpen;



    return (
        <Sheet open={open} onOpenChange={setOpen}>
            {children && <SheetTrigger asChild>{children}</SheetTrigger>}
            <SheetContent className="sm:max-w-md w-full overflow-y-auto bg-[var(--ds-bg-elevated)] border-l border-[var(--ds-border-subtle)] p-0 flex flex-col sm:w-135">
                <SheetHeader className="p-6 border-b border-[var(--ds-border-subtle)]">
                    <SheetTitle className="text-[var(--ds-text-primary)] flex items-center gap-2">
                        <div className="p-2 bg-primary-500/10 rounded-lg text-primary-500">
                            <Type size={18} />
                        </div>
                        Gerenciar Campos
                    </SheetTitle>
                    <SheetDescription className="text-[var(--ds-text-secondary)]">
                        Crie campos para armazenar dados específicos dos seus contatos.
                    </SheetDescription>
                </SheetHeader>

                <CustomFieldsManager
                    entityType={entityType}
                    onFieldCreated={onFieldCreated}
                    onFieldDeleted={onFieldDeleted}
                />
            </SheetContent>
        </Sheet>
    );
}
