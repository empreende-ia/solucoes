/**
 * Contact List Service (smart lists estilo GHL)
 * Uma lista salva é um conjunto de filtros nomeado — os membros são dinâmicos:
 * quem casa com os filtros no momento da consulta faz parte da lista.
 */

export interface ContactListFilters {
  tags?: string[];
  tagMatch?: 'any' | 'all';
  status?: string;
  search?: string;
}

export interface ContactList {
  id: string;
  name: string;
  filters: ContactListFilters;
  createdAt: string;
  updatedAt?: string | null;
}

export const contactListService = {
  getAll: async (): Promise<ContactList[]> => {
    const response = await fetch('/api/contact-lists', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Falha ao buscar listas salvas');
    }
    return response.json();
  },

  create: async (input: { name: string; filters: ContactListFilters }): Promise<ContactList> => {
    const response = await fetch('/api/contact-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Falha ao criar lista');
    }

    return response.json();
  },

  update: async (
    id: string,
    patch: { name?: string; filters?: ContactListFilters }
  ): Promise<ContactList> => {
    const response = await fetch(`/api/contact-lists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Falha ao atualizar lista');
    }

    return response.json();
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetch(`/api/contact-lists/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Falha ao excluir lista');
    }
  },
};
