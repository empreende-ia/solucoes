"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Star,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/builder/api-client";
import { cn } from "@/lib/utils";

type WorkflowItem = Awaited<ReturnType<typeof api.workflow.getAll>>[number];

function formatDate(date?: string) {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function StatusBadge({ status }: { status?: string }) {
  const normalized = (status || "draft").toLowerCase();
  if (normalized === "published") {
    return (
      <span className="inline-flex items-center rounded-md border border-primary-500/20 bg-primary-500/10 px-2.5 py-1 text-xs font-medium text-primary-300">
        Publicado
      </span>
    );
  }
  if (normalized === "archived") {
    return (
      <span className="inline-flex items-center rounded-md border border-slate-500/20 bg-slate-500/10 px-2.5 py-1 text-xs font-medium text-[var(--ds-text-secondary)]">
        Arquivado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
      Rascunho
    </span>
  );
}

function getTriggerLabel(workflow: WorkflowItem): string {
  const triggerNode = workflow.nodes.find((node) => node?.data?.type === "trigger");
  const triggerType = triggerNode?.data?.config?.triggerType;
  if (typeof triggerType === "string" && triggerType.trim()) {
    const trimmed = triggerType.trim();
    if (trimmed === "Keywords") return "Palavras-chave";
    if (trimmed === "Webhook") return "Webhook";
    if (trimmed === "Manual") return "Manual";
    return trimmed;
  }
  if (triggerType === "Keywords") {
    return "Palavras-chave";
  }
  return "Manual";
}

export default function WorkflowsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [isSettingDefault, setIsSettingDefault] = useState(false);
  const [defaultWorkflowId, setDefaultWorkflowId] = useState<string | null>(null);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["builder-workflows"],
    queryFn: api.workflow.getAll,
    staleTime: 5000,
  });

  const metricsQuery = useQuery({
    queryKey: ["builder-workflows-metrics"],
    queryFn: () => api.workflow.getMetrics(),
    staleTime: 5000,
  });

  const defaultWorkflowQuery = useQuery({
    queryKey: ["builder-default-workflow"],
    queryFn: async () => {
      const response = await fetch("/api/settings/workflow-builder");
      if (!response.ok) throw new Error("Falha ao buscar fluxo padrão");
      return response.json() as Promise<{ defaultWorkflowId: string }>;
    },
    staleTime: 5000,
  });

  useEffect(() => {
    if (defaultWorkflowQuery.data?.defaultWorkflowId) {
      setDefaultWorkflowId(defaultWorkflowQuery.data.defaultWorkflowId);
    }
  }, [defaultWorkflowQuery.data?.defaultWorkflowId]);

  const workflows = (data || []).filter((workflow) => {
    if (!search.trim()) return true;
    return workflow.name.toLowerCase().includes(search.toLowerCase());
  });

  const sortedWorkflows = [...workflows].sort((a, b) => {
    if (a.id === defaultWorkflowId) return -1;
    if (b.id === defaultWorkflowId) return 1;
    return 0;
  });

  const selectedWorkflowId = searchParams?.get("workflowId");
  const versionsQuery = useQuery({
    queryKey: ["builder-workflow-versions", selectedWorkflowId],
    queryFn: () =>
      selectedWorkflowId
        ? api.workflow.getVersions(selectedWorkflowId)
        : Promise.resolve([]),
    enabled: Boolean(selectedWorkflowId),
  });

  const handleCreate = async () => {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const name = `Fluxo ${stamp}`;
    try {
      const created = await api.workflow.create({ name, nodes: [], edges: [] });
      router.push(`/builder/${encodeURIComponent(created.id)}`);
    } catch (error) {
      console.error("Failed to create workflow:", error);
      toast.error("Falha ao criar fluxo");
    }
  };

  const handleRollback = async (versionId: string) => {
    if (!selectedWorkflowId) return;
    const confirmed = window.confirm("Confirmar rollback dessa versão?");
    if (!confirmed) return;
    setIsRollingBack(true);
    setRollingBackId(versionId);
    try {
      await api.workflow.rollback(selectedWorkflowId, versionId);
      toast.success("Reversão aplicada");
      await Promise.all([versionsQuery.refetch(), refetch()]);
    } catch (error) {
      console.error("Failed to rollback workflow:", error);
      toast.error("Falha ao reverter");
    } finally {
      setIsRollingBack(false);
      setRollingBackId(null);
    }
  };

  const handlePublish = async (workflowId: string) => {
    setIsPublishing(true);
    setPublishingId(workflowId);
    try {
      await api.workflow.publish(workflowId);
      toast.success("Fluxo publicado");
      await Promise.all([refetch(), versionsQuery.refetch()]);
    } catch (error) {
      console.error("Failed to publish workflow:", error);
      toast.error("Falha ao publicar");
    } finally {
      setIsPublishing(false);
      setPublishingId(null);
    }
  };

  const handleDuplicate = async (workflowId: string) => {
    setIsDuplicating(true);
    setDuplicatingId(workflowId);
    try {
      const created = await api.workflow.duplicate(workflowId);
      toast.success("Fluxo duplicado");
      router.push(`/builder/${encodeURIComponent(created.id)}`);
    } catch (error) {
      console.error("Failed to duplicate workflow:", error);
      toast.error("Falha ao duplicar fluxo");
    } finally {
      setIsDuplicating(false);
      setDuplicatingId(null);
    }
  };

  const handleDelete = async (workflowId: string) => {
    const confirmed = window.confirm(
      "Tem certeza que deseja excluir este fluxo? Essa ação não pode ser desfeita."
    );
    if (!confirmed) return;
    try {
      await api.workflow.delete(workflowId);
      if (defaultWorkflowId === workflowId) {
        await fetch("/api/settings/workflow-builder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defaultWorkflowId: "" }),
        });
        setDefaultWorkflowId(null);
      }
      toast.success("Fluxo excluido");
      await Promise.all([refetch(), defaultWorkflowQuery.refetch()]);
    } catch (error) {
      console.error("Failed to delete workflow:", error);
      toast.error("Falha ao excluir fluxo");
    }
  };
  const handleSetDefault = async (workflowId: string) => {
    setIsSettingDefault(true);
    try {
      const response = await fetch("/api/settings/workflow-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultWorkflowId: workflowId }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || "Falha ao definir fluxo padrão");
      }
      setDefaultWorkflowId(workflowId);
      toast.success("Fluxo padrão atualizado");
      await defaultWorkflowQuery.refetch();
    } catch (error) {
      console.error("Failed to set default workflow:", error);
      toast.error("Falha ao definir fluxo padrão");
    } finally {
      setIsSettingDefault(false);
    }
  };

  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Fluxos</PageTitle>
          <PageDescription>
            Crie e gerencie os fluxos do builder.
          </PageDescription>
        </div>
        <PageActions>
          <Button
            variant="outline"
            onClick={() => refetch()}
            className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)]"
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Atualizar
          </Button>
          <Button
            onClick={handleCreate}
            className="bg-primary-500 text-black hover:bg-primary-400 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Novo fluxo
          </Button>
        </PageActions>
      </PageHeader>

      <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/40 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-[var(--ds-text-secondary)]">
            <WorkflowIcon className="h-4 w-4 text-primary-600 dark:text-primary-400" />
            {workflows.length} fluxos encontrados
          </div>
          <div className="flex w-full max-w-sm items-center gap-2 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)] px-3 py-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar fluxo..."
              className="h-7 border-0 bg-transparent text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {isLoading && (
            <div className="rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-6 text-sm text-[var(--ds-text-secondary)]">
              Carregando fluxos...
            </div>
          )}

          {!isLoading && workflows.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-8 text-center text-[var(--ds-text-secondary)]">
              Nenhum fluxo criado ainda.
            </div>
          )}

          {!isLoading &&
            sortedWorkflows.map((workflow) => (
              // div com role="button" (não <button>): o card contém <Button>s internos
              // (Publicar, menu ...) e button-dentro-de-button é HTML inválido —
              // o parser fecha o botão externo no SSR e gera hydration mismatch.
              <div
                key={workflow.id}
                role="button"
                tabIndex={0}
                className={cn(
                  "group flex w-full cursor-pointer items-center justify-between rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] px-4 py-4 text-left transition hover:border-primary-500/40 hover:bg-[var(--ds-bg-hover)]",
                  workflow.id === defaultWorkflowId &&
                    "border-primary-500/30 bg-primary-500/5 ring-1 ring-primary-500/15"
                )}
                onClick={() =>
                  router.push(`/builder/${encodeURIComponent(workflow.id)}`)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/builder/${encodeURIComponent(workflow.id)}`);
                  }
                }}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)]">
                  <WorkflowIcon className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--ds-text-primary)]">
                    <span className="inline-flex items-center gap-2">
                      {workflow.name}
                      {workflow.id === defaultWorkflowId && (
                        <Star className="h-3.5 w-3.5 text-primary-300" />
                      )}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--ds-text-muted)]">
                    Atualizado em {formatDate(workflow.updatedAt)}
                  </div>
                  <div className="text-xs text-[var(--ds-text-muted)]">
                    Gatilho: {getTriggerLabel(workflow)}
                  </div>
                  {workflow.id === defaultWorkflowId && (
                    <div className="text-xs text-primary-300/80">
                      Fluxo padrão
                    </div>
                    )}
                    {workflow.lastPublishedVersion && (
                      <div className="text-xs text-primary-300/70">
                        Última publicada: v{workflow.lastPublishedVersion}
                      </div>
                    )}
                  </div>
                </div>
                  {workflow.description && (
                    <div className="text-xs text-[var(--ds-text-muted)]">
                      {workflow.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-2 text-xs text-[var(--ds-text-muted)]">
                    <span>
                      Execuções:{" "}
                      {metricsQuery.data?.byWorkflow?.[workflow.id]?.runs ?? 0}
                    </span>
                    <span>
                      Erros:{" "}
                      {metricsQuery.data?.byWorkflow?.[workflow.id]?.failed ?? 0}
                    </span>
                  </div>
                  <StatusBadge status={workflow.status} />
                  {workflow.status !== "published" && (
                    <Button
                      className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)]"
                      onClick={(event) => {
                        event.stopPropagation();
                        handlePublish(workflow.id);
                      }}
                      size="sm"
                      variant="outline"
                      disabled={isPublishing || publishingId === workflow.id}
                    >
                      {publishingId === workflow.id ? "Publicando..." : "Publicar"}
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)]"
                        size="sm"
                        variant="outline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {defaultWorkflowId !== workflow.id && (
                        <DropdownMenuItem
                          onClick={(event) => {
                            event.stopPropagation();
                            handleSetDefault(workflow.id);
                          }}
                          disabled={isSettingDefault}
                        >
                          Marcar como padrão
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDuplicate(workflow.id);
                        }}
                        disabled={isDuplicating || duplicatingId === workflow.id}
                      >
                        {duplicatingId === workflow.id
                          ? "Duplicando..."
                          : "Duplicar"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/workflows?workflowId=${encodeURIComponent(workflow.id)}`);
                        }}
                      >
                        Versões
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-400 focus:text-red-400"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(workflow.id);
                        }}
                      >
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ChevronRight className="h-4 w-4 text-[var(--ds-text-muted)] transition group-hover:text-[var(--ds-text-primary)]" />
                </div>
              </div>
            ))}
        </div>

        {selectedWorkflowId && (
          <div className="mt-6 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-[var(--ds-text-primary)]">
                Versões do fluxo
              </div>
              <Button
                variant="ghost"
                onClick={() => router.push("/workflows")}
                className="text-xs text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
              >
                Fechar
              </Button>
            </div>
            {!versionsQuery.isLoading &&
              versionsQuery.data &&
              versionsQuery.data.length > 0 && (
                <div className="mt-2 text-xs text-[var(--ds-text-muted)]">
                  Última publicada:{" "}
                  {versionsQuery.data.find((version) => version.status === "published")
                    ? `v${versionsQuery.data.find((version) => version.status === "published")?.version}`
                    : "—"}
                </div>
              )}
            <div className="mt-3 space-y-2">
              {versionsQuery.isLoading && (
                <div className="text-xs text-[var(--ds-text-secondary)]">Carregando versões...</div>
              )}
              {!versionsQuery.isLoading &&
                (versionsQuery.data || []).map((version) => (
                  <div
                    className="flex items-center justify-between rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)] px-3 py-2 text-xs text-[var(--ds-text-secondary)]"
                    key={version.id}
                  >
                    <div className="flex items-center gap-3">
                      <span>v{version.version}</span>
                      <span className="text-[var(--ds-text-muted)]">{version.status}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)]"
                      disabled={
                        isRollingBack ||
                        rollingBackId === version.id ||
                        version.status === "published"
                      }
                      onClick={() => handleRollback(version.id)}
                    >
                      {rollingBackId === version.id
                        ? "Aplicando..."
                        : "Reverter"}
                    </Button>
                  </div>
                ))}
              {!versionsQuery.isLoading &&
                (versionsQuery.data || []).length === 0 && (
                  <div className="text-xs text-[var(--ds-text-secondary)]">
                    Nenhuma versão encontrada.
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}
