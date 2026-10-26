'use client'

import dynamic from 'next/dynamic'
import 'swagger-ui-react/swagger-ui.css'

// Importar dinamicamente para evitar SSR (Swagger UI usa DOM)
const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false })

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <SwaggerUI url="/openapi.yaml" />
    </div>
  )
}
