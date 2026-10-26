/**
 * Resume Campaign API
 * 
 * POST /api/campaign/[id]/resume
 * 
 * Resumes a paused campaign. State is stored in Supabase.
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
      status: CampaignStatus.SENDING,
      startedAt: new Date().toISOString(),
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    console.log(`▶️ Campaign ${campaignId} resumed.`)

    return NextResponse.json({ status: 'resumed', campaignId })
  } catch (error) {
    console.error('Error resuming campaign:', error)
    return NextResponse.json({ error: 'Failed to resume campaign' }, { status: 500 })
  }
}
