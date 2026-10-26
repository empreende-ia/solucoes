import { useQuery } from '@tanstack/react-query'

interface AwesomeAPIResponse {
  USDBRL: {
    bid: string
    ask: string
  }
}

// Função de fetch separada para React Query
async function fetchExchangeRate(): Promise<number> {
  const response = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL')
  if (!response.ok) throw new Error('API indisponível')

  const data: AwesomeAPIResponse = await response.json()
  return parseFloat(data.USDBRL.bid)
}

/**
 * Hook para obter taxa de câmbio USD/BRL
 * Usa React Query para cache automático e deduplicação
 */
export function useExchangeRate() {
  const { data: rate, isLoading, error } = useQuery({
    queryKey: ['exchange-rate', 'USD-BRL'],
    queryFn: fetchExchangeRate,
    staleTime: 1000 * 60 * 60, // 1 hora - mesma duração do cache anterior
    gcTime: 1000 * 60 * 60 * 24, // 24 horas no garbage collector
    retry: 2,
    refetchOnWindowFocus: false,
  })

  return {
    rate: rate ?? null,
    isLoading,
    error: error ? 'Taxa de câmbio indisponível' : null,
    hasRate: rate != null,
  }
}
