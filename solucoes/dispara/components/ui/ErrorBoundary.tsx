'use client'

/**
 * Error Boundary Component
 * 
 * Captura erros em componentes filhos e exibe uma UI de fallback
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  /**
   * Cria um Error Boundary para capturar exceções em tempo de renderização dos filhos.
   *
   * @param props Propriedades do componente (children, fallback opcional e callback `onError`).
   */
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  /**
   * Atualiza o estado quando um erro acontece em algum componente descendente.
   *
   * @param error Erro lançado durante renderização/commit.
   * @returns Um parcial do estado, marcando `hasError` e guardando o erro.
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  /**
   * Hook do React chamado após capturar um erro em um componente filho.
   *
   * @param error Erro capturado.
   * @param errorInfo Informações adicionais (component stack).
   * @returns Nada.
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    this.props.onError?.(error, errorInfo)
    
    // Log para monitoramento
    console.error('ErrorBoundary caught an error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })
  }

  /**
   * Reseta o estado do boundary e tenta renderizar novamente os filhos.
   *
   * @returns Nada.
   */
  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  /**
   * Recarrega a página atual.
   *
   * @returns Nada.
   */
  handleReload = (): void => {
    window.location.reload()
  }

  /**
   * Redireciona para a home (`/`).
   *
   * @returns Nada.
   */
  handleGoHome = (): void => {
    window.location.href = '/'
  }

  /**
   * Renderiza os filhos normalmente ou a UI de fallback quando `hasError`.
   *
   * @returns Elemento React com children ou fallback.
   */
  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-100 flex items-center justify-center p-8">
          <div className="max-w-md w-full text-center">
            {/* Icon */}
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            
            {/* Title */}
            <h2 className="text-xl font-semibold text-[var(--ds-text-primary)] mb-2">
              Algo deu errado
            </h2>
            <p className="text-[var(--ds-text-secondary)] mb-6">
              Ocorreu um erro inesperado. Tente recarregar a página ou voltar ao início.
            </p>
            
            {/* Actions */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] rounded-lg hover:bg-[var(--ds-bg-hover)] transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Tentar novamente
              </button>
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] rounded-lg hover:bg-[var(--ds-bg-hover)] transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Recarregar
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
              >
                <Home className="w-4 h-4" />
                Início
              </button>
            </div>
            
            {/* Error details (development only) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-8 text-left">
                <summary className="text-sm text-[var(--ds-text-muted)] cursor-pointer hover:text-[var(--ds-text-secondary)] flex items-center gap-2">
                  <Bug className="w-4 h-4" />
                  Detalhes do erro (dev only)
                </summary>
                <div className="mt-4 p-4 bg-[var(--ds-bg-surface)] rounded-lg overflow-auto">
                  <p className="text-sm font-mono text-red-400 mb-2">
                    {this.state.error.message}
                  </p>
                  {this.state.error.stack && (
                    <pre className="text-xs text-[var(--ds-text-muted)] whitespace-pre-wrap">
                      {this.state.error.stack}
                    </pre>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <pre className="text-xs text-[var(--ds-text-muted)] whitespace-pre-wrap mt-4 pt-4 border-t border-[var(--ds-border-default)]">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Error Boundary de alto nível para envolver páginas inteiras.
 *
 * Útil para evitar que uma exceção em qualquer componente da página derrube
 * toda a navegação; permite também plugar monitoramento (ex.: Sentry).
 *
 * @param props Propriedades do componente.
 * @param props.children Conteúdo da página.
 * @returns Componente {@link ErrorBoundary} envolvendo `children`.
 */
export function PageErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Aqui poderia enviar para serviço de monitoramento como Sentry
        console.error('Page error:', error, errorInfo)
      }}
    >
      {children}
    </ErrorBoundary>
  )
}

export default ErrorBoundary
