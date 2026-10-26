import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { ThemedToaster } from '@/components/ui/themed-toaster'
import { getBrandConfig, buildBrandCssOverrides, DEFAULT_BRAND } from '@/lib/branding'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
})

export const viewport: Viewport = {
  // Dark-only: mesma cor nos dois esquemas (brand bg-base)
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#030712' },
    { media: '(prefers-color-scheme: dark)', color: '#030712' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandConfig()

  return {
    title: `${brand.name} — Disparos e Automação no WhatsApp API Oficial`,
    description: 'Campanhas, automações e atendimento com IA no WhatsApp API Oficial (Meta Cloud API).',
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      ],
      shortcut: '/icons/icon-192.png',
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: brand.name,
    },
    formatDetection: {
      telephone: false,
    },
    other: {
      'mobile-web-app-capable': 'yes',
    },
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Whitelabel: cor primária custom sobrescreve os tokens emerald via CSS vars
  const brand = await getBrandConfig()
  const hasCustomColor =
    brand.primaryColor.toLowerCase() !== DEFAULT_BRAND.primaryColor.toLowerCase()

  return (
    // Classe de tema (dark|light) é gerenciada pelo next-themes (Providers);
    // dark é o default. suppressHydrationWarning cobre a troca no client.
    <html lang="pt-BR" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        {hasCustomColor && (
          <style
            id="brand-overrides"
            dangerouslySetInnerHTML={{ __html: buildBrandCssOverrides(brand.primaryColor) }}
          />
        )}
        <Providers>
          <ThemedToaster />
          {children}
        </Providers>
      </body>
    </html>
  )
}
