/**
 * useContactForm - Controller Hook para formulário de contato
 * 
 * Segue o padrão View + Controller:
 * - Este hook contém toda a lógica de validação e submissão
 * - A View apenas renderiza e emite eventos
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTypedForm } from '@/components/ui/Form';
import { contactFormSchema, ContactForm } from '@/lib/validation/schemas';
import { contactService } from '@/services/contactService';

interface UseContactFormOptions {
  /** ID do contato para edição (undefined = novo contato) */
  contactId?: string;
  /** Callback após sucesso */
  onSuccess?: () => void;
  /** Valores iniciais */
  defaultValues?: Partial<ContactForm>;
}

export const useContactFormController = (options: UseContactFormOptions = {}) => {
  const { contactId, onSuccess, defaultValues } = options;
  const queryClient = useQueryClient();
  const isEditing = !!contactId;

  // Form com validação Zod
  const form = useTypedForm(contactFormSchema, {
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      tags: [],
      ...defaultValues,
    },
  });

  // Mutation para atualizar (create ainda não implementado no service)
  const mutation = useMutation({
    mutationFn: async (data: ContactForm) => {
      if (!isEditing) {
        throw new Error('Criação de contato não implementada. Use importação CSV.');
      }
      return contactService.update(contactId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success(isEditing ? 'Contato atualizado!' : 'Contato criado!');
      form.reset();
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  // Handler de submit
  const handleSubmit = (data: ContactForm) => {
    mutation.mutate(data);
  };

  return {
    form,
    handleSubmit,
    isSubmitting: mutation.isPending,
    isEditing,
  };
};

export default useContactFormController;
