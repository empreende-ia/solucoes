import { DIRECTORY_COLUMNS, type DirectoryKind, type DirectoryView } from './contact-model';
export interface SavedDirectoryView { id: string; name: string; view: DirectoryView; updatedAt: string }
export const SAVED_VIEW_VERSION = 1;
export function savedViewKey(userId: string, orgId: string, kind: DirectoryKind) {
  return `empreende-ia:views:v${SAVED_VIEW_VERSION}:${encodeURIComponent(userId)}:${encodeURIComponent(orgId)}:${kind}`;
}
export function parseSavedViews(raw: string | null): SavedDirectoryView[] {
  if (!raw || raw.length > 100_000) return [];
  try {
    const parsed = JSON.parse(raw);
    if (parsed.version !== SAVED_VIEW_VERSION || !Array.isArray(parsed.views)) return [];
    const seen = new Set<string>();
    return parsed.views.filter((item: SavedDirectoryView) => {
      if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60 || !item.view) return false;
      const v = item.view;
      if (typeof v.q !== 'string' || v.q.length > 300 || !['all', 'mine', 'unassigned', 'no-action'].includes(v.scope) || !['name', 'updated', 'next-action'].includes(v.sort) || !Array.isArray(v.columns) || !v.columns.every(c => DIRECTORY_COLUMNS.includes(c)) || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))) return false;
      seen.add(item.id); return true;
    }).slice(0, 20);
  } catch { return []; }
}
export function serializeSavedViews(views: SavedDirectoryView[]) { return JSON.stringify({ version: SAVED_VIEW_VERSION, views: views.slice(0, 20) }); }
