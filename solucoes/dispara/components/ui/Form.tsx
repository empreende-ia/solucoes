/**
 * Componentes de Form com React Hook Form + Zod
 * 
 * Características:
 * - Validação em tempo real (onBlur)
 * - Acessibilidade (ARIA)
 * - Estilização consistente com o design system
 */
'use client';

import React, { forwardRef, useId } from 'react';
import { 
  useForm, 
  UseFormReturn, 
  FieldValues, 
  FieldPath,
  ControllerRenderProps,
  ControllerFieldState,
  UseFormStateReturn,
  Controller,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Check, Loader2 } from 'lucide-react';

// ============================================
// TYPES
// ============================================

export interface FormFieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  options: { value: string; label: string }[];
}

// ============================================
// FORM FIELD WRAPPER
// ============================================

/**
 * Wrapper para campos de formulário com label, erro e hint
 * 
 * @example
 * <FormField label="Nome" error={errors.name?.message} required>
 *   <Input {...register('name')} />
 * </FormField>
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  hint,
  required,
  className = '',
  children,
}) => {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label 
          htmlFor={id}
          className="block text-xs font-bold text-[var(--ds-text-muted)] uppercase tracking-wider ml-1"
        >
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      
      {/* Clone children to inject id and aria attributes */}
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<{ 
            id?: string; 
            'aria-describedby'?: string; 
            'aria-invalid'?: boolean;
          }>, {
            id,
            'aria-describedby': error ? errorId : hint ? hintId : undefined,
            'aria-invalid': !!error,
          });
        }
        return child;
      })}
      
      {/* Error message */}
      {error && (
        <div 
          id={errorId}
          role="alert"
          className="flex items-center gap-1.5 text-red-400 text-xs mt-1 animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <AlertCircle size={12} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      
      {/* Hint text */}
      {!error && hint && (
        <p id={hintId} className="text-xs text-[var(--ds-text-muted)] mt-1 ml-1">
          {hint}
        </p>
      )}
    </div>
  );
};

// ============================================
// INPUT COMPONENT
// ============================================

/**
 * Input estilizado com suporte a erros
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`
          w-full px-4 py-3 
          bg-[var(--ds-bg-elevated)] border rounded-xl 
          text-[var(--ds-text-primary)] placeholder-[var(--ds-text-muted)]
          outline-none transition-all duration-200
          focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error 
            ? 'border-red-500/50 focus:ring-red-500/50 focus:border-red-500/50' 
            : 'border-[var(--ds-border-subtle)] hover:border-[var(--ds-border-default)]'
          }
          ${className}
        `}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

// ============================================
// TEXTAREA COMPONENT
// ============================================

/**
 * Textarea estilizado com suporte a erros
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`
          w-full px-4 py-3 
          bg-[var(--ds-bg-elevated)] border rounded-xl 
          text-[var(--ds-text-primary)] placeholder-[var(--ds-text-muted)]
          outline-none transition-all duration-200 resize-none
          focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error 
            ? 'border-red-500/50 focus:ring-red-500/50 focus:border-red-500/50' 
            : 'border-[var(--ds-border-subtle)] hover:border-[var(--ds-border-default)]'
          }
          ${className}
        `}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

// ============================================
// SELECT COMPONENT
// ============================================

/**
 * Select estilizado com suporte a erros
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, options, className = '', ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`
          w-full px-4 py-3 
          bg-[var(--ds-bg-elevated)] border rounded-xl 
          text-[var(--ds-text-primary)]
          outline-none transition-all duration-200
          focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error 
            ? 'border-red-500/50 focus:ring-red-500/50 focus:border-red-500/50' 
            : 'border-[var(--ds-border-subtle)] hover:border-[var(--ds-border-default)]'
          }
          ${className}
        `}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
);
Select.displayName = 'Select';

// ============================================
// CHECKBOX COMPONENT
// ============================================

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, className = '', ...props }, ref) => {
    const id = useId();
    
    return (
      <label 
        htmlFor={id}
        className={`
          flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all
          ${props.checked 
            ? 'bg-primary-500/10 border border-primary-500/30' 
            : 'bg-[var(--ds-bg-surface)] border border-transparent hover:bg-[var(--ds-bg-hover)]'
          }
          ${props.disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${className}
        `}
      >
        <input
          ref={ref}
          id={id}
          type="checkbox"
          className="w-4 h-4 text-primary-600 bg-slate-700 border-slate-600 rounded focus:ring-primary-500"
          {...props}
        />
        <span className="text-sm text-[var(--ds-text-primary)]">{label}</span>
        {props.checked && (
          <Check size={16} className="text-primary-400 ml-auto" />
        )}
      </label>
    );
  }
);
Checkbox.displayName = 'Checkbox';

// ============================================
// SUBMIT BUTTON
// ============================================

interface SubmitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

export const SubmitButton: React.FC<SubmitButtonProps> = ({
  children,
  isLoading,
  loadingText = 'Processando...',
  variant = 'primary',
  className = '',
  disabled,
  ...props
}) => {
  const variants = {
    primary: 'bg-primary-600 hover:bg-primary-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]',
    secondary: 'bg-white hover:bg-slate-200 text-black',
    danger: 'bg-red-600 hover:bg-red-500 text-white',
  };

  return (
    <button
      type="submit"
      disabled={disabled || isLoading}
      className={`
        px-6 py-3 rounded-xl font-bold transition-all duration-200
        flex items-center justify-center gap-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
        ${className}
      `}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 size={18} className="animate-spin" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  );
};

// ============================================
// FORM HOOK FACTORY
// ============================================

/**
 * Cria um hook de form tipado com validação Zod
 * 
 * @example
 * const schema = z.object({ name: z.string().min(3) });
 * const form = useTypedForm(schema, { defaultValues: { name: '' } });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useTypedForm<T extends FieldValues>(
  schema: z.ZodType<T, any, any>,
  options?: Omit<Parameters<typeof useForm<T>>[0], 'resolver'>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<T>({
    resolver: zodResolver(schema) as any,
    mode: 'onBlur', // Validate on blur for better UX
    reValidateMode: 'onChange', // Re-validate on change after first error
    ...options,
  });

  return form;
}

// ============================================
// FORM CONTEXT (for complex forms)
// ============================================

interface FormContextValue<T extends FieldValues = FieldValues> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<T, any, any>;
}

const FormContext = React.createContext<FormContextValue | null>(null);

export function useFormContext<T extends FieldValues>() {
  const context = React.useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext must be used within a FormProvider');
  }
  return context as FormContextValue<T>;
}

interface FormProviderProps<T extends FieldValues> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<T, any, any>;
  children: React.ReactNode;
  onSubmit: (data: T) => void | Promise<void>;
  className?: string;
}

export function FormProvider<T extends FieldValues>({
  form,
  children,
  onSubmit,
  className = '',
}: FormProviderProps<T>) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <FormContext.Provider value={{ form: form as any }}>
      <form 
        onSubmit={form.handleSubmit(onSubmit)} 
        className={className}
        noValidate // Disable browser validation, use Zod
      >
        {children}
      </form>
    </FormContext.Provider>
  );
}

// ============================================
// CONTROLLED FIELD COMPONENT
// ============================================

interface ControlledFieldProps<T extends FieldValues, K extends FieldPath<T>> {
  name: K;
  control: UseFormReturn<T>['control'];
  render: (props: {
    field: ControllerRenderProps<T, K>;
    fieldState: ControllerFieldState;
    formState: UseFormStateReturn<T>;
  }) => React.ReactElement;
}

export function ControlledField<T extends FieldValues, K extends FieldPath<T>>({
  name,
  control,
  render,
}: ControlledFieldProps<T, K>) {
  return (
    <Controller
      name={name}
      control={control}
      render={render}
    />
  );
}
