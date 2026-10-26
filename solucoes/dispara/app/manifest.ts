/**
 * PWA Manifest dinâmico (whitelabel)
 *
 * Servido em /manifest.webmanifest — name/short_name e theme_color vêm da
 * configuração de marca do deploy (settings: brand_name / brand_primary_color).
 */

import type { MetadataRoute } from 'next'
import { getBrandConfig } from '@/lib/branding'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await getBrandConfig()

  return {
    name: brand.name,
    short_name: brand.name,
    description: 'Disparos, automação e atendimento com IA no WhatsApp API Oficial',
    start_url: '/atendimento',
    scope: '/atendimento',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#030712',
    theme_color: brand.primaryColor,
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    categories: ['business', 'productivity'],
    lang: 'pt-BR',
    dir: 'ltr',
    prefer_related_applications: false,
    shortcuts: [
      {
        name: 'Conversas Urgentes',
        short_name: 'Urgentes',
        description: 'Ver conversas que precisam de atenção',
        url: '/atendimento?filter=urgent',
        icons: [{ src: '/icons/shortcut-urgent.png', sizes: '96x96' }],
      },
    ],
  }
}
