'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTemplatesController } from '@/hooks/useTemplates';
import { useLeadFormsController } from '@/hooks/useLeadForms'
import { TemplateListView } from '@/components/features/templates/TemplateListView';
import { useTemplateProjectsQuery, useTemplateProjectMutations } from '@/hooks/useTemplateProjects';
import { Loader2, Plus, Folder, Search, RefreshCw, CheckCircle, AlertTriangle, Trash2, Pencil, LayoutGrid, Workflow, FileText, ClipboardList, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Megaphone, Wrench, VenetianMask } from 'lucide-react';
import type { AIStrategy } from '@/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

import { FlowPublishPanel } from '@/components/features/flows/FlowPublishPanel'
import { flowsService } from '@/services/flowsService'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { LeadFormsView } from '@/components/features/lead-forms/LeadFormsView'

// Strategy Badge Component
const StrategyBadge = ({ strategy }: { strategy?: AIStrategy }) => {
  const config = {
    marketing: {
      icon: Megaphone,
      label: 'Marketing',
      style: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    },
    utility: {
      icon: Wrench,
      label: 'Utilidade',
      style: 'bg-primary-500/10 text-primary-400 border-primary-500/30',
    },
    bypass: {
      icon: VenetianMask,
      label: 'Camuflado',
      style: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    },
  };

  const s = strategy || 'utility';
  const c = config[s];
  const Icon = c.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${c.style}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
};

// Status Badge Component
const StatusBadge = ({ status, approvedCount, totalCount }: { status: string; approvedCount?: number; totalCount?: number }) => {
  const isDraft = status === 'draft';
  const isComplete = approvedCount && totalCount && approvedCount === totalCount && totalCount > 0;
  const isPartial = approvedCount && approvedCount > 0 && !isComplete;

  if (isComplete) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border bg-green-500/10 text-green-300 border-green-500/20">
        Concluído
      </span>
    );
  }
  if (isPartial) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border bg-amber-500/10 text-amber-300 border-amber-500/20">
        <span className="relative flex h-2 w-2 mr-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        Em Progresso
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] border-[var(--ds-border-default)]">
      Rascunho
    </span>
  );
};

export default function TemplatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const controller = useTemplatesController();
  const { data: projects, isLoading: isLoadingProjects, refetch } = useTemplateProjectsQuery();
  const { deleteProject, updateProjectTitle, isDeleting, isUpdating } = useTemplateProjectMutations();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'projects' | 'meta' | 'flows' | 'forms'>('meta');

  // Estado do modal de confirmação de exclusão
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [projectToDelete, setProjectToDelete] = React.useState<{ id: string; title: string; approvedCount: number } | null>(null);
  const [deleteMetaTemplates, setDeleteMetaTemplates] = React.useState(false);
  const [isCreatingFlow, setIsCreatingFlow] = React.useState(false);

  // Estado de edição inline do nome
  const [editingProjectId, setEditingProjectId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState('');
  const [isSyncingProjects, setIsSyncingProjects] = React.useState(false);
  const leadFormsController = useLeadFormsController()

  // Sincroniza todos os projetos com a Meta
  const handleSyncProjects = async () => {
    if (!projects || projects.length === 0) return;

    setIsSyncingProjects(true);
    try {
      // Sincroniza todos os projetos em paralelo
      const promises = projects.map(project =>
        fetch(`/api/template-projects/${project.id}/sync`, { method: 'POST' })
      );

      await Promise.allSettled(promises);

      // Atualiza a lista
      refetch();
      toast.success('Projetos sincronizados com a Meta');
    } catch (error) {
      console.error('Sync error:', error);
      toast.error('Erro ao sincronizar projetos');
    } finally {
      setIsSyncingProjects(false);
    }
  };

  const handleCreateManualTemplate = () => {
    // Navega para a página de criação sem criar rascunho no banco.
    // O rascunho só será criado quando o usuário clicar em "Salvar Rascunho".
    router.push('/templates/drafts/new')
  }

  // Flows hub state
  const flowsQuery = useQuery({
    queryKey: ['flows'],
    queryFn: flowsService.list,
    staleTime: 10_000,
    enabled: activeTab === 'flows',
  })
  const builderFlows = flowsQuery.data || []
  const handleQuickCreateFlow = async () => {
    const now = new Date()
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    const name = `flow_${stamp}`
    try {
      setIsCreatingFlow(true)
      const created = await flowsService.create({ name })
      router.push(`/flows/builder/${encodeURIComponent(created.id)}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar MiniApp')
    } finally {
      setIsCreatingFlow(false)
    }
  }

  // Deep-link: /templates?tab=flows (roda apenas na montagem inicial)
  const initialTabApplied = React.useRef(false)
  React.useEffect(() => {
    if (initialTabApplied.current) return
    initialTabApplied.current = true

    const tab = (searchParams?.get('tab') || '').toLowerCase()
    if (tab === 'drafts') {
      setActiveTab('meta')
      controller.setStatusFilter('DRAFT')
      router.replace('/templates?tab=meta')
      return
    }
    if (tab === 'meta' || tab === 'projects' || tab === 'flows' || tab === 'forms') {
      setActiveTab(tab)
    }
  }, [controller, router, searchParams])

  const setTab = (tab: 'projects' | 'meta' | 'flows' | 'forms') => {
    setActiveTab(tab)
    window.history.replaceState(null, '', `/templates?tab=${encodeURIComponent(tab)}`)
  }

  const handleDeleteProject = (e: React.MouseEvent, project: { id: string; title: string; approved_count: number }) => {
    e.stopPropagation();
    setProjectToDelete({ id: project.id, title: project.title, approvedCount: project.approved_count });
    setDeleteMetaTemplates(false);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;
    await deleteProject(projectToDelete.id, deleteMetaTemplates);
    setDeleteModalOpen(false);
    setProjectToDelete(null);
  };

  const handleStartEdit = (e: React.MouseEvent, project: { id: string; title: string }) => {
    e.stopPropagation();
    setEditingProjectId(project.id);
    setEditingTitle(project.title);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProjectId(null);
    setEditingTitle('');
  };

  const handleSaveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingProjectId || !editingTitle.trim()) return;
    await updateProjectTitle(editingProjectId, editingTitle.trim());
    setEditingProjectId(null);
    setEditingTitle('');
  };

  const filteredProjects = React.useMemo(() => {
    if (!projects) return [];
    if (!searchTerm) return projects;
    return projects.filter(p =>
      p.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [projects, searchTerm]);

  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Templates</PageTitle>
          <PageDescription>
            {activeTab === 'flows'
              ? 'Crie e monitore MiniApps do WhatsApp, e mapeie respostas para campos do Dispara.'
              : activeTab === 'forms'
                ? 'Crie formulários públicos para captar contatos e tags automaticamente.'
              : 'Gerencie templates e rascunhos.'}
          </PageDescription>
        </div>
        <PageActions>
          {activeTab === 'meta' && (
            <div className="flex items-center gap-2">
              <Button variant="brand" className="min-w-[160px]" onClick={handleCreateManualTemplate}>
                <Plus className="w-4 h-4" />
                Criar template
              </Button>

              <Button
                variant="outline"
                className="min-w-[160px]"
                onClick={controller.onSync}
                disabled={controller.isSyncing}
              >
                <RefreshCw className={cn('w-4 h-4', controller.isSyncing && 'animate-spin')} />
                {controller.isSyncing ? 'Sincronizando...' : 'Sincronizar'}
              </Button>
            </div>
          )}

          {activeTab === 'projects' && (
            <div className="flex items-center gap-2">
              <Button variant="brand" onClick={() => router.push('/templates/new')}>
                <Plus className="w-4 h-4" />
                Novo Projeto
              </Button>

              <Button
                variant="outline"
                onClick={handleSyncProjects}
                disabled={isSyncingProjects || isLoadingProjects}
              >
                <RefreshCw className={cn('w-4 h-4', isSyncingProjects && 'animate-spin')} />
                {isSyncingProjects ? 'Sincronizando...' : 'Sincronizar'}
              </Button>
            </div>
          )}

          {activeTab === 'flows' && (
            <div className="flex items-center gap-2">
              <Button variant="brand" onClick={handleQuickCreateFlow} disabled={isCreatingFlow}>
                <Plus className="w-4 h-4" />
                {isCreatingFlow ? 'Criando...' : 'Criar MiniApp'}
              </Button>
              <Button variant="outline" onClick={() => router.push('/submissions')}>
                <ClipboardList className="w-4 h-4" />
                Ver Submissões
              </Button>
            </div>
          )}

          {activeTab === 'forms' && (
            <Button variant="brand" onClick={() => leadFormsController.setIsCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              Criar formulário
            </Button>
          )}
        </PageActions>
      </PageHeader>

      {/* TABS */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTab('meta')}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'meta'
            ? 'border-primary-400/40 bg-primary-500/10 text-[var(--ds-status-success-text)]'
            : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]'
            }`}
        >
          <CheckCircle className="w-4 h-4" />
          Meta (Templates)
        </button>

        <button
          onClick={() => setTab('projects')}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'projects'
            ? 'border-primary-400/40 bg-primary-500/10 text-[var(--ds-status-success-text)]'
            : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]'
            }`}
        >
          <LayoutGrid className="w-4 h-4" />
          Projetos (Fábrica)
          <span className="rounded-full bg-green-500/20 px-1 py-px text-[8px] font-semibold uppercase tracking-wider text-[var(--ds-status-success-text)] border border-green-500/30">
            beta
          </span>
        </button>

        <button
          onClick={() => setTab('flows')}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'flows'
            ? 'border-primary-400/40 bg-primary-500/10 text-[var(--ds-status-success-text)]'
            : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]'
            }`}
        >
          <Workflow className="w-4 h-4" />
          MiniApps
          <span className="rounded-full bg-green-500/20 px-1 py-px text-[8px] font-semibold uppercase tracking-wider text-[var(--ds-status-success-text)] border border-green-500/30">
            beta
          </span>
        </button>

        <button
          onClick={() => setTab('forms')}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'forms'
            ? 'border-primary-400/40 bg-primary-500/10 text-[var(--ds-status-success-text)]'
            : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]'
            }`}
        >
          <FileText className="w-4 h-4" />
          Forms
          <span className="rounded-full bg-green-500/20 px-1 py-px text-[8px] font-semibold uppercase tracking-wider text-[var(--ds-status-success-text)] border border-green-500/30">
            beta
          </span>
        </button>
      </div>

      {/* Mantém componentes montados para evitar flicker no switch de abas */}
      <div className={activeTab === 'meta' ? '' : 'hidden'}>
        <TemplateListView
          {...controller}
          hideHeader
          onCreateCampaign={(template) => {
            router.push(`/campaigns/new?templateName=${encodeURIComponent(template.name)}`)
          }}
          onCloneTemplate={async (template) => {
            try {
              const result = await controller.cloneTemplate(template.name)
              if (result?.id) {
                router.push(`/templates/drafts/${encodeURIComponent(result.id)}`)
              }
            } catch {
              // Toast já é emitido pelo controller
            }
          }}
        />
      </div>

      <div className={activeTab === 'flows' ? '' : 'hidden'}>
        <FlowPublishPanel
          flows={builderFlows}
          isLoading={flowsQuery.isLoading}
          isFetching={flowsQuery.isFetching}
          onRefresh={() => flowsQuery.refetch()}
        />
      </div>

      <div className={activeTab === 'forms' ? '' : 'hidden'}>
        <LeadFormsView
          forms={leadFormsController.forms}
          tags={leadFormsController.tags}
          isLoading={leadFormsController.isLoading}
          error={leadFormsController.error}
          publicBaseUrl={leadFormsController.publicBaseUrl}
          isCreateOpen={leadFormsController.isCreateOpen}
          setIsCreateOpen={leadFormsController.setIsCreateOpen}
          createDraft={leadFormsController.createDraft}
          setCreateDraft={leadFormsController.setCreateDraft}
          onCreate={leadFormsController.create}
          isCreating={leadFormsController.isCreating}
          createError={leadFormsController.createError}
          isEditOpen={leadFormsController.isEditOpen}
          editDraft={leadFormsController.editDraft}
          setEditDraft={leadFormsController.setEditDraft}
          onEdit={leadFormsController.openEdit}
          onCloseEdit={leadFormsController.closeEdit}
          onSaveEdit={leadFormsController.saveEdit}
          isUpdating={leadFormsController.isUpdating}
          updateError={leadFormsController.updateError}
          onDelete={leadFormsController.remove}
          isDeleting={leadFormsController.isDeleting}
          deleteError={leadFormsController.deleteError}
          hideHeader
        />
      </div>

      {activeTab === 'projects' && (
        <>
          {/* Filters Bar */}
          <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-96 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl px-4 py-3 transition-all">
              <Search size={18} className="text-[var(--ds-text-muted)]" />
              <input
                type="text"
                placeholder="Buscar projetos..."
                className="bg-transparent border-none outline-none text-sm w-full text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => refetch()}
                className="p-2.5 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] rounded-lg border border-[var(--ds-border-default)] transition-colors"
                title="Atualizar"
              >
                <RefreshCw size={18} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] shadow-[0_12px_30px_rgba(0,0,0,0.35)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--ds-bg-surface)]/30 text-[var(--ds-text-muted)] uppercase tracking-widest text-[11px]">
                  <tr>
                    <th className="px-6 py-4 font-medium">Nome</th>
                    <th className="px-6 py-4 font-medium">Tipo</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium text-center">Templates</th>
                    <th className="px-6 py-4 font-medium">Progresso</th>
                    <th className="px-6 py-4 font-medium">Criado em</th>
                    <th className="px-6 py-4 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ds-border-subtle)]">
                  {isLoadingProjects ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" />
                      </td>
                    </tr>
                  ) : filteredProjects.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-[var(--ds-text-muted)]">
                        Nenhum projeto encontrado.
                      </td>
                    </tr>
                  ) : (
                    filteredProjects.map((project) => {
                      const approvedPercent = project.template_count > 0
                        ? Math.round((project.approved_count / project.template_count) * 100)
                        : 0;

                      return (
                        <tr
                          key={project.id}
                          onClick={() => router.push(`/templates/${project.id}`)}
                          className="hover:bg-[var(--ds-bg-hover)] transition-colors group cursor-pointer"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-primary-500/10 rounded-lg text-primary-400">
                                <Folder size={16} />
                              </div>
                              {editingProjectId === project.id ? (
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    value={editingTitle}
                                    onChange={(e) => setEditingTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveEdit(e as unknown as React.MouseEvent);
                                      if (e.key === 'Escape') handleCancelEdit(e as unknown as React.MouseEvent);
                                    }}
                                    autoFocus
                                    className="px-2 py-1 rounded-lg border border-primary-500 bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                                  />
                                  <button
                                    onClick={handleSaveEdit}
                                    disabled={isUpdating}
                                    className="p-1.5 rounded-lg text-primary-400 hover:bg-primary-500/10 disabled:opacity-50"
                                    title="Salvar"
                                  >
                                    {isUpdating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    className="p-1.5 rounded-lg text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-hover)]"
                                    title="Cancelar"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <div>
                                  <p className="font-medium text-[var(--ds-text-primary)] group-hover:text-[var(--ds-status-success-text)] transition-colors">
                                    {project.title}
                                  </p>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <StrategyBadge strategy={project.strategy} />
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge
                              status={project.status}
                              approvedCount={project.approved_count}
                              totalCount={project.template_count}
                            />
                          </td>
                          <td className="px-6 py-4 text-center text-[var(--ds-text-secondary)] font-mono">
                            {project.template_count}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 w-24 bg-[var(--ds-bg-surface)] rounded-full h-1">
                                <div
                                  className="bg-primary-500 h-1 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                  style={{ width: `${approvedPercent}%` }}
                                />
                              </div>
                              <span className="text-xs text-[var(--ds-text-secondary)] font-mono w-10">
                                {approvedPercent}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-[var(--ds-text-muted)] font-mono text-xs">
                            {new Date(project.created_at).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={(e) => handleStartEdit(e, project)}
                                title="Renomear"
                                className="p-2 rounded-lg text-[var(--ds-text-secondary)] hover:text-primary-400 hover:bg-primary-500/10"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                onClick={(e) => handleDeleteProject(e, project)}
                                title="Excluir"
                                className="p-2 rounded-lg text-[var(--ds-text-secondary)] hover:text-amber-300 hover:bg-amber-500/10"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal de confirmação de exclusão */}
      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[var(--ds-text-primary)]">
              Excluir projeto
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--ds-text-secondary)]">
              Tem certeza que deseja excluir o projeto{' '}
              <span className="font-medium text-[var(--ds-text-primary)]">
                "{projectToDelete?.title}"
              </span>
              ?
              {projectToDelete && projectToDelete.approvedCount > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-amber-200 font-medium text-sm">
                        Este projeto tem {projectToDelete.approvedCount} template(s) aprovado(s) na Meta
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <Checkbox
                          id="delete-meta"
                          checked={deleteMetaTemplates}
                          onCheckedChange={(checked) => setDeleteMetaTemplates(checked === true)}
                          className="border-amber-500/50 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                        />
                        <Label
                          htmlFor="delete-meta"
                          className="text-sm text-amber-300 cursor-pointer"
                        >
                          Também excluir os templates da Meta
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
