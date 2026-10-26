import { NextResponse } from 'next/server'
import { templateProjectDb } from '@/lib/supabase-db'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'

export const dynamic = 'force-dynamic'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const project = await templateProjectDb.getById(id)
        return NextResponse.json(project)
    } catch (error) {
        console.error('Failed to fetch template project details:', error)
        return NextResponse.json(
            { error: 'Failed to fetch template project details' },
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
        const url = new URL(request.url)
        const deleteMetaTemplates = url.searchParams.get('deleteMetaTemplates') === 'true'

        // Se pediu para deletar templates da Meta, fazer isso primeiro
        if (deleteMetaTemplates) {
            const credentials = await getWhatsAppCredentials()
            if (credentials) {
                // Buscar o projeto com seus items para saber quais templates deletar
                const project = await templateProjectDb.getById(id)
                const approvedItems = project.items?.filter(
                    (item: { meta_status?: string; name?: string }) =>
                        item.meta_status === 'APPROVED' && item.name
                ) || []

                // Deletar cada template aprovado da Meta
                for (const item of approvedItems) {
                    try {
                        const deleteUrl = `https://graph.facebook.com/v24.0/${credentials.businessAccountId}/message_templates?name=${encodeURIComponent(item.name)}`
                        const response = await fetch(deleteUrl, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${credentials.accessToken}`,
                            },
                        })

                        if (response.ok) {
                            console.log(`[DELETE] Template "${item.name}" deletado da Meta`)
                        } else {
                            const error = await response.json()
                            console.warn(`[DELETE] Falha ao deletar template "${item.name}" da Meta:`, error)
                        }
                    } catch (err) {
                        console.warn(`[DELETE] Erro ao deletar template "${item.name}":`, err)
                        // Continua deletando os outros templates mesmo se um falhar
                    }
                }
            }
        }

        // Deletar o projeto (cascade deleta os items)
        await templateProjectDb.delete(id)
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to delete template project:', error)
        return NextResponse.json(
            { error: 'Failed to delete template project' },
            { status: 500 }
        )
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await request.json()

        const updated = await templateProjectDb.update(id, {
            title: body.title
        })

        return NextResponse.json(updated)
    } catch (error) {
        console.error('Failed to update template project:', error)
        return NextResponse.json(
            { error: 'Failed to update template project' },
            { status: 500 }
        )
    }
}
