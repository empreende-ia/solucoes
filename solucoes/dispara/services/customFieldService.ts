import { CustomFieldDefinition } from '../types';

export const customFieldService = {
    getAll: async (entityType: 'contact' | 'deal' = 'contact'): Promise<CustomFieldDefinition[]> => {
        const response = await fetch(`/api/custom-fields?entityType=${entityType}`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Falha ao buscar campos personalizados');
        }
        return response.json();
    },

    create: async (data: Omit<CustomFieldDefinition, 'id' | 'created_at'>): Promise<CustomFieldDefinition> => {
        const response = await fetch('/api/custom-fields', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Falha ao criar campo personalizado');
        }

        return response.json();
    },

    delete: async (id: string): Promise<void> => {
        const response = await fetch(`/api/custom-fields/${id}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Falha ao deletar campo personalizado');
        }
    },
};
