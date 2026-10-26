import { useMemo, useRef, useState } from 'react';
import { AlertCircle, Bot, CheckCircle2, Loader2, MessageCircle, Send, ThumbsDown, ThumbsUp, UserRound } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/Button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { evalsApi, type ExpectedBehavior } from '@/services/evals';
import { knowledgeApi, type SimulatorGrounding } from '@/services/knowledge';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const profiles = [
  { id: 'curious', label: 'Curioso', context: 'Está conhecendo a empresa agora, tem uma dor vaga e faz perguntas diretas antes de explicar o contexto.' },
  { id: 'qualified', label: 'Bom perfil', context: 'Tem problema claro, urgência moderada e autoridade para avaliar uma solução.' },
  { id: 'no_fit', label: 'Fora de perfil', context: 'Busca algo que a empresa não oferece e não deve receber agendamento forçado.' },
  { id: 'objection', label: 'Com objeção', context: 'Demonstra interesse, mas considera a solução cara e quer comparar alternativas.' },
  { id: 'upset', label: 'Insatisfeito', context: 'Está frustrado, pede ajuda objetiva e pode solicitar atendimento humano.' },
] as const;

export default function AgentSimulator({ onScenarioCreated, draftSaved = true }: { onScenarioCreated?: () => Promise<void> | void; draftSaved?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [profileId, setProfileId] = useState<(typeof profiles)[number]['id']>('curious');
  const [contactName, setContactName] = useState('Marina');
  const [grounding, setGrounding] = useState<SimulatorGrounding | null>(null);
  const [feedback, setFeedback] = useState<'good' | 'problem' | null>(null);
  const [expectedBehavior, setExpectedBehavior] = useState<ExpectedBehavior>('responder');
  const [expectedContent, setExpectedContent] = useState('');
  const [savingScenario, setSavingScenario] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const profile = profiles.find((item) => item.id === profileId)!;
  const lastAssistant = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant'), [messages]);

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setFeedback(null);
    try {
      const response = await knowledgeApi.simulate(nextMessages, {
        contact_name: contactName.trim() || 'Lead de Teste',
        profile_context: profile.context,
      });
      setMessages((current) => [...current, { role: 'assistant', content: response.reply }]);
      setGrounding(response.grounding);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível responder no simulador.');
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const saveScenario = async () => {
    const lastUserIndex = messages.map((message) => message.role).lastIndexOf('user');
    const lastUser = lastUserIndex >= 0 ? messages[lastUserIndex] : undefined;
    if (!lastUser) return;
    setSavingScenario(true);
    try {
      await evalsApi.createCase({
        title: `Simulação: ${lastUser.content.slice(0, 80)}`,
        query: lastUser.content,
        messages: messages.slice(0, lastUserIndex),
        expected_behavior: expectedBehavior,
        expected_content: expectedBehavior === 'responder' ? expectedContent.trim() || null : null,
        category: expectedBehavior === 'agendar' ? 'acao' : expectedBehavior === 'transferir' ? 'handoff' : expectedBehavior === 'opt_out' ? 'seguranca' : 'factual',
        origin: 'simulador',
        severity: feedback === 'problem' ? 'critical' : 'warning',
        notes: `Perfil simulado: ${profile.label}. ${profile.context}`,
      });
      toast.success('Conversa adicionada às situações de teste.');
      await onScenarioCreated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a situação.');
    } finally {
      setSavingScenario(false);
    }
  };

  return <div className="eia-card overflow-hidden"><div className="border-b border-border p-6"><p className="eia-eyebrow">Simulador</p><h2 className="mt-1 text-xl font-semibold text-foreground">Converse com o rascunho atual</h2><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Ações ficam em modo simulado: nenhum agendamento, cancelamento, transferência ou opt-out altera dados reais.</p>{!draftSaved && <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Você tem edições sendo salvas — a conversa usa a última versão salva do rascunho e as novas mudanças entram em instantes.</p>}<div className="mt-5 grid gap-3 md:grid-cols-[220px_1fr]"><label className="text-sm font-medium">Nome fictício<Input value={contactName} onChange={(event) => setContactName(event.target.value)} className="mt-1.5" placeholder="Ex.: Marina" /></label><div><p className="text-sm font-medium text-foreground">Perfil do lead</p><div className="mt-1.5 flex flex-wrap gap-2">{profiles.map((item) => <button key={item.id} type="button" onClick={() => { setProfileId(item.id); setMessages([]); setGrounding(null); }} className={cn('rounded-full border px-3 py-2 text-xs font-medium', profileId === item.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>{item.label}</button>)}</div><p className="mt-2 text-xs text-muted-foreground">{profile.context}</p></div></div></div><div className="grid min-h-[480px] lg:grid-cols-[minmax(0,1fr)_320px]"><div className="flex min-h-[480px] flex-col border-b border-border lg:border-b-0 lg:border-r"><div className="flex-1 space-y-3 overflow-y-auto p-5">{messages.length === 0 && <div className="flex h-full min-h-64 flex-col items-center justify-center text-center"><MessageCircle className="h-7 w-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium text-foreground">Inicie uma conversa realista</p><p className="mt-1 max-w-sm text-xs text-muted-foreground">Ex.: “Vi o site de vocês, mas ainda não entendi se isso serve para uma empresa pequena.”</p></div>}{messages.map((message, index) => <div key={`${index}-${message.role}`} className={cn('flex gap-2', message.role === 'user' ? 'justify-end' : 'justify-start')}><span className={cn('mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', message.role === 'user' ? 'order-2 bg-muted' : 'bg-primary text-primary-foreground')}>{message.role === 'user' ? <UserRound className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}</span><div className={cn('max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed', message.role === 'user' ? 'rounded-tr-sm bg-primary text-primary-foreground' : 'rounded-tl-sm border border-border bg-card text-foreground')}>{message.content}</div></div>)}{sending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A agente está respondendo…</div>}</div><div className="border-t border-border p-4"><div className="flex gap-2"><Input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) void send(); }} placeholder="Escreva como o lead…" disabled={sending} /><Button variant="primary" onClick={() => void send()} disabled={sending || !input.trim()}><Send className="h-4 w-4" />Enviar</Button></div></div></div><aside className="space-y-4 bg-muted/15 p-5"><div><p className="text-sm font-semibold text-foreground">Avalie a última resposta</p>{!lastAssistant ? <p className="mt-2 text-xs text-muted-foreground">A avaliação aparecerá depois da primeira resposta.</p> : <div className="mt-3 flex gap-2"><Button variant={feedback === 'good' ? 'primary' : 'secondary'} size="sm" onClick={() => setFeedback('good')}><ThumbsUp className="h-4 w-4" />Boa</Button><Button variant={feedback === 'problem' ? 'primary' : 'secondary'} size="sm" onClick={() => setFeedback('problem')}><ThumbsDown className="h-4 w-4" />Problemática</Button></div>}</div>{feedback && <div className="rounded-xl border border-border bg-card p-3"><div className="flex items-start gap-2">{feedback === 'good' ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> : <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />}<div><p className="text-sm font-medium text-foreground">Registre o esperado</p><p className="mt-1 text-xs text-muted-foreground">Transforme esta conversa completa em teste de múltiplos turnos.</p></div></div><select value={expectedBehavior} onChange={(event) => setExpectedBehavior(event.target.value as ExpectedBehavior)} className="mt-3 h-10 w-full rounded-xl border border-input bg-secondary px-3 text-sm"><option value="responder">Responder com a base</option><option value="recusar">Não inventar</option><option value="transferir">Encaminhar para humano</option><option value="agendar">Conduzir agendamento</option><option value="opt_out">Respeitar pedido de parada</option></select>{expectedBehavior === 'responder' && <textarea value={expectedContent} onChange={(event) => setExpectedContent(event.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-input bg-secondary p-3 text-sm" placeholder="Informação ou comportamento que deve aparecer…" />}<Button variant="secondary" size="sm" className="mt-3 w-full" disabled={savingScenario} onClick={() => void saveScenario()}>{savingScenario ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Salvar como situação de teste</Button></div>}<div><p className="text-sm font-semibold text-foreground">O que sustentou a resposta</p>{grounding ? <div className="mt-3 space-y-2"><div className="rounded-xl border border-border bg-card p-3"><p className="text-xs font-medium text-foreground">Fontes consultadas</p><p className="mt-1 text-xs text-muted-foreground">{grounding.searches.reduce((sum, search) => sum + search.results.length, 0)} resultado(s) em {grounding.searches.length} busca(s)</p></div><div className="rounded-xl border border-border bg-card p-3"><p className="text-xs font-medium text-foreground">Ações simuladas</p><div className="mt-2 flex flex-wrap gap-1">{grounding.tool_events.length ? grounding.tool_events.map((event, index) => <Badge key={`${event.tool}-${index}`} variant={event.ok ? 'success' : 'muted'}>{event.tool}</Badge>) : <span className="text-xs text-muted-foreground">Nenhuma ação nesta resposta.</span>}</div></div>{grounding.unanswered.length > 0 && <div className="rounded-xl border border-border bg-muted/30 p-3"><p className="text-xs font-medium text-foreground">Lacunas detectadas</p>{grounding.unanswered.map((item) => <p key={item.pergunta} className="mt-1 text-xs text-muted-foreground">{item.pergunta}</p>)}</div>}</div> : <p className="mt-2 text-xs text-muted-foreground">Fontes, lacunas e ações simuladas aparecerão aqui.</p>}</div><Button variant="ghost" size="sm" onClick={() => { setMessages([]); setGrounding(null); setFeedback(null); }}>Limpar conversa</Button></aside></div></div>;
}
