'use client';

import React from 'react';
import { PrefetchLink } from '@/components/ui/PrefetchLink';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { formatDateFull } from '@/lib/date-formatter';
import { Container } from '@/components/ui/container';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Send,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  MoreHorizontal,
  ArrowUpRight,
  Zap,
  BarChart3,
  Plus,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from '@/components/ui/lazy-charts';
import { Campaign, CampaignStatus } from '../../../types';
import { DashboardStats } from '../../../services/dashboardService';

interface DashboardViewProps {
  stats: DashboardStats;
  recentCampaigns: Campaign[];
  isLoading: boolean;
}

const getCampaignBadgeStatus = (status: CampaignStatus) => {
  const map: Record<CampaignStatus, 'completed' | 'sending' | 'failed' | 'draft' | 'paused' | 'scheduled' | 'default'> = {
    [CampaignStatus.COMPLETED]: 'completed',
    [CampaignStatus.SENDING]: 'sending',
    [CampaignStatus.FAILED]: 'failed',
    [CampaignStatus.DRAFT]: 'draft',
    [CampaignStatus.PAUSED]: 'paused',
    [CampaignStatus.SCHEDULED]: 'scheduled',
    [CampaignStatus.CANCELLED]: 'default',
  };
  return map[status] || 'default';
};

const getCampaignLabel = (status: CampaignStatus) => {
  const labels: Record<CampaignStatus, string> = {
    [CampaignStatus.COMPLETED]: 'Concluído',
    [CampaignStatus.SENDING]: 'Enviando',
    [CampaignStatus.FAILED]: 'Falhou',
    [CampaignStatus.DRAFT]: 'Rascunho',
    [CampaignStatus.PAUSED]: 'Pausado',
    [CampaignStatus.SCHEDULED]: 'Agendado',
    [CampaignStatus.CANCELLED]: 'Cancelada',
  };
  return labels[status];
};

function HeroStatSkeleton() {
  return (
    <div className="col-span-1 md:col-span-2 ds-gradient-hero p-8 rounded-2xl">
      <div className="w-32 h-4 bg-[var(--ds-bg-hover)] rounded animate-pulse mb-3" />
      <div className="w-48 h-10 bg-[var(--ds-bg-hover)] rounded animate-pulse mb-4" />
      <div className="w-36 h-5 bg-[var(--ds-bg-hover)] rounded animate-pulse" />
    </div>
  );
}

function SmallStatSkeleton() {
  return (
    <div className="ds-stat-card p-6">
      <div className="w-10 h-10 rounded-lg bg-[var(--ds-bg-surface)] animate-pulse mb-4" />
      <div className="w-24 h-3 bg-[var(--ds-bg-surface)] rounded animate-pulse mb-2" />
      <div className="w-16 h-7 bg-[var(--ds-bg-surface)] rounded animate-pulse" />
    </div>
  );
}

export const DashboardView: React.FC<DashboardViewProps> = ({ stats, recentCampaigns, isLoading }) => {
  const [range, setRange] = React.useState<'7D' | '15D' | '30D'>('7D');
  const [isMounted, setIsMounted] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rangeSize = range === '7D' ? 7 : range === '15D' ? 15 : 30;
  const chartData = stats.chartData || [];

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const container = containerRef.current;
      if (container && container.clientWidth > 0 && container.clientHeight > 0) {
        setIsMounted(true);
      } else {
        setTimeout(() => setIsMounted(true), 500);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Dashboard</PageTitle>
          <PageDescription>Visão geral da performance de mensagens</PageDescription>
        </div>
        <PageActions>
          <PrefetchLink
            href="/campaigns/new"
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-primary-500/10 active:scale-95 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2"
            aria-label="Criar nova campanha"
          >
            <Plus size={16} />
            Nova Campanha
          </PrefetchLink>
        </PageActions>
      </PageHeader>

      {/* ====== HERO STATS ROW (Stitch-inspired) ====== */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">

        {/* Hero Card — Total Enviado (ocupa 2 colunas) */}
        {isLoading ? <HeroStatSkeleton /> : (
          <div className="col-span-1 md:col-span-2 ds-gradient-hero p-8 group">
            <div className="relative z-10">
              <p className="text-primary-200 text-sm font-bold uppercase tracking-widest mb-2">
                Total Enviado
              </p>
              <h3 className="text-4xl font-extrabold text-white font-[var(--ds-font-display)] mb-4">
                {stats.sent24h}
              </h3>
              <div className="flex items-center gap-2 text-primary-200 font-bold text-sm">
                <TrendingUp size={16} />
                <span>Últimas 24 horas</span>
              </div>
            </div>
            {/* Ghost icon decorativo */}
            <div className="absolute -right-6 -bottom-6 opacity-[0.06] group-hover:scale-110 transition-transform duration-700 pointer-events-none">
              <Send size={180} strokeWidth={1} />
            </div>
          </div>
        )}

        {/* Stat Card — Taxa de Entrega */}
        {isLoading ? <SmallStatSkeleton /> : (
          <div className="ds-stat-card p-6 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-lg flex items-center justify-center mb-4">
                <CheckCircle2 size={20} />
              </div>
              <p className="text-[var(--ds-text-muted)] text-xs font-semibold mb-1">Taxa de Entrega</p>
              <h4 className="text-2xl font-bold text-[var(--ds-text-primary)] font-[var(--ds-font-display)]">
                {stats.deliveryRate}
              </h4>
            </div>
            <div className="h-1 bg-[var(--ds-bg-surface)] rounded-full mt-4 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: stats.deliveryRate }}
              />
            </div>
          </div>
        )}

        {/* Stat Card — Campanhas Ativas */}
        {isLoading ? <SmallStatSkeleton /> : (
          <div className="ds-stat-card p-6 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 bg-[var(--ds-brand-primary-muted)] text-[var(--ds-brand-primary)] rounded-lg flex items-center justify-center mb-4">
                <Zap size={20} />
              </div>
              <p className="text-[var(--ds-text-muted)] text-xs font-semibold mb-1">Campanhas Ativas</p>
              <h4 className="text-2xl font-bold text-[var(--ds-text-primary)] font-[var(--ds-font-display)]">
                {stats.activeCampaigns}
              </h4>
            </div>
            <p className="text-[10px] text-[var(--ds-text-brand)] font-bold mt-4 uppercase tracking-tight">
              Em andamento agora
            </p>
          </div>
        )}
      </section>

      {/* ====== CHART + RECENT CAMPAIGNS ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Chart Section */}
        <div className="lg:col-span-2 ds-stat-card p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-heading-4" id="chart-title">Volume de Mensagens</h3>
            <div className="flex gap-2" role="group" aria-label="Período do gráfico">
              {[
                { key: '7D', label: 'Últimos 7 dias' },
                { key: '15D', label: 'Últimos 15 dias' },
                { key: '30D', label: 'Últimos 30 dias' }
              ].map((t) => (
                <button
                  key={t.key}
                  aria-label={t.label}
                  aria-pressed={t.key === range}
                  onClick={() => setRange(t.key as '7D' | '15D' | '30D')}
                  className={`text-xs px-4 py-1.5 rounded-full font-bold transition-colors ${
                    t.key === range
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)]'
                  }`}
                >
                  {t.key}
                </button>
              ))}
            </div>
          </div>
          <figure role="figure" aria-labelledby="chart-title" aria-describedby="chart-description">
            <div ref={containerRef} className="h-72 w-full">
              {isMounted && chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <AreaChart data={chartData.slice(-rangeSize)} aria-hidden="true">
                    <defs>
                      <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.22}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.08)" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{fill: '#64748b', fontSize: 12}}
                      dy={15}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{fill: '#64748b', fontSize: 12}}
                    />
                    <Tooltip
                      contentStyle={{backgroundColor: 'var(--ds-bg-elevated)', borderRadius: '12px', border: '1px solid var(--ds-border-subtle)', color: 'var(--ds-text-primary)'}}
                      itemStyle={{color: '#34d399'}}
                      labelStyle={{color: 'var(--ds-text-secondary)'}}
                      formatter={(value) => [value, 'Enviadas']}
                    />
                    <Area
                      type="monotone"
                      dataKey="sent"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorSent)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full rounded-xl bg-[var(--ds-bg-hover)]" aria-hidden="true" />
              )}
            </div>
            <p id="chart-description" className="sr-only">
              Gráfico de área mostrando o volume de mensagens enviadas ao longo do tempo.
            </p>
          </figure>
        </div>

        {/* Recent Campaigns — Premium Table */}
        <div className="ds-table-wrapper flex flex-col">
          <div className="p-6 border-b border-[var(--ds-border-default)] flex justify-between items-center">
            <h3 className="text-heading-4">Campanhas Recentes</h3>
            <button
              aria-label="Mais opções"
              className="text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] transition-colors"
            >
              <MoreHorizontal size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {recentCampaigns.length === 0 ? (
              <div className="p-8 text-center text-[var(--ds-text-muted)]">
                <BarChart3 size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhuma campanha ainda.</p>
                <p className="text-xs mt-1">Crie sua primeira campanha para ver os dados aqui.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-[var(--ds-bg-surface)]/30">
                    <th className="px-6 py-4 text-[11px] font-extrabold text-[var(--ds-text-muted)] uppercase tracking-widest">
                      Campanha
                    </th>
                    <th className="px-6 py-4 text-right text-[11px] font-extrabold text-[var(--ds-text-muted)] uppercase tracking-widest">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ds-border-subtle)]">
                  {recentCampaigns.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className="hover:bg-[var(--ds-bg-hover)] transition-all duration-200 group cursor-pointer"
                    >
                      <td className="px-6 py-5">
                        <p className="font-semibold text-[var(--ds-text-primary)] text-sm group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                          {campaign.name}
                        </p>
                        <p className="text-[var(--ds-text-muted)] text-xs mt-1">{formatDateFull(campaign.createdAt)}</p>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <StatusBadge status={getCampaignBadgeStatus(campaign.status)} size="sm">
                          {getCampaignLabel(campaign.status)}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="px-6 py-4 border-t border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)]/20">
            <PrefetchLink
              href="/campaigns"
              className="text-xs font-bold text-[var(--ds-text-muted)] hover:text-primary-500 transition-colors flex items-center justify-center gap-2"
            >
              Ver Todas as Campanhas <ArrowUpRight size={14} />
            </PrefetchLink>
          </div>
        </div>
      </div>
    </Page>
  );
};
