import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/crm-client', () => ({ crmDb: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({}) }));
vi.mock('@/hooks/useOrg', () => ({ useOrg: () => ({}) }));
import { readCrmPages } from './useCrmSnapshot';
describe('snapshot completo', () => {
  it('continua além do limite e não perde registros após 1000 linhas', async () => {
    const expected = Array.from({ length: 1205 }, (_, id) => ({ id })); const request = vi.fn(async (from, to) => ({ data: expected.slice(from, to + 1), error: null }));
    expect(await readCrmPages(request)).toEqual(expected); expect(request.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });
  it('um erro intermediário falha o snapshot inteiro em vez de publicar contagem parcial', async () => {
    const failure = { message: 'network', code: 'offline' }; const request = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }).mockResolvedValueOnce({ data: null, error: failure });
    await expect(readCrmPages(request)).rejects.toBe(failure);
  });
});
