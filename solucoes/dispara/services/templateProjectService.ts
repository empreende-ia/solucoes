import { TemplateProject, TemplateProjectItem, CreateTemplateProjectDTO, ProjectStatus } from '@/types';

export type { TemplateProject, TemplateProjectItem, CreateTemplateProjectDTO, ProjectStatus };

export const templateProjectService = {
    // --- Projects ---

    getAll: async (): Promise<TemplateProject[]> => {
        const response = await fetch('/api/template-projects');
        if (!response.ok) {
            throw new Error('Failed to fetch projects');
        }
        return response.json();
    },

    getById: async (id: string): Promise<TemplateProject & { items: TemplateProjectItem[] }> => {
        const response = await fetch(`/api/template-projects/${id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch project details');
        }
        return response.json();
    },

    create: async (dto: CreateTemplateProjectDTO): Promise<TemplateProject> => {
        const response = await fetch('/api/template-projects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(dto),
        });

        if (!response.ok) {
            throw new Error('Failed to create project');
        }
        return response.json();
    },

    update: async (id: string, updates: Partial<TemplateProject>): Promise<TemplateProject> => {
        const response = await fetch(`/api/template-projects/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updates),
        });

        if (!response.ok) {
            throw new Error('Failed to update project');
        }
        return response.json();
    },

    delete: async (id: string, deleteMetaTemplates: boolean = false): Promise<void> => {
        const url = deleteMetaTemplates
            ? `/api/template-projects/${id}?deleteMetaTemplates=true`
            : `/api/template-projects/${id}`;

        const response = await fetch(url, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Failed to delete project');
        }
    },

    // --- Items ---

    updateItem: async (id: string, updates: Partial<TemplateProjectItem>): Promise<TemplateProjectItem> => {
        const response = await fetch(`/api/template-projects/items/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updates),
        });

        if (!response.ok) {
            throw new Error('Failed to update item');
        }
        return response.json();
    },

    deleteItem: async (id: string): Promise<void> => {
        const response = await fetch(`/api/template-projects/items/${id}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Failed to delete item');
        }
    }
};
