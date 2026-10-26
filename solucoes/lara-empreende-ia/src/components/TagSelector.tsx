import React, { useState } from 'react';
import { Search, Plus, Check } from 'lucide-react';
import { TagDefinition } from '@/types';
import { Input } from './ui/input';
import { Button } from './ui/button';

interface TagSelectorProps {
  availableTags: TagDefinition[];
  selectedTags: string[];
  onToggleTag: (tagKey: string) => void;
  onCreateTag: (tag: { key: string; label: string; color: string; category: string }) => void;
}

export const TagSelector: React.FC<TagSelectorProps> = ({
  availableTags,
  selectedTags,
  onToggleTag,
  onCreateTag
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTag, setNewTag] = useState({
    label: '',
    color: '#141414',
    category: 'custom'
  });

  // Filtrar tags por busca
  const filteredTags = availableTags.filter(tag =>
    tag.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tag.key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Agrupar tags por categoria
  const tagsByCategory = filteredTags.reduce((acc, tag) => {
    if (!acc[tag.category]) acc[tag.category] = [];
    acc[tag.category].push(tag);
    return acc;
  }, {} as Record<string, TagDefinition[]>);

  const categoryLabels: Record<string, string> = {
    status: 'STATUS',
    interest: 'INTERESSE',
    action: 'AÇÃO NECESSÁRIA',
    qualification: 'QUALIFICAÇÃO',
    custom: 'PERSONALIZADO'
  };

  const handleCreateTag = () => {
    if (!newTag.label.trim()) return;
    
    const key = newTag.label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    onCreateTag({
      key,
      label: newTag.label,
      color: newTag.color,
      category: newTag.category
    });

    setNewTag({ label: '', color: '#141414', category: 'custom' });
    setIsCreating(false);
  };

  if (isCreating) {
    return (
      <div className="p-4 space-y-3">
        <h4 className="text-sm font-semibold text-foreground mb-3">Criar nova tag</h4>

        <div className="space-y-2">
          <Input
            placeholder="Nome da tag"
            value={newTag.label}
            onChange={(e) => setNewTag({ ...newTag, label: e.target.value })}
          />
          
          <div className="space-y-2">
            <label htmlFor="new-tag-category" className="eia-eyebrow">Categoria</label>
            <select
              id="new-tag-category"
              value={newTag.category}
              onChange={(e) => setNewTag({ ...newTag, category: e.target.value })}
              className="w-full h-9 px-3 rounded-md bg-secondary border border-input text-sm text-foreground"
            >
              <option value="custom">Personalizado</option>
              <option value="status">Status</option>
              <option value="interest">Interesse</option>
              <option value="action">Ação</option>
              <option value="qualification">Qualificação</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleCreateTag}
            size="sm"
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Criar
          </Button>
          <Button
            onClick={() => setIsCreating(false)}
            size="sm"
            variant="outline"
            className="flex-1"
          >
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-h-[400px] flex flex-col">
      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Tags List */}
      <div className="flex-1 overflow-y-auto p-2">
        {Object.entries(tagsByCategory).map(([category, tags]) => (
          <div key={category} className="mb-3">
            <h5 className="eia-eyebrow text-muted-foreground px-2 py-1.5">
              {categoryLabels[category] || category}
            </h5>
            <div className="space-y-0.5">
              {tags.map(tag => {
                const isSelected = selectedTags.includes(tag.key);
                return (
                  <button
                    key={tag.key}
                    onClick={() => onToggleTag(tag.key)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent/50 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-sm text-foreground">{tag.label}</span>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Create New Tag Button */}
      <div className="p-2 border-t border-border">
        <button
          onClick={() => setIsCreating(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent transition-colors text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus className="w-4 h-4" />
          <span>Criar nova tag</span>
        </button>
      </div>
    </div>
  );
};
