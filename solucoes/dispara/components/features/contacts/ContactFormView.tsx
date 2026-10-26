/**
 * ContactFormView - Exemplo de View com React Hook Form + Zod
 * 
 * Demonstra:
 * - Validação em tempo real (onBlur)
 * - Mensagens de erro acessíveis (ARIA)
 * - Componentes de form reutilizáveis
 */
'use client';

import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { User, Phone, Mail, Tag, X } from 'lucide-react';
import { 
  FormField, 
  Input, 
  SubmitButton,
  FormProvider,
} from '@/components/ui/Form';
import { ContactForm } from '@/lib/validation/schemas';

interface ContactFormViewProps {
  form: UseFormReturn<ContactForm>;
  onSubmit: (data: ContactForm) => void;
  isSubmitting?: boolean;
  onCancel?: () => void;
  submitLabel?: string;
}

export const ContactFormView: React.FC<ContactFormViewProps> = ({
  form,
  onSubmit,
  isSubmitting = false,
  onCancel,
  submitLabel = 'Salvar Contato',
}) => {
  const { register, formState: { errors } } = form;

  return (
    <FormProvider form={form} onSubmit={onSubmit} className="space-y-6">
      {/* Nome */}
      <FormField 
        label="Nome" 
        error={errors.name?.message}
        hint="Nome do contato (opcional)"
      >
        <div className="relative">
          <User 
            size={18} 
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)]" 
          />
          <Input
            {...register('name')}
            placeholder="João Silva"
            error={!!errors.name}
            className="pl-11"
          />
        </div>
      </FormField>

      {/* Telefone */}
      <FormField 
        label="Telefone" 
        error={errors.phone?.message}
        required
        hint="Formato: +5511999999999"
      >
        <div className="relative">
          <Phone 
            size={18} 
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)]" 
          />
          <Input
            {...register('phone')}
            placeholder="+5511999999999"
            error={!!errors.phone}
            className="pl-11"
            type="tel"
          />
        </div>
      </FormField>

      {/* Email */}
      <FormField 
        label="Email" 
        error={errors.email?.message}
        hint="Email do contato (opcional)"
      >
        <div className="relative">
          <Mail 
            size={18} 
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)]" 
          />
          <Input
            {...register('email')}
            placeholder="joao@email.com"
            error={!!errors.email}
            className="pl-11"
            type="email"
          />
        </div>
      </FormField>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--ds-border-subtle)]">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] transition-colors"
          >
            Cancelar
          </button>
        )}
        <SubmitButton 
          isLoading={isSubmitting}
          loadingText="Salvando..."
        >
          {submitLabel}
        </SubmitButton>
      </div>
    </FormProvider>
  );
};

export default ContactFormView;
