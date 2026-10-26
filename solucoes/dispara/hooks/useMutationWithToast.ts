/**
 * Custom hook that wraps useMutation with automatic toast notifications.
 * Reduces boilerplate for the common pattern of mutation + success/error toasts.
 */

import { useMutation, useQueryClient, UseMutationOptions, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export interface UseMutationWithToastOptions<TData, TError, TVariables, TContext> {
  /**
   * The mutation function that performs the async operation.
   */
  mutationFn: (variables: TVariables) => Promise<TData>

  /**
   * Success toast message. If undefined, no toast is shown.
   * Can be a string or a function that receives the data and returns a string.
   */
  successMessage?: string | ((data: TData) => string)

  /**
   * Error toast message. If undefined, uses error.message or a generic message.
   * Can be a string or a function that receives the error and returns a string.
   */
  errorMessage?: string | ((error: TError) => string)

  /**
   * Callback to invalidate queries on success.
   * Receives the QueryClient to perform invalidations.
   */
  onInvalidate?: (queryClient: QueryClient, data: TData) => void

  /**
   * Additional success callback (called after toast and invalidation).
   */
  onSuccess?: (data: TData) => void

  /**
   * Additional error callback (called after toast).
   */
  onError?: (error: TError) => void

  /**
   * Standard TanStack Query mutation options.
   */
  mutationOptions?: Omit<
    UseMutationOptions<TData, TError, TVariables, TContext>,
    'mutationFn' | 'onSuccess' | 'onError'
  >
}

/**
 * Hook that wraps useMutation with automatic toast notifications.
 *
 * @example
 * // Basic usage
 * const deleteMutation = useMutationWithToast({
 *   mutationFn: contactService.delete,
 *   successMessage: 'Contato excluído com sucesso!',
 *   onInvalidate: (qc) => queryInvalidation.contacts(qc),
 * })
 *
 * @example
 * // With dynamic messages
 * const updateMutation = useMutationWithToast({
 *   mutationFn: updateContact,
 *   successMessage: (data) => `Contato ${data.name} atualizado!`,
 *   errorMessage: (error) => `Erro: ${error.message}`,
 *   onInvalidate: (qc, data) => queryInvalidation.contact(qc, data.id),
 * })
 */
export function useMutationWithToast<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>({
  mutationFn,
  successMessage,
  errorMessage,
  onInvalidate,
  onSuccess,
  onError,
  mutationOptions,
}: UseMutationWithToastOptions<TData, TError, TVariables, TContext>) {
  const queryClient = useQueryClient()

  return useMutation<TData, TError, TVariables, TContext>({
    mutationFn,
    ...mutationOptions,

    onSuccess: (data, variables, context) => {
      // Show success toast
      if (successMessage) {
        const message =
          typeof successMessage === 'function'
            ? successMessage(data)
            : successMessage
        toast.success(message)
      }

      // Invalidate queries
      onInvalidate?.(queryClient, data)

      // Call additional success handler
      onSuccess?.(data)
    },

    onError: (error, variables, context) => {
      // Show error toast
      const message =
        errorMessage !== undefined
          ? typeof errorMessage === 'function'
            ? errorMessage(error)
            : errorMessage
          : error instanceof Error
            ? error.message
            : 'Erro ao executar operação'
      toast.error(message)

      // Call additional error handler
      onError?.(error)
    },
  })
}

/**
 * Simplified version for delete operations.
 * Pre-configured with common delete patterns.
 *
 * @example
 * const deleteContact = useDeleteMutation({
 *   mutationFn: contactService.delete,
 *   entityName: 'Contato',
 *   onInvalidate: (qc) => queryInvalidation.contacts(qc),
 * })
 */
export function useDeleteMutation<TData = unknown, TVariables = string>({
  mutationFn,
  entityName,
  onInvalidate,
  onSuccess,
}: {
  mutationFn: (variables: TVariables) => Promise<TData>
  entityName: string
  onInvalidate?: (queryClient: QueryClient, data: TData) => void
  onSuccess?: (data: TData) => void
}) {
  return useMutationWithToast({
    mutationFn,
    successMessage: `${entityName} excluído com sucesso!`,
    errorMessage: `Erro ao excluir ${entityName.toLowerCase()}`,
    onInvalidate,
    onSuccess,
  })
}

/**
 * Simplified version for create operations.
 *
 * @example
 * const createContact = useCreateMutation({
 *   mutationFn: contactService.add,
 *   entityName: 'Contato',
 *   onInvalidate: (qc) => queryInvalidation.contacts(qc),
 * })
 */
export function useCreateMutation<TData = unknown, TVariables = unknown>({
  mutationFn,
  entityName,
  onInvalidate,
  onSuccess,
}: {
  mutationFn: (variables: TVariables) => Promise<TData>
  entityName: string
  onInvalidate?: (queryClient: QueryClient, data: TData) => void
  onSuccess?: (data: TData) => void
}) {
  return useMutationWithToast({
    mutationFn,
    successMessage: `${entityName} criado com sucesso!`,
    errorMessage: `Erro ao criar ${entityName.toLowerCase()}`,
    onInvalidate,
    onSuccess,
  })
}

/**
 * Simplified version for update operations.
 *
 * @example
 * const updateContact = useUpdateMutation({
 *   mutationFn: ({ id, data }) => contactService.update(id, data),
 *   entityName: 'Contato',
 *   onInvalidate: (qc) => queryInvalidation.contacts(qc),
 * })
 */
export function useUpdateMutation<TData = unknown, TVariables = unknown>({
  mutationFn,
  entityName,
  onInvalidate,
  onSuccess,
}: {
  mutationFn: (variables: TVariables) => Promise<TData>
  entityName: string
  onInvalidate?: (queryClient: QueryClient, data: TData) => void
  onSuccess?: (data: TData) => void
}) {
  return useMutationWithToast({
    mutationFn,
    successMessage: `${entityName} atualizado com sucesso!`,
    errorMessage: `Erro ao atualizar ${entityName.toLowerCase()}`,
    onInvalidate,
    onSuccess,
  })
}
