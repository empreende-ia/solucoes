'use client'

import React, { useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Callback when modal should close */
  onClose?: () => void
  /** Modal title (optional - for accessibility) */
  title?: string
  /** Modal content */
  children: React.ReactNode
  /** Max width variant */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  /** Color variant for border accent */
  variant?: 'default' | 'warning' | 'danger' | 'success'
  /** Whether to show close button */
  showCloseButton?: boolean
  /** Whether clicking backdrop closes modal */
  closeOnBackdropClick?: boolean
  /** Whether pressing Escape closes modal */
  closeOnEscape?: boolean
  /** Additional className for the modal container */
  className?: string
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
} as const

const variantClasses = {
  default: 'border-[var(--ds-border-subtle)]',
  warning: 'border-amber-500/20',
  danger: 'border-red-500/20',
  success: 'border-green-500/20',
} as const

/**
 * Base Modal component with backdrop, animations, and keyboard handling.
 * Use this as a wrapper for all modal content.
 *
 * @example
 * <Modal isOpen={isOpen} onClose={handleClose} title="Confirm Action">
 *   <p>Are you sure?</p>
 *   <button onClick={handleConfirm}>Yes</button>
 * </Modal>
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
  variant = 'default',
  showCloseButton = false,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  className = '',
}: ModalProps) {
  // Handle Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape && onClose) {
        onClose()
      }
    },
    [closeOnEscape, onClose]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnBackdropClick && onClose) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        className={`
          bg-[var(--ds-bg-elevated)]/95 border rounded-2xl w-full p-6
          shadow-[0_30px_80px_rgba(0,0,0,0.55)]
          animate-in zoom-in-95 fade-in duration-200
          ${maxWidthClasses[maxWidth]}
          ${variantClasses[variant]}
          ${className}
        `}
      >
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between mb-4">
            {title && (
              <h2 id="modal-title" className="text-xl font-semibold text-[var(--ds-text-primary)]">
                {title}
              </h2>
            )}
            {showCloseButton && onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

/**
 * Modal Header component for consistent styling
 */
export function ModalHeader({
  icon,
  title,
  description,
  iconClassName = '',
}: {
  icon: React.ReactNode
  title: string
  description?: string
  iconClassName?: string
}) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div className={`p-3 rounded-xl ${iconClassName || 'bg-[var(--ds-bg-hover)]'}`}>
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-bold text-[var(--ds-text-primary)]">{title}</h3>
        {description && (
          <p className="text-sm text-[var(--ds-text-secondary)]">{description}</p>
        )}
      </div>
    </div>
  )
}

/**
 * Modal Footer component for action buttons
 */
export function ModalFooter({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex gap-3 mt-6 ${className}`}>
      {children}
    </div>
  )
}

/**
 * Standard Cancel button for modals
 */
export function ModalCancelButton({
  onClick,
  disabled = false,
  children = 'Cancelar',
}: {
  onClick: () => void
  disabled?: boolean
  children?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 px-4 py-3 bg-[var(--ds-bg-surface)]/30 text-[var(--ds-text-secondary)] border border-[var(--ds-border-subtle)] rounded-lg font-medium hover:bg-[var(--ds-bg-hover)] transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  )
}

/**
 * Standard Confirm button for modals (warning/danger style)
 */
export function ModalConfirmButton({
  onClick,
  disabled = false,
  loading = false,
  variant = 'warning',
  icon,
  loadingText,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'warning' | 'danger' | 'primary'
  icon?: React.ReactNode
  loadingText?: string
  children: React.ReactNode
}) {
  const variantStyles = {
    warning: 'bg-amber-500/10 text-amber-200 border-amber-500/30 hover:bg-amber-500/15',
    danger: 'bg-red-500/10 text-red-200 border-red-500/30 hover:bg-red-500/15',
    primary: 'bg-primary-500/10 text-primary-200 border-primary-500/30 hover:bg-primary-500/15',
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex-1 px-4 py-3 border rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${variantStyles[variant]}`}
    >
      {loading ? (
        <>
          <span className="animate-spin">⏳</span>
          {loadingText || 'Processando...'}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  )
}
