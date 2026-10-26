'use client';

import React, { useState, useEffect } from 'react';
import { FileText, X, Loader2 } from 'lucide-react';
import { Template } from '@/types';
import { TemplatePreviewRenderer } from '@/components/features/templates/TemplatePreviewRenderer';
import { templateService } from '@/services/templateService';
import { TemplatePreviewModalProps } from './types';

export const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({
  isOpen,
  onClose,
  templateName,
}) => {
  const [template, setTemplate] = useState<Template | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && templateName) {
      setIsLoading(true);
      templateService.getAll().then(templates => {
        const found = templates.find(t => t.name === templateName);
        setTemplate(found || null);
        setIsLoading(false);
      }).catch(() => {
        setTemplate(null);
        setIsLoading(false);
      });
    }
  }, [isOpen, templateName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--ds-border-subtle)]">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-primary-400" />
            <h3 className="text-lg font-bold text-[var(--ds-text-primary)]">{templateName}</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors">
            <X size={18} className="text-[var(--ds-text-secondary)]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 bg-[#0b141a] max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
            </div>
          ) : template ? (
            <TemplatePreviewRenderer components={template.components} />
          ) : (
            <p className="text-[var(--ds-text-muted)] text-center py-8">Template nao encontrado</p>
          )}
        </div>
      </div>
    </div>
  );
};
