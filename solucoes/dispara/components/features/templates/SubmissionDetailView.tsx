import React, { useState } from 'react';
import { BatchSubmission, GeneratedTemplateWithStatus } from '../../../types';
import { Container } from '@/components/ui/container';
import {
    ArrowLeft, RefreshCw, Trash2, CheckCircle, AlertTriangle,
    XCircle, Filter, ChevronDown, ChevronRight, Zap, Eye, Copy,
    CheckSquare, Square
} from 'lucide-react';
import { WhatsAppPhonePreview } from '@/components/ui/WhatsAppPhonePreview';


interface SubmissionDetailViewProps {
    submission: BatchSubmission;
    onBack: () => void;
    onRefresh: () => void;
    onCleanMarketing: () => void;
    isLoading: boolean;
}

export function SubmissionDetailView({
    submission,
    onBack,
    onRefresh,
    onCleanMarketing,
    isLoading
}: SubmissionDetailViewProps) {
    const [expandedSection, setExpandedSection] = useState<'UTILITY' | 'MARKETING' | 'REJECTED' | 'PENDING' | 'ALL'>('ALL');
    const [selectedTemplate, setSelectedTemplate] = useState<GeneratedTemplateWithStatus | null>(null);

    // Group templates
    const groups = {
        UTILITY: submission.templates.filter(t => t.status === 'APPROVED' && t.category === 'UTILITY'),
        MARKETING: submission.templates.filter(t => t.status === 'APPROVED' && t.category === 'MARKETING'),
        REJECTED: submission.templates.filter(t => t.status === 'REJECTED'),
        PENDING: submission.templates.filter(t => t.status === 'PENDING'),
    };

    const sections = [
        { id: 'UTILITY', label: 'Aprovados como Utility', count: groups.UTILITY.length, color: 'purple', icon: CheckCircle },
        { id: 'MARKETING', label: 'Convertidos para Marketing', count: groups.MARKETING.length, color: 'yellow', icon: AlertTriangle },
        { id: 'REJECTED', label: 'Rejeitados', count: groups.REJECTED.length, color: 'red', icon: XCircle },
        { id: 'PENDING', label: 'Pendentes', count: groups.PENDING.length, color: 'slate', icon: Filter },
    ] as const;

    const sectionIconTone: Record<(typeof sections)[number]['color'], string> = {
        purple: 'text-primary-300',
        yellow: 'text-amber-300',
        red: 'text-amber-300',
        slate: 'text-[var(--ds-text-secondary)]',
    };

    return (
        <div className="flex h-[calc(100vh-140px)] gap-6">
            {/* --- LEFT SIDE: LIST & STATS --- */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* Header Actions */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="p-2 -ml-2 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-[var(--ds-text-primary)] flex items-center gap-2">
                                {submission.name}
                                <span className={`px-2 py-0.5 text-xs rounded-full border ${submission.status === 'processing'
                                    ? 'bg-primary-500/10 text-primary-200 border-primary-500/20'
                                    : 'bg-[var(--ds-bg-surface)]/30 text-[var(--ds-text-secondary)] border-[var(--ds-border-subtle)]'
                                    }`}>
                                    {submission.status === 'processing' ? 'Processando' : 'Concluído'}
                                </span>
                            </h1>
                            <p className="text-xs text-[var(--ds-text-secondary)] mt-1">
                                Criado em {new Date(submission.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={onRefresh}
                            disabled={isLoading}
                            className="px-3 py-2 bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] text-[var(--ds-text-primary)] rounded-lg hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            Atualizar Status
                        </button>

                        {(groups.MARKETING.length > 0 || groups.REJECTED.length > 0) && (
                            <button
                                onClick={onCleanMarketing}
                                className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-200 rounded-lg hover:bg-amber-500/15 transition-colors flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Limpar {groups.MARKETING.length + groups.REJECTED.length} não-Utility
                            </button>
                        )}
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <StatCard
                        label="Utility (Sucesso)"
                        count={groups.UTILITY.length}
                        total={submission.stats.total}
                        color="purple"
                        icon={CheckCircle}
                    />
                    <StatCard
                        label="Marketing (Convertidos)"
                        count={groups.MARKETING.length}
                        total={submission.stats.total}
                        color="yellow"
                        icon={AlertTriangle}
                    />
                    <StatCard
                        label="Rejeitados"
                        count={groups.REJECTED.length}
                        total={submission.stats.total}
                        color="red"
                        icon={XCircle}
                    />
                </div>

                {/* Template List */}
                <Container variant="default" padding="none" className="flex-1 overflow-y-auto">
                    {sections.map(section => {
                        if (section.count === 0) return null;

                        const isExpanded = expandedSection === 'ALL' || expandedSection === section.id;

                        return (
                            <div key={section.id} className="border-b border-[var(--ds-border-subtle)] last:border-0">
                                <button
                                    onClick={() => setExpandedSection(isExpanded && expandedSection !== 'ALL' ? 'ALL' : section.id)}
                                    className="w-full flex items-center justify-between p-4 hover:bg-[var(--ds-bg-hover)] transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <section.icon className={`w-5 h-5 ${sectionIconTone[section.color]}`} />
                                        <span className="font-medium text-[var(--ds-text-primary)]">{section.label}</span>
                                        <span className="px-2 py-0.5 rounded-full bg-[var(--ds-bg-surface)]/30 text-xs text-[var(--ds-text-secondary)] border border-[var(--ds-border-subtle)]">
                                            {section.count}
                                        </span>
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-[var(--ds-text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>

                                {isExpanded && (
                                    <div className="px-4 pb-4 space-y-2">
                                        {groups[section.id].map(template => (
                                            <div
                                                key={template.id}
                                                onClick={() => setSelectedTemplate(template)}
                                                className={`p-3 rounded-lg border transition-all cursor-pointer ${selectedTemplate?.id === template.id
                                                    ? 'bg-primary-500/10 border-primary-500/30 ring-1 ring-primary-500/40'
                                                    : 'bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] hover:border-[var(--ds-border-default)] hover:bg-[var(--ds-bg-hover)]'
                                                    }`}
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-sm font-medium text-[var(--ds-text-primary)] flex items-center gap-2">
                                                        {template.name}
                                                        {template.category !== template.originalCategory && (
                                                            <span className="text-[10px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                                                Mudou de Categoria
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="text-xs text-[var(--ds-text-muted)] flex items-center gap-1">
                                                        <Copy className="w-3 h-3" />
                                                        {template.language}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-[var(--ds-text-secondary)] line-clamp-2">
                                                    {template.content}
                                                </p>
                                                {template.rejectionReason && (
                                                    <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-200">
                                                        {template.rejectionReason}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </Container>
            </div>

            {/* --- RIGHT SIDE: PREVIEW --- */}
            <div className="w-[380px] shrink-0 border-l border-[var(--ds-border-subtle)] pl-6 flex flex-col justify-center">
                {selectedTemplate ? (
                    <div className="sticky top-6">
                        <h3 className="text-sm font-medium text-[var(--ds-text-secondary)] mb-4 text-center">
                            Pré-visualização
                        </h3>
                        <WhatsAppPhonePreview
                            components={[
                                selectedTemplate.header ? { type: 'HEADER' as const, ...selectedTemplate.header } : null,
                                { type: 'BODY' as const, text: selectedTemplate.content },
                                selectedTemplate.footer ? { type: 'FOOTER' as const, ...selectedTemplate.footer } : null,
                                selectedTemplate.buttons?.length ? { type: 'BUTTONS' as const, buttons: selectedTemplate.buttons } : null
                            ].filter((c): c is any => Boolean(c))}
                            fallbackContent={selectedTemplate.content}
                            variables={['Variável 1', 'Variável 2', 'Variável 3']} // Shows placeholder variables
                            size="md"
                        />
                        <Container variant="default" padding="md" className="mt-6">
                            <h4 className="text-sm font-medium text-[var(--ds-text-primary)] mb-2">Detalhes Técnicos</h4>
                            <div className="space-y-2 text-xs text-[var(--ds-text-secondary)]">
                                <div className="flex justify-between">
                                    <span>Categoria:</span>
                                    <span className={selectedTemplate.category === 'UTILITY' ? 'text-primary-300' : 'text-amber-300'}>
                                        {selectedTemplate.category}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Status Meta:</span>
                                    <span>{selectedTemplate.status}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>ID:</span>
                                    <span className="font-mono">{selectedTemplate.id.slice(0, 8)}...</span>
                                </div>
                            </div>
                        </Container>
                    </div>
                ) : (
                    <Container variant="default" padding="none" className="h-full flex flex-col items-center justify-center text-[var(--ds-text-muted)] border-dashed">
                        <Eye className="w-12 h-12 mb-4 opacity-50" />
                        <p className="text-sm">Selecione um template para visualizar</p>
                    </Container>
                )}
            </div>
        </div>
    );
}

interface StatCardProps {
    /** Display label for the stat */
    label: string
    /** Current count value */
    count: number
    /** Total value for percentage calculation */
    total: number
    /** Color theme for the card */
    color: 'purple' | 'yellow' | 'red' | 'slate'
    /** Icon component to display */
    icon: React.ComponentType<{ className?: string }>
}

function StatCard({ label, count, total, color, icon: Icon }: StatCardProps) {
    const percent = Math.round((count / total) * 100) || 0;

    const colors: Record<StatCardProps['color'], string> = {
        purple: 'text-primary-300 bg-primary-500/10 border-primary-500/20',
        yellow: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
        red: 'text-amber-200 bg-amber-500/10 border-amber-500/20',
        slate: 'text-[var(--ds-text-secondary)] bg-slate-500/10 border-[var(--ds-border-subtle)]',
    };

    return (
        <div className={`p-4 rounded-2xl border shadow-[0_12px_30px_rgba(0,0,0,0.35)] ${colors[color]}`}>
            <div className="flex justify-between items-start mb-2">
                <Icon className="w-5 h-5" />
                <span className="text-2xl font-bold">{count}</span>
            </div>
            <div className="flex justify-between items-end">
                <span className="text-xs opacity-80">{label}</span>
                <span className="text-xs font-mono">{percent}%</span>
            </div>
        </div>
    );
}
