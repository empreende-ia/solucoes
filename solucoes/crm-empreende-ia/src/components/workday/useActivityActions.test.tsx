import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '@/lib/activity-logic';
import type { RelationshipData } from '@/lib/contact-model';

const mocks = vi.hoisted(() => ({ canWrite: true, canManage: false, from: vi.fn(), success: vi.fn() }));
vi.mock('@/hooks/useOrg', () => ({ useOrg: () => ({ orgId: 'org-1' }) }));
vi.mock('@/hooks/useCrmPermissions', () => ({ useCrmPermissions: () => ({ canWrite: mocks.canWrite, canManage: mocks.canManage }) }));
vi.mock('@/integrations/supabase/crm-client', () => ({ crmDb: { from: mocks.from } }));
vi.mock('sonner', () => ({ toast: { success: mocks.success } }));

import { useActivityActions } from './useActivityActions';
import { ActivityDetail } from './ActivityDetail';

function activity(): Activity {
  return { id: 'activity-1', org_id: 'org-1', title: 'Retorno comercial', body: null, type: 'task',
    user_id: 'member-1', contact_id: null, company_id: null, deal_id: null, due_date: null,
    end_date: null, completed_at: null, created_by: 'member-1',
    created_at: '2026-09-06T10:00:00.000000Z', updated_at: '2026-09-06T10:00:00.123456Z' };
}

/** Models conditional writes: a stale version returns zero rows and never changes storage. */
function database(row = activity()) {
  const state = { row: { ...row } as Activity | null, error: null as { code: string } | null };
  mocks.from.mockImplementation(() => {
    let remove = false;
    let patch: Partial<Activity> = {};
    const filters: [keyof Activity, unknown][] = [];
    const chain = {
      update: (fields: Partial<Activity>) => { patch = fields; return chain; },
      delete: () => { remove = true; return chain; },
      eq: (column: keyof Activity, value: unknown) => { filters.push([column, value]); return chain; },
      select: () => chain,
      maybeSingle: async () => {
        if (state.error) return { data: null, error: state.error };
        if (!state.row || !filters.every(([column, value]) => state.row![column] === value)) return { data: null, error: null };
        const id = state.row.id;
        if (remove) state.row = null;
        else Object.assign(state.row, patch, { updated_at: '2026-09-06T10:05:00.000001Z' });
        return { data: { id }, error: null };
      },
    };
    return chain;
  });
  return state;
}

function wrapper() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Provider({ children }: PropsWithChildren) {
    return <QueryClientProvider client={cache}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter></QueryClientProvider>;
  };
}

beforeEach(() => { vi.clearAllMocks(); mocks.canWrite = true; mocks.canManage = false; });
afterEach(cleanup);

describe('permissões e concorrência da rotina', () => {
  it('colaborador conclui uma atividade, mas exclusão direta no hook não faz requisição', async () => {
    const original = activity(), state = database(original);
    const { result } = renderHook(() => useActivityActions(), { wrapper: wrapper() });
    await act(async () => { expect(await result.current.toggle(original)).toBe(true); });
    expect(state.row?.completed_at).not.toBeNull(); expect(mocks.from).toHaveBeenCalledTimes(1);
    await act(async () => { expect(await result.current.remove(state.row!)).toBe(false); });
    expect(state.row).not.toBeNull(); expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('consulta não pode concluir nem excluir, mesmo chamando o hook diretamente', async () => {
    mocks.canWrite = false; database();
    const { result } = renderHook(() => useActivityActions(), { wrapper: wrapper() });
    await act(async () => {
      expect(await result.current.toggle(activity())).toBe(false);
      expect(await result.current.remove(activity())).toBe(false);
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('administrador exclui a versão revisada da atividade', async () => {
    mocks.canManage = true; const original = activity(), state = database(original);
    const { result } = renderHook(() => useActivityActions(), { wrapper: wrapper() });
    await act(async () => { expect(await result.current.remove(original)).toBe(true); });
    expect(state.row).toBeNull(); expect(mocks.success).toHaveBeenCalledWith('Atividade excluída');
  });

  it.each(['toggle', 'remove'] as const)('%s recusa versão obsoleta sem alterar a conclusão atual', async action => {
    mocks.canManage = true;
    const original = activity(), state = database(original);
    state.row = { ...original, completed_at: '2026-09-06T10:03:00.000000Z', updated_at: '2026-09-06T10:03:00.000001Z' };
    const current = { ...state.row };
    const { result } = renderHook(() => useActivityActions(), { wrapper: wrapper() });
    await act(async () => { expect(await result.current[action](original)).toBe(false); });
    expect(state.row).toEqual(current); expect(result.current.error).toContain('Esta atividade mudou');
    expect(mocks.success).not.toHaveBeenCalled();
  });
});

describe('ficha de atividade', () => {
  const data: RelationshipData = { contacts: [], companies: [], deals: [], activities: [], members: [] };

  it('colaborador encontra edição e conclusão sem botão ou confirmação de exclusão', () => {
    database();
    render(<ActivityDetail activity={activity()} data={data} onClose={vi.fn()} onEdit={vi.fn()} />, { wrapper: wrapper() });
    expect(screen.getByRole('button', { name: 'Editar / reagendar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Concluir' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Excluir esta atividade?' })).not.toBeInTheDocument();
  });

  it('falha ao excluir permanece visível dentro da confirmação e conserva a atividade', async () => {
    mocks.canManage = true; const original = activity(), state = database(original); state.error = { code: '42501' };
    const onClose = vi.fn();
    render(<ActivityDetail activity={original} data={data} onClose={onClose} onEdit={vi.fn()} />, { wrapper: wrapper() });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    const confirmation = screen.getByRole('dialog', { name: 'Excluir esta atividade?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Excluir atividade' }));
    expect(await within(confirmation).findByRole('alert')).toHaveTextContent('Seu papel não permite esta ação');
    await waitFor(() => expect(within(confirmation).getByRole('button', { name: 'Excluir atividade' })).toBeEnabled());
    expect(state.row).toEqual(original); expect(onClose).not.toHaveBeenCalled();
  });
});
