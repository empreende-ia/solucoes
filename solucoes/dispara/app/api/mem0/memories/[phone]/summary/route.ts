/**
 * Gera um resumo narrativo combinando perfil + memórias do contato
 *
 * POST - Gera resumo usando IA
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { settingsDb } from '@/lib/supabase-db'

interface RouteParams {
  params: Promise<{ phone: string }>
}

interface ProfileData {
  name: string | null
  email: string | null
  status: string
  tags: string[]
  customFields: Record<string, unknown>
  createdAt: string | null
}

interface MemoryData {
  memory: string
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { phone } = await params
    const body = await request.json()
    const { profile, memories } = body as { profile: ProfileData | null; memories: MemoryData[] }

    if (!profile && (!memories || memories.length === 0)) {
      return NextResponse.json({
        ok: false,
        error: 'Nenhum dado para resumir',
      }, { status: 400 })
    }

    // Busca API key do Gemini
    const geminiKey = await settingsDb.get('gemini_api_key') || process.env.GEMINI_API_KEY
    if (!geminiKey) {
      return NextResponse.json({
        ok: false,
        error: 'Gemini não configurado',
      }, { status: 400 })
    }

    // Monta contexto para o prompt
    const contextParts: string[] = []

    if (profile) {
      const profileLines: string[] = []
      if (profile.name) profileLines.push(`Nome: ${profile.name}`)
      if (profile.email) profileLines.push(`Email: ${profile.email}`)
      // Tags são metadados de sistema (segmentação interna), não preferências do cliente - não incluir
      if (profile.createdAt) profileLines.push(`Cliente desde: ${profile.createdAt}`)
      if (profile.customFields && Object.keys(profile.customFields).length > 0) {
        Object.entries(profile.customFields).forEach(([key, value]) => {
          profileLines.push(`${key}: ${value}`)
        })
      }
      if (profileLines.length > 0) {
        contextParts.push(`DADOS CADASTRAIS:\n${profileLines.join('\n')}`)
      }
    }

    if (memories && memories.length > 0) {
      const memoryLines = memories.map((m) => `- ${m.memory}`).join('\n')
      contextParts.push(`MEMÓRIAS DA IA:\n${memoryLines}`)
    }

    const context = contextParts.join('\n\n')

    // Gera resumo com Gemini
    const google = createGoogleGenerativeAI({ apiKey: geminiKey })

    const { text } = await generateText({
      model: google('gemini-2.0-flash'),
      prompt: `Você é um assistente que ajuda atendentes a entender rapidamente o contexto de um cliente.

Com base nas informações abaixo, gere um RESUMO NARRATIVO curto (2-3 frases) em português brasileiro, em tom profissional e amigável.

O resumo deve:
- Ser conciso e útil para um atendente
- Destacar informações mais relevantes para personalizar o atendimento
- Usar linguagem natural (não listar dados)

INFORMAÇÕES DO CLIENTE:
${context}

RESUMO:`,
    })

    return NextResponse.json({
      ok: true,
      summary: text.trim(),
    })
  } catch (error) {
    console.error('[mem0 summary] POST error:', error)
    return NextResponse.json({
      ok: false,
      error: 'Falha ao gerar resumo',
    }, { status: 500 })
  }
}
