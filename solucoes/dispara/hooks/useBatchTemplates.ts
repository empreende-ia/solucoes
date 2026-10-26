import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { BatchSubmission, GeneratedTemplateWithStatus } from '../types';
import { GeneratedTemplate } from '../services/templateService';
import { templateService } from '../services/templateService';

// Mock storage key
const STORAGE_KEY = 'dispara_batch_submissions';

export const useBatchTemplates = () => {
    const [submissions, setSubmissions] = useState<BatchSubmission[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);

    // Load from storage on mount
    useEffect(() => {
        const loaded = localStorage.getItem(STORAGE_KEY);
        if (loaded) {
            try {
                setSubmissions(JSON.parse(loaded));
            } catch (e) {
                console.error('Failed to parse batch submissions', e);
            }
        }
    }, []);

    // Save to storage whenever changed
    useEffect(() => {
        if (submissions.length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(submissions));
        }
    }, [submissions]);

    // --- Hourly Rate Limit Logic ---
    const [hourlyCount, setHourlyCount] = useState(0);

    // Update hourly count on mount and periodically
    const updateHourlyCount = () => {
        try {
            if (typeof window === 'undefined') return;

            const history = JSON.parse(localStorage.getItem('batch_creation_history') || '[]');
            const oneHourAgo = Date.now() - 60 * 60 * 1000;

            // Filter logs older than 1 hour
            const recentLogs = history.filter((timestamp: number) => timestamp > oneHourAgo);

            // Clean up storage if changed
            if (recentLogs.length !== history.length) {
                localStorage.setItem('batch_creation_history', JSON.stringify(recentLogs));
            }

            setHourlyCount(recentLogs.length);
        } catch (error) {
            console.error("Failed to parse creation history", error);
        }
    };

    useEffect(() => {
        updateHourlyCount();
        const interval = setInterval(updateHourlyCount, 60000); // Check every minute
        return () => clearInterval(interval);
    }, []);

    const createSubmission = async (name: string, templates: GeneratedTemplate[]) => {
        // 1. Check Rate Limits before starting
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const history = JSON.parse(localStorage.getItem('batch_creation_history') || '[]');
        const recentLogs = history.filter((timestamp: number) => timestamp > oneHourAgo);

        if (recentLogs.length + templates.length > 100) {
            throw new Error(`Limite de criação por hora excedido. Você pode criar mais ${100 - recentLogs.length} templates agora.`);
        }

        setIsLoading(true);
        try {
            // Templates já vêm sanitizados do sistema 2-Round AI
            // Round 1: Geração com engajamento
            // Round 2: Sanitização automática (palavras promocionais → variáveis)
            const templatesToCreate = templates.map(t => ({
                name: t.name,
                content: t.content, // Já sanitizado pela API
                language: t.language || 'pt_BR',
                category: 'UTILITY' as const,
                header: t.header,
                footer: t.footer,
                buttons: t.buttons,
            }));

            // Call the REAL Meta API
            const result = await templateService.createBulkInMeta(templatesToCreate);

            // 2. Log creation timestamps for rate limiting (only successful ones)
            const now = Date.now();
            const newLogs = Array(result.created).fill(0).map(() => now);
            const updatedHistory = [...recentLogs, ...newLogs];
            localStorage.setItem('batch_creation_history', JSON.stringify(updatedHistory));
            updateHourlyCount();

            // Show errors if any
            if (result.errors && result.errors.length > 0) {
                result.errors.forEach(err => {
                    toast.error(`${err.name}: ${err.error}`);
                });
            }

            if (result.created === 0) {
                throw new Error('Nenhum template foi criado na Meta');
            }

            toast.success(`${result.created} de ${result.total} templates criados na Meta!`);

            // Create Batch Record
            const newSubmission: BatchSubmission = {
                id: crypto.randomUUID(),
                name,
                createdAt: new Date().toISOString(),
                status: 'completed',
                stats: {
                    total: templates.length,
                    utility: templates.filter(t => t.category === 'UTILITY').length,
                    marketing: 0, // Initially 0, will update after sync
                    poll_utility: 0,
                    rejected: 0,
                    pending: templates.length // All start as pending/approved
                },
                templates: templates.map(t => ({
                    ...t,
                    originalCategory: 'UTILITY', // Added this back as it was in the original code
                    category: 'UTILITY', // Added this back as it was in the original code
                    status: 'PENDING', // Added this back as it was in the original code
                    generatedAt: new Date().toISOString() // Added this back as it was in the original code
                }))
            };

            const updated = [newSubmission, ...submissions];
            setSubmissions(updated);
            setSelectedSubmissionId(newSubmission.id);

            // Persist locally
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            toast.success('Submissão criada com sucesso!'); // Added this back as it was in the original code

            return newSubmission.id;
        } catch (error) {
            console.error('Error creating submission:', error);
            toast.error('Erro ao criar submissão em lote');
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const refreshSubmissionStatus = useCallback(async (submissionId: string) => {
        setIsLoading(true);
        try {
            // Fetch REAL status from Meta API
            const response = await fetch('/api/templates');
            if (!response.ok) {
                throw new Error('Falha ao buscar templates da Meta');
            }

            const metaTemplates = await response.json() as Array<{
                name: string;
                status: string;
                category: string;
            }>;

            // Create a map for quick lookup
            const metaStatusMap = new Map(
                metaTemplates.map(t => [t.name, { status: t.status, category: t.category }])
            );

            setSubmissions(prev => prev.map(sub => {
                if (sub.id !== submissionId) return sub;

                // Update templates with REAL status from Meta
                const updatedTemplates = sub.templates.map(t => {
                    const metaInfo = metaStatusMap.get(t.name);

                    if (!metaInfo) {
                        // Template not found in Meta yet - keep as PENDING (takes time to propagate)
                        // Only mark as rejected if it's been more than 10 minutes since creation
                        const createdAt = new Date(t.generatedAt || sub.createdAt).getTime();
                        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

                        if (createdAt < tenMinutesAgo) {
                            // Template is old and still not in Meta - likely failed
                            return { ...t, status: 'REJECTED' as const, rejectionReason: 'Template não encontrado na Meta após 10 minutos' };
                        }
                        // Still new, keep as pending
                        return { ...t, status: 'PENDING' as const };
                    }

                    // Map Meta status to our status
                    let newStatus: 'APPROVED' | 'REJECTED' | 'PENDING' = 'PENDING';
                    if (metaInfo.status === 'APPROVED') {
                        newStatus = 'APPROVED';
                    } else if (metaInfo.status === 'REJECTED' || metaInfo.status === 'DISABLED') {
                        newStatus = 'REJECTED';
                    } else {
                        // PENDING, IN_APPEAL, PAUSED, etc.
                        newStatus = 'PENDING';
                    }

                    return {
                        ...t,
                        status: newStatus,
                        category: metaInfo.category as 'UTILITY' | 'MARKETING',
                    };
                });

                // Recalculate stats based on REAL data
                const stats = {
                    total: sub.stats.total,
                    utility: updatedTemplates.filter(t => t.status === 'APPROVED' && t.category === 'UTILITY').length,
                    marketing: updatedTemplates.filter(t => t.status === 'APPROVED' && t.category === 'MARKETING').length,
                    poll_utility: 0,
                    rejected: updatedTemplates.filter(t => t.status === 'REJECTED').length,
                    pending: updatedTemplates.filter(t => t.status === 'PENDING').length
                };

                return {
                    ...sub,
                    status: stats.pending === 0 ? 'completed' : 'processing',
                    stats,
                    templates: updatedTemplates
                };
            }));

            toast.success('Status sincronizado com a Meta!');
        } catch (error) {
            console.error('Error refreshing status:', error);
            toast.error('Erro ao sincronizar status com a Meta');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const cleanNonUtilityTemplates = useCallback(async (submissionId: string) => {
        setSubmissions(prev => prev.map(sub => {
            if (sub.id !== submissionId) return sub;

            // Remove all templates that are NOT approved UTILITY
            // This includes: MARKETING (approved but wrong category) and REJECTED
            const filteredTemplates = sub.templates.filter(t =>
                t.status === 'APPROVED' && t.category === 'UTILITY'
            );

            // Count what we're removing for the toast
            const removedCount = sub.templates.length - filteredTemplates.length;

            // Recalculate stats - only UTILITY and PENDING remain
            const stats = {
                total: sub.stats.total, // Keep original total for history
                utility: filteredTemplates.length,
                marketing: 0,
                poll_utility: 0,
                rejected: 0,
                pending: sub.templates.filter(t => t.status === 'PENDING').length
            };

            // Keep pending templates too (they might still get approved)
            const templatesWithPending = [
                ...filteredTemplates,
                ...sub.templates.filter(t => t.status === 'PENDING')
            ];

            return {
                ...sub,
                stats: {
                    ...stats,
                    pending: templatesWithPending.filter(t => t.status === 'PENDING').length
                },
                templates: templatesWithPending
            };
        }));
        toast.success('Templates não-Utility removidos!');
    }, []);

    const deleteSubmission = useCallback((id: string) => {
        setSubmissions(prev => prev.filter(s => s.id !== id));
        if (selectedSubmissionId === id) setSelectedSubmissionId(null);
        toast.success('Submissão excluída');
    }, [selectedSubmissionId]);

    return {
        submissions,
        isLoading,
        createSubmission,
        refreshSubmissionStatus,
        cleanNonUtilityTemplates,
        deleteSubmission,
        selectedSubmissionId,
        setSelectedSubmissionId,
        selectedSubmission: submissions.find(s => s.id === selectedSubmissionId),
        hourlyCount
    };
};
