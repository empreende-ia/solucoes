
import { NextResponse } from 'next/server'
import { templateProjectDb } from '@/lib/supabase-db'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

export const dynamic = 'force-dynamic'

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const project = await templateProjectDb.getById(id)
        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        const credentials = await getWhatsAppCredentials()
        if (!credentials) {
            return NextResponse.json({ error: 'WhatsApp credentials not found' }, { status: 400 })
        }

        const results = []

        for (const item of project.items) {
            try {
                let metaData = null

                // Strategy 1: Sync by ID
                if (item.meta_id) {
                    const response = await fetchWithTimeout(
                        `https://graph.facebook.com/v24.0/${item.meta_id}?fields=status,name,id`,
                        { headers: { 'Authorization': `Bearer ${credentials.accessToken}` }, timeoutMs: 12000 }
                    )
                    if (response.ok) {
                        metaData = await safeJson<any>(response)
                    }
                }

                // Strategy 2: Sync by Name (Recovery) if ID failed or missing
                if (!metaData && item.name) {
                    const response = await fetchWithTimeout(
                        `https://graph.facebook.com/v24.0/${credentials.businessAccountId}/message_templates?name=${encodeURIComponent(item.name)}&fields=status,name,id`,
                        { headers: { 'Authorization': `Bearer ${credentials.accessToken}` }, timeoutMs: 12000 }
                    )

                    if (response.ok) {
                        const data = await safeJson<any>(response)
                        if (data.data && data.data.length > 0) {
                            // Find exact match (just to be safe)
                            metaData = data.data.find((t: any) => t.name === item.name) || data.data[0]
                        }
                    }
                }

                // Update DB if we found data
                if (metaData) {
                    await templateProjectDb.updateItem(item.id, {
                        meta_id: metaData.id,
                        meta_status: metaData.status
                    })

                    results.push({ id: item.id, status: 'updated', meta: metaData })
                } else {
                    // Not found in Meta -> Reset to Draft so user can try again
                    await templateProjectDb.updateItem(item.id, {
                        meta_id: undefined,
                        meta_status: undefined
                    })
                    results.push({ id: item.id, status: 'reset_to_draft' })
                }

            } catch (err) {
                console.error(`Sync error for item ${item.name}:`, err)
                results.push({ id: item.id, status: 'error' })
            }
        }

        return NextResponse.json({ success: true, results })

    } catch (error) {
        console.error('Sync Project Error:', error)
        return NextResponse.json(
            { error: 'Failed to sync project' },
            { status: 500 }
        )
    }
}
