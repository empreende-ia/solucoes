/**
 * Booking Settings API
 *
 * GET - Returns current booking configuration and prerequisites status
 * POST - Sets the booking_flow_id (which flow to use for booking)
 */

import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { checkBookingPrerequisites } from '@/lib/ai/tools/booking-tool'

const BOOKING_FLOW_ID_KEY = 'booking_flow_id'

// =============================================================================
// GET - Get booking configuration and status
// =============================================================================

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: false,
        error: 'Supabase não configurado',
      }, { status: 400 })
    }

    // Get prerequisites status
    const prereqs = await checkBookingPrerequisites()

    // Get current booking flow ID
    const bookingFlowId = await settingsDb.get(BOOKING_FLOW_ID_KEY)

    // Get flow details if configured
    let flowDetails = null
    if (bookingFlowId) {
      const { data: flow } = await supabase
        .from('flows')
        .select('id, name, meta_flow_id, meta_status')
        .eq('id', bookingFlowId)
        .single()

      flowDetails = flow
    }

    // Get available flows (published ones)
    const { data: availableFlows } = await supabase
      .from('flows')
      .select('id, name, meta_flow_id, meta_status, template_key')
      .not('meta_flow_id', 'is', null)
      .order('name')

    return NextResponse.json({
      ok: true,
      config: {
        bookingFlowId,
        flowDetails,
      },
      prerequisites: prereqs,
      availableFlows: availableFlows || [],
    })
  } catch (error) {
    console.error('[booking settings] GET error:', error)
    return NextResponse.json({
      ok: false,
      error: 'Falha ao buscar configurações',
    }, { status: 500 })
  }
}

// =============================================================================
// POST - Set booking flow ID
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: false,
        error: 'Supabase não configurado',
      }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const { flowId } = body

    // Validate flowId
    if (flowId !== null && flowId !== undefined) {
      if (typeof flowId !== 'string' || !flowId.trim()) {
        return NextResponse.json({
          ok: false,
          error: 'flowId deve ser uma string válida ou null para remover',
        }, { status: 400 })
      }

      // Check if flow exists and is published
      const { data: flow, error: flowError } = await supabase
        .from('flows')
        .select('id, name, meta_flow_id, meta_status')
        .eq('id', flowId.trim())
        .single()

      if (flowError || !flow) {
        return NextResponse.json({
          ok: false,
          error: 'Flow não encontrado',
        }, { status: 404 })
      }

      if (!flow.meta_flow_id) {
        return NextResponse.json({
          ok: false,
          error: 'Este Flow não está publicado no Meta. Publique primeiro.',
        }, { status: 400 })
      }

      // Save flow ID
      await settingsDb.set(BOOKING_FLOW_ID_KEY, flowId.trim())

      return NextResponse.json({
        ok: true,
        message: 'Flow de agendamento configurado',
        config: {
          bookingFlowId: flowId.trim(),
          flowDetails: flow,
        },
      })
    }

    // Remove booking flow ID by deleting from settings table
    const { error: deleteError } = await supabase
      .from('settings')
      .delete()
      .eq('key', BOOKING_FLOW_ID_KEY)

    if (deleteError) {
      console.error('[booking settings] Delete error:', deleteError)
    }

    return NextResponse.json({
      ok: true,
      message: 'Configuração de agendamento removida',
      config: {
        bookingFlowId: null,
        flowDetails: null,
      },
    })
  } catch (error) {
    console.error('[booking settings] POST error:', error)
    return NextResponse.json({
      ok: false,
      error: 'Falha ao salvar configurações',
    }, { status: 500 })
  }
}
