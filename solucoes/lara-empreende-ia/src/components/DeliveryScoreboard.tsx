import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, TrendingDown, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  absoluteDelta,
  autonomyRate,
  durationDelta,
  fetchDeliveryScoreboard,
  formatDuration,
  isMissingWorkspaceError,
  schedulingRate,
  type Delta,
  type DeliveryScoreboard as Scoreboard,
} from '@/services/scoreboard';

/**
 * Placar de entrega da Lara.
 *
 * Responde a pergunta que o dashboard de volume não responde: a Lara está
 * entregando? Cinco números atribuídos à agente — quantos leads atendeu,
 * quantas conversas conduziu sozinha, quantas viraram agendamento, quanto o
 * lead esperou pela primeira resposta e quantas mensagens morreram na fila —
 * cada um comparado com o período anterior.
 *
 * Toda a agregação vem da RPC `lara_delivery_scoreboard`, restrita ao workspace
 * de quem está logado.
 */

interface DeliveryScoreboardProps {
  /** Janela em dias. O mesmo seletor de período do dashboard alimenta este valor. */
  days?: number;
  className?: string;
  /**
   * Ação do estado vazio. Sem isso, o botão leva para Configurações →
   * Testar e publicar, onde mora o lead de teste.
   */
  onTest?: () => void;
}

const deltaToneClass: Record<Delta['direction'], string> = {
  up: 'eia-delta--up',
  down: 'eia-delta--down',
  flat: 'eia-delta--flat',
  none: 'eia-delta--flat',
};

function DeltaLine({ delta }: { delta: Delta }) {
  return (
    <div className="eia-metric__foot">
      <span className={cn('eia-delta inline-flex items-center gap-1', deltaToneClass[delta.direction])}>
        {delta.movement === 'up' && <TrendingUp aria-hidden="true" className="h-3.5 w-3.5" />}
        {delta.movement === 'down' && <TrendingDown aria-hidden="true" className="h-3.5 w-3.5" />}
        {delta.label}
      </span>
      <span>vs. período anterior</span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  delta,
  caption,
}: {
  label: string;
  value: string;
  delta: Delta;
  caption?: string;
}) {
  return (
    <article className="eia-metric eia-metric--atmos">
      <span className="eia-metric__label">{label}</span>
      <strong className="eia-metric__value">{value}</strong>
      <DeltaLine delta={delta} />
      {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
    </article>
  );
}

function periodLabel(days: number): string {
  if (days <= 1) return 'nas últimas 24 horas';
  return `nos últimos ${days} dias`;
}

const DeliveryScoreboard: React.FC<DeliveryScoreboardProps> = ({ days = 7, className, onTest }) => {
  const [scoreboard, setScoreboard] = useState<Scoreboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    // Guarda de corrida: trocar de período rápido fazia a resposta antiga
    // sobrescrever a nova no dashboard antigo. Aqui a resposta atrasada é
    // descartada.
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await fetchDeliveryScoreboard(days);
        if (cancelled) return;
        setScoreboard(result);
      } catch (error) {
        if (cancelled) return;
        setScoreboard(null);
        // O erro vem do PostgREST como objeto simples, não como Error: quem
        // decide a mensagem é o código do Postgres, não o texto.
        setErrorMessage(
          isMissingWorkspaceError(error)
            ? 'Sua conta ainda não está vinculada a um workspace, então não há placar para mostrar.'
            : 'Não foi possível carregar o placar agora.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [days, reloadToken]);

  const header = (
    <header className="flex flex-col gap-1">
      <p className="eia-eyebrow">Entrega da Lara</p>
      <h2 className="text-lg font-medium tracking-[-0.01em] text-foreground">O que a Lara entregou.</h2>
      <p className="text-sm text-muted-foreground">
        Atendimentos {periodLabel(days)}, comparados com o período anterior de mesmo tamanho.
        Conversas de teste ficam de fora da conta.
      </p>
    </header>
  );

  if (loading) {
    return (
      <section aria-label="Placar de entrega da Lara" className={cn('flex flex-col gap-4', className)}>
        {header}
        <div className="eia-card flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando o placar.
        </div>
      </section>
    );
  }

  if (errorMessage || !scoreboard) {
    return (
      <section aria-label="Placar de entrega da Lara" className={cn('flex flex-col gap-4', className)}>
        {header}
        <div className="eia-card flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-foreground">{errorMessage}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setReloadToken((token) => token + 1)}>
            Tentar de novo
          </Button>
        </div>
      </section>
    );
  }

  const { atual, anterior } = scoreboard;

  if (atual.conversas === 0) {
    // Estado vazio que ensina: diz o que falta acontecer e oferece o caminho.
    // Zero conversas depois de um período com movimento é notícia, não vazio.
    const caiuDeMovimento = anterior.conversas > 0;
    return (
      <section aria-label="Placar de entrega da Lara" className={cn('flex flex-col gap-4', className)}>
        {header}
        <div className="eia-card flex flex-col items-start gap-3 p-6">
          <p className="text-base font-medium text-foreground">Sem conversas neste período.</p>
          <p className="max-w-prose text-sm text-muted-foreground">
            {caiuDeMovimento
              ? `No período anterior foram ${anterior.conversas} conversas. Confira se o canal continua conectado e envie um lead de teste para ver a Lara responder ponta a ponta.`
              : 'Nenhum lead escreveu ainda. Envie um lead de teste para ver a Lara receber, responder e entregar a mensagem antes de abrir o canal para o público.'}
          </p>
          {onTest ? (
            <Button type="button" variant="outline" size="sm" onClick={onTest}>
              Testar a Lara
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to="/settings?section=publish">Testar a Lara</Link>
            </Button>
          )}
        </div>
      </section>
    );
  }

  const autonomia = autonomyRate(atual);
  const agendamento = schedulingRate(atual);

  return (
    <section aria-label="Placar de entrega da Lara" className={cn('flex flex-col gap-4', className)}>
      {header}

      <div className="eia-metric-grid">
        <MetricCard
          label="Conversas atendidas"
          value={String(atual.conversas)}
          delta={absoluteDelta(atual.conversas, anterior.conversas)}
          caption="Leads que escreveram no período."
        />
        <MetricCard
          label="Sem humano"
          value={String(atual.semHumano)}
          delta={absoluteDelta(atual.semHumano, anterior.semHumano)}
          caption={
            autonomia === null
              ? 'A Lara respondeu e ninguém precisou entrar.'
              : `${autonomia}% das conversas: a Lara respondeu e ninguém precisou entrar.`
          }
        />
        <MetricCard
          label="Viraram agendamento"
          value={String(atual.comAgendamento)}
          delta={absoluteDelta(atual.comAgendamento, anterior.comAgendamento)}
          caption={
            agendamento === null
              ? 'Conversas com horário marcado na agenda.'
              : `${agendamento}% das conversas com horário marcado na agenda.`
          }
        />
        <MetricCard
          label="Primeira resposta"
          value={formatDuration(atual.medianaPrimeiraRespostaSegundos)}
          delta={durationDelta(atual.medianaPrimeiraRespostaSegundos, anterior.medianaPrimeiraRespostaSegundos)}
          caption="Mediana da espera do lead até a Lara responder."
        />
        <MetricCard
          label="Falhas na fila"
          value={String(atual.falhasNaFila)}
          delta={absoluteDelta(atual.falhasNaFila, anterior.falhasNaFila, false)}
          caption={
            atual.falhasNaFila > 0
              ? 'Mensagens que não viraram resposta. Cada uma é um lead esperando.'
              : 'Nenhuma mensagem ficou sem resposta por falha.'
          }
        />
      </div>
    </section>
  );
};

export default DeliveryScoreboard;
export { DeliveryScoreboard };
