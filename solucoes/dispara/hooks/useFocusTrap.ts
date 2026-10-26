'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook para gerenciar focus trap em modais e overlays.
 * 
 * Funcionalidades:
 * - Captura o foco dentro do container quando ativo
 * - Retorna o foco ao elemento anterior quando desativado
 * - Suporte a navegação circular (Tab e Shift+Tab)
 * - Fecha com Escape
 * 
 * @example
 * ```tsx
 * function Modal({ isOpen, onClose, children }) {
 *   const { containerRef, firstFocusableRef } = useFocusTrap(isOpen, onClose);
 *   
 *   if (!isOpen) return null;
 *   
 *   return (
 *     <div ref={containerRef} role="dialog" aria-modal="true">
 *       <button ref={firstFocusableRef} onClick={onClose}>Fechar</button>
 *       {children}
 *     </div>
 *   );
 * }
 * ```
 */
export function useFocusTrap(
  isActive: boolean,
  onClose?: () => void
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Seletores para elementos focáveis
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(focusableSelectors)
    ).filter(el => !el.closest('[hidden]') && el.offsetParent !== null);
  }, [focusableSelectors]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isActive || !containerRef.current) return;

    // Fechar com Escape
    if (event.key === 'Escape' && onClose) {
      event.preventDefault();
      onClose();
      return;
    }

    // Gerenciar Tab navigation
    if (event.key === 'Tab') {
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Shift + Tab no primeiro elemento → vai para o último
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
      // Tab no último elemento → vai para o primeiro
      else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }, [isActive, onClose, getFocusableElements]);

  // Gerenciar foco ao ativar/desativar
  useEffect(() => {
    if (isActive) {
      // Salvar elemento atualmente focado
      previouslyFocusedRef.current = document.activeElement as HTMLElement;

      // Focar no primeiro elemento focável ou no container
      requestAnimationFrame(() => {
        if (firstFocusableRef.current) {
          firstFocusableRef.current.focus();
        } else {
          const focusableElements = getFocusableElements();
          if (focusableElements.length > 0) {
            focusableElements[0].focus();
          } else {
            containerRef.current?.focus();
          }
        }
      });
    } else {
      // Retornar foco ao elemento anterior
      if (previouslyFocusedRef.current && previouslyFocusedRef.current.focus) {
        previouslyFocusedRef.current.focus();
      }
    }
  }, [isActive, getFocusableElements]);

  // Adicionar event listener para keyboard
  useEffect(() => {
    if (isActive) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isActive, handleKeyDown]);

  // Prevenir scroll do body quando modal está aberto
  useEffect(() => {
    if (isActive) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isActive]);

  return {
    containerRef,
    firstFocusableRef,
  };
}

/**
 * Props para componente Modal acessível
 */
export interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  titleId?: string;
  descriptionId?: string;
  children: React.ReactNode;
}

export default useFocusTrap;
