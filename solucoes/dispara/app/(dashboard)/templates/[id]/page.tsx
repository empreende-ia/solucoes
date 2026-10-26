'use client';

import React, { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTemplateProjectDetailsQuery } from '@/hooks/useTemplateProjects';
import {
    Loader2, ArrowLeft, Check, AlertCircle, Clock, Send, Trash2,
    RefreshCw, Filter, ChevronDown, CheckCircle, XCircle, AlertTriangle,
    Copy, CheckSquare, Square, Eye, Pencil, X
} from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { manualDraftsService } from '@/services/manualDraftsService';
import { WhatsAppPhonePreview } from '@/components/ui/WhatsAppPhonePreview';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';

export default function TemplateProjectDetailsPage() {
    const params = useParams();
    const id = params.id as string;
    const router = useRouter();
    const queryClient = useQueryClient();
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [expandedSection, setExpandedSection] = useState<'APPROVED' | 'REJECTED' | 'PENDING' | 'DRAFT' | 'ALL'>('ALL');
    const [previewItem, setPreviewItem] = useState<any | null>(null);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedTitle, setEditedTitle] = useState('');

    const { data: project, isLoading, error, refetch } = useTemplateProjectDetailsQuery(id);

    // Rename Project Mutation
    const renameProjectMutation = useMutation({
        mutationFn: async (newTitle: string) => {
            const response = await fetch(`/api/template-projects/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });
            if (!response.ok) throw new Error('Falha ao renomear');
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['template_projects', id] });
            queryClient.invalidateQueries({ queryKey: ['template_projects'] });
            toast.success('Projeto renomeado!');
            setIsEditingTitle(false);
        },
        onError: () => {
            toast.error('Erro ao renomear projeto');
        }
    });

    const handleStartEdit = () => {
        setEditedTitle(project?.title || '');
        setIsEditingTitle(true);
    };

    const handleSaveTitle = () => {
        if (!editedTitle.trim()) return toast.error('Digite um nome');
        renameProjectMutation.mutate(editedTitle.trim());
    };

    const handleCancelEdit = () => {
        setIsEditingTitle(false);
        setEditedTitle('');
    };

    // DEBUG: Inspect loaded items
    React.useEffect(() => {
        if (project?.items) {
        }
    }, [project]);

    // Toggle selection
    const toggleSelection = (itemId: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setSelectedItems(prev =>
            prev.includes(itemId)
                ? prev.filter(id => id !== itemId)
                : [...prev, itemId]
        );
    };

    const toggleSelectAll = () => {
        if (!project?.items) return;
        const validItems = project.items.filter((i: any) => !i.meta_id); // Only select draft items

        if (selectedItems.length === validItems.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(validItems.map((i: any) => i.id));
        }
    };

    /**
     * Normaliza variáveis de template para serem sequenciais
     * Problema: AI às vezes gera {{1}}, {{5}}, {{6}} em vez de {{1}}, {{2}}, {{3}}
     * Solução: Renumera todas as variáveis para serem sequenciais
     */
    const normalizeTemplateVariables = (item: any) => {
        // 1. Encontra todas as variáveis usadas no template
        const allText = [
            item.content || '',
            item.header?.text || '',
            item.footer?.text || ''
        ].join(' ');

        const varPattern = /\{\{(\d+)\}\}/g;
        const usedVars = new Set<number>();
        let match;
        while ((match = varPattern.exec(allText)) !== null) {
            usedVars.add(parseInt(match[1]));
        }

        // Se não há variáveis ou já são sequenciais, retorna original
        const sortedVars = Array.from(usedVars).sort((a, b) => a - b);
        const isSequential = sortedVars.every((v, i) => v === i + 1);

        if (sortedVars.length === 0 || isSequential) {
            // Retorna sample_variables como array ordenado
            let exampleVariables: string[] = [];
            if (item.sample_variables && typeof item.sample_variables === 'object') {
                const keys = Object.keys(item.sample_variables)
                    .filter(k => /^\d+$/.test(k))
                    .sort((a, b) => Number(a) - Number(b));
                exampleVariables = keys.map(k => item.sample_variables[k]);
            }
            return {
                content: item.content,
                header: item.header,
                exampleVariables
            };
        }

        // 2. Cria mapeamento: variável original -> nova posição sequencial
        const varMapping: Record<number, number> = {};
        sortedVars.forEach((oldVar, index) => {
            varMapping[oldVar] = index + 1;
        });

        // 3. Substitui variáveis no content e header
        const replaceVars = (text: string) => {
            return text.replace(/\{\{(\d+)\}\}/g, (_, num) => {
                const newNum = varMapping[parseInt(num)] || num;
                return `{{${newNum}}}`;
            });
        };

        const normalizedContent = replaceVars(item.content || '');
        const normalizedHeader = item.header ? {
            ...item.header,
            text: item.header.text ? replaceVars(item.header.text) : item.header.text
        } : item.header;

        // 4. Reorganiza sample_variables com novas posições
        let exampleVariables: string[] = [];
        if (item.sample_variables && typeof item.sample_variables === 'object') {
            // Mapeia valores antigos para novas posições
            const newSampleVars: Record<string, string> = {};
            for (const [oldKey, newKey] of Object.entries(varMapping)) {
                if (item.sample_variables[oldKey]) {
                    newSampleVars[String(newKey)] = item.sample_variables[oldKey];
                }
            }
            // Converte para array ordenado
            const keys = Object.keys(newSampleVars)
                .filter(k => /^\d+$/.test(k))
                .sort((a, b) => Number(a) - Number(b));
            exampleVariables = keys.map(k => newSampleVars[k]);
        }

        // Se ainda faltam examples, preenche com placeholder
        const maxVar = sortedVars.length;
        while (exampleVariables.length < maxVar) {
            exampleVariables.push(`Valor ${exampleVariables.length + 1}`);
        }

        return {
            content: normalizedContent,
            header: normalizedHeader,
            exampleVariables
        };
    };

    // Bulk Submit Mutation - Envia todos templates em paralelo via única chamada à API
    const bulkSubmitMutation = useMutation({
        mutationFn: async (itemIds: string[]) => {
            const itemsToSubmit = (project?.items || []).filter((i: any) => itemIds.includes(i.id));

            // Prepara todos os payloads de uma vez
            const templates = itemsToSubmit.map(item => {
                // Normaliza variáveis para serem sequenciais (corrige bug do AI)
                const normalized = normalizeTemplateVariables(item);

                return {
                    itemId: item.id, // ID for server-side DB update
                    projectId: id,
                    name: item.name,
                    category: item.category || 'UTILITY', // Use item category (MARKETING/UTILITY)
                    language: item.language || 'pt_BR',
                    content: normalized.content,
                    header: normalized.header,
                    footer: item.footer,
                    buttons: item.buttons,
                    // Inclui variáveis de exemplo normalizadas (necessário para Meta API)
                    exampleVariables: normalized.exampleVariables
                };
            });

            // Envia todos de uma vez - API processa em paralelo
            const response = await fetch('/api/templates/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templates })
            });

            const result = await response.json();

            // Processa resposta da API (pode ser sucesso total, parcial ou falha)
            const successes: string[] = [];
            const errors: Array<{ name: string; error: string }> = [];

            if (!response.ok) {
                // Falha total - todos falharam
                if (result.details) {
                    result.details.forEach((err: any) => errors.push({ name: err.name, error: err.error }));
                } else {
                    errors.push({ name: 'batch', error: result.error || 'Erro desconhecido' });
                }
            } else if (result.failed && result.failed.length > 0) {
                // Sucesso parcial (status 207)
                result.created?.forEach((t: any) => {
                    const item = itemsToSubmit.find(i => i.name === t.name);
                    if (item) successes.push(item.id);
                });
                result.failed.forEach((err: any) => errors.push({ name: err.name, error: err.error }));
            } else if (result.templates) {
                // Sucesso total (array de templates)
                result.templates.forEach((t: any) => {
                    const item = itemsToSubmit.find(i => i.name === t.name);
                    if (item) successes.push(item.id);
                });
            } else if (result.success || result.id) {
                // Sucesso de template único
                successes.push(itemsToSubmit[0]?.id);
            }

            return { successes, errors };
        },
        onSuccess: ({ successes, errors }) => {
            // Invalida tanto o detalhe quanto a lista de projetos
            queryClient.invalidateQueries({ queryKey: ['template_projects', id] });
            queryClient.invalidateQueries({ queryKey: ['template_projects'] });
            setSelectedItems([]);

            if (errors.length > 0 && successes.length === 0) {
                // Todos falharam
                const errorDetails = errors.map(e => `• ${e.name}: ${e.error}`).join('\n');
                toast.error(`Falha ao enviar ${errors.length} template(s)`, {
                    description: errorDetails,
                    duration: 8000
                });
            } else if (errors.length > 0) {
                // Parcialmente sucesso
                const errorDetails = errors.map(e => `• ${e.name}: ${e.error}`).join('\n');
                toast.warning(`${successes.length} enviado(s), ${errors.length} falha(s)`, {
                    description: errorDetails,
                    duration: 8000
                });
            } else if (successes.length > 0) {
                // Todos sucesso
                toast.success(`${successes.length} template(s) enviado(s) com sucesso para a Meta!`);
            } else {
                // Nenhum item para enviar (edge case)
                toast.info('Nenhum template selecionado para envio.');
            }
        },
        onError: (error: any) => {
            toast.error('Erro inesperado ao enviar templates', {
                description: error.message || 'Verifique e tente novamente.'
            });
        }
    });

    // Delete Item Mutation
    const deleteItemMutation = useMutation({
        mutationFn: async (itemId: string) => {
            const response = await fetch(`/api/template-projects/items/${itemId}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Falha ao excluir item');
        },
        onSuccess: () => {
            // Invalidate list
            queryClient.invalidateQueries({ queryKey: ['template_projects', id] });
            toast.success('Rascunho excluído');
        },
        onError: () => {
            toast.error('Erro ao excluir rascunho');
        }
    });

    // Edit Item Mutation - Cria um draft manual e redireciona para o editor
    const editItemMutation = useMutation({
        mutationFn: async (item: any) => {
            // 1. Cria um novo draft manual com os dados básicos
            const draft = await manualDraftsService.create({
                name: item.name,
                language: item.language || 'pt_BR',
                category: item.category || 'UTILITY',
                parameterFormat: 'positional',
            });

            // 2. Constrói o spec completo com header, body, footer e buttons
            const spec = {
                name: item.name,
                language: item.language || 'pt_BR',
                category: item.category || 'UTILITY',
                parameter_format: 'positional',
                body: { text: item.content || '' },
                header: item.header || null,
                footer: item.footer || null,
                buttons: item.buttons || [],
                carousel: null,
                limited_time_offer: null,
            };

            // 3. Atualiza o draft com o spec completo
            await manualDraftsService.update(draft.id, { spec });

            // 4. Remove o item do projeto
            const response = await fetch(`/api/template-projects/items/${item.id}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Falha ao remover item do projeto');

            return draft.id;
        },
        onSuccess: (draftId) => {
            queryClient.invalidateQueries({ queryKey: ['template_projects', id] });
            queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual'] });
            toast.success('Abrindo editor de template...');
            router.push(`/templates/drafts/${draftId}`);
        },
        onError: (error: any) => {
            toast.error('Erro ao abrir editor', {
                description: error.message || 'Tente novamente'
            });
        }
    });

    // Sync Project Mutation
    const syncProjectMutation = useMutation({
        mutationFn: async () => {
            const response = await fetch(`/api/template-projects/${id}/sync`, { method: 'POST' });
            if (!response.ok) throw new Error('Falha ao sincronizar');
            return response.json();
        },
        onSuccess: () => {
            // Invalida tanto o detalhe quanto a lista de projetos
            queryClient.invalidateQueries({ queryKey: ['template_projects', id] });
            queryClient.invalidateQueries({ queryKey: ['template_projects'] });
            toast.success('Status atualizados da Meta!');
        },
        onError: () => {
            toast.error('Erro ao sincronizar status.');
        }
    });

    // Grouping Logic
    const groups = useMemo(() => {
        if (!project?.items) return { APPROVED: [], REJECTED: [], PENDING: [], DRAFT: [] };
        return {
            APPROVED: project.items.filter((i: any) => i.meta_status === 'APPROVED'),
            REJECTED: project.items.filter((i: any) => i.meta_status === 'REJECTED'),
            PENDING: project.items.filter((i: any) => i.meta_status && i.meta_status !== 'APPROVED' && i.meta_status !== 'REJECTED'),
            DRAFT: project.items.filter((i: any) => !i.meta_status) // Strictly no status = Draft
        };
    }, [project?.items]);

    const sections = [
        { id: 'APPROVED', label: 'Aprovados', count: groups.APPROVED.length, color: 'purple', icon: CheckCircle },
        { id: 'REJECTED', label: 'Rejeitados', count: groups.REJECTED.length, color: 'red', icon: XCircle },
        { id: 'PENDING', label: 'Em Análise', count: groups.PENDING.length, color: 'yellow', icon: Clock },
        { id: 'DRAFT', label: 'Rascunhos (Não Enviados)', count: groups.DRAFT.length, color: 'slate', icon: Filter },
    ] as const;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-primary-300" />
            </div>
        );
    }

    if (error || !project) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="p-4 bg-amber-500/10 text-amber-200 border border-amber-500/20 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-300" />
                    <span>Erro ao carregar projeto ou projeto não encontrado.</span>
                </div>
                <button
                    onClick={() => router.push('/templates?tab=projects')}
                    className="flex items-center gap-2 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar para lista
                </button>
            </div>
        );
    }

    return (
        <Page className="flex flex-col h-full min-h-0">
            <PageHeader>
                <div className="min-w-0">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push('/templates?tab=projects')}
                            className="p-2 -ml-2 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30"
                            aria-label="Voltar para projetos"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>

                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                {isEditingTitle ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={editedTitle}
                                            onChange={(e) => setEditedTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleSaveTitle();
                                                if (e.key === 'Escape') handleCancelEdit();
                                            }}
                                            autoFocus
                                            className="text-2xl sm:text-3xl font-bold bg-transparent border-b-2 border-primary-500 outline-none text-[var(--ds-text-primary)] min-w-[200px]"
                                        />
                                        <button
                                            onClick={handleSaveTitle}
                                            disabled={renameProjectMutation.isPending}
                                            className="p-1.5 text-primary-400 hover:bg-primary-500/20 rounded-lg transition-colors"
                                            title="Salvar"
                                        >
                                            {renameProjectMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                                        </button>
                                        <button
                                            onClick={handleCancelEdit}
                                            className="p-1.5 text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors"
                                            title="Cancelar"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <PageTitle className="text-2xl sm:text-3xl truncate">{project.title}</PageTitle>
                                        <button
                                            onClick={handleStartEdit}
                                            className="p-1.5 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors"
                                            title="Renomear projeto"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                    </>
                                )}
                                <span className="px-2 py-0.5 text-xs rounded-full border bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] text-[var(--ds-text-secondary)] shrink-0">
                                    {groups.DRAFT.length === 0 && groups.PENDING.length === 0 ? 'Concluído' : 'Em Progresso'}
                                </span>
                            </div>
                            <PageDescription className="text-sm">
                                Criado em {new Date(project.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
                            </PageDescription>
                        </div>
                    </div>
                </div>

                <PageActions className="flex-wrap justify-start sm:justify-end">
                    <button
                        onClick={() => syncProjectMutation.mutate()}
                        disabled={syncProjectMutation.isPending}
                        className="px-3 py-2 bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] text-[var(--ds-text-primary)] rounded-lg hover:bg-[var(--ds-bg-hover)] transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                        <RefreshCw className={cn("w-4 h-4", syncProjectMutation.isPending && "animate-spin")} />
                        {syncProjectMutation.isPending ? 'Sincronizando...' : 'Sincronizar Meta'}
                    </button>

                    {groups.DRAFT.length > 0 && (
                        <button
                            onClick={toggleSelectAll}
                            className="px-3 py-2 bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] text-[var(--ds-text-primary)] rounded-lg hover:bg-[var(--ds-bg-hover)] transition-colors flex items-center gap-2 text-sm"
                        >
                            {selectedItems.length === groups.DRAFT.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            Selecionar Tudo
                        </button>
                    )}

                    {selectedItems.length > 0 && (
                        <button
                            onClick={() => bulkSubmitMutation.mutate(selectedItems)}
                            disabled={bulkSubmitMutation.isPending}
                            className="px-4 py-2 bg-white text-black rounded-lg transition-colors flex items-center gap-2 text-sm font-semibold hover:bg-slate-200 disabled:opacity-50"
                        >
                            {bulkSubmitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Enviar ({selectedItems.length}) para Meta
                        </button>
                    )}
                </PageActions>
            </PageHeader>

            <div className="grid grid-cols-12 flex-1 min-h-0 gap-6 overflow-hidden w-full">
                {/* --- LEFT SIDE: LIST & STATS --- */}
                <div className="col-span-12 lg:col-span-8 flex flex-col min-w-0 min-h-0">

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 shrink-0">
                    <StatCard
                        label="Aprovados"
                        count={groups.APPROVED.length}
                        total={project.items.length}
                        color="purple"
                        icon={CheckCircle}
                    />
                    <StatCard
                        label="Em Análise"
                        count={groups.PENDING.length}
                        total={project.items.length}
                        color="yellow"
                        icon={Clock}
                    />
                    <StatCard
                        label="Rejeitados"
                        count={groups.REJECTED.length}
                        total={project.items.length}
                        color="red"
                        icon={XCircle}
                    />
                    <StatCard
                        label="Rascunhos"
                        count={groups.DRAFT.length}
                        total={project.items.length}
                        color="slate"
                        icon={Filter}
                    />
                </div>

                {/* Template List */}
                <div className="flex-1 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-2xl overflow-y-auto shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                    {sections.map(section => {
                        if (section.count === 0) return null;

                        const isExpanded = expandedSection === 'ALL' || expandedSection === section.id;
                        // @ts-ignore
                        const sectionItems = groups[section.id];

                        return (
                            <div key={section.id} className="border-b border-[var(--ds-border-subtle)] last:border-0">
                                <button
                                    onClick={() => setExpandedSection(isExpanded && expandedSection !== 'ALL' ? 'ALL' : section.id)}
                                    className="w-full flex items-center justify-between p-4 hover:bg-[var(--ds-bg-hover)] transition-colors sticky top-0 bg-[var(--ds-bg-elevated)] z-10"
                                >
                                    <div className="flex items-center gap-3">
                                        <section.icon className={cn("w-5 h-5", {
                                            'text-primary-300': section.color === 'purple',
                                            'text-red-300': section.color === 'red',
                                            'text-amber-300': section.color === 'yellow',
                                            'text-[var(--ds-text-secondary)]': section.color === 'slate',
                                        })} />
                                        <span className="font-medium text-[var(--ds-text-primary)]">{section.label}</span>
                                        <span className="px-2 py-0.5 rounded-full bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] text-xs text-[var(--ds-text-secondary)]">
                                            {section.count}
                                        </span>
                                    </div>
                                    <ChevronDown className={cn("w-4 h-4 text-[var(--ds-text-secondary)] transition-transform", { "rotate-180": isExpanded })} />
                                </button>

                                {isExpanded && (
                                    <div className="px-4 pb-4 space-y-2">
                                        {/* Checkbox "Selecionar Tudo" para seção DRAFT */}
                                        {section.id === 'DRAFT' && sectionItems.length > 0 && (
                                            <div
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleSelectAll();
                                                }}
                                                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--ds-bg-surface)]/40 border border-[var(--ds-border-subtle)] cursor-pointer hover:bg-[var(--ds-bg-hover)] transition-colors"
                                            >
                                                <div className={cn(
                                                    "w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0",
                                                    selectedItems.length === groups.DRAFT.length && groups.DRAFT.length > 0
                                                        ? "bg-primary-500 border-primary-500 text-black"
                                                        : "border-[var(--ds-border-default)] text-transparent hover:border-white/40"
                                                )}>
                                                    <Check className="w-3.5 h-3.5" />
                                                </div>
                                                <span className="text-sm text-[var(--ds-text-secondary)]">
                                                    {selectedItems.length === groups.DRAFT.length && groups.DRAFT.length > 0
                                                        ? 'Desmarcar tudo'
                                                        : `Selecionar tudo (${groups.DRAFT.length})`}
                                                </span>
                                            </div>
                                        )}
                                        {/* @ts-ignore */}
                                        {sectionItems.map((item: any) => {
                                            const isSelected = selectedItems.includes(item.id);
                                            const isDraft = !item.meta_id;
                                            const isActive = previewItem?.id === item.id;

                                            return (
                                                <div
                                                    key={item.id}
                                                    onClick={() => setPreviewItem(item)}
                                                    className={cn(
                                                        "p-3 rounded-lg border transition-all cursor-pointer flex gap-3 relative group",
                                                        isActive
                                                            ? "bg-primary-500/10 border-primary-500/30 ring-1 ring-primary-500/40"
                                                            : "bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] hover:border-[var(--ds-border-default)] hover:bg-[var(--ds-bg-hover)]"
                                                    )}
                                                >
                                                    {isDraft && (
                                                        <div
                                                            onClick={(e) => toggleSelection(item.id, e)}
                                                            className={cn(
                                                                "mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 z-10",
                                                                isSelected
                                                                    ? "bg-primary-500 border-primary-500 text-black"
                                                                    : "border-[var(--ds-border-default)] text-transparent hover:border-white/40"
                                                            )}
                                                        >
                                                            <Check className="w-3.5 h-3.5" />
                                                        </div>
                                                    )}

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="text-sm font-medium flex items-center gap-2 truncate">
                                                                {item.name}
                                                            </span>
                                                            <div className="flex items-center gap-2">
                                                            <span className="text-xs text-[var(--ds-text-secondary)] flex items-center gap-1 shrink-0">
                                                                <Copy className="w-3 h-3" />
                                                                {item.language}
                                                            </span>
                                                            {isDraft && (
                                                                <>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            editItemMutation.mutate(item);
                                                                        }}
                                                                        disabled={editItemMutation.isPending}
                                                                        className="p-1 text-[var(--ds-text-secondary)] hover:text-primary-300 hover:bg-primary-500/10 rounded transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                                                        title="Editar template"
                                                                    >
                                                                        <Pencil className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (confirm('Excluir este rascunho?')) {
                                                                                deleteItemMutation.mutate(item.id);
                                                                            }
                                                                        }}
                                                                        className="p-1 text-[var(--ds-text-secondary)] hover:text-amber-300 hover:bg-amber-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                                                                        title="Excluir rascunho"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <p className="text-xs text-[var(--ds-text-secondary)] line-clamp-2">
                                                            {item.content}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

                {/* --- RIGHT SIDE: PREVIEW --- */}
                <div className="hidden lg:flex col-span-4 border-l border-[var(--ds-border-subtle)] pl-6 flex-col min-h-0">
                {previewItem ? (
                    <div className="sticky top-6 w-full">
                        <h3 className="text-sm font-medium text-[var(--ds-text-secondary)] mb-4 text-center">
                            Pré-visualização
                        </h3>
                        <WhatsAppPhonePreview
                            components={[
                                previewItem.header ? { type: 'HEADER', ...previewItem.header } : null,
                                { type: 'BODY', text: previewItem.content },
                                previewItem.footer ? { type: 'FOOTER', ...previewItem.footer } : null,
                                previewItem.buttons?.length ? { type: 'BUTTONS', buttons: previewItem.buttons } : null
                            ].filter(Boolean)}
                            fallbackContent={previewItem.content}
                            variables={['Nome do Contato', 'Valor', 'Data']} // Placeholder
                            size="md"
                        />
                        <div className="mt-6 p-4 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-2xl shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                            <h4 className="text-sm font-medium text-[var(--ds-text-primary)] mb-2">Detalhes Técnicos</h4>
                            <div className="space-y-2 text-xs text-[var(--ds-text-secondary)]">
                                <div className="flex justify-between">
                                    <span>Status Meta:</span>
                                    <span className={cn(
                                        "font-medium",
                                        previewItem.meta_status === 'APPROVED' && "text-primary-300",
                                        previewItem.meta_status === 'REJECTED' && "text-amber-300",
                                        previewItem.meta_status === 'PENDING' && "text-amber-300",
                                    )}>{previewItem.meta_status || 'Rascunho'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>ID:</span>
                                    <span className="font-mono">{previewItem.id.slice(0, 8)}...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-[var(--ds-text-secondary)] border border-dashed border-[var(--ds-border-subtle)] rounded-2xl bg-[var(--ds-bg-elevated)] shadow-[0_12px_30px_rgba(0,0,0,0.35)] w-full">
                        <Eye className="w-12 h-12 mb-4 opacity-50" />
                        <p className="text-sm">Selecione um template para visualizar</p>
                    </div>
                )}
                </div>
            </div>
        </Page>
    );
}

function StatCard({ label, count, total, color, icon: Icon }: any) {
    const percent = total > 0 ? Math.round((count / total) * 100) : 0;

    const colors: Record<string, string> = {
        purple: 'text-primary-300 bg-primary-500/10 border-primary-500/20',
        yellow: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
        red: 'text-amber-200 bg-amber-500/10 border-amber-500/20',
        slate: 'text-[var(--ds-text-secondary)] bg-slate-500/10 border-[var(--ds-border-subtle)]',
    };

    return (
        <div className={cn("p-4 rounded-2xl border flex flex-col justify-between h-24 shadow-[0_12px_30px_rgba(0,0,0,0.35)]", colors[color])}>
            <div className="flex justify-between items-start">
                <Icon className="w-5 h-5 opacity-70" />
                <span className="text-2xl font-bold">{count}</span>
            </div>
            <div className="flex justify-between items-end">
                <span className="text-xs opacity-80 font-medium">{label}</span>
                <span className="text-xs opacity-60 font-mono">{percent}%</span>
            </div>
        </div>
    );
}
