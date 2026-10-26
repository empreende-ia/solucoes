'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { AlertTriangle, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

import type { Contact, CustomFieldDefinition } from '@/types';
import { contactService } from '@/services/contactService';
import { customFieldService } from '@/services/customFieldService';
import type { ContactFixFocus, ContactFixTarget } from '@/lib/precheck-humanizer';

type ContactsCache = { list: Contact[]; byId: Record<string, Contact> };

type ContactUpdatePayload = Partial<Omit<Contact, 'id' | 'email'>> & {
  email?: string | null;
};

const normalizeEmailForUpdate = (email: string) => {
  const trimmed = (email ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

const sanitizeCustomFieldsForUpdate = (fields?: Record<string, any>) => {
  if (!fields) return fields;
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    out[key] = value;
  }
  return out;
};

const getContactDisplayName = (contact?: Contact | null) => {
  if (!contact) return '';
  const name = (contact.name ?? '').trim();
  if (name) return name;

  // Alguns imports/fluxos podem guardar o nome em custom_fields.
  const cf = (contact.custom_fields && typeof contact.custom_fields === 'object') ? contact.custom_fields : {};
  const candidates = ['nome', 'name', 'full_name', 'fullName', 'first_name', 'firstName'];
  for (const key of candidates) {
    const raw = (cf as any)?.[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }

  return '';
};

type ContactsQueryData =
  | ContactsCache
  | Contact[]
  | { data: Contact[]; total: number; limit?: number; offset?: number }
  | undefined;

const isContactsCache = (value: any): value is ContactsCache => {
  return !!value && typeof value === 'object' && Array.isArray(value.list) && value.byId && typeof value.byId === 'object';
};

const patchContactsQueryData = (current: ContactsQueryData, id: string, data: ContactUpdatePayload): ContactsQueryData => {
  if (!current) return current;

  // Alguns lugares (ex: wizard) usam ['contacts'] como Contact[] puro.
  if (Array.isArray(current)) {
    return current.map((c) => (c.id === id ? ({ ...c, ...data, updatedAt: new Date().toISOString() } as Contact) : c));
  }

  // Outros lugares usam o shape normalizado { list, byId }.
  if (isContactsCache(current)) {
    const existing = current.byId[id];
    if (!existing) return current;
    const patched: Contact = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    const nextList = current.list.map((c) => (c.id === id ? patched : c));
    return { list: nextList, byId: { ...current.byId, [id]: patched } };
  }

  // Páginas paginadas { data, total }
  if (typeof current === 'object' && Array.isArray((current as any).data)) {
    const page = current as { data: Contact[]; total: number; limit?: number; offset?: number };
    const nextData = page.data.map((c) =>
      c.id === id ? ({ ...c, ...data, updatedAt: new Date().toISOString() } as Contact) : c
    );
    return { ...page, data: nextData };
  }

  return current;
};

interface ContactQuickEditModalProps {
  isOpen: boolean;
  contactId: string | null;
  onClose: () => void;
  focus?: ContactFixFocus;
  title?: string;
  onSaved?: () => void;
  mode?: 'full' | 'focused';
  // Quando true, o modo focused mostra também o campo Nome (útil para contexto/ajustes extras).
  // Quando false, o modo focused mostra APENAS os campos necessários para destravar.
  showNameInFocusedMode?: boolean;

  // Quando true, e o contato estiver sem nome, o modo focused também mostra o campo Nome.
  // Por padrão fica false para manter o modal estritamente “pre-check-driven”.
  showNameWhenMissingInFocusedMode?: boolean;
}

export const ContactQuickEditModal: React.FC<ContactQuickEditModalProps> = ({
  isOpen,
  contactId,
  onClose,
  focus = null,
  title = 'Editar contato',
  onSaved,
  mode = 'full',
  showNameInFocusedMode = true,
  showNameWhenMissingInFocusedMode = false,
}) => {
  const queryClient = useQueryClient();
  const nameRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const customRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const contactQuery = useQuery({
    queryKey: ['contact', contactId],
    enabled: isOpen && !!contactId,
    queryFn: async () => {
      const c = await contactService.getById(contactId!);
      if (!c) throw new Error('Contato não encontrado');
      return c;
    },
  });

  const customFieldsQuery = useQuery({
    queryKey: ['customFields'],
    enabled: isOpen,
    queryFn: () => customFieldService.getAll('contact'),
  });

  const customFields = (customFieldsQuery.data || []) as CustomFieldDefinition[];

  const focusTargets = useMemo<ContactFixTarget[]>(() => {
    if (!focus) return [];
    if ((focus as any).type === 'multi') {
      return Array.isArray((focus as any).targets) ? ((focus as any).targets as ContactFixTarget[]) : [];
    }
    return [focus as ContactFixTarget];
  }, [focus]);

  // Quando em modo "focused" e temos um foco explícito,
  // por padrão mostramos Nome + o campo que precisa de correção.
  // (pode ser desativado para um UX mais “cirúrgico”).
  const isFocusedMode = mode === 'focused' && focusTargets.length > 0;
  const isNameMissing = useMemo(() => {
    if (!isFocusedMode) return false;
    const c = contactQuery.data;
    const displayName = getContactDisplayName(c);
    return !String(displayName || '').trim();
  }, [contactQuery.data, isFocusedMode]);

  const shouldShowName =
    !isFocusedMode ||
    showNameInFocusedMode ||
    focusTargets.some((t) => t.type === 'name') ||
    (showNameWhenMissingInFocusedMode && isNameMissing);
  const shouldShowEmail = !isFocusedMode || focusTargets.some((t) => t.type === 'email');
  const focusedCustomFieldKeys = useMemo(() => {
    const keys = focusTargets.filter((t) => t.type === 'custom_field').map((t) => (t as any).key as string);
    return Array.from(new Set(keys)).filter(Boolean);
  }, [focusTargets]);
  const shouldShowFocusedCustomFields = isFocusedMode && focusedCustomFieldKeys.length > 0;
  const shouldShowAllCustomFields = !isFocusedMode;

  const [form, setForm] = useState<{ name: string; email: string; custom_fields: Record<string, any> }>({
    name: '',
    email: '',
    custom_fields: {},
  });

  useEffect(() => {
    if (!isOpen) return;
    const c = contactQuery.data;
    if (!c) return;

    setForm({
      name: c.name || '',
      email: c.email || '',
      custom_fields: (c.custom_fields || {}) as Record<string, any>,
    });
  }, [isOpen, contactQuery.data]);

  const focusLabel = useMemo(() => {
    if (focusTargets.length === 0) return null;
    const labels = focusTargets.map((t) => {
      if (t.type === 'name') return 'Nome';
      if (t.type === 'email') return 'Email';
      const key = (t as any).key as string;
      const field = customFields.find((f) => f.key === key);
      return field?.label || key;
    });
    const uniq = Array.from(new Set(labels)).filter(Boolean);
    if (uniq.length === 1) return uniq[0];
    return uniq.join(', ');
  }, [focusTargets, customFields]);

  useEffect(() => {
    if (!isOpen) return;
    // Pequeno delay para garantir que o input montou
    const t = setTimeout(() => {
      const first = focusTargets[0];
      if (!first) return;

      if (first.type === 'name') {
        nameRef.current?.focus();
        nameRef.current?.select();
        return;
      }

      if (first.type === 'email') {
        emailRef.current?.focus();
        emailRef.current?.select();
        return;
      }

      const key = (first as any).key as string;
      if (!key) return;
      const el = customRefs.current[key];
      el?.focus();
      el?.select?.();
    }, 50);
    return () => clearTimeout(t);
  }, [isOpen, focusTargets]);

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; data: ContactUpdatePayload }) => {
      const updated = await contactService.update(payload.id, payload.data);
      if (!updated) throw new Error('Falha ao atualizar contato');
      return updated;
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['contacts'] });
      if (contactId) await queryClient.cancelQueries({ queryKey: ['contact', contactId] });

      const previousContacts = queryClient.getQueriesData<ContactsQueryData>({ queryKey: ['contacts'] });
      const previousContact = contactId
        ? queryClient.getQueryData<Contact>(['contact', contactId])
        : undefined;

      // Patch lista/cache principal (suporta Contact[] e { list, byId })
      queryClient.setQueriesData<ContactsQueryData>(
        { queryKey: ['contacts'] },
        (current) => patchContactsQueryData(current, id, data)
      );

      // Patch cache de detalhe
      if (contactId) {
        queryClient.setQueryData<Contact>(['contact', contactId], (current) => {
          if (!current) return current;
          return { ...current, ...data, updatedAt: new Date().toISOString() };
        });
      }

      return { previousContacts, previousContact };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      if (contactId) queryClient.invalidateQueries({ queryKey: ['contact', contactId] });
      toast.success('Contato atualizado');
      onSaved?.();
      onClose();
    },
    onError: (e: any, _vars, context) => {
      if (context?.previousContacts) {
        context.previousContacts.forEach(([key, data]) => {
          queryClient.setQueryData(key as QueryKey, data);
        });
      }
      if (contactId && context?.previousContact) queryClient.setQueryData(['contact', contactId], context.previousContact);
      toast.error(e?.message || 'Falha ao atualizar contato');
    },
  });

  if (!isOpen) return null;

  const isLoading = contactQuery.isLoading;
  const isError = contactQuery.isError;
  const errorMessage = (contactQuery.error as any)?.message as string | undefined;

  const contactHeaderText = useMemo(() => {
    const c = contactQuery.data;
    if (!c) return null;
    const parts: string[] = [];
    const name = getContactDisplayName(c);
    const phone = (c.phone ?? '').trim();
    const email = (c.email ?? '').trim();
    parts.push(name || 'Sem nome');
    if (phone) parts.push(phone);
    if (email) parts.push(email);
    if (parts.length === 0) return 'Contato';
    return parts.join(' • ');
  }, [contactQuery.data]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-60 flex items-center justify-center p-4">
      <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-[var(--ds-text-primary)]">{title}</h2>

            {!!contactId && (
              <p className="text-xs text-[var(--ds-text-secondary)] mt-1">
                <span className="text-[var(--ds-text-muted)]">Contato:</span>{' '}
                {contactQuery.isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-3 w-36 rounded bg-[var(--ds-bg-hover)] animate-pulse" />
                  </span>
                ) : contactHeaderText ? (
                  <span className="text-[var(--ds-text-primary)] font-medium">{contactHeaderText}</span>
                ) : (
                  <span className="text-[var(--ds-text-muted)]">—</span>
                )}
              </p>
            )}

            {focusLabel && (
              <p className="text-xs text-[var(--ds-text-muted)] mt-1">
                Dica: complete <span className="text-[var(--ds-text-primary)]">{focusLabel}</span> para destravar o envio.
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1 rounded-lg hover:bg-[var(--ds-bg-hover)]">
            <X className="text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)]" />
          </button>
        </div>

        {!contactId ? (
          <div className="flex flex-col items-center justify-center py-10 text-[var(--ds-text-secondary)] text-center">
            <AlertTriangle className="w-5 h-5 text-amber-400 mb-2" />
            <p className="text-sm text-[var(--ds-text-primary)] font-medium">Contato inválido</p>
            <p className="text-xs text-[var(--ds-text-muted)] mt-1">Não foi possível abrir este contato. Feche e tente novamente.</p>
            <div className="mt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-10 text-[var(--ds-text-secondary)]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Carregando contato...
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-10 text-[var(--ds-text-secondary)] text-center">
            <AlertTriangle className="w-5 h-5 text-amber-400 mb-2" />
            <p className="text-sm text-[var(--ds-text-primary)] font-medium">Não foi possível carregar o contato</p>
            <p className="text-xs text-[var(--ds-text-muted)] mt-1">
              {errorMessage || 'O contato pode ter sido removido ou você não tem permissão para acessá-lo.'}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => contactQuery.refetch()}
                className="px-4 py-2 rounded-lg bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors inline-flex items-center gap-2"
              >
                <RefreshCw size={14} /> Tentar novamente
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {shouldShowName && (
              <div>
                <label className="block text-sm text-[var(--ds-text-secondary)] mb-1">Nome</label>
                {isFocusedMode && showNameWhenMissingInFocusedMode && isNameMissing && (
                  <p className="text-xs text-[var(--ds-text-muted)] mb-2">Este contato está sem nome cadastrado. Vale a pena preencher.</p>
                )}
                <input
                  ref={nameRef}
                  className="w-full bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg px-4 py-3 text-[var(--ds-text-primary)] focus:border-primary-500 outline-none transition-colors"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: João Silva"
                />
              </div>
            )}

            {shouldShowEmail && (
              <div>
                <label className="block text-sm text-[var(--ds-text-secondary)] mb-1">Email</label>
                <input
                  ref={emailRef}
                  type="email"
                  className="w-full bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg px-4 py-3 text-[var(--ds-text-primary)] focus:border-primary-500 outline-none transition-colors"
                  value={form.email}
                  onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="email@exemplo.com"
                />
              </div>
            )}

            {shouldShowFocusedCustomFields && (
              <div className="space-y-3">
                {focusedCustomFieldKeys.map((key) => {
                  const field = customFields.find((f) => f.key === key);
                  const label = field?.label || key;
                  const type = field?.type;

                  // Se for select, usa select. Caso contrário, input.
                  if (type === 'select' && field?.options && field.options.length > 0) {
                    return (
                      <div key={key}>
                        <label className="block text-sm text-[var(--ds-text-secondary)] mb-1">{label}</label>
                        <select
                          className="w-full bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg px-4 py-3 text-[var(--ds-text-primary)] focus:border-primary-500 outline-none transition-colors"
                          value={String(form.custom_fields?.[key] ?? '')}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              custom_fields: { ...(prev.custom_fields || {}), [key]: e.target.value },
                            }))
                          }
                        >
                          <option value="">Selecionar...</option>
                          {field.options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  return (
                    <div key={key}>
                      <label className="block text-sm text-[var(--ds-text-secondary)] mb-1">{label}</label>
                      <input
                        ref={(el) => { customRefs.current[key] = el; }}
                        type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
                        className="w-full bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg px-4 py-3 text-[var(--ds-text-primary)] focus:border-primary-500 outline-none transition-colors"
                        value={String(form.custom_fields?.[key] ?? '')}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            custom_fields: { ...(prev.custom_fields || {}), [key]: e.target.value },
                          }))
                        }
                        placeholder={type === 'date' ? '' : `Digite ${label}...`}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {shouldShowAllCustomFields && (
              <details className="pt-2 border-t border-[var(--ds-border-subtle)]">
                <summary className="cursor-pointer text-sm text-[var(--ds-text-secondary)]">Campos personalizados</summary>
                <div className="mt-3 space-y-3">
                  {customFields.length === 0 ? (
                    <p className="text-xs text-[var(--ds-text-muted)]">Nenhum campo personalizado cadastrado.</p>
                  ) : (
                    customFields.map(field => (
                      <div key={field.id}>
                        <label className="block text-xs text-[var(--ds-text-muted)] mb-1">{field.label}</label>
                        {field.type === 'select' && field.options && field.options.length > 0 ? (
                          <select
                            className="w-full bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg px-4 py-2.5 text-[var(--ds-text-primary)] focus:border-primary-500 outline-none transition-colors"
                            value={String(form.custom_fields?.[field.key] ?? '')}
                            onChange={(e) =>
                              setForm(prev => ({
                                ...prev,
                                custom_fields: { ...(prev.custom_fields || {}), [field.key]: e.target.value },
                              }))
                            }
                          >
                            <option value="">Selecionar...</option>
                            {field.options.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                            className="w-full bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg px-4 py-2.5 text-[var(--ds-text-primary)] focus:border-primary-500 outline-none transition-colors"
                            value={String(form.custom_fields?.[field.key] ?? '')}
                            onChange={(e) =>
                              setForm(prev => ({
                                ...prev,
                                custom_fields: { ...(prev.custom_fields || {}), [field.key]: e.target.value },
                              }))
                            }
                            placeholder={field.type === 'date' ? '' : `Digite ${field.label}...`}
                          />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </details>
            )}

            <div className="pt-4 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 bg-[var(--ds-bg-surface)] text-[var(--ds-text-primary)] font-medium py-3 rounded-xl hover:bg-[var(--ds-bg-hover)] transition-colors"
                disabled={updateMutation.isPending}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!contactId) return;
                  const sanitizedCustomFields = sanitizeCustomFieldsForUpdate(form.custom_fields);
                  updateMutation.mutate({
                    id: contactId,
                    data: {
                      name: form.name || undefined,
                      // Para “apagar” email, precisamos enviar null (undefined não altera no banco)
                      email: normalizeEmailForUpdate(form.email),
                      custom_fields: sanitizedCustomFields,
                    },
                  });
                }}
                className="flex-1 bg-primary-500 text-white font-bold py-3 rounded-xl hover:bg-primary-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
