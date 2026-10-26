import { NextResponse } from 'next/server'
import { templateProjectDb } from '@/lib/supabase-db'

export const dynamic = 'force-dynamic'

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const updates = await request.json()
        const item = await templateProjectDb.updateItem(id, updates)
        return NextResponse.json(item)
    } catch (error) {
        console.error('Failed to update template project item:', error)
        return NextResponse.json(
            { error: 'Failed to update template project item' },
            { status: 500 }
        )
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        await templateProjectDb.deleteItem(id)
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to delete template project item:', error)
        return NextResponse.json(
            { error: 'Failed to delete template project item' },
            { status: 500 }
        )
    }
}
