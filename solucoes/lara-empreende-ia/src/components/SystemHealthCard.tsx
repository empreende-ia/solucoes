import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bot,
  CheckCircle,
  Clock,
  Compass,
  Gauge,
  Inbox,
  Layers,
  MessageSquare,
  Mic,
  Send,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react';

import { actionHref, type ValidationResult } from '@/services/goLive';

interface SystemHealthCardProps {
  /** Resultados técnicos da verificação — o checklist já cuida dos 6 passos. */
  results: ValidationResult[];
}

const componentIcons: Record<string, React.ReactNode> = {
  workspace_membership: <ShieldCheck className="h-4 w-4" aria-hidden="true" />,
  identity: <User className="h-4 w-4" aria-hidden="true" />,
  whatsapp: <MessageSquare className="h-4 w-4" aria-hidden="true" />,
  agent_config: <Bot className="h-4 w-4" aria-hidden="true" />,
  agent_prompt: <Bot className="h-4 w-4" aria-hidden="true" />,
  elevenlabs: <Mic className="h-4 w-4" aria-hidden="true" />,
  business_hours: <Clock className="h-4 w-4" aria-hidden="true" />,
  openai: <Compass className="h-4 w-4" aria-hidden="true" />,
  pipeline: <Layers className="h-4 w-4" aria-hidden="true" />,
  profile: <User className="h-4 w-4" aria-hidden="true" />,
  lara_settings: <Gauge className="h-4 w-4" aria-hidden="true" />,
  last_inbound: <Inbox className="h-4 w-4" aria-hidden="true" />,
  last_send: <Send className="h-4 w-4" aria-hidden="true" />,
  test_lead: <MessageSquare className="h-4 w-4" aria-hidden="true" />,
};

const componentLabels: Record<string, string> = {
  workspace_membership: 'Vínculo com o workspace',
  identity: 'Identidade',
  whatsapp: 'Canal de WhatsApp',
  agent_config: 'Configuração da agente',
  agent_prompt: 'Versão publicada',
  elevenlabs: 'ElevenLabs',
  business_hours: 'Horário comercial',
  openai: 'Chave da OpenAI',
  pipeline: 'Funil',
  profile: 'Perfil',
  lara_settings: 'Configurações',
  last_inbound: 'Última mensagem recebida',
  last_send: 'Último envio',
  test_lead: 'Lead de teste',
};

function statusIcon(status: ValidationResult['status']) {
  if (status === 'ok') return <CheckCircle className="h-4 w-4 text-success" aria-hidden="true" />;
  if (status === 'error') return <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />;
  return <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

function statusLabel(status: ValidationResult['status']) {
  if (status === 'ok') return 'Em ordem';
  if (status === 'error') return 'Com erro';
  return 'Atenção';
}

/**
 * Detalhe técnico da verificação. Antes era um card autônomo no dashboard que
 * buscava a validate-setup por conta própria; agora recebe os resultados do
 * checklist e mostra só o que não é passo de "Colocar no ar".
 */
export const SystemHealthCard: React.FC<SystemHealthCardProps> = ({ results }) => {
  if (results.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum detalhe técnico adicional nesta verificação.
      </p>
    );
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {results.map((result) => {
        const href = actionHref(result.action);
        return (
          <li
            key={result.component}
            className="flex items-start gap-3 rounded-xl border border-border bg-secondary px-4 py-3"
          >
            <span className="mt-0.5 shrink-0 text-muted-foreground">
              {componentIcons[result.component] ?? <Gauge className="h-4 w-4" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">
                {componentLabels[result.component] ?? result.component}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{result.message}</p>
              {result.details && (
                <p className="mt-1 text-xs text-muted-foreground">{result.details}</p>
              )}
              {href && (
                <Link
                  to={href}
                  style={{ color: 'var(--eia-link)' }}
                  className="mt-1.5 inline-flex text-xs font-medium underline underline-offset-2"
                >
                  {result.action?.label ?? 'Abrir'}
                </Link>
              )}
            </div>
            <span className="shrink-0" title={statusLabel(result.status)}>
              {statusIcon(result.status)}
              <span className="sr-only">{statusLabel(result.status)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
};
