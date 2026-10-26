import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { contactService } from '../services';
import { ContactStatus } from '../types';
import {
  toggleContactSelection,
  toggleSelectAllContacts,
  clearContactSelection,
  selectAllContactsGlobal,
} from '@/lib/business/contact';

/**
 * Filters for selecting contacts globally (across all pages)
 */
export interface ContactSelectionFilters {
  search: string;
  status: ContactStatus | 'ALL' | 'SUPPRESSED';
  /** filtro single-tag legado (usado pelo "Sem tags") */
  tag?: string;
  /** filtro multi-tag (paridade GHL) */
  tags?: string[];
  tagMatch?: 'any' | 'all';
}

/**
 * Extracted hook for contact selection logic.
 * Encapsulates selection state and handlers, reusable across components.
 *
 * @param pageContactIds - IDs of contacts currently visible on the page
 * @param filters - Current filter state for global selection
 */
export function useContactSelection(
  pageContactIds: string[],
  filters: ContactSelectionFilters
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Toggle a single contact's selection
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => toggleContactSelection(prev, id));
  }, []);

  // Toggle all contacts on the current page
  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allOnPageSelected =
        pageContactIds.length > 0 && pageContactIds.every((id) => prev.has(id));
      return toggleSelectAllContacts(prev, pageContactIds, allOnPageSelected);
    });
  }, [pageContactIds]);

  // Select all contacts matching current filters (across all pages)
  const selectAllGlobal = useCallback(() => {
    void contactService
      .getIds({
        search: filters.search.trim(),
        status: filters.status,
        tag: filters.tag,
        tags: filters.tags,
        tagMatch: filters.tagMatch,
      })
      .then((ids) => {
        setSelectedIds(selectAllContactsGlobal(ids));
      })
      .catch((error: any) => {
        toast.error(error.message || 'Erro ao selecionar todos os contatos');
      });
  }, [filters.search, filters.status, filters.tag, filters.tags, filters.tagMatch]);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedIds(clearContactSelection());
  }, []);

  // Derived state
  const isAllSelected = useMemo(
    () => pageContactIds.length > 0 && pageContactIds.every((id) => selectedIds.has(id)),
    [pageContactIds, selectedIds]
  );
  const isSomeSelected = selectedIds.size > 0;

  return {
    selectedIds,
    setSelectedIds,
    toggleSelect,
    toggleSelectAll,
    selectAllGlobal,
    clearSelection,
    isAllSelected,
    isSomeSelected,
  };
}
