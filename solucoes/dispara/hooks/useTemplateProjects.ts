
import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { templateProjectService, CreateTemplateProjectDTO } from '@/services/templateProjectService';
import { useRealtimeQuery } from './useRealtimeQuery';
import { REALTIME_FILTERS } from '@/lib/realtime-db-change';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

// --- Queries ---

export const useTemplateProjectsQuery = () => {
    return useRealtimeQuery({
        queryKey: ['template_projects'],
        queryFn: templateProjectService.getAll,
        table: 'template_projects',
        events: ['INSERT', 'UPDATE', 'DELETE'],
    });
};

export const useTemplateProjectDetailsQuery = (id: string) => {
    return useRealtimeQuery({
        queryKey: ['template_projects', id],
        queryFn: () => templateProjectService.getById(id),
        table: 'template_project_items',
        filter: REALTIME_FILTERS.projectItemsByProject(id),
        events: ['INSERT', 'UPDATE', 'DELETE'],
        // Note: This primarily listens to ITEM changes. 
        // Project-level changes (status) might need a separate subscription or manual invalidation if they happen outside this user's context.
        // For now, this is sufficient for the generation flow.
    });
};

// --- Mutations ---

export const useTemplateProjectMutations = () => {
    const queryClient = useQueryClient();
    const router = useRouter();
    const [isCreating, setIsCreating] = useState(false);

    const createProjectMutation = useMutation({
        mutationFn: async (dto: CreateTemplateProjectDTO) => {
            setIsCreating(true);
            return await templateProjectService.create(dto);
        },
        onSuccess: (project) => {
            // Invalidate list
            queryClient.invalidateQueries({ queryKey: ['template_projects'] });
            toast.success('Projeto criado com sucesso');
            // Navigate to details
            router.push(`/templates/${project.id}`);
        },
        onError: (error) => {
            console.error('Error creating project:', error);
            toast.error('Erro ao criar projeto');
        },
        onSettled: () => {
            setIsCreating(false);
        }
    });

    const updateProjectMutation = useMutation({
        mutationFn: ({ id, title }: { id: string; title: string }) =>
            templateProjectService.update(id, { title }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['template_projects'] });
            toast.success('Nome atualizado');
        },
        onError: (error) => {
            console.error('Error updating project:', error);
            toast.error('Erro ao atualizar nome');
        }
    });

    const deleteProjectMutation = useMutation({
        mutationFn: ({ id, deleteMetaTemplates }: { id: string; deleteMetaTemplates: boolean }) =>
            templateProjectService.delete(id, deleteMetaTemplates),
        onSuccess: (_, { deleteMetaTemplates }) => {
            queryClient.invalidateQueries({ queryKey: ['template_projects'] });
            if (deleteMetaTemplates) {
                queryClient.invalidateQueries({ queryKey: ['templates'] });
            }
            toast.success('Projeto excluído');
            router.push('/templates');
        },
        onError: (error) => {
            console.error('Error deleting project:', error);
            toast.error('Erro ao excluir projeto');
        }
    });

    const deleteProject = async (id: string, deleteMetaTemplates: boolean = false) => {
        return deleteProjectMutation.mutateAsync({ id, deleteMetaTemplates });
    };

    const updateProjectTitle = async (id: string, title: string) => {
        return updateProjectMutation.mutateAsync({ id, title });
    };

    return {
        createProject: createProjectMutation.mutateAsync,
        updateProjectTitle,
        deleteProject,
        isCreating,
        isUpdating: updateProjectMutation.isPending,
        isDeleting: deleteProjectMutation.isPending
    };
};
