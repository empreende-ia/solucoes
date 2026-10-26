/**
 * Pause Campaign API
 * 
 * POST /api/campaign/[id]/pause
 * 
 * Pauses a running campaign. State is stored in Supabase.
 */

import { NextRequest, NextResponse } from 'next/server'
import { campaignDb } from '@/lib/supabase-db'
import { CampaignStatus } from '@/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  try {
    // Update campaign status in Supabase
    const campaign = await campaignDb.updateStatus(campaignId, {
      status: CampaignStatus.PAUSED,
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    console.log(`⏸️ Campaign ${campaignId} paused.`)

    return NextResponse.json({
      status: 'paused',
      campaignId,
    })
  } catch (error) {
    console.error('Error pausing campaign:', error)
    return NextResponse.json({ error: 'Failed to pause campaign' }, { status: 500 })
  }
}
