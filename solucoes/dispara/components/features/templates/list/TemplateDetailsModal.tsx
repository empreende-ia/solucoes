'use client';

import React from 'react';
import { X, Loader2, AlertTriangle, Trash2, RefreshCw, Copy } from 'lucide-react';
import { Template } from '../../../../types';
import { StatusBadge } from './StatusBadge';
import { TemplateDetails } from './types';
import { WhatsAppPhonePreview } from '@/components/ui/WhatsAppPhonePreview';

export interface TemplateDetailsModalProps {
  isOpen: boolean;
  template: Template | null;
  details: TemplateDetails | null;
  isLoading: boolean;
  isRefreshingPreview: boolean;
  onClose: () => void;
  onDelete: () => void;
  onRefreshPreview?: () => void;
}

const PREVIEW_VARIABLES = ['Joao', '19:00', '01/12', 'R$ 99,90', '#12345'];

export const TemplateDetailsModal: React.FC<TemplateDetailsModalProps> = ({
  isOpen,
  template,
  details,
  isLoading,
  isRefreshingPreview,
  onClose,
  onDelete,
  onRefreshPreview,
}) => {
  if (!isOpen || !template) return null;

  // Generate preview with smart examples
  let previewContent = template.content;
  previewContent = previewContent
    .replace(/\{\{1\}\}/g, 'Joao')
    .replace(/\{\{2\}\}/g, '19:00')
    .replace(/\{\{3\}\}/g, '01/12')
    .replace(/\{\{4\}\}/g, 'R$ 99,90')
    .replace(/\{\{5\}\}/g, '#12345');

  const headerFormat = template.components?.find((c) => c.type === 'HEADER')?.format;
  const canRefreshPreview = Boolean(
    headerFormat && ['IMAGE', 'VIDEO', 'DOCUMENT', 'GIF'].includes(String(headerFormat).toUpperCase())
  );

  // Only show rejection if real (not "NONE")
  const hasRejection =
    details?.rejectedReason &&
    details.rejectedReason !== 'NONE' &&
    details.rejectedReason.trim() !== '';

  // Only show quality if known
  const hasQuality = details?.qualityScore && details.qualityScore !== 'UNKNOWN';

  const handleCopyContent = () => {
    navigator.clipboard.writeText(template.content);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-2xl w-full max-w-md p-0 shadow-[0_30px_80px_rgba(0,0,0,0.55)] animate-in zoom-in duration-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--ds-border-subtle)] flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-[var(--ds-text-primary)]">{template.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={template.status} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-primary-300" />
            </div>
          ) : (
            <>
              {/* Rejection alert - only if exists */}
              {hasRejection && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-amber-200 font-bold text-sm mb-1">
                    <AlertTriangle size={14} />
                    Rejeitado
                  </div>
                  <p className="text-amber-200 text-xs">{details?.rejectedReason}</p>
                </div>
              )}

              {/* WhatsApp Preview - THE FOCUS */}
              <div className="bg-[#0b141a] rounded-xl p-3">
                <WhatsAppPhonePreview
                  components={template.components}
                  fallbackContent={previewContent}
                  parameterFormat={template.parameterFormat || 'positional'}
                  variables={PREVIEW_VARIABLES}
                  headerVariables={PREVIEW_VARIABLES}
                  headerMediaPreviewUrl={
                    template.headerMediaPreviewUrl ||
                    details?.headerMediaPreviewUrl ||
                    null
                  }
                  size="md"
                />
              </div>

              {/* Quality - only if known */}
              {hasQuality && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg ${
                    details?.qualityScore === 'HIGH'
                      ? 'bg-primary-500/10 text-primary-200'
                      : details?.qualityScore === 'MEDIUM'
                        ? 'bg-amber-500/10 text-amber-200'
                        : 'bg-slate-500/10 text-[var(--ds-text-secondary)]'
                  }`}
                >
                  <span className="text-lg">
                    {details?.qualityScore === 'HIGH'
                      ? String.fromCodePoint(0x1f7e2)
                      : details?.qualityScore === 'MEDIUM'
                        ? String.fromCodePoint(0x1f7e1)
                        : String.fromCodePoint(0x1f534)}
                  </span>
                  <span className="text-sm font-medium">
                    Qualidade {details?.qualityScore?.toLowerCase()}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with actions */}
        <div className="px-6 py-4 border-t border-[var(--ds-border-subtle)] flex gap-2">
          <button
            onClick={onDelete}
            className="p-2 text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors"
            title="Deletar"
          >
            <Trash2 size={18} />
          </button>
          {canRefreshPreview && onRefreshPreview && (
            <button
              onClick={onRefreshPreview}
              disabled={isRefreshingPreview || isLoading}
              className="px-3 py-2 bg-[var(--ds-bg-surface)]/30 text-[var(--ds-text-primary)] border border-[var(--ds-border-subtle)] rounded-lg font-medium hover:bg-[var(--ds-bg-hover)] transition-colors flex items-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              title="Regerar preview da midia"
            >
              {isRefreshingPreview ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Regerar preview
            </button>
          )}
          <button
            onClick={handleCopyContent}
            className="flex-1 py-2 bg-[var(--ds-bg-surface)]/30 text-[var(--ds-text-primary)] border border-[var(--ds-border-subtle)] rounded-lg font-medium hover:bg-[var(--ds-bg-hover)] transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <Copy size={16} />
            Copiar código
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white text-black rounded-lg font-semibold hover:bg-slate-200 transition-colors text-sm"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
