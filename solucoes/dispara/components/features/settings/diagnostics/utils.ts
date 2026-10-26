import type { MetaDiagnosticsAction, MetaDiagnosticsResponse } from '@/services/metaDiagnosticsService'
import type {
  MetaDiagnosticsCheck,
  MetaDiagnosticsCheckStatus,
  MetaLockSignal,
  TopLineResult,
  FriendlyCopy,
} from './types'
import { META_BUSINESS_LOCKED_CODE } from './types'

export function hasMetaBusinessLockedEvidence(checks: MetaDiagnosticsCheck[]): MetaLockSignal {
  // Regra: so tratamos como BLOQUEIO ATUAL se o Health Status estiver BLOCKED.
  // Caso contrario, 131031 vira apenas um sinal historico (ex.: ocorreu 1x em falhas recentes).

  const health = checks.find((c) => c.id === 'meta_health_status')
  const healthOverall = String((health?.details as Record<string, unknown>)?.overall || '')
  const healthErrors = Array.isArray((health?.details as Record<string, unknown>)?.errors)
    ? ((health?.details as Record<string, unknown>)?.errors as Array<{ error_code?: number }>)
    : []
  const healthHas131031 = healthErrors.some((e) => Number(e?.error_code) === META_BUSINESS_LOCKED_CODE)
  const isBlockedNow = health?.status === 'fail' || healthOverall === 'BLOCKED'

  if (isBlockedNow) {
    return {
      kind: 'current',
      evidence: {
        source: health?.title || 'Health Status',
        ...(healthHas131031 ? { count: 1 } : null),
      },
    }
  }

  // Sinal historico: falhas recentes (detalhe.top[]) inclui o codigo
  for (const c of checks) {
    if (c.id !== 'internal_recent_failures') continue
    const top = (c.details as Record<string, unknown>)?.top
    if (Array.isArray(top)) {
      const found = top.find((x: { code?: number }) => Number(x?.code) === META_BUSINESS_LOCKED_CODE)
      if (found) {
        return {
          kind: 'historical',
          evidence: {
            source: c.title || c.id,
            count: typeof (found as { count?: number })?.count === 'number' ? (found as { count: number }).count : undefined,
          },
        }
      }
    }
  }

  return { kind: 'none' }
}

export function formatJsonMaybe(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function isProblemStatus(s: MetaDiagnosticsCheckStatus): boolean {
  return s === 'fail' || s === 'warn'
}

export function bestApiAction(actions: MetaDiagnosticsAction[] | undefined): MetaDiagnosticsAction | null {
  const list = actions || []
  // preferimos API actions (um clique) antes de links
  const api = list.find((a) => a.kind === 'api')
  return api || null
}

export function firstNextSteps(details: Record<string, unknown> | undefined): string[] {
  const v = details?.nextSteps
  if (!Array.isArray(v)) return []
  return v.filter((x: unknown) => typeof x === 'string').slice(0, 4) as string[]
}

export function scrollToCheck(checkId: string): void {
  if (typeof document === 'undefined') return
  const el = document.getElementById(`check-${checkId}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function getFriendlyCopy(check: MetaDiagnosticsCheck): FriendlyCopy {
  const overall = String((check.details as Record<string, unknown>)?.overall || '')

  // Traducoes por ID (mantemos o tecnico nos detalhes, mas o texto principal vira "humano").
  switch (check.id) {
    case 'creds':
      return {
        title: 'Credenciais do WhatsApp (token e IDs)',
        message:
          check.status === 'pass'
            ? 'Configurado. Se algo falhar, normalmente e permissao/atribuicao do token.'
            : 'Falta configurar token + WABA ID + Phone Number ID em Ajustes.',
        why: 'Sem isso, nao da pra consultar a Meta nem enviar mensagens.',
      }

    case 'infra_supabase':
      return {
        title: 'Banco de dados (Supabase)',
        message: check.status === 'pass' ? 'OK. Banco conectado.' : 'Banco nao esta configurado corretamente.',
        why: 'O app salva configurações e resultados de envio no Supabase.',
      }

    case 'meta_health_status':
      return {
        title: 'Posso enviar agora?',
        message:
          overall === 'AVAILABLE'
            ? 'Sim. A Meta diz que o envio esta liberado.'
            : overall === 'LIMITED'
              ? 'Parcialmente. A Meta diz que o envio esta limitado.'
              : overall === 'BLOCKED'
                ? 'Nao. A Meta confirma bloqueio para envio.'
                : 'Nao foi possivel confirmar pela Meta (Health Status indisponível).',
        why: 'Esse e o "veredito oficial" da Meta sobre envio.',
      }

    case 'meta_debug_token':
      return {
        title: 'Token e valido? (validacao forte)',
        message:
          check.status === 'pass'
            ? 'Sim. Validado via /debug_token.'
            : check.status === 'fail'
              ? 'Nao. A Meta marcou o token como invalido.'
              : check.status === 'warn'
                ? 'Nao conseguimos validar (best-effort).'
                : 'Opcional. Configure Meta App ID/Secret para validar com prova.',
        why: 'Evita "achismo" sobre expiracao/permissoes do token.',
      }

    case 'meta_token_scopes':
      return {
        title: 'Token tem permissoes do WhatsApp?',
        message:
          check.status === 'pass'
            ? 'Sim. Escopos principais presentes.'
            : check.status === 'fail'
              ? 'Nao. Faltam permissoes essenciais para envio.'
              : 'Pode estar faltando alguma permissao. Veja o passo a passo.',
        why: 'Sem esses escopos, a Meta bloqueia chamadas e envios.',
      }

    case 'meta_token_app_id':
      return {
        title: 'Token e do App certo?',
        message:
          check.status === 'warn'
            ? 'Parece que o token foi gerado em outro App da Meta.'
            : check.message,
        why: 'Misturar apps diferentes e causa comum de erro 100/33.',
      }

    case 'meta_subscription_messages':
      return {
        title: 'Receber status (delivered/read) no webhook',
        message:
          check.status === 'pass'
            ? 'Ativo. Voce deve receber eventos de mensagem (quando a Meta enviar).'
            : check.status === 'fail'
              ? 'Desativado. Voce NAO vai receber delivered/read.'
              : 'Nao deu para confirmar. Veja detalhes.',
        why: 'Sem "messages" inscrito, a Meta nao manda os status para o seu webhook.',
      }

    case 'meta_waba_phone_link':
      return {
        title: 'WABA e número combinam?',
        message:
          check.status === 'pass'
            ? 'Sim. O número aparece dentro do WABA.'
            : check.status === 'fail'
              ? 'Nao. IDs podem estar trocados ou o token nao enxerga o ativo.'
              : 'Nao deu para confirmar.',
        why: 'Se WABA/Phone nao "batem", o envio falha mesmo com token "parecendo certo".',
      }

    case 'meta_phone':
      return {
        title: 'Número está acessível (qualidade/tier)',
        message: check.status === 'pass' ? 'OK. Conseguimos ler dados do número.' : 'Não conseguimos ler o número.',
        why: 'Se o token não tem acesso ao número, o envio não funciona.',
      }

    case 'meta_waba':
      return {
        title: 'WABA está acessível',
        message: check.status === 'pass' ? 'OK. Conseguimos ler dados do WABA.' : 'Nao conseguimos ler o WABA.',
        why: 'Se o token nao tem acesso ao WABA, nada do WhatsApp funciona.',
      }

    case 'meta_templates':
      return {
        title: 'Templates (aprovados)',
        message: check.status === 'pass' ? check.message : 'Nao encontramos templates (ou token sem acesso).',
        why: 'Para enviar template, ele precisa existir/aprovar na Meta.',
      }

    case 'internal_recent_failures':
      return {
        title: 'Falhas recentes (histórico)',
        message: check.message,
        why: 'Ajuda a ver padroes (pagamento, token, rate limit etc.).',
      }

    case 'internal_last_status_update':
      return {
        title: 'Atividade do sistema',
        message: check.message,
        why: 'Se nao houver atividade, pode ser falta de envios/testes.',
      }

    case 'webhook_expected':
      return {
        title: 'Webhook configurado no painel da Meta',
        message: 'Use esta URL no WhatsApp Manager/App para receber eventos.',
        why: 'Se o webhook estiver errado, voce nao recebe eventos de mensagens.',
      }
  }

  if (check.id.startsWith('meta_access_')) {
    return {
      title: 'Token tem acesso ao ativo?',
      message:
        check.status === 'pass'
          ? 'Sim. O token consegue ler o ativo.'
          : 'Nao. Geralmente e ID errado ou falta atribuicao do ativo ao token (System User).',
      why: 'Erro 100/33 quase sempre cai aqui.',
    }
  }

  // fallback
  return { title: check.title, message: check.message }
}

export function topLineForSend(checks: MetaDiagnosticsCheck[]): TopLineResult {
  const health = checks.find((c) => c.id === 'meta_health_status')
  const overall = String((health?.details as Record<string, unknown>)?.overall || '')
  if (overall === 'AVAILABLE') return { label: 'Pode enviar agora', status: 'pass', detail: 'A Meta confirma envio liberado.' }
  if (overall === 'LIMITED') return { label: 'Envio limitado', status: 'warn', detail: 'A Meta limitou o envio; pode afetar volume.' }
  if (overall === 'BLOCKED') return { label: 'Nao pode enviar', status: 'fail', detail: 'A Meta confirmou bloqueio.' }
  if (health?.status === 'fail') return { label: 'Nao pode enviar', status: 'fail', detail: 'Falha ao consultar Health Status.' }
  return { label: 'Envio nao confirmado', status: 'info', detail: 'Health Status indisponível.' }
}

export function topLineForToken(checks: MetaDiagnosticsCheck[], data?: MetaDiagnosticsResponse): TopLineResult {
  const dbgEnabled = Boolean(data?.debugTokenValidation?.enabled)
  const dbgCheck = checks.find((c) => c.id === 'meta_debug_token')
  const meCheck = checks.find((c) => c.id === 'meta_me')
  if (dbgEnabled && dbgCheck?.status === 'pass') {
    return { label: 'Token valido', status: 'pass', detail: 'Validado via /debug_token.' }
  }
  if (dbgEnabled && dbgCheck?.status === 'fail') {
    return { label: 'Token invalido', status: 'fail', detail: 'A Meta marcou como invalido.' }
  }
  if (dbgEnabled && dbgCheck?.status === 'warn') {
    return { label: 'Token nao confirmado', status: 'warn', detail: 'Validacao falhou (best-effort).' }
  }
  if (meCheck?.status === 'pass') {
    return { label: 'Token autentica', status: 'info', detail: 'Autenticou via /me, mas sem prova forte.' }
  }
  if (meCheck?.status === 'fail') {
    return { label: 'Token falhou', status: 'fail', detail: 'Falha ao autenticar via /me.' }
  }
  return { label: 'Token sem status', status: 'info', detail: 'Ainda sem confirmacao.' }
}

export function topLineForWebhook(checks: MetaDiagnosticsCheck[]): TopLineResult {
  const sub = checks.find((c) => c.id === 'meta_subscription_messages')
  if (sub?.status === 'pass') return { label: 'Webhook ok', status: 'pass', detail: 'Voce deve receber delivered/read.' }
  if (sub?.status === 'fail') return { label: 'Webhook falho', status: 'fail', detail: 'Voce nao vai receber delivered/read.' }
  if (sub?.status === 'warn') return { label: 'Webhook incerto', status: 'warn', detail: 'Nao deu para confirmar inscricao.' }
  return { label: 'Webhook sem status', status: 'info', detail: 'Ainda sem confirmacao.' }
}
