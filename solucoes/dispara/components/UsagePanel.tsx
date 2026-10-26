'use client'

import React from 'react'
import {
  Zap,
  Database,
  MessageCircle,
  Server,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  ExternalLink,
  RefreshCw
} from 'lucide-react'
import { Container } from '@/components/ui/container'

interface UsageData {
  vercel: {
    plan?: 'hobby' | 'pro' | 'enterprise' | 'unknown'
    functionInvocations: number
    functionLimit: number
    functionPercentage: number
    edgeRequests: number
    edgeLimit: number
    edgePercentage: number
    buildMinutes: number
    buildLimit: number
    buildPercentage: number
    percentage: number
    status: 'ok' | 'warning' | 'critical'
  }
  database: {
    plan?: 'free' | 'pro' | 'team' | 'enterprise' | 'unknown'
    storageMB: number
    limitMB: number
    bandwidthMB?: number
    bandwidthLimitMB?: number
    percentage: number
    status: 'ok' | 'warning' | 'critical'
  }
  whatsapp: {
    messagesSent: number
    tier: string
    tierLimit: number
    percentage: number
    quality: string
    status: 'ok' | 'warning' | 'critical'
  }
}

interface UsagePanelProps {
  usage: UsageData | null
  isLoading: boolean
  onRefresh: () => void
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

const StatusIcon = ({ status }: { status: 'ok' | 'warning' | 'critical' }) => {
  if (status === 'ok') return <CheckCircle2 size={14} className="text-green-400" />
  if (status === 'warning') return <AlertTriangle size={14} className="text-amber-400" />
  return <AlertTriangle size={14} className="text-red-400" />
}

// Constantes de cores hoistadas para evitar re-criação em cada render
const PROGRESS_BAR_COLORS = {
  ok: 'bg-green-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
} as const

const ProgressBar = ({
  percentage,
  status
}: {
  percentage: number
  status: 'ok' | 'warning' | 'critical'
}) => {
  return (
    <div className="w-full h-2 bg-[var(--ds-bg-surface)] rounded-full overflow-hidden">
      <div
        className={`h-full ${PROGRESS_BAR_COLORS[status]} transition-all duration-500`}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  )
}

const UsageItem = ({
  icon: Icon,
  iconColor,
  title,
  subtitle,
  value,
  limit,
  percentage,
  status,
  helpText,
  upgradeUrl,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  iconColor: string
  title: string
  subtitle: string
  value: string
  limit: string
  percentage: number
  status: 'ok' | 'warning' | 'critical'
  helpText?: string
  upgradeUrl?: string
}) => {
  return (
    <div className={`p-4 rounded-xl border transition-all ${status === 'critical'
      ? 'bg-red-500/5 border-red-500/20'
      : status === 'warning'
        ? 'bg-amber-500/5 border-amber-500/20'
        : 'bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)]'
      }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-[var(--ds-bg-surface)] ${iconColor}`}>
            <Icon size={18} />
          </div>
          <div>
            <h4 className="font-medium text-[var(--ds-text-primary)] text-sm">{title}</h4>
            <p className="text-xs text-[var(--ds-text-muted)]">{subtitle}</p>
          </div>
        </div>
        <StatusIcon status={status} />
      </div>

      <div className="space-y-2">
        <ProgressBar percentage={percentage} status={status} />

        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--ds-text-secondary)]">
            <span className="font-mono text-[var(--ds-text-primary)]">{value}</span>
            <span className="text-[var(--ds-text-muted)]"> / {limit}</span>
          </span>
          <span className={`font-medium ${status === 'critical'
            ? 'text-red-400'
            : status === 'warning'
              ? 'text-amber-400'
              : 'text-green-400'
            }`}>
            {percentage.toFixed(1)}%
          </span>
        </div>

        {helpText && (
          <p className={`text-xs mt-2 ${status === 'critical'
            ? 'text-red-400'
            : status === 'warning'
              ? 'text-amber-400'
              : 'text-[var(--ds-text-muted)]'
            }`}>
            {status === 'critical' ? '⚠️ ' : status === 'warning' ? '⚡ ' : '✓ '}
            {helpText}
          </p>
        )}

        {(status === 'warning' || status === 'critical') && upgradeUrl && (
          <a
            href={upgradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
          >
            <TrendingUp size={12} />
            Aumentar limite
            <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  )
}

export const UsagePanel: React.FC<UsagePanelProps> = ({ usage, isLoading, onRefresh }) => {
  if (isLoading && !usage) {
    return (
      <Container variant="glass" padding="lg">
        <div className="flex items-center justify-center h-48">
          <RefreshCw size={24} className="text-[var(--ds-text-muted)] animate-spin" />
        </div>
      </Container>
    )
  }

  if (!usage) {
    return (
      <Container variant="glass" padding="lg">
        <div className="text-center text-[var(--ds-text-muted)] py-8">
          Não foi possível carregar os dados de uso.
          <button
            onClick={onRefresh}
            className="block mx-auto mt-4 text-primary-400 hover:text-primary-300"
          >
            Tentar novamente
          </button>
        </div>
      </Container>
    )
  }

  const getHelpText = (type: string, status: 'ok' | 'warning' | 'critical', percentage: number) => {
    if (type === 'vercel') {
      if (status === 'critical') return 'Limite quase atingido! Considere upgrade.'
      if (status === 'warning') return 'Atenção ao uso de execuções.'
      return 'Dentro do plano'
    }
    if (type === 'whatsapp') {
      if (status === 'critical') return 'Próximo do limite do tier (janela móvel 24h)!'
      if (status === 'warning') return 'Atenção: você está chegando perto do limite /24h'
      return `Qualidade: ${usage.whatsapp.quality} • Janela: 24h`
    }
    return ''
  }

  return (
    <Container variant="glass" padding="lg">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-[var(--ds-text-primary)]">Uso da Infraestrutura</h3>
          <p className="text-sm text-[var(--ds-text-muted)]">Este mês</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid gap-4">
        {/* Vercel - Expanded view with 3 metrics */}
        <div className={`p-4 rounded-xl border transition-all ${usage.vercel.status === 'critical'
          ? 'bg-red-500/5 border-red-500/20'
          : usage.vercel.status === 'warning'
            ? 'bg-amber-500/5 border-amber-500/20'
            : 'bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)]'
          }`}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--ds-bg-surface)] text-amber-400">
                <Zap size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-[var(--ds-text-primary)] text-sm">Vercel</h4>
                  {usage.vercel.plan && usage.vercel.plan !== 'unknown' && (
                    <span className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded ${usage.vercel.plan === 'enterprise' ? 'bg-primary-500/20 text-primary-300' :
                      usage.vercel.plan === 'pro' ? 'bg-blue-500/20 text-blue-300' :
                        'bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]'
                      }`}>
                      {usage.vercel.plan}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--ds-text-muted)]">Uso mensal</p>
              </div>
            </div>
            <StatusIcon status={usage.vercel.status} />
          </div>

          {/* Function Invocations */}
          <div className="space-y-1 mb-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--ds-text-secondary)]">Invocações</span>
              <span className="text-[var(--ds-text-secondary)]">
                <span className="font-mono text-[var(--ds-text-primary)]">{formatNumber(usage.vercel.functionInvocations)}</span>
                <span className="text-[var(--ds-text-muted)]"> / {formatNumber(usage.vercel.functionLimit)}</span>
              </span>
            </div>
            <ProgressBar percentage={usage.vercel.functionPercentage} status={
              usage.vercel.functionPercentage >= 90 ? 'critical'
                : usage.vercel.functionPercentage >= 70 ? 'warning'
                  : 'ok'
            } />
          </div>

          {/* Edge Requests */}
          <div className="space-y-1 mb-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--ds-text-secondary)]">Edge Requests</span>
              <span className="text-[var(--ds-text-secondary)]">
                <span className="font-mono text-[var(--ds-text-primary)]">{formatNumber(usage.vercel.edgeRequests)}</span>
                <span className="text-[var(--ds-text-muted)]"> / {formatNumber(usage.vercel.edgeLimit)}</span>
              </span>
            </div>
            <ProgressBar percentage={usage.vercel.edgePercentage} status={
              usage.vercel.edgePercentage >= 90 ? 'critical'
                : usage.vercel.edgePercentage >= 70 ? 'warning'
                  : 'ok'
            } />
          </div>

          {/* Build Minutes */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--ds-text-secondary)]">Build (min)</span>
              <span className="text-[var(--ds-text-secondary)]">
                <span className="font-mono text-[var(--ds-text-primary)]">{formatNumber(usage.vercel.buildMinutes)}</span>
                <span className="text-[var(--ds-text-muted)]"> / {formatNumber(usage.vercel.buildLimit)}</span>
              </span>
            </div>
            <ProgressBar percentage={usage.vercel.buildPercentage} status={
              usage.vercel.buildPercentage >= 90 ? 'critical'
                : usage.vercel.buildPercentage >= 70 ? 'warning'
                  : 'ok'
            } />
          </div>

          {(usage.vercel.status === 'warning' || usage.vercel.status === 'critical') && (
            <a
              href="https://vercel.com/dashboard/usage"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
            >
              <TrendingUp size={12} />
              Ver detalhes
              <ExternalLink size={10} />
            </a>
          )}
        </div>

        {/* Database - Custom section with plan badge */}
        <div className={`p-4 rounded-xl border transition-all ${usage.database.status === 'critical'
          ? 'bg-red-500/5 border-red-500/20'
          : usage.database.status === 'warning'
            ? 'bg-amber-500/5 border-amber-500/20'
            : 'bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)]'
          }`}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--ds-bg-surface)] text-cyan-400">
                <Database size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-[var(--ds-text-primary)] text-sm">Database</h4>
                  {usage.database.plan && usage.database.plan !== 'unknown' && (
                    <span className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded ${usage.database.plan === 'enterprise' ? 'bg-primary-500/20 text-primary-300' :
                      usage.database.plan === 'team' ? 'bg-blue-500/20 text-blue-300' :
                        usage.database.plan === 'pro' ? 'bg-primary-500/20 text-primary-300' :
                          'bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]'
                      }`}>
                      {usage.database.plan}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--ds-text-muted)]">Supabase</p>
              </div>
            </div>
            <StatusIcon status={usage.database.status} />
          </div>
          <div className="space-y-2">
            <ProgressBar percentage={usage.database.percentage} status={usage.database.status} />
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--ds-text-secondary)]">
                <span className="font-mono text-[var(--ds-text-primary)]">{usage.database.storageMB}MB</span>
                <span className="text-[var(--ds-text-muted)]"> / {usage.database.limitMB >= 1000 ? `${(usage.database.limitMB / 1000).toFixed(0)}GB` : `${usage.database.limitMB}MB`}</span>
              </span>
              <span className={`font-medium ${usage.database.status === 'critical' ? 'text-red-400' :
                usage.database.status === 'warning' ? 'text-amber-400' :
                  'text-green-400'
                }`}>
                {(usage.database?.percentage ?? 0).toFixed(1)}%
              </span>
            </div>

            {/* Bandwidth Row */}
            {usage.database.bandwidthMB !== undefined && (
              <div className="mt-3 pt-3 border-t border-[var(--ds-border-subtle)]">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[var(--ds-text-muted)]">Bandwidth (egress)</span>
                  <span className="text-[var(--ds-text-secondary)]">
                    <span className="font-mono text-[var(--ds-text-primary)]">{(usage.database?.bandwidthMB ?? 0) < 1 ? `${Math.round((usage.database?.bandwidthMB ?? 0) * 1024)}KB` : `${(usage.database?.bandwidthMB ?? 0).toFixed(1)}MB`}</span>
                    <span className="text-[var(--ds-text-muted)]"> / {(usage.database?.bandwidthLimitMB ?? 0) >= 1000 ? `${((usage.database?.bandwidthLimitMB ?? 0) / 1000).toFixed(0)}GB` : `${usage.database?.bandwidthLimitMB ?? 0}MB`}</span>
                  </span>
                </div>
                <ProgressBar
                  percentage={usage.database.bandwidthLimitMB ? Math.round(((usage.database.bandwidthMB || 0) / usage.database.bandwidthLimitMB) * 100 * 10) / 10 : 0}
                  status={usage.database.bandwidthLimitMB && ((usage.database.bandwidthMB || 0) / usage.database.bandwidthLimitMB) > 0.8 ? 'warning' : 'ok'}
                />
              </div>
            )}

            <p className={`text-xs mt-2 ${usage.database.status === 'critical' ? 'text-red-400' :
              usage.database.status === 'warning' ? 'text-amber-400' :
                'text-[var(--ds-text-muted)]'
              }`}>
              {usage.database.status === 'critical' ? '⚠️ Armazenamento quase cheio!' :
                usage.database.status === 'warning' ? '⚡ Monitorar espaço' :
                  '✓ Espaço de sobra'}
            </p>
          </div>
        </div>

        <UsageItem
          icon={MessageCircle}
          iconColor="text-green-400"
          title="WhatsApp"
          subtitle={`Tier: ${formatNumber(usage.whatsapp.tierLimit)}/24h (contatos únicos)`}
          value={formatNumber(usage.whatsapp.messagesSent)}
          limit={formatNumber(usage.whatsapp.tierLimit)}
          percentage={usage.whatsapp.percentage}
          status={usage.whatsapp.status}
          helpText={getHelpText('whatsapp', usage.whatsapp.status, usage.whatsapp.percentage)}
        />
      </div>

      {/* Dica de upgrade */}
      {usage.whatsapp.status === 'warning' && (
        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <p className="text-xs text-amber-300">
            <strong>Dica:</strong> Você pode subir pro próximo tier do WhatsApp
            alcançando mais {formatNumber(Math.max(usage.whatsapp.tierLimit - usage.whatsapp.messagesSent, 0))} contatos com boa qualidade.
          </p>
        </div>
      )}
    </Container>
  )
}
