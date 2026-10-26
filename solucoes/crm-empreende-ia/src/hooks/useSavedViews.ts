import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/hooks/useOrg';
import { parseSavedViews, savedViewKey, serializeSavedViews, type SavedDirectoryView } from '@/lib/contact-saved-views';
import type { DirectoryKind, DirectoryView } from '@/lib/contact-model';

export function useSavedViews(kind: DirectoryKind) {
  const { user } = useAuth(); const { orgId } = useOrg();
  const key = user && orgId ? savedViewKey(user.id, orgId, kind) : null;
  const [snapshot, setSnapshot] = useState<{ key: string | null; views: SavedDirectoryView[] }>({ key: null, views: [] });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const read = () => { try { setSnapshot({ key, views: key ? parseSavedViews(localStorage.getItem(key)) : [] }); setError(null); }
      catch { setSnapshot({ key, views: [] }); setError('O navegador bloqueou o acesso às visões salvas.'); } };
    read(); const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) read(); };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, [key]);
  const update = useCallback((change: (views: SavedDirectoryView[]) => SavedDirectoryView[]) => {
    if (!key) return false;
    try { const views = change(parseSavedViews(localStorage.getItem(key))); localStorage.setItem(key, serializeSavedViews(views)); setSnapshot({ key, views }); setError(null); return true; }
    catch (cause) { setError(cause instanceof Error && cause.message.startsWith('Você') ? cause.message : 'Não foi possível salvar no navegador. Sua visão atual continua aplicada.'); return false; }
  }, [key]);
  return { views: snapshot.key === key ? snapshot.views : [], error,
    save: (name: string, view: DirectoryView) => update(views => {
      const trimmed = name.trim().slice(0, 60); if (!trimmed) throw new Error('Você precisa informar um nome para a visão.');
      const existing = views.find(v => v.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
      if (!existing && views.length >= 20) throw new Error('Você atingiu 20 visões. Exclua uma antes de salvar outra.');
      const item = { id: existing?.id ?? crypto.randomUUID(), name: trimmed, view, updatedAt: new Date().toISOString() };
      return [item, ...views.filter(v => v.id !== item.id)];
    }), remove: (id: string) => update(views => views.filter(v => v.id !== id)),
  };
}
