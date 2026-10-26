import { NextResponse } from 'next/server'
import { fetchWithTimeout, isAbortError } from '@/lib/server-http'

export async function POST() {
  // Para fazer redeploy via API da Vercel, precisamos:
  // 1. VERCEL_TOKEN (token de acesso)
  // 2. VERCEL_PROJECT_ID ou nome do projeto
  // 3. VERCEL_TEAM_ID (opcional)
  
  // Como alternativa mais simples: instruir o usuário a criar um deploy hook
  // que pode ser chamado via POST sem autenticação
  
  const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL
  
  if (!deployHookUrl) {
    return NextResponse.json({
      success: false,
      message: 'Deploy hook não configurado. Configure VERCEL_DEPLOY_HOOK_URL nas variáveis de ambiente.',
      instructions: [
        '1. Vá em Project Settings → Git → Deploy Hooks',
        '2. Crie um hook chamado "dispara-redeploy"',
        '3. Copie a URL e adicione como VERCEL_DEPLOY_HOOK_URL',
      ]
    }, { status: 400 })
  }

  try {
    const response = await fetchWithTimeout(deployHookUrl, {
      method: 'POST',
      timeoutMs: 8000,
    })

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'Redeploy iniciado! Aguarde alguns segundos e clique em "Verificar novamente".',
      })
    } else {
      return NextResponse.json({
        success: false,
        message: 'Falha ao iniciar redeploy',
      }, { status: 500 })
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    }, { status: isAbortError(error) ? 504 : 502 })
  }
}
