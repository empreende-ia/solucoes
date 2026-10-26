'use client';

import React from 'react';
import { Template } from '../../../../types';
import { TemplatePreviewCard } from '@/components/ui/TemplatePreviewCard';

export interface TemplateHoverPreviewProps {
  template: Template | null;
  variables?: string[];
}

const DEFAULT_VARIABLES = ['Joao', '19:00', '01/12', 'R$ 99,90', '#12345'];

export const TemplateHoverPreview: React.FC<TemplateHoverPreviewProps> = ({
  template,
  variables = DEFAULT_VARIABLES,
}) => {
  if (!template) return null;

  return (
    <div className="pointer-events-none hidden xl:block fixed right-96 top-52 z-40 w-90 animate-in fade-in-0 zoom-in-95 duration-150">
      <TemplatePreviewCard
        templateName={template.name}
        components={template.components}
        fallbackContent={template.content}
        parameterFormat={template.parameterFormat || 'positional'}
        variables={variables}
        headerMediaPreviewUrl={template.headerMediaPreviewUrl || null}
        className="!bg-[var(--ds-bg-elevated)] !backdrop-blur-none shadow-2xl shadow-black/50 ring-1 ring-[var(--ds-border-subtle)]"
      />
    </div>
  );
};
