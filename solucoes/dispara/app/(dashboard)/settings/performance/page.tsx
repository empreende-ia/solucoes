'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSettingsPerformanceController } from '@/hooks/useSettingsPerformance'
import { SettingsPerformanceView } from '@/components/features/settings/SettingsPerformanceView'
import { useDevMode } from '@/components/providers/DevModeProvider'

export default function SettingsPerformancePage() {
  const router = useRouter()
  const { isDevMode } = useDevMode()
  const [isChecking, setIsChecking] = useState(true)
  const c = useSettingsPerformanceController()

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
    <SettingsPerformanceView
      data={c.data}
      isLoading={c.isLoading}
      isFetching={c.isFetching}
      rangeDays={c.rangeDays}
      setRangeDays={c.setRangeDays}
      selectedConfigHash={c.selectedConfigHash}
      setSelectedConfigHash={c.setSelectedConfigHash}
      filteredRuns={c.filteredRuns}
      configs={c.configs}
      onRefresh={() => c.refetch()}
      hint={c.data?.hint}
    />
  )
}
