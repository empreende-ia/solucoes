'use client';

import { Sparkles, X, Copy, Check, Loader2 } from 'lucide-react';
import { GeneratedTemplate } from '@/hooks/useAITemplateGenerator';

interface AIGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  
  // Form
  prompt: string;
  setPrompt: (value: string) => void;
  quantity: number;
  setQuantity: (value: number) => void;
  language: string;
  setLanguage: (value: string) => void;
  
  // Results
  generatedTemplates: GeneratedTemplate[];
  selectedTemplates: Set<string>;
  
  // Actions
  onGenerate: () => void;
  onToggleTemplate: (id: string) => void;
  onSelectAll: () => void;
  onCopyTemplate: (template: GeneratedTemplate) => void;
  onExport: () => void;
  
  // Loading
  isGenerating: boolean;
  isExporting?: boolean;
  
  // Customization
  exportButtonText?: string;
  title?: string;
}

export const AIGeneratorModal = ({
  isOpen,
  onClose,
  prompt,
  setPrompt,
  quantity,
  setQuantity,
  language,
  setLanguage,
  generatedTemplates,
  selectedTemplates,
  onGenerate,
  onToggleTemplate,
  onSelectAll,
  onCopyTemplate,
  onExport,
  isGenerating,
  isExporting = false,
  exportButtonText = 'Exportar para Meta',
  title = 'Gerar Templates com IA'
}: AIGeneratorModalProps) => {
  if (!isOpen) return null;

  const hasTemplates = generatedTemplates.length > 0;
  const selectedCount = selectedTemplates.size;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary-300" />
            <h2 className="text-lg font-medium text-[var(--ds-text-primary)]">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Input Form - Always visible */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--ds-text-secondary)] mb-2">
                O que você precisa? Seja específico para melhores resultados
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex: Sou dono de uma pizzaria delivery e preciso de templates para confirmar pedidos, avisar sobre tempo de entrega, e informar quando o motoboy saiu..."
                className="w-full h-32 px-4 py-3 bg-[var(--ds-bg-surface)]/30 rounded-xl border border-[var(--ds-border-subtle)] focus:border-primary-500/50 focus:outline-none resize-none text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]"
              />
              <p className="text-xs text-[var(--ds-text-muted)] mt-1">
                Mínimo 10 caracteres. Quanto mais detalhes, melhor a IA entende seu negócio.
              </p>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm text-[var(--ds-text-secondary)] mb-2">
                  Quantidade
                </label>
                <select
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full h-11 px-4 bg-[var(--ds-bg-surface)]/30 rounded-xl border border-[var(--ds-border-subtle)] focus:border-primary-500/50 focus:outline-none text-[var(--ds-text-primary)]"
                >
                  <option value={3}>3 templates</option>
                  <option value={5}>5 templates</option>
                  <option value={7}>7 templates</option>
                  <option value={10}>10 templates</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm text-[var(--ds-text-secondary)] mb-2">
                  Idioma
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full h-11 px-4 bg-[var(--ds-bg-surface)]/30 rounded-xl border border-[var(--ds-border-subtle)] focus:border-primary-500/50 focus:outline-none text-[var(--ds-text-primary)]"
                >
                  <option value="pt_BR">Português (BR)</option>
                  <option value="en_US">English (US)</option>
                  <option value="es">Español</option>
                </select>
              </div>
            </div>

            <button
              onClick={onGenerate}
              disabled={isGenerating || prompt.length < 10}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-black rounded-lg transition-colors font-semibold hover:bg-slate-200 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Gerando templates...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 text-primary-600" />
                  Gerar Templates
                </>
              )}
            </button>
          </div>

          {/* Generated Templates List */}
          {hasTemplates && (
            <div className="border-t border-[var(--ds-border-subtle)] pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-[var(--ds-text-secondary)]">
                  Templates Gerados ({generatedTemplates.length})
                </h3>
                <button
                  onClick={onSelectAll}
                  className="text-sm text-primary-200 hover:text-primary-100"
                >
                  {selectedTemplates.size === generatedTemplates.length
                    ? 'Desmarcar todos'
                    : 'Selecionar todos'}
                </button>
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {generatedTemplates.map((template) => (
                  <div
                    key={template.id}
                    className={`p-3 rounded-lg border transition-colors ${
                      selectedTemplates.has(template.id)
                        ? 'bg-primary-500/10 border-primary-500/30'
                        : 'bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] hover:border-[var(--ds-border-default)]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => onToggleTemplate(template.id)}
                        className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                          selectedTemplates.has(template.id)
                            ? 'bg-primary-500 border-primary-500'
                            : 'border-[var(--ds-border-default)] hover:border-white/40'
                        }`}
                      >
                        {selectedTemplates.has(template.id) && (
                          <Check className="h-3 w-3 text-white" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-[var(--ds-text-primary)]">
                            {template.name}
                          </span>
                          <button
                            onClick={() => onCopyTemplate(template)}
                            className="p-1 hover:bg-[var(--ds-bg-hover)] rounded transition-colors"
                            title="Copiar"
                          >
                            <Copy className="h-4 w-4 text-[var(--ds-text-secondary)]" />
                          </button>
                        </div>
                        <p className="text-sm text-[var(--ds-text-secondary)] whitespace-pre-wrap">
                          {template.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer - Only when templates exist */}
        {hasTemplates && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30">
            <span className="text-sm text-[var(--ds-text-secondary)]">
              {selectedCount} de {generatedTemplates.length} selecionados
            </span>
            <button
              onClick={onExport}
              disabled={selectedCount === 0 || isExporting}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-black hover:bg-primary-400 disabled:opacity-50 rounded-lg transition-colors font-semibold"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Exportando...
                </>
              ) : (
                exportButtonText
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
