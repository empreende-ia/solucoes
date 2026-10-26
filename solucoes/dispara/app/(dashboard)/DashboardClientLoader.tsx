'use client'

import { DashboardClientWrapper } from './DashboardClientWrapper'

export function DashboardClientLoader({ initialData }: { initialData?: any }) {
  return <DashboardClientWrapper initialData={initialData} />
}
