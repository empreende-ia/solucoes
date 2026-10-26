import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, Check, Clipboard, Code2, Loader2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/Button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { AgentConfig } from '@/domain/agent-config';
import { diffLines } from '@/lib/textDiff';
import { cn } from '@/lib/utils';
import {
  getAgentCompiledPromptPreview,
  getCurrentAgentContext,
  type AgentPromptPreview,
} from '@/services/agent-config';
// O compilador é um módulo puro compartilhado com as Edge Functions: compilar aqui
// dá prévia instantânea a cada tecla, com o mesmo resultado do servidor.
import { compileAgentPrompt, type CompiledAgentPrompt } from '../../../supabase/functions/_shared/agent-prompt-compiler';

interface CompiledPromptInspectorProps {
  variant?: 'dialog' | 'inline';
  agentId?: string;
  revisionKey?: number;
  autoLoad?: boolean;
  /** Com uma configuração, o modo inline compila localmente — sem rede. */
  config?: AgentConfig | null;
  /** Configuração da versão ativa, para comparar o que muda. */
  publishedConfig?: AgentConfig | null;
  /** Habilita a conferência com o servidor (só faz sentido com rascunho salvo). */
  draftSaved?: boolean;
}

function IssueList({ issues }: { issues: CompiledAgentPrompt['issues'] }) {
  if (issues.length === 0) return null;
  return (
    <div className="space-y-2">
      {issues.map((item) => (
        <div key={`${item.code}-${item.field}`} className={item.severity === 'blocking' ? 'rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm' : 'rounded-xl border border-border bg-muted/40 p-3 text-sm'}>
          <div className="flex items-start gap-2">
            <AlertTriangle className={item.severity === 'blocking' ? 'mt-0.5 h-4 w-4 shrink-0 text-destructive' : 'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground'} />
            <div>
              <p className="font-medium text-foreground">{item.message}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{item.field}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Prévia compilada no navegador: atualiza a cada edição, sem esperar autosave nem
 * ida ao servidor. O servidor continua sendo a autoridade — nos testes, na
 * publicação e na conferência sob demanda oferecida aqui.
 */
function LocalPromptPreview({ config, publishedConfig, draftSaved, agentId }: {
  config: AgentConfig;
  publishedConfig: AgentConfig | null;
  draftSaved: boolean;
  agentId?: string;
}) {
  const deferredConfig = useDeferredValue(config);
  const [showDiff, setShowDiff] = useState(false);
  const [serverCheck, setServerCheck] = useState<'idle' | 'checking' | 'match' | 'mismatch' | 'error'>('idle');

  const compiled = useMemo(() => {
    try {
      return { ok: true as const, result: compileAgentPrompt(deferredConfig) };
    } catch (cause) {
      return { ok: false as const, message: cause instanceof Error ? cause.message : 'Não foi possível compilar a configuração.' };
    }
  }, [deferredConfig]);

  const publishedPrompt = useMemo(() => {
    if (!publishedConfig) return null;
    try {
      return compileAgentPrompt(publishedConfig).prompt;
    } catch {
      return null;
    }
  }, [publishedConfig]);

  const diff = useMemo(() => (
    showDiff && publishedPrompt !== null && compiled.ok
      ? diffLines(publishedPrompt, compiled.result.prompt)
      : null
  ), [showDiff, publishedPrompt, compiled]);

  // Qualquer edição invalida uma conferência anterior.
  useEffect(() => {
    setServerCheck('idle');
  }, [deferredConfig]);

  const checkServer = async () => {
    setServerCheck('checking');
    try {
      let resolvedAgentId = agentId;
      if (!resolvedAgentId) resolvedAgentId = (await getCurrentAgentContext())?.agentId;
      if (!resolvedAgentId) throw new Error('Configuração da agente não encontrada.');
      const server = await getAgentCompiledPromptPreview(resolvedAgentId);
      setServerCheck(compiled.ok && server.prompt === compiled.result.prompt ? 'match' : 'mismatch');
    } catch {
      setServerCheck('error');
    }
  };

  if (!compiled.ok) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Não foi possível compilar a configuração</p>
            <p className="mt-1 text-destructive/80">{compiled.message}</p>
          </div>
        </div>
      </div>
    );
  }

  const { result } = compiled;
  const added = diff?.filter((line) => line.type === 'added').length ?? 0;
  const removed = diff?.filter((line) => line.type === 'removed').length ?? 0;

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(result.prompt);
    toast.success('Prompt compilado copiado');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {result.hasBlockingIssues ? <Badge variant="destructive">Publicação bloqueada</Badge> : <Badge variant="success"><Check className="mr-1 h-3 w-3" />Pronto para avaliação</Badge>}
          <Badge variant="muted">{result.compilerVersion}</Badge>
          <Badge variant="outline">Prévia instantânea</Badge>
          <span>{result.sections.length} seções</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {publishedPrompt !== null && (
            <Button variant={showDiff ? 'primary' : 'ghost'} size="sm" onClick={() => setShowDiff((current) => !current)}>
              <ArrowLeftRight className="h-4 w-4" />
              {showDiff ? 'Ocultar diferenças' : 'Comparar com a versão ativa'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void copyPrompt()}><Clipboard className="h-4 w-4" />Copiar</Button>
        </div>
      </div>

      {result.sections.length > 0 && !showDiff && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Origem das seções</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{result.sections.map((section) => <Badge key={section} variant="outline">{section}</Badge>)}</div>
        </div>
      )}

      <IssueList issues={result.issues} />

      {diff ? (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            Em relação à versão ativa: <span className="font-medium text-success">+{added}</span> · <span className="font-medium text-destructive">−{removed}</span> linha(s).
            {added + removed === 0 && ' Nenhuma diferença.'}
          </p>
          <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-secondary p-4 font-mono text-xs leading-relaxed">
            {diff.map((line, index) => (
              <div
                key={index}
                className={cn(
                  line.type === 'added' && 'bg-success/15 text-foreground',
                  line.type === 'removed' && 'bg-destructive/10 text-muted-foreground line-through decoration-destructive/40',
                  line.type === 'same' && 'text-foreground/80',
                )}
              >
                {line.type === 'added' ? '+ ' : line.type === 'removed' ? '− ' : '  '}{line.text || ' '}
              </div>
            ))}
          </pre>
        </div>
      ) : (
        <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-secondary p-4 font-mono text-xs leading-relaxed text-foreground">{result.prompt}</pre>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Button variant="ghost" size="sm" disabled={!draftSaved || serverCheck === 'checking'} title={draftSaved ? undefined : 'Aguarde o rascunho salvar para conferir'} onClick={() => void checkServer()}>
          {serverCheck === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Conferir com o servidor
        </Button>
        {serverCheck === 'match' && <span className="flex items-center gap-1 text-success"><Check className="h-3.5 w-3.5" />Idêntico ao compilado no servidor.</span>}
        {serverCheck === 'mismatch' && <span className="text-destructive">O servidor compilou um texto diferente — recarregue a página; se persistir, avise o suporte.</span>}
        {serverCheck === 'error' && <span>Não foi possível conferir agora.</span>}
      </div>
    </div>
  );
}

function PromptPreview({ loading, preview, error, onReload }: {
  loading: boolean;
  preview: AgentPromptPreview | null;
  error: string | null;
  onReload: () => void;
}) {
  const copyPrompt = async () => {
    if (!preview) return;
    await navigator.clipboard.writeText(preview.prompt);
    toast.success('Prompt compilado copiado');
  };

  if (loading) return <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Compilando o rascunho salvo…</div>;
  if (error) return <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"><div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-medium">Não foi possível gerar a visualização</p><p className="mt-1 text-destructive/80">{error}</p><Button variant="outline" size="sm" className="mt-3" onClick={onReload}><RefreshCw className="h-4 w-4" />Tentar novamente</Button></div></div></div>;
  if (!preview) return <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center"><Code2 className="h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">Gere a visualização do rascunho para conferir o texto final.</p><Button variant="secondary" size="sm" className="mt-3" onClick={onReload}>Gerar visualização</Button></div>;

  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3"><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{preview.hasBlockingIssues ? <Badge variant="destructive">Publicação bloqueada</Badge> : <Badge variant="success"><Check className="mr-1 h-3 w-3" />Pronto para avaliação</Badge>}<Badge variant="muted">{preview.compilerVersion}</Badge><Badge variant="outline">Rascunho r{preview.draftRevision}</Badge><span>{preview.sections.length} seções</span><span className="font-mono">{preview.artifactChecksum.slice(0, 12)}</span></div><div className="flex gap-2"><Button variant="ghost" size="sm" onClick={onReload}><RefreshCw className="h-4 w-4" />Atualizar</Button><Button variant="outline" size="sm" onClick={() => void copyPrompt()}><Clipboard className="h-4 w-4" />Copiar</Button></div></div>{preview.sections.length > 0 && <div><p className="text-xs font-medium text-muted-foreground">Origem das seções</p><div className="mt-2 flex flex-wrap gap-1.5">{preview.sections.map((section) => <Badge key={section} variant="outline">{section}</Badge>)}</div></div>}<IssueList issues={preview.issues} /><pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-secondary p-4 font-mono text-xs leading-relaxed text-foreground">{preview.prompt}</pre></div>;
}

export default function CompiledPromptInspector({ variant = 'dialog', agentId, revisionKey, autoLoad = true, config, publishedConfig, draftSaved = false }: CompiledPromptInspectorProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<AgentPromptPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let resolvedAgentId = agentId;
      if (!resolvedAgentId) resolvedAgentId = (await getCurrentAgentContext())?.agentId;
      if (!resolvedAgentId) throw new Error('Configuração da agente não encontrada.');
      setPreview(await getAgentCompiledPromptPreview(resolvedAgentId));
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : 'Não foi possível compilar o rascunho.');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (variant === 'inline' && !config && autoLoad) void loadPreview();
  }, [autoLoad, config, loadPreview, revisionKey, variant]);

  if (variant === 'inline') {
    if (config) return <LocalPromptPreview config={config} publishedConfig={publishedConfig ?? null} draftSaved={draftSaved} agentId={agentId} />;
    return <PromptPreview loading={loading} preview={preview} error={error} onReload={() => void loadPreview()} />;
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) void loadPreview();
  };

  return <Dialog open={open} onOpenChange={handleOpenChange}><DialogTrigger asChild><Button variant="ghost" size="sm"><Code2 className="mr-2 h-4 w-4" />Ver prompt compilado</Button></DialogTrigger><DialogContent className="max-h-[88vh] max-w-4xl grid-rows-[auto_minmax(0,1fr)]"><DialogHeader><DialogTitle>Prompt compilado</DialogTitle><DialogDescription>Artefato derivado e somente leitura. Para mudar o comportamento, edite os campos estruturados ou as instruções avançadas.</DialogDescription></DialogHeader><div className="min-h-0 overflow-y-auto pr-1"><PromptPreview loading={loading} preview={preview} error={error} onReload={() => void loadPreview()} /></div></DialogContent></Dialog>;
}
