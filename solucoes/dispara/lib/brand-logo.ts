/**
 * Utilidades para o logo do whitelabel (upload por arquivo → data URI).
 *
 * O install wizard roda ANTES do Supabase existir e o produto é "só Supabase +
 * Vercel" — não há storage de blobs disponível no onboarding. Por isso o upload
 * converte a imagem para um data URI (base64) e grava na MESMA string
 * `brand_logo_url` (tabela settings). Data URI funciona em <img src> em todos os
 * pontos de render (sidebar, login, preview) e a validação Zod `.url()` do
 * provision aceita o esquema `data:`.
 */

/** Teto de tamanho do arquivo (o valor vai para a tabela settings, não para env var). */
export const LOGO_MAX_BYTES = 512 * 1024; // 512 KB

/** Tipos de imagem aceitos. */
export const LOGO_ACCEPT = 'image/png,image/svg+xml,image/webp,image/jpeg,image/gif';

const ALLOWED_TYPES = [
  'image/png',
  'image/svg+xml',
  'image/webp',
  'image/jpeg',
  'image/gif',
];

/** Texto de orientação (formato + proporção ideal) exibido sob o campo. */
export const LOGO_GUIDANCE =
  'PNG, SVG ou WebP · fundo transparente · proporção ~3:1 (horizontal) ou 1:1 · até 512 KB';

export interface LogoReadResult {
  dataUri?: string;
  error?: string;
}

function formatKb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * Lê um arquivo de imagem e retorna um data URI (base64), validando tipo e tamanho.
 * Só deve ser chamado no client (usa FileReader).
 */
export async function readLogoFileAsDataUri(file: File): Promise<LogoReadResult> {
  if (!file.type.startsWith('image/') || !ALLOWED_TYPES.includes(file.type)) {
    return { error: 'Formato inválido. Use PNG, SVG, WebP, JPG ou GIF.' };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { error: `Arquivo muito grande (${formatKb(file.size)}). Máximo ${formatKb(LOGO_MAX_BYTES)}.` };
  }

  return new Promise<LogoReadResult>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result.startsWith('data:')) {
        resolve({ dataUri: result });
      } else {
        resolve({ error: 'Falha ao processar a imagem.' });
      }
    };
    reader.onerror = () => resolve({ error: 'Falha ao ler o arquivo.' });
    reader.readAsDataURL(file);
  });
}

/** Rótulo curto para exibir a origem do valor atual (upload vs URL). */
export function describeLogoValue(value: string | undefined): string {
  if (!value) return '';
  return value.startsWith('data:') ? 'Imagem enviada' : value;
}
