'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MetaDiagnosticsView } from '@/components/features/settings/MetaDiagnosticsView'
import { useMetaDiagnosticsController } from '@/hooks/useMetaDiagnostics'
import { useDevMode } from '@/components/providers/DevModeProvider'

export default function MetaDiagnosticsPage() {
  const router = useRouter()
  const { isDevMode } = useDevMode()
  const [isChecking, setIsChecking] = useState(true)
  const c = useMetaDiagnosticsController()

  // Aguarda hydration do localStorage antes de verificar
  useEffect(() => {
    const timer = setTimeout(() => setIsChecking(false), 100)
    return () => clearTimeout(timer)
  }, [])

  // Redireciona se não estiver no dev mode
  useEffect(() => {
    if (!isChecking && !isDevMode) {
      router.replace('/')
    }
  }, [isChecking, isDevMode, router])

  // Loading state enquanto verifica
  if (isChecking || !isDevMode) {
    return null
  }

  return (
    <MetaDiagnosticsView
      data={c.data}
      checks={c.checks}
      filteredChecks={c.filteredChecks}
      counts={c.counts}
      overall={c.overall}
      isLoading={c.isLoading}
      isFetching={c.isFetching}
      filter={c.filter}
      setFilter={c.setFilter}
      onRefresh={() => c.refetch()}
      onRunAction={c.runAction}
      isActing={c.isActing}
    />
  )
}
