import { NextResponse } from 'next/server'
import { customFieldDefDb } from '@/lib/supabase-db'

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        await customFieldDefDb.delete(id)
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to delete custom field:', error)
        return NextResponse.json(
            { error: 'Falha ao deletar campo personalizado' },
            { status: 500 }
        )
    }
}
