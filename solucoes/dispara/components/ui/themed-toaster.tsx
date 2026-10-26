'use client'

import { Toaster } from 'sonner'

/**
 * Toaster com tema dark fixo — o app é dark-only (brand Henrique Gabriel).
 */
export function ThemedToaster() {
  return (
    <Toaster
      richColors
      position="top-right"
      theme="dark"
    />
  )
}
