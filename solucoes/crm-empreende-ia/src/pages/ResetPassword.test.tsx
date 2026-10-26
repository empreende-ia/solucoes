import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResetPassword from './ResetPassword';

const mock = vi.hoisted(() => ({ initialize: vi.fn(), getUser: vi.fn(), updateUser: vi.fn(), navigate: vi.fn(), toast: vi.fn(), listener: null as null | ((event: string) => void) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  initialize: () => mock.initialize(), getUser: () => mock.getUser(), updateUser: (data: unknown) => mock.updateUser(data),
  onAuthStateChange: (listener: typeof mock.listener) => { mock.listener = listener; return { data: { subscription: { unsubscribe: vi.fn() } } }; },
} } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mock.navigate }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mock.toast }) }));
vi.mock('@/components/brand/AuthBrandPanel', () => ({ AuthBrandPanel: () => null }));
vi.mock('@/components/brand/ThemeToggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/components/brand/Wordmark', () => ({ default: () => null }));

beforeEach(() => {
  vi.clearAllMocks(); mock.listener = null;
  mock.initialize.mockResolvedValue({ error: null });
  mock.getUser.mockResolvedValue({ data: { user: { id: 'recovery-user' } }, error: null });
  mock.updateUser.mockResolvedValue({ error: null });
  window.location.hash = '';
});

describe('password recovery', () => {
  it('waits for URL processing and allows a valid session after the SDK removes the fragment', async () => {
    let resolve!: (result: unknown) => void;
    mock.initialize.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<ResetPassword />);
    expect(screen.getByRole('status')).toHaveTextContent('Validando');
    expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument();
    expect(mock.getUser).not.toHaveBeenCalled();
    await act(async () => { resolve({ error: null }); });
    expect(await screen.findByLabelText('Nova senha')).toBeInTheDocument();
    expect(mock.navigate).not.toHaveBeenCalled();
  });

  it('does not reuse an existing session when the recovery callback is invalid', async () => {
    mock.initialize.mockResolvedValue({ error: new Error('Invalid recovery callback') });
    render(<ResetPassword />);
    expect(await screen.findByRole('alert')).toHaveTextContent('inválido ou expirou');
    expect(mock.getUser).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument();
  });

  it('requires a verified user before allowing a password change', async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: null });
    render(<ResetPassword />);
    expect(await screen.findByRole('alert')).toHaveTextContent('inválido ou expirou');
    expect(mock.updateUser).not.toHaveBeenCalled();
  });

  it('does not restore the form if validation resolves after logout', async () => {
    let resolve!: (result: unknown) => void;
    mock.getUser.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<ResetPassword />);
    await waitFor(() => expect(mock.getUser).toHaveBeenCalled());
    await act(async () => { mock.listener?.('SIGNED_OUT'); resolve({ data: { user: { id: 'old-user' } }, error: null }); });
    expect(screen.getByRole('alert')).toHaveTextContent('inválido ou expirou');
    expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument();
  });

  it.each(['initialize', 'getUser'] as const)('offers reload after a temporary %s connection failure', async (method) => {
    mock[method].mockRejectedValueOnce(new TypeError('Network failed'));
    const first = render(<ResetPassword />);
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Verifique a conexão');
    first.unmount();
    render(<ResetPassword />);
    expect(await screen.findByLabelText('Nova senha')).toBeInTheDocument();
  });

  it('preserves the password and releases the submit button after a thrown failure', async () => {
    mock.updateUser.mockRejectedValueOnce(new TypeError('Network failed'));
    render(<ResetPassword />);
    const input = await screen.findByLabelText('Nova senha');
    fireEvent.change(input, { target: { value: 'a-new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Não foi possível salvar a senha' })));
    expect(input).toHaveValue('a-new-password');
    expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeEnabled();
    expect(mock.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    await waitFor(() => expect(mock.navigate).toHaveBeenCalledWith('/'));
  });
});
