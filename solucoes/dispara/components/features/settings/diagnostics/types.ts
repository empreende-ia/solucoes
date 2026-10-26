import type {
  MetaDiagnosticsCheck,
  MetaDiagnosticsCheckStatus,
} from '@/services/metaDiagnosticsService'

export const META_BUSINESS_LOCKED_CODE = 131031

export type MetaLockSignal =
  | { kind: 'none' }
  | { kind: 'historical'; evidence: { source: string; count?: number } }
  | { kind: 'current'; evidence: { source: string; count?: number } }

export type Simulate10033Response =
  | {
      ok: true
      simulated: true
      attempt?: { objectId?: string; status?: number }
      result?: {
        graphOk?: boolean
        normalizedError?: {
          message?: string
          code?: number | null
          subcode?: number | null
          fbtraceId?: string | null
          type?: string | null
        }
      }
    }
  | { ok: false; error: string; details?: unknown }

export interface TopLineResult {
  label: string
  status: MetaDiagnosticsCheckStatus
  detail: string
}

export interface FriendlyCopy {
  title: string
  message: string
  why?: string
}

export type { MetaDiagnosticsCheck, MetaDiagnosticsCheckStatus }
