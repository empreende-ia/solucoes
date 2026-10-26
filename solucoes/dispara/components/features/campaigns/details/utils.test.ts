import { describe, expect, it } from 'vitest'
import { CampaignStatus } from '@/types'
import {
  formatDurationMs,
  formatThroughput,
  formatMs,
  getCampaignStatusClass,
  formatScheduledTime,
  computeBaselineThroughputMedian,
  computePerfSourceLabel,
  computeLimiterInfo,
} from './utils'

describe('formatDurationMs', () => {
  it('retorna traço para null', () => {
    expect(formatDurationMs(null)).toBe('—')
  })

  it('retorna traço para undefined', () => {
    expect(formatDurationMs(undefined)).toBe('—')
  })

  it('retorna traço para zero', () => {
    expect(formatDurationMs(0)).toBe('—')
  })

  it('retorna traço para valores negativos', () => {
    expect(formatDurationMs(-1000)).toBe('—')
  })

  it('formata apenas segundos para duracoes menores que 1 minuto', () => {
    expect(formatDurationMs(5000)).toBe('5s')
    expect(formatDurationMs(30000)).toBe('30s')
    expect(formatDurationMs(59000)).toBe('59s')
  })

  it('formata minutos e segundos para duracoes maiores que 1 minuto', () => {
    expect(formatDurationMs(60000)).toBe('1m 00s')
    expect(formatDurationMs(65000)).toBe('1m 05s')
    expect(formatDurationMs(125000)).toBe('2m 05s')
    expect(formatDurationMs(3600000)).toBe('60m 00s')
  })

  it('arredonda milissegundos para segundos', () => {
    expect(formatDurationMs(1499)).toBe('1s')
    expect(formatDurationMs(1500)).toBe('2s')
    expect(formatDurationMs(61500)).toBe('1m 02s')
  })

  it('adiciona zero a esquerda nos segundos', () => {
    expect(formatDurationMs(61000)).toBe('1m 01s')
    expect(formatDurationMs(69000)).toBe('1m 09s')
  })
})

describe('formatThroughput', () => {
  it('retorna traço para null', () => {
    expect(formatThroughput(null)).toBe('—')
  })

  it('retorna traço para undefined', () => {
    expect(formatThroughput(undefined)).toBe('—')
  })

  it('retorna traço para zero', () => {
    expect(formatThroughput(0)).toBe('—')
  })

  it('retorna traço para valores negativos', () => {
    expect(formatThroughput(-1)).toBe('—')
  })

  it('retorna traço para NaN', () => {
    expect(formatThroughput(NaN)).toBe('—')
  })

  it('retorna traço para Infinity', () => {
    expect(formatThroughput(Infinity)).toBe('—')
    expect(formatThroughput(-Infinity)).toBe('—')
  })

  it('formata throughput com 2 casas decimais para msg/s e 1 para msg/min', () => {
    expect(formatThroughput(1)).toBe('1.00 msg/s (60.0 msg/min)')
    expect(formatThroughput(0.5)).toBe('0.50 msg/s (30.0 msg/min)')
    expect(formatThroughput(2.333)).toBe('2.33 msg/s (140.0 msg/min)')
  })

  it('funciona com valores pequenos', () => {
    expect(formatThroughput(0.1)).toBe('0.10 msg/s (6.0 msg/min)')
    expect(formatThroughput(0.01)).toBe('0.01 msg/s (0.6 msg/min)')
  })
})

describe('formatMs', () => {
  it('retorna traço para null', () => {
    expect(formatMs(null)).toBe('—')
  })

  it('retorna traço para undefined', () => {
    expect(formatMs(undefined)).toBe('—')
  })

  it('retorna traço para zero', () => {
    expect(formatMs(0)).toBe('—')
  })

  it('retorna traço para valores negativos', () => {
    expect(formatMs(-100)).toBe('—')
  })

  it('retorna traço para NaN', () => {
    expect(formatMs(NaN)).toBe('—')
  })

  it('retorna traço para Infinity', () => {
    expect(formatMs(Infinity)).toBe('—')
  })

  it('formata em milissegundos para valores menores que 1000', () => {
    expect(formatMs(1)).toBe('1ms')
    expect(formatMs(500)).toBe('500ms')
    expect(formatMs(999)).toBe('999ms')
  })

  it('formata em segundos para valores >= 1000', () => {
    expect(formatMs(1000)).toBe('1.00s')
    expect(formatMs(1500)).toBe('1.50s')
    expect(formatMs(2345)).toBe('2.35s')
  })

  it('arredonda milissegundos', () => {
    expect(formatMs(123.7)).toBe('124ms')
    expect(formatMs(123.4)).toBe('123ms')
  })
})

describe('getCampaignStatusClass', () => {
  it('retorna classe correta para COMPLETED', () => {
    expect(getCampaignStatusClass(CampaignStatus.COMPLETED)).toBe(
      'bg-primary-500/10 border-primary-500/20 text-primary-400'
    )
  })

  it('retorna classe correta para SENDING', () => {
    expect(getCampaignStatusClass(CampaignStatus.SENDING)).toBe(
      'bg-blue-500/10 border-blue-500/20 text-blue-400'
    )
  })

  it('retorna classe correta para CANCELLED', () => {
    expect(getCampaignStatusClass(CampaignStatus.CANCELLED)).toBe(
      'bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]'
    )
  })

  it('retorna classe correta para PAUSED', () => {
    expect(getCampaignStatusClass(CampaignStatus.PAUSED)).toBe(
      'bg-amber-500/10 border-amber-500/20 text-amber-400'
    )
  })

  it('retorna classe correta para SCHEDULED', () => {
    expect(getCampaignStatusClass(CampaignStatus.SCHEDULED)).toBe(
      'bg-violet-500/10 border-violet-500/20 text-violet-400'
    )
  })

  it('retorna classe correta para FAILED', () => {
    expect(getCampaignStatusClass(CampaignStatus.FAILED)).toBe(
      'bg-red-500/10 border-red-500/20 text-red-400'
    )
  })

  it('retorna classe padrao para DRAFT', () => {
    expect(getCampaignStatusClass(CampaignStatus.DRAFT)).toBe(
      'bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]'
    )
  })

  it('retorna classe padrao para status desconhecido', () => {
    expect(getCampaignStatusClass('unknown' as CampaignStatus)).toBe(
      'bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]'
    )
  })
})

describe('formatScheduledTime', () => {
  it('retorna null para null', () => {
    expect(formatScheduledTime(null)).toBeNull()
  })

  it('retorna null para undefined', () => {
    expect(formatScheduledTime(undefined)).toBeNull()
  })

  it('retorna null para string vazia', () => {
    expect(formatScheduledTime('')).toBeNull()
  })

  it('formata data ISO em formato pt-BR', () => {
    const result = formatScheduledTime('2024-06-15T14:30:00.000Z')
    // O resultado depende do timezone local, mas deve conter os elementos basicos
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('formata datas com diferentes timezones', () => {
    const result = formatScheduledTime('2024-01-01T00:00:00.000Z')
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })
})

describe('computeBaselineThroughputMedian', () => {
  it('retorna null para array vazio', () => {
    expect(computeBaselineThroughputMedian([])).toBeNull()
  })

  it('retorna null para array com valores invalidos', () => {
    expect(computeBaselineThroughputMedian([{ throughput_mps: null }])).toBeNull()
    expect(computeBaselineThroughputMedian([{ throughput_mps: undefined }])).toBeNull()
    expect(computeBaselineThroughputMedian([{ throughput_mps: 'abc' }])).toBeNull()
    expect(computeBaselineThroughputMedian([{ throughput_mps: NaN }])).toBeNull()
    expect(computeBaselineThroughputMedian([{ throughput_mps: 0 }])).toBeNull()
    expect(computeBaselineThroughputMedian([{ throughput_mps: -5 }])).toBeNull()
  })

  it('retorna o valor unico para array com um elemento valido', () => {
    expect(computeBaselineThroughputMedian([{ throughput_mps: 5 }])).toBe(5)
  })

  it('calcula mediana para numero impar de elementos', () => {
    const baseline = [
      { throughput_mps: 1 },
      { throughput_mps: 3 },
      { throughput_mps: 2 },
    ]
    expect(computeBaselineThroughputMedian(baseline)).toBe(2)
  })

  it('calcula mediana para numero par de elementos', () => {
    const baseline = [
      { throughput_mps: 1 },
      { throughput_mps: 2 },
      { throughput_mps: 3 },
      { throughput_mps: 4 },
    ]
    expect(computeBaselineThroughputMedian(baseline)).toBe(2.5)
  })

  it('ignora valores invalidos no calculo', () => {
    const baseline = [
      { throughput_mps: 1 },
      { throughput_mps: null },
      { throughput_mps: 3 },
      { throughput_mps: -1 },
      { throughput_mps: 5 },
    ]
    expect(computeBaselineThroughputMedian(baseline)).toBe(3)
  })

  it('funciona com objetos sem propriedade throughput_mps', () => {
    const baseline = [
      { throughput_mps: 2 },
      { other_prop: 10 },
      { throughput_mps: 4 },
    ]
    expect(computeBaselineThroughputMedian(baseline)).toBe(3)
  })

  it('funciona com valores string numericos', () => {
    const baseline = [
      { throughput_mps: '2' },
      { throughput_mps: '4' },
    ]
    expect(computeBaselineThroughputMedian(baseline)).toBe(3)
  })
})

describe('computePerfSourceLabel', () => {
  it('retorna label correto para run_metrics', () => {
    const result = computePerfSourceLabel('run_metrics')
    expect(result.label).toBe('Dados: avançados')
    expect(result.tone).toBe('text-primary-300 bg-primary-500/10 border-primary-500/20')
  })

  it('retorna label correto para campaigns_fallback', () => {
    const result = computePerfSourceLabel('campaigns_fallback')
    expect(result.label).toBe('Dados: básicos')
    expect(result.tone).toBe('text-amber-200 bg-amber-500/10 border-amber-500/20')
  })

  it('retorna label padrao para undefined', () => {
    const result = computePerfSourceLabel(undefined)
    expect(result.label).toBe('Dados: —')
    expect(result.tone).toBe('text-[var(--ds-text-muted)] bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)]')
  })

  it('retorna label padrao para string vazia', () => {
    const result = computePerfSourceLabel('')
    expect(result.label).toBe('Dados: —')
    expect(result.tone).toBe('text-[var(--ds-text-muted)] bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)]')
  })

  it('retorna label padrao para string com espacos', () => {
    const result = computePerfSourceLabel('   ')
    expect(result.label).toBe('Dados: —')
    expect(result.tone).toBe('text-[var(--ds-text-muted)] bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)]')
  })

  it('retorna label customizado para source desconhecido', () => {
    const result = computePerfSourceLabel('custom_source')
    expect(result.label).toBe('Dados: custom_source')
    expect(result.tone).toBe('text-[var(--ds-text-muted)] bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)]')
  })

  it('faz trim em sources com espacos', () => {
    const result = computePerfSourceLabel('  run_metrics  ')
    expect(result.label).toBe('Dados: avançados')
  })
})

describe('computeLimiterInfo', () => {
  describe('quando saw_throughput_429 e true', () => {
    it('retorna rate limit com cor amber', () => {
      const result = computeLimiterInfo({ saw_throughput_429: true }, 'run_metrics')
      expect(result.value).toBe('Rate limit')
      expect(result.color).toBe('#f59e0b')
      expect(result.subvalue).toContain('130429')
    })

    it('retorna rate limit independente do source', () => {
      const result = computeLimiterInfo({ saw_throughput_429: true }, undefined)
      expect(result.value).toBe('Rate limit')
    })
  })

  describe('quando saw_throughput_429 e false', () => {
    it('retorna OK com latencia quando meta_avg_ms esta presente', () => {
      const result = computeLimiterInfo(
        { saw_throughput_429: false, meta_avg_ms: 250 },
        'run_metrics'
      )
      expect(result.value).toBe('OK')
      expect(result.color).toBe('#3b82f6')
      expect(result.subvalue).toContain('250ms')
    })

    it('retorna OK sem latencia quando meta_avg_ms nao esta presente', () => {
      const result = computeLimiterInfo(
        { saw_throughput_429: false },
        'run_metrics'
      )
      expect(result.value).toBe('OK')
      expect(result.subvalue).toBe('Sem 130429 detectado nesta execução.')
    })

    it('retorna OK sem latencia quando meta_avg_ms e zero', () => {
      const result = computeLimiterInfo(
        { saw_throughput_429: false, meta_avg_ms: 0 },
        'run_metrics'
      )
      expect(result.value).toBe('OK')
      expect(result.subvalue).toBe('Sem 130429 detectado nesta execução.')
    })

    it('retorna OK sem latencia quando meta_avg_ms e negativo', () => {
      const result = computeLimiterInfo(
        { saw_throughput_429: false, meta_avg_ms: -100 },
        'run_metrics'
      )
      expect(result.value).toBe('OK')
      expect(result.subvalue).toBe('Sem 130429 detectado nesta execução.')
    })

    it('formata latencia em segundos para valores >= 1000ms', () => {
      const result = computeLimiterInfo(
        { saw_throughput_429: false, meta_avg_ms: 1500 },
        'run_metrics'
      )
      expect(result.subvalue).toContain('1.50s')
    })
  })

  describe('quando saw_throughput_429 e undefined/null', () => {
    it('retorna traço para campaigns_fallback', () => {
      const result = computeLimiterInfo({}, 'campaigns_fallback')
      expect(result.value).toBe('—')
      expect(result.subvalue).toContain('métricas avançadas')
      expect(result.color).toBe('#3b82f6')
    })

    it('retorna sem telemetria para run_metrics sem dados', () => {
      const result = computeLimiterInfo({}, 'run_metrics')
      expect(result.value).toBe('Sem telemetria')
      expect(result.subvalue).toContain('não registrou sinal')
      expect(result.color).toBe('#3b82f6')
    })

    it('retorna sem telemetria para perf null', () => {
      const result = computeLimiterInfo(null, 'run_metrics')
      expect(result.value).toBe('Sem telemetria')
    })

    it('retorna sem telemetria para perf undefined', () => {
      const result = computeLimiterInfo(undefined, 'run_metrics')
      expect(result.value).toBe('Sem telemetria')
    })

    it('retorna sem telemetria quando source e undefined', () => {
      const result = computeLimiterInfo({}, undefined)
      expect(result.value).toBe('Sem telemetria')
    })
  })
})
