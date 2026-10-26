'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, Search, Tags } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { NO_TAGS_FILTER } from '@/services/contactService';

export interface ContactTagMultiSelectProps {
  /** Tags disponíveis (GET /api/contacts/tags) */
  tags: string[];
  /** Tags selecionadas (pode conter a sentinela NO_TAGS_FILTER, exclusiva) */
  selected: string[];
  onChange: (selected: string[]) => void;
  /** any = qualquer uma das tags; all = todas as tags */
  tagMatch: 'any' | 'all';
  onTagMatchChange: (match: 'any' | 'all') => void;
}

/**
 * Filtro multi-tag estilo GHL: dropdown com checkboxes + toggle "qualquer uma / todas".
 * "Sem tags" é uma opção exclusiva (limpa as demais ao ser marcada).
 */
export const ContactTagMultiSelect: React.FC<ContactTagMultiSelectProps> = ({
  tags,
  selected,
  onChange,
  tagMatch,
  onTagMatchChange,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const noTagsSelected = selected.includes(NO_TAGS_FILTER);
  const realSelected = useMemo(
    () => selected.filter((t) => t !== NO_TAGS_FILTER),
    [selected]
  );

  const filteredTags = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.toLowerCase().includes(q));
  }, [tags, query]);

  const toggleTag = (tag: string) => {
    if (tag === NO_TAGS_FILTER) {
      // "Sem tags" é exclusivo: marca sozinho ou desmarca
      onChange(noTagsSelected ? [] : [NO_TAGS_FILTER]);
      return;
    }
    const withoutSentinel = selected.filter((t) => t !== NO_TAGS_FILTER);
    onChange(
      withoutSentinel.includes(tag)
        ? withoutSentinel.filter((t) => t !== tag)
        : [...withoutSentinel, tag]
    );
  };

  const triggerLabel = noTagsSelected
    ? 'Sem tags'
    : realSelected.length === 0
      ? 'Todas Tags'
      : realSelected.length === 1
        ? realSelected[0]
        : `${realSelected.length} tags`;

  const hasSelection = selected.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`px-4 py-2.5 text-sm font-medium rounded-xl border transition-colors outline-none cursor-pointer flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2 ${hasSelection
            ? 'text-primary-600 dark:text-primary-400 bg-primary-500/10 border-primary-500/30'
            : 'bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] border-[var(--ds-border-default)] hover:bg-[var(--ds-bg-hover)]'
            }`}
          aria-label="Filtrar contatos por tags"
          aria-expanded={open}
        >
          <Tags size={16} aria-hidden="true" />
          <span className="max-w-[10rem] truncate">{triggerLabel}</span>
          <ChevronDown size={14} className="opacity-60" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64 p-0 bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)]">
        {/* Toggle qualquer uma / todas */}
        <div className="p-3 border-b border-[var(--ds-border-subtle)]">
          <p className="text-xs font-medium text-[var(--ds-text-muted)] mb-2">
            Contatos que tenham
          </p>
          <div className="flex rounded-lg border border-[var(--ds-border-default)] p-0.5 gap-0.5" role="radiogroup" aria-label="Modo de combinação das tags">
            <button
              type="button"
              role="radio"
              aria-checked={tagMatch === 'any'}
              onClick={() => onTagMatchChange('any')}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${tagMatch === 'any'
                ? 'bg-primary-500/15 text-primary-600 dark:text-primary-400'
                : 'text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]'
                }`}
            >
              Qualquer uma
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={tagMatch === 'all'}
              onClick={() => onTagMatchChange('all')}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${tagMatch === 'all'
                ? 'bg-primary-500/15 text-primary-600 dark:text-primary-400'
                : 'text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]'
                }`}
            >
              Todas
            </button>
          </div>
        </div>

        {/* Busca (útil quando há muitas tags) */}
        {tags.length > 6 && (
          <div className="px-3 pt-3">
            <div className="flex items-center gap-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg px-2.5 py-1.5">
              <Search size={14} className="text-[var(--ds-text-muted)]" aria-hidden="true" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar tag..."
                className="bg-transparent border-none outline-none text-sm w-full text-[var(--ds-text-primary)] placeholder-[var(--ds-text-muted)]"
                aria-label="Buscar tag"
              />
            </div>
          </div>
        )}

        {/* Opções */}
        <div className="max-h-56 overflow-y-auto p-2">
          <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--ds-bg-hover)] transition-colors">
            <Checkbox
              checked={noTagsSelected}
              onCheckedChange={() => toggleTag(NO_TAGS_FILTER)}
              aria-label="Filtrar contatos sem tags"
            />
            <span className="text-sm text-[var(--ds-text-secondary)] italic">Sem tags</span>
          </label>

          {filteredTags.map((tag) => (
            <label
              key={tag}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--ds-bg-hover)] transition-colors"
            >
              <Checkbox
                checked={realSelected.includes(tag)}
                onCheckedChange={() => toggleTag(tag)}
                aria-label={`Filtrar pela tag ${tag}`}
              />
              <span className="text-sm text-[var(--ds-text-primary)] truncate">{tag}</span>
            </label>
          ))}

          {filteredTags.length === 0 && tags.length > 0 && (
            <p className="px-2 py-3 text-sm text-[var(--ds-text-muted)]">
              Nenhuma tag encontrada.
            </p>
          )}
          {tags.length === 0 && (
            <p className="px-2 py-3 text-sm text-[var(--ds-text-muted)]">
              Nenhuma tag cadastrada ainda.
            </p>
          )}
        </div>

        {/* Limpar */}
        {hasSelection && (
          <div className="p-2 border-t border-[var(--ds-border-subtle)]">
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full px-2 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors"
            >
              Limpar seleção
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
