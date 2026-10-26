import React from 'react';
import { BatchSubmission } from '../../../types';
import { Container } from '@/components/ui/container';
import { ChevronRight, Trash2, Clock, CheckCircle, AlertTriangle, XCircle, Loader2 } from 'lucide-react';

interface BatchSubmissionListProps {
    submissions: BatchSubmission[];
    onSelectSubmission: (id: string) => void;
    onDeleteSubmission: (id: string) => void;
    isLoading?: boolean;
    hourlyCount: number; // New prop
}

export function BatchSubmissionList({
    submissions,
    onSelectSubmission,
    onDeleteSubmission,
    isLoading,
    hourlyCount
}: BatchSubmissionListProps) {
    // ... logic ...

    // Reuse the empty state if no submissions, but maybe show the limit there too?
    // Let's add the indicator above the table if submissions exist.

    // Actually, user wants it on "main screen".
    // I will add a header section above the table.

    if (isLoading && submissions.length === 0) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
        );
    }

    if (submissions.length === 0) {
        return (
            <Container variant="default" padding="none" className="flex flex-col items-center justify-center py-16 px-4 border-dashed">
                <div className="w-16 h-16 rounded-full bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] flex items-center justify-center mb-4">
                    <Clock className="w-8 h-8 text-[var(--ds-text-muted)]" />
                </div>
                <h3 className="text-lg font-medium text-[var(--ds-text-primary)] mb-2">Nenhuma submissão ainda</h3>
                <p className="text-[var(--ds-text-secondary)] text-center max-w-md mb-6">
                    Gere sua primeira levas de templates para começar a fábrica.
                </p>
            </Container>
        );
    }

    return (
        <div className="space-y-6">
            {/* Rate Limit Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Container variant="default" padding="md" className="flex items-center justify-between">
                    <div>
                        <p className="text-[var(--ds-text-secondary)] text-xs font-medium uppercase tracking-wider mb-1">Cota por Hora</p>
                        <h3 className={`text-2xl font-bold ${hourlyCount >= 100 ? 'text-amber-300' : 'text-[var(--ds-text-primary)]'}`}>
                            {hourlyCount}<span className="text-[var(--ds-text-muted)] text-base">/100</span>
                        </h3>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] flex items-center justify-center">
                        <Clock className={`w-5 h-5 ${hourlyCount >= 80 ? 'text-amber-300' : 'text-primary-300'}`} />
                    </div>
                </Container>
            </div>

            <Container variant="default" padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30">
                                <th className="px-6 py-4 text-xs font-semibold text-[var(--ds-text-secondary)] uppercase tracking-widest">Nome</th>
                                <th className="px-6 py-4 text-xs font-semibold text-[var(--ds-text-secondary)] uppercase tracking-widest">Progresso</th>
                                <th className="px-6 py-4 text-xs font-semibold text-[var(--ds-text-secondary)] uppercase tracking-widest text-center">Gerados</th>
                                <th className="px-6 py-4 text-xs font-semibold text-[var(--ds-text-secondary)] uppercase tracking-widest text-center">Utility</th>
                                <th className="px-6 py-4 text-xs font-semibold text-[var(--ds-text-secondary)] uppercase tracking-widest text-center">Mkt</th>
                                <th className="px-6 py-4 text-xs font-semibold text-[var(--ds-text-secondary)] uppercase tracking-widest">Criado Em</th>
                                <th className="px-6 py-4 text-xs font-semibold text-[var(--ds-text-secondary)] uppercase tracking-widest text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                            {submissions.map((submission) => {
                                const isProcessing = submission.status === 'processing';

                                // Progress Bar Logic
                                const total = submission.stats.total;
                                const utilityPercent = (submission.stats.utility / total) * 100;
                                const marketingPercent = (submission.stats.marketing / total) * 100;
                                const rejectedPercent = (submission.stats.rejected / total) * 100;
                                const pendingPercent = (submission.stats.pending / total) * 100;

                                return (
                                    <tr
                                        key={submission.id}
                                        className="group hover:bg-[var(--ds-bg-hover)] transition-colors cursor-pointer"
                                        onClick={() => onSelectSubmission(submission.id)}
                                    >
                                        <td className="px-6 py-4 max-w-[300px]">
                                            <div className="flex items-center gap-3">
                                                <div className="min-w-0">
                                                    <h3 className="font-medium text-[var(--ds-text-primary)] group-hover:text-primary-200 transition-colors truncate max-w-[280px]" title={submission.name}>
                                                        {submission.name}
                                                    </h3>
                                                    <span className="text-xs text-[var(--ds-text-muted)]">
                                                        {isProcessing ? 'Processando...' : 'Concluído'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-6 py-4 w-48">
                                            <div className="h-2 w-full bg-[var(--ds-bg-surface)]/40 rounded-full overflow-hidden flex">
                                                <div style={{ width: `${utilityPercent}%` }} className="bg-primary-500 transition-all duration-500" />
                                                <div style={{ width: `${marketingPercent}%` }} className="bg-amber-500 transition-all duration-500" />
                                                <div style={{ width: `${rejectedPercent}%` }} className="bg-amber-700 transition-all duration-500" />
                                                <div style={{ width: `${pendingPercent}%` }} className="bg-slate-700 animate-pulse" />
                                            </div>
                                        </td>

                                        <td className="px-6 py-4 text-center">
                                            <span className="text-sm text-[var(--ds-text-secondary)] font-medium">{submission.stats.total}</span>
                                        </td>

                                        <td className="px-6 py-4 text-center">
                                            {submission.stats.utility > 0 ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-500/10 text-primary-300 border border-primary-500/20">
                                                    {submission.stats.utility}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-[var(--ds-text-muted)]">-</span>
                                            )}
                                        </td>

                                        <td className="px-6 py-4 text-center">
                                            {submission.stats.marketing > 0 ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                                    {submission.stats.marketing}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-[var(--ds-text-muted)]">-</span>
                                            )}
                                        </td>

                                        <td className="px-6 py-4 text-sm text-[var(--ds-text-secondary)] whitespace-nowrap">
                                            {new Date(submission.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </td>

                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteSubmission(submission.id);
                                                }}
                                                className="p-2 text-[var(--ds-text-muted)] hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors"
                                                title="Excluir submissão"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Container>
        </div>
    );
}
