import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/crm-client', () => ({ crmDb: {} }));
import { allRows } from './data';

describe('leitura integral do pipeline', () => {
  it('carrega além da primeira página sem cortar contagens ou valores', async () => {
    const records = Array.from({ length: 1003 }, (_, id) => ({ id }));
    const page = vi.fn(async (from: number, to: number) => ({ data: records.slice(from, to + 1), error: null }));
    expect(await allRows(page)).toEqual(records);
    expect(page.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });
  it('propaga falha em página posterior em vez de mostrar totais parciais', async () => {
    const page = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }).mockResolvedValueOnce({ data: null, error: { message: 'Sem conexão' } });
    await expect(allRows(page)).rejects.toEqual({ message: 'Sem conexão' });
  });
});
