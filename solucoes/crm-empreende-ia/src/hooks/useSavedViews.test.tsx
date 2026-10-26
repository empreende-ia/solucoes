import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const context = vi.hoisted(() => ({ user: { id: 'u1' }, orgId: 'o1' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: context.user }) }));
vi.mock('@/hooks/useOrg', () => ({ useOrg: () => ({ orgId: context.orgId }) }));
import { useSavedViews } from './useSavedViews';
const view = { q: 'Empresa', scope: 'mine', sort: 'updated', columns: ['owner'] } as const;
describe('persistência de visões por identidade', () => {
  beforeEach(() => { localStorage.clear(); context.user = { id: 'u1' }; context.orgId = 'o1'; vi.restoreAllMocks(); });
  it('salva, atualiza por nome e restaura sem vazar para outra organização', () => {
    const { result, rerender } = renderHook(() => useSavedViews('contacts'));
    act(() => { expect(result.current.save('Carteira', { ...view, columns: ['owner'] })).toBe(true); }); expect(result.current.views).toHaveLength(1);
    act(() => { result.current.save('carteira', { ...view, q: 'Novo filtro', columns: ['owner'] }); }); expect(result.current.views).toHaveLength(1); expect(result.current.views[0].view.q).toBe('Novo filtro');
    context.orgId = 'o2'; rerender(); expect(result.current.views).toHaveLength(0);
    context.orgId = 'o1'; rerender(); expect(result.current.views[0].view.q).toBe('Novo filtro');
    context.user = { id: 'u2' }; rerender(); expect(result.current.views).toHaveLength(0);
  });
  it('comunica falha de gravação e mantém as visões salvas em memória', () => {
    const { result } = renderHook(() => useSavedViews('contacts'));
    act(() => { result.current.save('Carteira', { ...view, columns: ['owner'] }); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    act(() => { expect(result.current.save('Outra', { ...view, columns: ['owner'] })).toBe(false); });
    expect(result.current.error).toMatch('Não foi possível salvar'); expect(result.current.views).toHaveLength(1);
  });
});
