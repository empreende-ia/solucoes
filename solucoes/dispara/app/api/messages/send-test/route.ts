import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials';
import { normalizePhoneNumber } from '@/lib/phone-formatter';
import { fetchWithTimeout, safeJson } from '@/lib/server-http';

const META_API_VERSION = 'v24.0';

type TemplateInfo = {
  name: string;
  language: string;
  status: string;
  category: string;
};

/**
 * Busca um template válido para teste.
 * Prioriza hello_world, depois templates SEM parâmetros ({{n}}).
 */
async function findTestTemplate(
  wabaId: string,
  accessToken: string
): Promise<TemplateInfo | null> {
  try {
    // Busca templates com componentes para verificar se tem parâmetros
    const url = `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/message_templates?fields=name,language,status,category,components&limit=100`;
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeoutMs: 10000,
    });

    const data = await safeJson<{ data?: Array<any> }>(res);
    if (!res.ok || !Array.isArray(data?.data)) {
      return null;
    }

    const templates = data.data.filter((t) => t.status === 'APPROVED');

    // Prioridade 1: hello_world aprovado (template padrão da Meta)
    const helloWorld = templates.find((t) => t.name === 'hello_world');
    if (helloWorld) {
      return {
        name: helloWorld.name,
        language: helloWorld.language || 'en_US',
        status: helloWorld.status,
        category: helloWorld.category || 'UTILITY',
      };
    }

    // Prioridade 2: templates SIMPLES (sem parâmetros E sem header de mídia)
    const simpleTemplates = templates.filter((t) => {
      const components = Array.isArray(t.components) ? t.components : [];

      // Verificar body: sem parâmetros {{
      const bodyComponent = components.find((c: any) => c.type === 'BODY');
      const bodyText = bodyComponent?.text || '';
      if (bodyText.includes('{{')) return false;

      // Verificar header: sem mídia (IMAGE, VIDEO, DOCUMENT)
      const headerComponent = components.find((c: any) => c.type === 'HEADER');
      if (headerComponent) {
        const format = headerComponent.format || '';
        if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format)) return false;
      }

      return true;
    });

    if (simpleTemplates.length > 0) {
      // Ordena por categoria (UTILITY primeiro)
      simpleTemplates.sort((a, b) => {
        const order = ['UTILITY', 'MARKETING', 'AUTHENTICATION'];
        return order.indexOf(a.category) - order.indexOf(b.category);
      });
      const selected = simpleTemplates[0];
      return {
        name: selected.name,
        language: selected.language || 'pt_BR',
        status: selected.status,
        category: selected.category || 'UTILITY',
      };
    }

    // Prioridade 3: qualquer template APPROVED (vai falhar se tiver params, mas tenta)
    if (templates.length > 0) {
      const selected = templates[0];
      return {
        name: selected.name,
        language: selected.language || 'pt_BR',
        status: selected.status,
        category: selected.category || 'UTILITY',
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * POST /api/messages/send-test
 * Envia uma mensagem de teste usando um template aprovado da conta.
 * Auto-seleciona o template: prioriza hello_world, depois qualquer APPROVED.
 *
 * Body:
 * - to: número do destinatário
 * - credentials?: { phoneNumberId, businessAccountId, accessToken } - opcional, usa credenciais salvas se não fornecido
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, credentials: providedCredentials } = body;

    if (!to) {
      return NextResponse.json(
        { error: 'Número do destinatário é obrigatório' },
        { status: 400 }
      );
    }

    // Normalizar número
    const normalizedPhone = normalizePhoneNumber(to);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: 'Número de telefone inválido' },
        { status: 400 }
      );
    }

    // Obter credenciais salvas (sempre precisamos do WABA para buscar templates)
    const savedCredentials = await getWhatsAppCredentials();

    // Usar credenciais fornecidas ou salvas para Phone ID e Token
    const phoneNumberId = providedCredentials?.phoneNumberId || savedCredentials?.phoneNumberId;
    const accessToken = providedCredentials?.accessToken || savedCredentials?.accessToken;
    const wabaId = providedCredentials?.businessAccountId || savedCredentials?.businessAccountId;

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        { error: 'Credenciais não configuradas' },
        { status: 401 }
      );
    }

    if (!wabaId) {
      return NextResponse.json(
        { error: 'Business Account ID (WABA) não configurado. Configure nas credenciais.' },
        { status: 400 }
      );
    }

    // Buscar template válido da conta
    const template = await findTestTemplate(wabaId, accessToken);

    if (!template) {
      return NextResponse.json(
        {
          ok: false,
          noTemplate: true,
          message: 'Nenhum template disponível para teste.',
          hint: 'Você pode criar um template no Meta Business Manager depois.',
        },
        { status: 200 } // 200 porque não é erro - só não tem template
      );
    }

    // Enviar mensagem usando o template encontrado
    const response = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalizedPhone,
          type: 'template',
          template: {
            name: template.name,
            language: {
              code: template.language,
            },
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data?.error?.message || 'Erro ao enviar mensagem';
      const errorCode = data?.error?.code;

      // Erros comuns
      if (errorCode === 131026) {
        return NextResponse.json(
          { error: 'Número não está no WhatsApp ou bloqueou a empresa' },
          { status: 400 }
        );
      }

      // Template não encontrado (pode ter sido deletado entre a busca e o envio)
      if (errorCode === 132000 || errorCode === 132001) {
        return NextResponse.json(
          {
            error: `Template "${template.name}" não disponível. Pode ter sido deletado ou está pendente de aprovação.`,
            hint: 'Verifique seus templates no Meta Business Manager.',
            details: data?.error,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: errorMessage, details: data?.error },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      messageId: data?.messages?.[0]?.id,
      to: normalizedPhone,
      templateUsed: template.name,
    });
  } catch (error: any) {
    console.error('Error sending test message:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao enviar mensagem' },
      { status: 500 }
    );
  }
}
