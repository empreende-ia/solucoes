'use client'

import React from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, ExternalLink, Loader2, Save, UploadCloud, Wand2, LayoutTemplate, PenSquare, Check } from 'lucide-react'

import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { MetaFlowPreview } from '@/components/ui/MetaFlowPreview'

// Dynamic imports para componentes pesados (~1700+ linhas cada)
const UnifiedFlowEditor = dynamic(
  () => import('@/components/features/flows/builder/UnifiedFlowEditor').then(m => m.UnifiedFlowEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center p-8 text-[var(--ds-text-secondary)]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Carregando editor...
      </div>
    ),
  }
)

const AdvancedFlowPanel = dynamic(
  () => import('@/components/features/flows/builder/dynamic-flow/AdvancedFlowPanel').then(m => m.AdvancedFlowPanel),
  { ssr: false }
)
import { Textarea } from '@/components/ui/textarea'
import { FLOW_TEMPLATES } from '@/lib/flow-templates'
import { useFlowBuilderController } from '@/hooks/useFlowBuilder'

export default function FlowBuilderEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = React.use(params)

  const {
    controller,
    flow,
    router,

    name,
    setName,
    metaFlowId,
    step,
    setStep,
    formPreviewJson,
    formPreviewSelectedScreenId,
    previewSelectedEditorKey,
    previewDynamicSpec,
    editorSpecOverride,
    startMode,
    aiPrompt,
    setAiPrompt,
    aiLoading,
    selectedTemplateKey,
    hoverTemplateKey,
    showAdvancedPanel,

    advancedGate,
    shouldShowLoading,
    metaStatus,
    hasMetaErrors,
    statusLabel,
    statusClass,
    steps,
    previewFlowJson,
    finalScreenId,
    confirmationState,
    panelClass,

    handleEditorPreviewChange,
    handleGenerateWithAI,
    handleApplyTemplate,
    handleTemplateHover,
    handleTemplateClick,
    handleTemplateListMouseLeave,
    handleStartModeSelect,
    handleCancelStartMode,
    handleOpenAdvanced,
    handleCloseAdvancedPanel,
    handlePreviewScreenIdChange,
    handleEditorSave,
    handleAdvancedScreensChange,
    handleAdvancedRoutingChange,
    handleSaveDraft,
    handleResetPublication,
    handlePublishToMeta,
    handleSelectPreviewEditorKey,
    applyConfirmationPatch,
    collectFieldCatalog,
  } = useFlowBuilderController(id)

  return (
    <Page>
      <PageHeader>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Templates / MiniApps / Builder</div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <PageTitle>Editor de MiniApp</PageTitle>
              {flow ? (
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${statusClass}`}>
                  {statusLabel}
                </span>
              ) : null}
            </div>
            <PageDescription>
              MiniApp é uma experiência por telas. Edite conteúdo e navegação sem precisar alternar modos.
            </PageDescription>
          </div>
        </div>
        <PageActions>
          <div className="flex items-center gap-2">
            <Link href="/templates?tab=flows">
              <Button variant="outline" className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)] hover:bg-[var(--ds-bg-hover)]">
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
            </Link>
            <Link href="/flows/builder">
              <Button variant="outline" className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)] hover:bg-[var(--ds-bg-hover)]">
                Lista
              </Button>
            </Link>
          </div>
        </PageActions>
      </PageHeader>

      {shouldShowLoading ? (
        <div className={`${panelClass} p-8 text-[var(--ds-text-secondary)] flex items-center gap-3`}>
          <Loader2 className="w-5 h-5 animate-spin" />
          Carregando miniapp...
        </div>
      ) : controller.isError ? (
        <div className={`${panelClass} p-8 text-red-300 space-y-2`}>
          <div className="font-medium">Falha ao carregar miniapp.</div>
          <div className="text-sm text-red-200/90 whitespace-pre-wrap">
            {controller.error?.message || 'Erro desconhecido'}
          </div>
          <div>
            <Button variant="outline" onClick={() => router.refresh()} className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)] hover:bg-[var(--ds-bg-hover)]">
              Tentar novamente
            </Button>
          </div>
        </div>
      ) : !flow ? (
        <div className={`${panelClass} p-8 text-[var(--ds-text-secondary)]`}>MiniApp não encontrada.</div>
      ) : (
        <>
          <div className="mt-4 grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6 items-start">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {steps.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStep(item.id)}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      step === item.id
                        ? 'border-primary-400/40 bg-primary-500/10 text-[var(--ds-text-primary)]'
                        : 'border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]'
                    }`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--ds-border-subtle)] text-xs font-semibold leading-none">
                      {item.id}
                    </span>
                    <span className="uppercase tracking-widest text-xs">{item.label}</span>
                  </button>
                ))}
              </div>

              {step === 1 && (
                <div className={`${panelClass} p-6 space-y-6`}>
                  <div>
                    <div className="text-lg font-semibold text-[var(--ds-text-primary)]">Como quer começar?</div>
                    <div className="text-xs text-[var(--ds-text-muted)]">Escolha uma opção para criar sua MiniApp.</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button
                      type="button"
                      aria-pressed={startMode === 'ai'}
                      onClick={() => handleStartModeSelect('ai')}
                      className={`relative rounded-2xl border p-4 text-left transition ${
                        startMode === 'ai'
                          ? 'border-primary-400/40 bg-primary-500/10'
                          : 'border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] hover:bg-[var(--ds-bg-hover)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-[var(--ds-text-primary)] font-semibold">
                        <Wand2 className="h-4 w-4" />
                        Criar com IA
                      </div>
                      <div className="mt-1 text-xs text-[var(--ds-text-secondary)]">Descreva o que precisa e a IA monta as perguntas.</div>
                    </button>

                    <button
                      type="button"
                      aria-pressed={startMode === 'template'}
                      onClick={() => handleStartModeSelect('template')}
                      className={`relative rounded-2xl border p-4 text-left transition ${
                        startMode === 'template'
                          ? 'border-primary-400/40 bg-primary-500/10'
                          : 'border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] hover:bg-[var(--ds-bg-hover)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-[var(--ds-text-primary)] font-semibold">
                        <LayoutTemplate className="h-4 w-4" />
                        Usar modelo pronto
                      </div>
                      <div className="mt-1 text-xs text-[var(--ds-text-secondary)]">Escolha um template e personalize.</div>
                    </button>

                    <button
                      type="button"
                      aria-pressed={startMode === 'zero'}
                      onClick={() => handleStartModeSelect('zero')}
                      className={`relative rounded-2xl border p-4 text-left transition ${
                        startMode === 'zero'
                          ? 'border-primary-400/40 bg-primary-500/10'
                          : 'border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] hover:bg-[var(--ds-bg-hover)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-[var(--ds-text-primary)] font-semibold">
                        <PenSquare className="h-4 w-4" />
                        Criar do zero
                      </div>
                      <div className="mt-1 text-xs text-[var(--ds-text-secondary)]">Comece com a primeira pergunta.</div>
                    </button>
                  </div>

                  {startMode === 'ai' ? (
                    <div className={`rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4 space-y-3 ${aiLoading ? 'animate-pulse' : ''}`}>
                      <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Criar com IA</div>
                      <div className="text-xs text-[var(--ds-text-muted)]">Descreva o que você quer coletar.</div>
                      <Textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        className="min-h-28 bg-[var(--ds-bg-surface)] border-[var(--ds-border-subtle)] text-[var(--ds-text-primary)]"
                        placeholder='Ex: "Quero um formulário de pré-cadastro para uma turma. Pergunte nome, telefone, e-mail e cidade."'
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
                          onClick={handleCancelStartMode}
                          disabled={aiLoading}
                        >
                          Cancelar
                        </Button>
                        <Button type="button" onClick={handleGenerateWithAI} disabled={aiLoading || aiPrompt.trim().length < 10}>
                          {aiLoading ? 'Gerando…' : 'Gerar MiniApp'}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {startMode === 'template' ? (
                    <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4 space-y-3">
                      <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Usar modelo pronto</div>
                      <div
                        className="grid grid-cols-1 md:grid-cols-2 gap-3"
                        onMouseLeave={handleTemplateListMouseLeave}
                      >
                        {FLOW_TEMPLATES.map((tpl) => (
                          <button
                            key={tpl.key}
                            type="button"
                            onMouseEnter={() => handleTemplateHover(tpl)}
                            onClick={() => handleTemplateClick(tpl)}
                            className={`rounded-xl border p-4 text-left transition ${
                              selectedTemplateKey === tpl.key
                                ? 'border-primary-400/40 bg-primary-500/10 text-[var(--ds-text-primary)]'
                                : 'border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold">{tpl.name}</div>
                              <span
                                className={
                                  'px-1.5 py-0.5 text-[10px] rounded ' +
                                  (tpl.isDynamic
                                    ? 'bg-primary-500/20 text-primary-200'
                                    : 'bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)]')
                                }
                              >
                                {tpl.isDynamic ? 'Dinâmico' : 'Simples'}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-[var(--ds-text-secondary)]">{tpl.description}</div>
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
                          onClick={handleCancelStartMode}
                        >
                          Cancelar
                        </Button>
                        <Button type="button" onClick={handleApplyTemplate} disabled={!selectedTemplateKey}>
                          Usar modelo
                        </Button>
                      </div>
                    </div>
                  ) : null}

                </div>
              )}

              <div className={`${panelClass} p-6 space-y-4 ${step === 2 ? '' : 'hidden'}`}>
                {step === 2 ? (
                  <UnifiedFlowEditor
                    flowName={name || flow?.name || 'MiniApp'}
                    currentSpec={editorSpecOverride || controller.spec}
                    flowJsonFromDb={(flow as any)?.flow_json}
                    isSaving={controller.isSaving}
                    selectedEditorKey={previewSelectedEditorKey}
                    onOpenAdvanced={handleOpenAdvanced}
                    onPreviewChange={handleEditorPreviewChange}
                    onPreviewScreenIdChange={(screenId) => handlePreviewScreenIdChange(screenId)}
                    onSave={(patch) => handleEditorSave(patch)}
                  />
                ) : null}

                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
                    onClick={() => setStep(3)}
                  >
                    Ir para finalizar
                  </Button>
                </div>
              </div>

              {step === 3 && (
                <div className={`${panelClass} p-6 space-y-4`}>
                  <div>
                    <div className="text-lg font-semibold text-[var(--ds-text-primary)]">Finalizar</div>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-widest text-[var(--ds-text-muted)] mb-2">Nome</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>

                  {previewDynamicSpec && finalScreenId ? (
                    <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 p-4 space-y-4">
                      <div>
                        <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Confirmação</div>
                        <div className="text-xs text-[var(--ds-text-secondary)] mt-1">
                          Controla a mensagem "Resposta registrada ✅" e quais campos aparecem no resumo.
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 px-3 py-2">
                        <div>
                          <div className="text-xs font-medium text-[var(--ds-text-secondary)]">Enviar confirmação ao usuário</div>
                          <div className="text-[11px] text-[var(--ds-text-muted)]">Mostra um resumo das respostas após finalizar</div>
                        </div>
                        <button
                          type="button"
                          className="h-6 w-12 rounded-full border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] relative"
                          aria-pressed={!confirmationState?.sendDisabled}
                          onClick={() => applyConfirmationPatch({ enabled: !!confirmationState?.sendDisabled })}
                        >
                          <span
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                              confirmationState?.sendDisabled ? 'left-0.5 opacity-40' : 'left-[26px]'
                            }`}
                          />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs uppercase tracking-widest text-[var(--ds-text-muted)] mb-2">Título (opcional)</label>
                          <Input
                            value={confirmationState?.title || ''}
                            onChange={(e) => {
                              // #region agent log
                              // #endregion
                              applyConfirmationPatch({ title: e.target.value })
                            }}
                            placeholder="Resposta registrada ✅"
                          />
                        </div>
                        <div>
                          <label className="block text-xs uppercase tracking-widest text-[var(--ds-text-muted)] mb-2">Rodapé (opcional)</label>
                          <Input
                            value={confirmationState?.footer || ''}
                            onChange={(e) => {
                              // #region agent log
                              // #endregion
                              applyConfirmationPatch({ footer: e.target.value })
                            }}
                            placeholder="Qualquer ajuste, responda esta mensagem."
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-medium text-[var(--ds-text-secondary)]">Campos no resumo</div>
                            <div className="text-[11px] text-[var(--ds-text-muted)]">Escolha o que aparece na mensagem após finalizar.</div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
                            onClick={() => applyConfirmationPatch({ fields: collectFieldCatalog(previewDynamicSpec).map((f) => f.name) })}
                          >
                            Selecionar tudo
                          </Button>
                        </div>

                        <div className="rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 p-3 max-h-56 overflow-auto space-y-2">
                          {collectFieldCatalog(previewDynamicSpec).map((f) => {
                            const selected = confirmationState?.fields ? confirmationState.fields.includes(f.name) : true
                            const customLabel = confirmationState?.labels ? confirmationState.labels[f.name] : ''
                            return (
                              <label key={f.name} className="flex items-center gap-3 text-sm text-[var(--ds-text-primary)]">
                                <Checkbox
                                  checked={selected}
                                  onCheckedChange={(checked) => {
                                    const current = confirmationState?.fields || collectFieldCatalog(previewDynamicSpec).map((x) => x.name)
                                    const next = checked
                                      ? Array.from(new Set([...current, f.name]))
                                      : current.filter((x) => x !== f.name)
                                    applyConfirmationPatch({ fields: next })
                                  }}
                                />
                                <div className="flex-1 min-w-0">
                                  <Input
                                    value={(customLabel || f.label) as string}
                                    onChange={(e) => {
                                      const base = confirmationState?.labels ? { ...confirmationState.labels } : {}
                                      const rawValue = e.target.value
                                      const nextValue = rawValue
                                      // #region agent log
                                      // #endregion
                                      const hasValue = rawValue.trim().length > 0
                                      if (!hasValue || rawValue === f.label) delete base[f.name]
                                      else base[f.name] = rawValue
                                      applyConfirmationPatch({ labels: base })
                                    }}
                                    className="h-9"
                                  />
                                  <div className="text-[11px] text-[var(--ds-text-muted)] mt-1">{f.name}</div>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-9 border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)] text-xs"
                                  onClick={() => {
                                    const base = confirmationState?.labels ? { ...confirmationState.labels } : {}
                                    delete base[f.name]
                                    applyConfirmationPatch({ labels: base })
                                  }}
                                >
                                  Resetar
                                </Button>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={handleSaveDraft}
                      disabled={controller.isSaving}
                      className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
                    >
                      {controller.isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Salvar rascunho
                    </Button>

                    {metaStatus === 'PUBLISHED' ? (
                      <Button
                        variant="outline"
                        onClick={handleResetPublication}
                        disabled={controller.isSaving}
                        className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
                      >
                        Resetar publicação
                      </Button>
                    ) : null}

                    <Button
                      onClick={handlePublishToMeta}
                      disabled={controller.isSaving || controller.isPublishingToMeta}
                      className="bg-white text-black hover:bg-slate-200"
                    >
                      {(controller.isSaving || controller.isPublishingToMeta) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UploadCloud className="w-4 h-4" />
                      )}
                      Enviar para Meta
                    </Button>
                  </div>
                </div>
              )}

            </div>

            <div className="space-y-4 lg:sticky lg:top-6 self-start">
              <div className={`${panelClass} p-4`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Resumo</div>
                    <div className="text-lg font-semibold text-[var(--ds-text-primary)]">Prévia</div>
                  </div>
                </div>

                {previewFlowJson ? (
                  <div className="flex items-center justify-center">
                    <MetaFlowPreview
                      flowJson={previewFlowJson}
                      selectedScreenId={formPreviewSelectedScreenId || undefined}
                      selectedEditorKey={previewSelectedEditorKey}
                      paths={
                        step === 2 && previewDynamicSpec
                          ? {
                              defaultNextByScreen: previewDynamicSpec.defaultNextByScreen,
                              branchesByScreen: previewDynamicSpec.branchesByScreen,
                            }
                          : undefined
                      }
                      onSelectEditorKey={handleSelectPreviewEditorKey}
                    />
                  </div>
                ) : (
                  <div className="py-16 text-center text-sm text-[var(--ds-text-muted)]">
                    A prévia aparece aqui assim que você criar a primeira tela.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      {showAdvancedPanel &&
        !!formPreviewJson &&
        typeof formPreviewJson === 'object' && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={handleCloseAdvancedPanel}
          />
          <AdvancedFlowPanel
            screens={(formPreviewJson as any)?.screens || []}
            routingModel={(formPreviewJson as any)?.routing_model || {}}
            onScreensChange={handleAdvancedScreensChange}
            onRoutingChange={handleAdvancedRoutingChange}
            onClose={handleCloseAdvancedPanel}
          />
        </>
      )}
    </Page>
  )
}
