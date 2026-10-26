'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface GeneratedTemplate {
  id: string;
  name: string;
  content: string;
  category: string;
  language: string;
}

interface GenerateParams {
  prompt: string;
  quantity: number;
  language: string;
}

interface UseAITemplateGeneratorOptions {
  onSuccess?: (templates: GeneratedTemplate[]) => void;
}

export const useAITemplateGenerator = (options?: UseAITemplateGeneratorOptions) => {
  // UI State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [quantity, setQuantity] = useState(5);
  const [language, setLanguage] = useState('pt_BR');
  
  // Results State
  const [generatedTemplates, setGeneratedTemplates] = useState<GeneratedTemplate[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());

  // Generate Mutation
  const generateMutation = useMutation({
    mutationFn: async (params: GenerateParams) => {
      const res = await fetch('/api/templates/generate-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Erro ao gerar templates');
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedTemplates(data.templates);
      setSelectedTemplates(new Set(data.templates.map((t: GeneratedTemplate) => t.id)));
      toast.success(`${data.templates.length} templates gerados!`);
      options?.onSuccess?.(data.templates);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  // Handlers
  const handleGenerate = () => {
    if (!prompt.trim() || prompt.length < 10) {
      toast.error('Descreva melhor o que você precisa (mínimo 10 caracteres)');
      return;
    }

    generateMutation.mutate({
      prompt,
      quantity,
      language
    });
  };

  const handleToggleTemplate = (id: string) => {
    setSelectedTemplates(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedTemplates.size === generatedTemplates.length) {
      setSelectedTemplates(new Set());
    } else {
      setSelectedTemplates(new Set(generatedTemplates.map(t => t.id)));
    }
  };

  const handleCopyTemplate = (template: GeneratedTemplate) => {
    navigator.clipboard.writeText(template.content);
    toast.success('Template copiado!');
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setPrompt('');
    setQuantity(5);
    setGeneratedTemplates([]);
    setSelectedTemplates(new Set());
  };

  const handleOpen = () => {
    setIsModalOpen(true);
  };

  // Get selected templates as array
  const getSelectedTemplates = () => {
    return generatedTemplates.filter(t => selectedTemplates.has(t.id));
  };

  return {
    // Modal state
    isModalOpen,
    openModal: handleOpen,
    closeModal: handleClose,
    
    // Form state
    prompt,
    setPrompt,
    quantity,
    setQuantity,
    language,
    setLanguage,
    
    // Results
    generatedTemplates,
    selectedTemplates,
    getSelectedTemplates,
    
    // Actions
    generate: handleGenerate,
    toggleTemplate: handleToggleTemplate,
    selectAll: handleSelectAll,
    copyTemplate: handleCopyTemplate,
    
    // Loading states
    isGenerating: generateMutation.isPending,
  };
};
