import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  DollarSign,
  Loader2,
  MessageSquare,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useNavigate, useOutletContext } from 'react-router-dom';

import { api } from '../services/api';
import type { StatMetric } from '../types';
import { GoLiveChecklist } from './GoLiveChecklist';
import { OnboardingBanner } from './OnboardingBanner';
import './Dashboard.css';

interface OutletContext {
  showOnboarding: boolean;
  setShowOnboarding: (show: boolean) => void;
}

type PeriodFilter = 'today' | '7days' | '30days';

const periodLabels: Record<PeriodFilter, string> = {
  today: 'Hoje',
  '7days': '7 dias',
  '30days': '30 dias',
};

const periodDays: Record<PeriodFilter, number> = {
  today: 1,
  '7days': 7,
  '30days': 30,
};

const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<StatMetric[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const { setShowOnboarding } = useOutletContext<OutletContext>();
  const navigate = useNavigate();

  useEffect(() => {
    // Guarda de corrida: trocas rápidas de período faziam a resposta antiga
    // sobrescrever a nova, exibindo métricas de outro intervalo.
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const days = periodDays[period];
        const [metricsData, chartDataResponse] = await Promise.all([
          api.fetchDashboardMetrics(days),
          api.fetchChartData(days),
        ]);
        if (cancelled) return;
        setMetrics(metricsData);
        setChartData(chartDataResponse);
      } catch (error) {
        if (!cancelled) console.error('Erro ao carregar dashboard:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [period]);

  const getIcon = (label: string) => {
    if (label.includes('Conversões')) return <DollarSign aria-hidden="true" />;
    if (label.includes('Atendimentos')) return <MessageSquare aria-hidden="true" />;
    if (label.includes('Leads')) return <Users aria-hidden="true" />;
    return <Activity aria-hidden="true" />;
  };

  const getMetricLabel = (baseLabel: string) => {
    if (baseLabel.includes('Atendimentos')) {
      return period === 'today' ? 'Atendimentos hoje' : `Atendimentos · ${periodLabels[period]}`;
    }
    if (baseLabel.includes('Leads')) {
      return period === 'today' ? 'Novos leads' : `Novos leads · ${periodLabels[period]}`;
    }
    return baseLabel;
  };

  const getDeltaTone = (stat: StatMetric) => {
    if (stat.trend === '-' || stat.trend === '0%' || stat.trend === '0') return 'eia-delta--flat';
    return stat.trendUp ? 'eia-delta--up' : 'eia-delta--down';
  };

  if (loading) {
    return (
      <div className="dashboard-loading" role="status" aria-label="Carregando visão geral">
        <div className="dashboard-loading-icon">
          <Loader2 className="animate-spin" aria-hidden="true" />
        </div>
        <p>Carregando visão geral</p>
      </div>
    );
  }

  const description =
    period === 'today'
      ? 'Acompanhe o que a Lara movimentou hoje.'
      : `Acompanhe conversas e conversões nos últimos ${periodLabels[period]}.`;

  return (
    <div className="dashboard-page custom-scrollbar">
      <div className="dashboard-container">
        <header className="dashboard-header">
          <div>
            <p className="eia-eyebrow">Operação comercial</p>
            <h1>Visão geral da Lara.</h1>
            <p>{description}</p>
          </div>

          <div className="dashboard-period" role="group" aria-label="Período dos indicadores">
            {(['today', '7days', '30days'] as PeriodFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPeriod(item)}
                aria-pressed={period === item}
                className={period === item ? 'is-active' : undefined}
              >
                {periodLabels[item]}
              </button>
            ))}
          </div>
        </header>

        <OnboardingBanner onOpenWizard={() => setShowOnboarding(true)} />
        <GoLiveChecklist onOpenWizard={() => setShowOnboarding(true)} />

        <section aria-label="Indicadores principais" className="eia-metric-grid dashboard-metrics">
          {metrics.map((stat) => (
            <article key={stat.label} className="eia-metric eia-metric--atmos dashboard-metric">
              <div className="dashboard-metric-top">
                <span className="eia-metric__label">{getMetricLabel(stat.label)}</span>
                <span className="dashboard-metric-icon">{getIcon(stat.label)}</span>
              </div>
              <strong className="eia-metric__value">{stat.value}</strong>
              <div className="eia-metric__foot">
                <span className={`eia-delta ${getDeltaTone(stat)}`}>
                  {getDeltaTone(stat) !== 'eia-delta--flat' &&
                    (stat.trendUp ? (
                      <TrendingUp aria-hidden="true" />
                    ) : (
                      <TrendingDown aria-hidden="true" />
                    ))}
                  {stat.trend}
                </span>
                <span>vs. período anterior</span>
              </div>
            </article>
          ))}
        </section>

        <section className="dashboard-charts" aria-label="Análise do período">
          <article className="eia-card dashboard-chart-card dashboard-chart-main">
            <header className="dashboard-card-header">
              <div>
                <p className="eia-eyebrow">Conversas</p>
                <h2>Volume de atendimentos</h2>
                <p>
                  Interações da Lara {period === 'today' ? 'hoje' : `nos últimos ${periodDays[period]} dias`}
                </p>
              </div>
              <button
                type="button"
                className="dashboard-icon-button"
                onClick={() => navigate('/chat')}
                aria-label="Abrir as conversas atendidas"
              >
                <ArrowUpRight aria-hidden="true" />
              </button>
            </header>

            <div className="dashboard-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorChats" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--eia-data-1)" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="var(--eia-data-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--eia-data-grid)" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tickMargin={10}
                    fontSize={12}
                    stroke="var(--eia-data-axis)"
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    fontSize={12}
                    stroke="var(--eia-data-axis)"
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--eia-surface-elev)',
                      borderRadius: 'var(--eia-radius-md)',
                      border: 'var(--eia-glass-ring)',
                      color: 'var(--eia-text-primary)',
                      boxShadow: 'var(--eia-glass-shadow)',
                    }}
                    itemStyle={{ color: 'var(--eia-data-1)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="chats"
                    stroke="var(--eia-data-1)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorChats)"
                    activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--eia-surface)', fill: 'var(--eia-data-1)' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="eia-card dashboard-chart-card dashboard-conversions">
            <header className="dashboard-card-header">
              <div>
                <p className="eia-eyebrow">Resultado</p>
                <h2>Conversões</h2>
                <p>Reuniões, vendas e ações concluídas.</p>
              </div>
            </header>

            <div className="dashboard-bars">
              {/* O array vem do mais antigo para o mais recente: slice(0, 5)
                  mostrava justamente os cinco dias mais velhos do período. */}
              {chartData.slice(-5).map((day, index) => {
                const maximum = Math.max(...chartData.map((item) => item.sales), 1);
                const width = Math.min((day.sales / maximum) * 100, 100);

                return (
                  <div key={`${day.name}-${index}`} className="dashboard-bar-row">
                    <div>
                      <span>{day.name}</span>
                      <strong>{day.sales} conv.</strong>
                    </div>
                    <span className="eia-bar" aria-hidden="true">
                      <span className="eia-bar__fill" style={{ width: `${width}%` }} />
                    </span>
                  </div>
                );
              })}
            </div>

            <footer className="dashboard-total">
              <span>Total no período</span>
              <strong>{chartData.reduce((sum, item) => sum + item.sales, 0)} conversões</strong>
            </footer>
          </article>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
