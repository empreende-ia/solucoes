import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceSetup } from './WorkspaceSetup';

const mock = vi.hoisted(() => ({ rpc: vi.fn(), refreshProfile: vi.fn(), signOut: vi.fn() }));
vi.mock('@/integrations/supabase/crm-client', () => ({ crmDb: { rpc: mock.rpc } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ refreshProfile: mock.refreshProfile, signOut: mock.signOut }) }));
function setup(path: string) {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/invite" element={<WorkspaceSetup />} />
    <Route path="/dashboard" element={<h1>CRM da equipe</h1>} />
    <Route path="/setup" element={<WorkspaceSetup />} />
  </Routes></MemoryRouter>);
}
beforeEach(() => {
  mock.rpc.mockReset().mockResolvedValue({ data: 'org-a', error: null });
  mock.refreshProfile.mockReset().mockResolvedValue(undefined);
  mock.signOut.mockReset().mockResolvedValue(true);
});
describe('workspace admission', () => {
  it('leaves the invitation route after a successful acceptance', async () => {
    setup('/invite?invite=invitation-a');
    expect(screen.getByRole('heading', { name: 'Entre na sua equipe' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar convite da equipe' }));
    expect(await screen.findByRole('heading', { name: 'CRM da equipe' })).toBeInTheDocument();
    expect(mock.rpc).toHaveBeenCalledWith('accept_invitation', { p_invitation_id: 'invitation-a' });
    expect(mock.refreshProfile).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Aceitar convite da equipe' })).not.toBeInTheDocument();
  });
  it('keeps a rejected invitation recoverable and navigates only on a successful retry', async () => {
    mock.rpc.mockResolvedValueOnce({ error: { message: 'expired' } });
    setup('/invite?invite=invitation-a');
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar convite da equipe' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível aceitar');
    expect(mock.refreshProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'CRM da equipe' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar convite da equipe' }));
    expect(await screen.findByRole('heading', { name: 'CRM da equipe' })).toBeInTheDocument();
  });
  it('preserves the organization name after a failed creation', async () => {
    mock.rpc.mockResolvedValueOnce({ error: { message: 'offline' } });
    setup('/setup');
    fireEvent.change(screen.getByLabelText('Nome da organização'), { target: { value: 'Empresa em qualquer segmento' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar espaço de trabalho' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Seu nome foi preservado');
    expect(screen.getByLabelText('Nome da organização')).toHaveValue('Empresa em qualquer segmento');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Criar espaço de trabalho' })).toBeEnabled());
  });
});
