import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, buttonVariants } from '@/components/Button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { AgentAction, AgentActionId, AgentConfig } from '@/domain/agent-config';
import { cn } from '@/lib/utils';
import { calendarApi, type CalendarStatus } from '@/services/calendar';

const weekdays = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

const fieldClass = 'mt-1.5 w-full rounded-xl border border-input bg-secondary px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60';

function ActionHeader({
  icon: Icon,
  title,
  description,
  enabled,
  editable,
  onEnabledChange,
}: {
  icon: typeof CalendarDays;
  title: string;
  description: string;
  enabled: boolean;
  editable: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div className="flex items-start gap-3">
        <span className="rounded-xl border border-border bg-secondary p-2.5"><Icon className="h-5 w-5 text-primary" /></span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{title}</h3>
            <Badge variant={enabled ? 'success' : 'muted'}>{enabled ? 'Habilitada no rascunho' : 'Desabilitada'}</Badge>
            <Badge variant="outline">Permissão: versão publicada</Badge>
            <Badge variant="outline">Simulação obrigatória em testes</Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{enabled ? 'Ativa' : 'Inativa'}</span>
        <Switch checked={enabled} disabled={!editable} onCheckedChange={onEnabledChange} aria-label={`${enabled ? 'Desabilitar' : 'Habilitar'} ${title}`} />
      </div>
    </div>
  );
}

export default function AgentActionsSettings({
  config,
  updateConfig,
  editable,
}: {
  config: AgentConfig;
  updateConfig: (updater: (current: AgentConfig) => AgentConfig) => void;
  editable: boolean;
}) {
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const appointments = useMemo(
    () => config.actions.find((action) => action.actionId === 'appointments')!,
    [config.actions],
  );
  const handoff = useMemo(
    () => config.actions.find((action) => action.actionId === 'human_handoff')!,
    [config.actions],
  );

  useEffect(() => {
    let active = true;
    calendarApi.status()
      .then((status) => { if (active) setCalendarStatus(status); })
      .catch((cause) => { if (active) setCalendarError(cause instanceof Error ? cause.message : 'Não foi possível verificar a agenda.'); })
      .finally(() => { if (active) setCalendarLoading(false); });
    return () => { active = false; };
  }, []);

  const updateAction = (actionId: AgentActionId, patch: Partial<AgentAction>) => {
    updateConfig((current) => ({
      ...current,
      actions: current.actions.map((action) => action.actionId === actionId ? { ...action, ...patch } : action),
    }));
  };

  const scheduling = appointments.scheduling!;
  const handoffPolicy = handoff.handoff!;
  const calendarReady = calendarStatus?.connected && calendarStatus.syncEnabled;
  // "Não conectada" é uma pendência do cliente; integração fora do ar é um
  // problema do ambiente. Tratar as duas igual manda a pessoa tentar conectar
  // uma coisa que não tem como conectar.
  const calendarUnavailable = calendarStatus?.configured === false;
  const calendarHeadline = calendarLoading
    ? 'Verificando a agenda…'
    : calendarReady
      ? `Conectada${calendarStatus?.accountEmail ? ` como ${calendarStatus.accountEmail}` : ''}`
      : calendarUnavailable
        ? 'A conexão de agenda não está no ar neste ambiente'
        : 'A agenda ainda não está pronta';
  const calendarDetail = calendarError
    || (calendarReady
      ? 'Os eventos confirmados serão espelhados na agenda conectada.'
      : calendarUnavailable
        ? `Falta configuração no servidor${calendarStatus?.missingConfig?.length ? `: ${calendarStatus.missingConfig.join(', ')}` : ''}. A Lara segue agendando, só não espelha em agenda externa.`
        : 'Conecte e ative a sincronização antes de publicar agendamentos.');

  return (
    <div className="space-y-5">
      <div className="eia-card p-6">
        <p className="eia-eyebrow">Ações</p>
        <h2 className="mt-1 text-xl font-semibold text-foreground">O que a agente pode fazer</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Cada ação exige dados completos, confirmação explícita e retorno positivo da integração. No simulador, nada é executado de verdade.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/25 p-4"><ShieldCheck className="h-5 w-5 text-primary" /><p className="mt-2 text-sm font-medium text-foreground">Confirmação obrigatória</p><p className="mt-1 text-xs text-muted-foreground">A fala do lead que autorizou a ação é validada antes da execução.</p></div>
          <div className="rounded-xl border border-border bg-muted/25 p-4"><CheckCircle2 className="h-5 w-5 text-primary" /><p className="mt-2 text-sm font-medium text-foreground">Sucesso verificável</p><p className="mt-1 text-xs text-muted-foreground">A agente só confirma depois que a ferramenta retorna sucesso.</p></div>
          <div className="rounded-xl border border-border bg-muted/25 p-4"><Clock3 className="h-5 w-5 text-primary" /><p className="mt-2 text-sm font-medium text-foreground">Teste sem efeito real</p><p className="mt-1 text-xs text-muted-foreground">Agendar, cancelar e transferir são sempre simulados nos testes.</p></div>
        </div>
      </div>

      <section className="eia-card p-6">
        <ActionHeader
          icon={CalendarDays}
          title="Agendamentos"
          description="Consultar disponibilidade, agendar, reagendar e cancelar usando as mesmas regras."
          enabled={appointments.enabled}
          editable={editable}
          onEnabledChange={(enabled) => updateAction('appointments', { enabled })}
        />

        <div className={cn('mt-5 rounded-xl border p-4', calendarReady ? 'border-success/25 bg-success/[0.04]' : 'border-border bg-muted/20')}>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              {calendarLoading ? <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-muted-foreground" /> : calendarReady ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" /> : <AlertCircle className="mt-0.5 h-5 w-5 text-muted-foreground" />}
              <div>
                <p className="text-sm font-medium text-foreground">{calendarHeadline}</p>
                <p className="mt-1 text-xs text-muted-foreground">{calendarDetail}</p>
              </div>
            </div>
            <Link to="/settings?tab=calendar" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Configurar agenda<ExternalLink className="h-3.5 w-3.5" /></Link>
          </div>
        </div>

        {appointments.enabled && (
          <div className="mt-5 space-y-5">
            <div className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 md:grid-cols-2">
              <label className="text-sm font-medium text-foreground">Finalidade<textarea disabled={!editable} value={appointments.purpose} onChange={(event) => updateAction('appointments', { purpose: event.target.value })} className={cn(fieldClass, 'min-h-24 resize-y')} placeholder="Ex.: Consultar disponibilidade e criar reuniões confirmadas." /></label>
              <label className="text-sm font-medium text-foreground">Dados obrigatórios<textarea disabled={!editable} value={appointments.requiredFields.join('\n')} onChange={(event) => updateAction('appointments', { requiredFields: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) })} className={cn(fieldClass, 'min-h-24 resize-y')} placeholder={'data\nhorário\nnome e contato'} /><span className="mt-1 block text-xs font-normal text-muted-foreground">Um item por linha. Todos devem existir antes da confirmação.</span></label>
              <label className="text-sm font-medium text-foreground md:col-span-2">Resposta após sucesso<textarea disabled={!editable} value={appointments.successMessage} onChange={(event) => updateAction('appointments', { successMessage: event.target.value })} className={cn(fieldClass, 'min-h-20 resize-y')} placeholder="Ex.: Confirme data e horário somente depois que a agenda retornar sucesso." /></label>
              <div className="flex flex-wrap gap-2 md:col-span-2"><Badge variant="muted">Confirmação explícita obrigatória</Badge><Badge variant="muted">Ferramenta simulada nos testes</Badge><Badge variant={calendarReady ? 'success' : 'muted'}>{calendarReady ? 'Integração conectada' : 'Integração pendente'}</Badge></div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm font-medium text-foreground">Duração padrão (min)<Input type="number" min={15} max={240} disabled={!editable} value={scheduling.durationMinutes} onChange={(event) => updateAction('appointments', { scheduling: { ...scheduling, durationMinutes: Number(event.target.value) } })} className="mt-1.5" /></label>
            <label className="text-sm font-medium text-foreground">Antecedência mínima (h)<Input type="number" min={0} max={720} disabled={!editable} value={scheduling.minimumNoticeHours} onChange={(event) => updateAction('appointments', { scheduling: { ...scheduling, minimumNoticeHours: Number(event.target.value) } })} className="mt-1.5" /></label>
            <label className="text-sm font-medium text-foreground">Agendar até (dias)<Input type="number" min={1} max={730} disabled={!editable} value={scheduling.maximumAdvanceDays} onChange={(event) => updateAction('appointments', { scheduling: { ...scheduling, maximumAdvanceDays: Number(event.target.value) } })} className="mt-1.5" /></label>
            <label className="text-sm font-medium text-foreground">Intervalo entre reuniões (min)<Input type="number" min={0} max={240} disabled={!editable} value={scheduling.bufferMinutes} onChange={(event) => updateAction('appointments', { scheduling: { ...scheduling, bufferMinutes: Number(event.target.value) } })} className="mt-1.5" /></label>
            <label className="text-sm font-medium text-foreground">Início do atendimento<Input type="time" disabled={!editable} value={scheduling.startTime} onChange={(event) => updateAction('appointments', { scheduling: { ...scheduling, startTime: event.target.value } })} className="mt-1.5" /></label>
            <label className="text-sm font-medium text-foreground">Fim do atendimento<Input type="time" disabled={!editable} value={scheduling.endTime} onChange={(event) => updateAction('appointments', { scheduling: { ...scheduling, endTime: event.target.value } })} className="mt-1.5" /></label>
            <label className="text-sm font-medium text-foreground">Fuso horário<Input disabled={!editable} value={scheduling.timeZone} onChange={(event) => updateAction('appointments', { scheduling: { ...scheduling, timeZone: event.target.value } })} className="mt-1.5" placeholder="America/Sao_Paulo" /></label>
            <label className="text-sm font-medium text-foreground">Responsável <span className="font-normal text-muted-foreground">(opcional)</span><Input disabled={!editable} value={scheduling.responsible} onChange={(event) => updateAction('appointments', { scheduling: { ...scheduling, responsible: event.target.value } })} className="mt-1.5" placeholder="Ex.: Consultor disponível" /></label>
            <label className="text-sm font-medium text-foreground">Se a agenda falhar<select disabled={!editable} value={appointments.failurePolicy} onChange={(event) => updateAction('appointments', { failurePolicy: event.target.value as AgentAction['failurePolicy'] })} className={fieldClass}><option value="offer_alternative">Oferecer outro horário ou caminho</option><option value="handoff">Encaminhar para atendimento humano</option><option value="retry_once_then_handoff">Tentar uma vez e encaminhar</option></select></label>
            <div className="md:col-span-2 xl:col-span-3"><Label>Dias permitidos</Label><div className="mt-2 flex flex-wrap gap-2">{weekdays.map((day) => { const selected = scheduling.allowedWeekdays.includes(day.value); return <button key={day.value} type="button" disabled={!editable} onClick={() => updateAction('appointments', { scheduling: { ...scheduling, allowedWeekdays: selected ? scheduling.allowedWeekdays.filter((value) => value !== day.value) : [...scheduling.allowedWeekdays, day.value].sort() } })} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-50', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>{day.label}</button>; })}</div></div>
            </div>
          </div>
        )}
      </section>

      <section className="eia-card p-6">
        <ActionHeader
          icon={UserRoundCheck}
          title="Transferência para atendimento humano"
          description="Pausa a agente e entrega à equipe o motivo e um resumo da conversa."
          enabled={handoff.enabled}
          editable={editable}
          onEnabledChange={(enabled) => updateAction('human_handoff', { enabled })}
        />

        {handoff.enabled && (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-foreground">Finalidade<textarea disabled={!editable} value={handoff.purpose} onChange={(event) => updateAction('human_handoff', { purpose: event.target.value })} className={cn(fieldClass, 'min-h-24 resize-y')} placeholder="Ex.: Entregar casos sensíveis ou pedidos explícitos à equipe." /></label>
            <label className="text-sm font-medium text-foreground">Dados obrigatórios<textarea disabled={!editable} value={handoff.requiredFields.join('\n')} onChange={(event) => updateAction('human_handoff', { requiredFields: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) })} className={cn(fieldClass, 'min-h-24 resize-y')} placeholder={'motivo\nresumo da conversa'} /></label>
            <label className="block text-sm font-medium text-foreground md:col-span-2">Resposta após sucesso<textarea disabled={!editable} value={handoff.successMessage} onChange={(event) => updateAction('human_handoff', { successMessage: event.target.value })} className={cn(fieldClass, 'min-h-20 resize-y')} placeholder="Ex.: Avise que a equipe assumirá somente depois da confirmação da transferência." /></label>
            <label className="text-sm font-medium text-foreground">Destino<Input disabled={!editable} value={handoffPolicy.destination} onChange={(event) => updateAction('human_handoff', { handoff: { ...handoffPolicy, destination: event.target.value } })} className="mt-1.5" /></label>
            <label className="text-sm font-medium text-foreground">Horário da equipe<Input disabled={!editable} value={handoffPolicy.humanHours} onChange={(event) => updateAction('human_handoff', { handoff: { ...handoffPolicy, humanHours: event.target.value } })} className="mt-1.5" /></label>
            <label className="text-sm font-medium text-foreground">Fora do horário<select disabled={!editable} value={handoffPolicy.outsideHoursBehavior} onChange={(event) => updateAction('human_handoff', { handoff: { ...handoffPolicy, outsideHoursBehavior: event.target.value as typeof handoffPolicy.outsideHoursBehavior } })} className={fieldClass}><option value="queue_and_inform">Colocar na fila e informar</option><option value="collect_contact">Confirmar contato para retorno</option><option value="continue_safely">Continuar somente com orientações seguras</option></select></label>
            <label className="block text-sm font-medium text-foreground md:col-span-2">Quando encaminhar<textarea disabled={!editable} value={handoffPolicy.reasons.join('\n')} onChange={(event) => updateAction('human_handoff', { handoff: { ...handoffPolicy, reasons: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) } })} className={cn(fieldClass, 'min-h-28 resize-y')} placeholder="Um motivo por linha" /></label>
            <div className="rounded-xl border border-border bg-muted/25 p-4 md:col-span-2"><p className="text-sm font-medium text-foreground">Comportamento fixo de segurança</p><p className="mt-1 text-xs text-muted-foreground">Ao transferir, a agente é pausada e um resumo da conversa acompanha o encaminhamento. Essas proteções não podem ser desativadas.</p><div className="mt-3 flex flex-wrap gap-2"><Badge variant="muted">Confirmação explícita obrigatória</Badge><Badge variant="muted">Transferência simulada nos testes</Badge></div></div>
          </div>
        )}
      </section>
    </div>
  );
}
