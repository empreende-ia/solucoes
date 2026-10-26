import React, { useState } from 'react';
import { Check, Copy, ExternalLink, KeyRound, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../Button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { calendarApi, type CalendarStatus } from '@/services/calendar';

interface NylasCredentialsSettingsProps {
  status: CalendarStatus | null;
  isAdmin: boolean;
  /** Recarrega o status da agenda depois de salvar/limpar as credenciais. */
  onSaved: () => void | Promise<void>;
}

/**
 * Endereço para onde o Nylas devolve a autorização.
 *
 * É o mesmo valor que a edge function monta como `redirect_uri`
 * (`${SUPABASE_URL}/functions/v1/nylas-calendar`). Mostrar aqui não é
 * curiosidade técnica: sem cadastrar exatamente este endereço no painel do
 * Nylas, toda tentativa de conectar uma agenda termina em erro.
 */
const CALLBACK_URL = (() => {
  try {
    const base = new URL(import.meta.env.VITE_SUPABASE_URL as string).origin;
    return `${base}/functions/v1/nylas-calendar`;
  } catch {
    return null;
  }
})();

/** Passo do guia: número, título e o corpo explicativo. */
const StepCard: React.FC<{ number: number; title: string; children: React.ReactNode }> = ({ number, title, children }) => (
  <li className="flex gap-3">
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-medium text-muted-foreground">
      {number}
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className="mt-1 space-y-2 text-xs leading-relaxed text-muted-foreground">{children}</div>
    </div>
  </li>
);

const CallbackField: React.FC = () => {
  const [copied, setCopied] = useState(false);

  if (!CALLBACK_URL) {
    return (
      <p className="text-xs text-muted-foreground">
        Não foi possível montar o endereço de retorno desta instalação. Ele é o endereço do seu
        projeto Supabase seguido de <code>/functions/v1/nylas-calendar</code>.
      </p>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CALLBACK_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Navegador sem permissão de área de transferência: o texto está à vista
      // e pode ser copiado à mão.
      toast.info('Copie o endereço manualmente.');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-[var(--eia-radius-sm)] border border-border bg-background px-3 py-2 font-mono text-[11px] text-foreground">
        {CALLBACK_URL}
      </code>
      <Button type="button" variant="secondary" size="sm" onClick={copy} className="gap-1.5">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copiado' : 'Copiar'}
      </Button>
    </div>
  );
};

/**
 * Formulário das credenciais do Nylas dentro da própria plataforma.
 *
 * As chaves ficam na configuração da instância e são gravadas pela edge
 * function (service role), que valida contra a API do Nylas antes de salvar.
 * O campo é write-only: mostra apenas se está configurado, nunca o valor.
 */
const NylasCredentialsSettings: React.FC<NylasCredentialsSettingsProps> = ({ status, isAdmin, onSaved }) => {
  const [clientId, setClientId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiUri, setApiUri] = useState('https://api.us.nylas.com');
  const [saving, setSaving] = useState(false);

  const configured = status?.credentialsSource === 'settings' || status?.credentialsSource === 'env';
  const fromEnv = status?.credentialsSource === 'env';
  // Quem ainda não configurou precisa do guia aberto; quem já configurou não
  // quer o passo a passo ocupando a tela toda vez.
  const [guideOpen, setGuideOpen] = useState(!configured);

  const handleSave = async () => {
    const id = clientId.trim();
    const key = apiKey.trim();
    if (!id || !key) return;
    setSaving(true);
    try {
      await calendarApi.saveCredentials({ clientId: id, apiKey: key, apiUri: apiUri.trim() });
      toast.success('Credenciais do Nylas salvas.');
      setClientId('');
      setApiKey('');
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar as credenciais.');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await calendarApi.clearCredentials();
      toast.success('Credenciais removidas.');
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover as credenciais.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="eia-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--eia-radius-sm)] border border-border bg-secondary text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <p className="eia-eyebrow">Credenciais</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Conexão com o Nylas</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              O Nylas é a ponte entre a Lara e as agendas do Google, Outlook e iCloud. Você cria uma
              conta lá, habilita os provedores que quer oferecer e traz duas credenciais para cá.
              A partir daí, conectar uma agenda vira um clique nesta tela.
            </p>
          </div>
        </div>
        <Badge variant={configured ? 'success' : 'muted'}>{configured ? 'Configurado' : 'Não configurado'}</Badge>
      </div>

      <details
        open={guideOpen}
        onToggle={(event) => setGuideOpen(event.currentTarget.open)}
        className="group mt-5 rounded-[var(--eia-radius-md)] border border-border bg-secondary/60 [&_summary::-webkit-details-marker]:hidden"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">Como ligar o Nylas</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Quatro passos, uns 15 minutos na primeira vez
            </span>
          </span>
          <span className="text-xs text-muted-foreground group-open:hidden">Ver</span>
          <span className="hidden text-xs text-muted-foreground group-open:inline">Ocultar</span>
        </summary>

        <ol className="space-y-4 border-t border-border p-4">
          <StepCard number={1} title="Crie a aplicação no Nylas">
            <p>
              Entre em{' '}
              <a
                href="https://dashboard-v3.nylas.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                dashboard-v3.nylas.com
                <ExternalLink className="h-3 w-3" />
              </a>{' '}
              e crie uma aplicação. Na criação você escolhe a região.
            </p>
            <p>
              A região escolhida lá precisa ser a mesma selecionada aqui embaixo, em
              <strong className="text-foreground"> Região da API</strong>. Se divergirem, a chave é
              recusada na hora de salvar.
            </p>
            <p>
              A aplicação <strong className="text-foreground">Sandbox</strong> que o Nylas cria junto
              com a conta não serve: ela não permite adicionar provedores.
            </p>
          </StepCard>

          <StepCard number={2} title="Cadastre o endereço de retorno">
            <p>
              No Nylas, em <strong className="text-foreground">Hosted Authentication</strong>, adicione
              este endereço à lista de callbacks:
            </p>
            <CallbackField />
            <p>
              É para cá que o Nylas devolve a autorização depois que a pessoa escolhe a conta dela. Sem
              este cadastro, a janela de conexão termina em erro.
            </p>
          </StepCard>

          <StepCard number={3} title="Habilite os provedores que você quer oferecer">
            <p>
              Em <strong className="text-foreground">Connectors</strong>, adicione um para cada
              provedor. Esta tela só oferece o que estiver habilitado lá — se você habilitar só o
              Google, só o Google aparece.
            </p>
            <ul className="mt-2 space-y-2">
              <li>
                <strong className="text-foreground">Google.</strong> Exige um projeto próprio no
                Google Cloud e passar pela verificação do Google. Enquanto o projeto estiver em modo
                de teste, a autorização expira a cada 7 dias e a agenda precisa ser reconectada.
              </li>
              <li>
                <strong className="text-foreground">Outlook.</strong> Exige registrar um aplicativo no
                Azure. Anote a validade do client secret: quando ele vence, todas as agendas
                conectadas por ele param de sincronizar.
              </li>
              <li>
                <strong className="text-foreground">iCloud.</strong> É só adicionar, sem configuração
                nenhuma. Quem for conectar precisa gerar uma senha de app no Apple ID, e esta tela
                explica isso na hora de conectar.
              </li>
            </ul>
          </StepCard>

          <StepCard number={4} title="Traga as duas credenciais para cá">
            <p>
              O <strong className="text-foreground">Application ID</strong> fica em App Settings e a{' '}
              <strong className="text-foreground">API Key</strong> em API Keys. Cole nos campos abaixo
              e salve.
            </p>
            <p>
              Ao salvar, a chave é testada contra o Nylas antes de ser gravada — se estiver errada ou
              for de outra região, você descobre agora e não na hora de conectar uma agenda.
            </p>
          </StepCard>
        </ol>
      </details>

      {fromEnv && (
        <p className="mt-4 text-xs text-muted-foreground">
          As credenciais em uso vêm da configuração do servidor. Salvar abaixo passa a usar estas.
        </p>
      )}

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nylas-client-id">Application ID (Client ID)</Label>
          <Input
            id="nylas-client-id"
            autoComplete="off"
            placeholder="00000000-0000-0000-0000-000000000000"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            disabled={!isAdmin || saving}
          />
          <p className="text-xs text-muted-foreground">No Nylas: App Settings.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="nylas-api-key">API Key</Label>
          <Input
            id="nylas-api-key"
            type="password"
            autoComplete="off"
            placeholder={configured ? 'Cole uma nova chave para substituir (nyk_…)' : 'nyk_…'}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            disabled={!isAdmin || saving}
          />
          <p className="text-xs text-muted-foreground">
            No Nylas: API Keys. Fica guardada aqui e nunca é exibida de volta.
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="nylas-api-uri">Região da API</Label>
          <select
            id="nylas-api-uri"
            value={apiUri}
            onChange={(event) => setApiUri(event.target.value)}
            disabled={!isAdmin || saving}
            className="h-10 w-full rounded-[var(--eia-radius-sm)] border border-border bg-background px-3 text-sm text-foreground sm:max-w-xs"
          >
            <option value="https://api.us.nylas.com">Estados Unidos (us)</option>
            <option value="https://api.eu.nylas.com">Europa (eu)</option>
          </select>
          <p className="text-xs text-muted-foreground">
            A mesma região escolhida ao criar a aplicação no Nylas.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          onClick={handleSave}
          disabled={!isAdmin || saving || !clientId.trim() || !apiKey.trim()}
          className="gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {configured ? 'Substituir credenciais' : 'Salvar credenciais'}
        </Button>
        {status?.credentialsSource === 'settings' && (
          <Button type="button" variant="secondary" onClick={handleClear} disabled={!isAdmin || saving}>
            Remover
          </Button>
        )}
      </div>

      {!isAdmin && (
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Apenas administradores podem alterar estas credenciais.
        </p>
      )}
    </div>
  );
};

export default NylasCredentialsSettings;
