'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  metaDiagnosticsService,
  type MetaDiagnosticsAction,
  type MetaDiagnosticsCheck,
  type MetaDiagnosticsResponse,
} from '@/services/metaDiagnosticsService'

export type MetaDiagnosticsFilter = 'all' | 'actionable' | 'problems'

function isProblemStatus(s: MetaDiagnosticsCheck['status']) {
  return s === 'fail' || s === 'warn'
}

function isActionable(check: MetaDiagnosticsCheck) {
  return (check.actions || []).some((a) => a.kind === 'api' || a.kind === 'link')
}

const STATUS_ORDER: Record<MetaDiagnosticsCheck['status'], number> = {
  fail: 0,
  warn: 1,
  info: 2,
  pass: 3,
}

const ID_PRIORITY: Record<string, number> = {
  creds: 0,
  meta_health_status: 1,
  meta_debug_token: 2,
  meta_token_scopes: 3,
  meta_token_app_id: 4,
  meta_waba_phone_link: 5,
  meta_subscription_messages: 6,
  meta_me: 7,
  meta_permissions: 8,
  meta_waba: 9,
  meta_phone: 10,
  internal_recent_failures: 20,
  internal_last_status_update: 21,
  webhook_expected: 30,
}

function getPriorityForCheckId(id: string) {
  if (id in ID_PRIORITY) return ID_PRIORITY[id]!
  // checks de acesso (WABA/PHONE_NUMBER) costumam destravar 90% dos erros 100/33
  if (id.startsWith('meta_access_')) return 4
  return 999
}

export function useMetaDiagnosticsController() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = React.useState<MetaDiagnosticsFilter>('problems')

  const query = useQuery<MetaDiagnosticsResponse>({
    queryKey: ['metaDiagnostics'],
    queryFn: () => metaDiagnosticsService.get(),
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: false,
  })

  const actionMutation = useMutation({
    mutationFn: async (action: MetaDiagnosticsAction) => metaDiagnosticsService.runAction(action),
    onSuccess: () => {
      toast.success('Ação executada! Atualizando diagnóstico…')
      queryClient.invalidateQueries({ queryKey: ['metaDiagnostics'] })
      queryClient.invalidateQueries({ queryKey: ['metaWebhookSubscription'] })
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Falha ao executar ação')
    },
  })

  const checksRaw = query.data?.checks || []

  const checks = React.useMemo(() => {
    const copy = [...checksRaw]
    copy.sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 99
      const sb = STATUS_ORDER[b.status] ?? 99
      if (sa !== sb) return sa - sb

      const aa = isActionable(a) ? 0 : 1
      const ab = isActionable(b) ? 0 : 1
      if (aa !== ab) return aa - ab

      const pa = getPriorityForCheckId(a.id)
      const pb = getPriorityForCheckId(b.id)
      if (pa !== pb) return pa - pb

      return a.title.localeCompare(b.title)
    })
    return copy
  }, [checksRaw])

  const filteredChecks = React.useMemo(() => {
    if (filter === 'all') return checks
    if (filter === 'problems') return checks.filter((c) => isProblemStatus(c.status))
    if (filter === 'actionable') return checks.filter((c) => isActionable(c))
    return checks
  }, [checks, filter])

  const counts = React.useMemo(() => {
    const out = { pass: 0, warn: 0, fail: 0, info: 0 }
    for (const c of checks) out[c.status]++
    return out
  }, [checks])

  const overall: 'pass' | 'warn' | 'fail' | 'info' = React.useMemo(() => {
    if (counts.fail > 0) return 'fail'
    if (counts.warn > 0) return 'warn'
    if (counts.pass > 0) return 'pass'
    return 'info'
  }, [counts.fail, counts.warn, counts.pass])

  const runAction = React.useCallback(
    async (action: MetaDiagnosticsAction) => {
      if (action.kind !== 'api') return
      await actionMutation.mutateAsync(action)
    },
    [actionMutation]
  )

  return {
    data: query.data,
    checks,
    filteredChecks,
    counts,
    overall,

    filter,
    setFilter,

    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,

    refetch: query.refetch,

    runAction,
    isActing: actionMutation.isPending,
  }
}
