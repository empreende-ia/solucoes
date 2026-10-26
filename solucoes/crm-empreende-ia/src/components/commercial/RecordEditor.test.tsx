import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ canWrite: true, insert: vi.fn(), update: vi.fn(), from: vi.fn(), single: vi.fn(), eq: vi.fn(), select: vi.fn() }));
vi.mock('@/hooks/useOrg', () => ({ useOrg: () => ({ orgId: 'organization-1' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/useCrmPermissions', () => ({ useCrmPermissions: () => ({ canWrite: mocks.canWrite }) }));
vi.mock('@/integrations/supabase/crm-client', () => ({ crmDb: { from: mocks.from } }));
import { RecordEditor } from './RecordEditor';
import type { Contact, RelationshipData } from '@/lib/contact-model';
const data: RelationshipData = { contacts: [], companies: [], deals: [], activities: [], members: [{ id: 'user-1', name: 'Pessoa', email: 'pessoa@example.com' }] };
function mount(record?: Contact) { const onSaved = vi.fn(), onClose = vi.fn(); const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={cache}><RecordEditor kind="contacts" data={data} record={record} onSaved={onSaved} onClose={onClose} /></QueryClientProvider>); return { onSaved, onClose }; }
describe('salvamento de cadastro', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.canWrite = true; const chain = { insert: mocks.insert, update: mocks.update, eq: mocks.eq, select: mocks.select, single: mocks.single }; mocks.from.mockReturnValue(chain); mocks.insert.mockReturnValue(chain); mocks.update.mockReturnValue(chain); mocks.eq.mockReturnValue(chain); mocks.select.mockReturnValue(chain); mocks.single.mockResolvedValue({ data: null, error: { code: 'network' } }); });
  afterEach(cleanup);
  it('falha comunicada preserva preenchimento e não fecha o formulário', async () => {
    const callbacks = mount(); fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Mariana' } }); fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'mariana@example.com' } }); fireEvent.click(screen.getByRole('button', { name: 'Salvar cadastro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Seu preenchimento foi preservado');
    expect(screen.getByLabelText('Nome *')).toHaveValue('Mariana'); expect(screen.getByLabelText('E-mail')).toHaveValue('mariana@example.com'); expect(callbacks.onSaved).not.toHaveBeenCalled(); expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ org_id: 'organization-1', first_name: 'Mariana', owner_id: 'user-1' }));
  });
  it('edição restringe a gravação por organização e ID e só fecha após confirmação', async () => {
    mocks.single.mockResolvedValue({ data: { id: 'contact-1' }, error: null });
    const callbacks = mount({ id: 'contact-1', first_name: 'Antigo', last_name: null, phone: null, email: null, owner_id: null, company_id: null, status: 'lead' } as Contact);
    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Atualizado' } }); fireEvent.click(screen.getByRole('button', { name: 'Salvar cadastro' }));
    await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledWith('contact-1'));
    expect(mocks.eq).toHaveBeenCalledWith('org_id', 'organization-1'); expect(mocks.eq).toHaveBeenCalledWith('id', 'contact-1');
  });
  it('papel de consulta não dispara gravação', () => { mocks.canWrite = false; mount(); expect(screen.getByRole('button', { name: 'Salvar cadastro' })).toBeDisabled(); expect(mocks.insert).not.toHaveBeenCalled(); });
});
