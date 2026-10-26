import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useState } from 'react';
import type { SetupEvidence } from './setup-state';

const fixture = vi.hoisted(() => ({
  userId: 'setup-user', orgId: 'setup-org',
  evidence: { identity: 'pending', pipeline: 'pending', contact: 'pending', opportunity: 'pending', activity: 'pending' } as SetupEvidence,
  refresh: vi.fn(async () => ({})),
  canManage: true, canWrite: true,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: fixture.userId }, profile: { org_id: fixture.orgId } }) }));
vi.mock('@/hooks/useCrmOnboarding', () => ({ useCrmOnboarding: () => ({
  evidence: fixture.evidence, loading: false, refreshing: false,
  hasError: Object.values(fixture.evidence).some((status) => status === 'error'),
  completed: Object.values(fixture.evidence).filter((status) => status === 'done').length,
  refresh: fixture.refresh,
}) }));
vi.mock('@/hooks/useCrmPermissions', () => ({ useCrmPermissions: () => ({ canManage: fixture.canManage, canWrite: fixture.canWrite, loading: false, error: null }) }));

import { CrmOnboardingProvider } from './CrmOnboardingProvider';
import { CrmSetupChecklist } from './CrmSetupChecklist';
import { useOnboardingGuide } from './CrmOnboardingContext';
import { setupGuideKey } from './setup-state';
import { HelpCenter } from '@/components/help/HelpCenter';
import { PageScaffold } from '@/components/shell/PageScaffold';
import { ShellContext } from '@/components/shell/ShellContext';

let counter = 0;
const bounds = { x: 20, y: 60, top: 60, left: 20, right: 300, bottom: 140, width: 280, height: 80, toJSON: () => ({}) };
beforeEach(() => {
  fixture.userId = `setup-user-${++counter}`; fixture.orgId = 'setup-org'; fixture.canManage = true; fixture.canWrite = true;
  fixture.evidence = { identity: 'pending', pipeline: 'pending', contact: 'pending', opportunity: 'pending', activity: 'pending' };
  fixture.refresh.mockClear();
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([bounds] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(bounds);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Content({ help = false }: { help?: boolean }) {
  const setup = useOnboardingGuide();
  const location = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  return <>
    <output data-testid="route">{location.pathname}{location.search}</output>
    <button onClick={() => setup?.openGuide()}>Abrir configuração</button>
    {help ? <><button onClick={() => setHelpOpen(true)}>Abrir ajuda</button><HelpCenter open={helpOpen} onOpenChange={setHelpOpen} /></> : <CrmSetupChecklist />}
    <div data-product-tour="contacts"><PageScaffold title="Contatos"><div data-tour="contacts-list">Lista de contatos</div><button data-tour="contacts-create">Novo contato da página</button></PageScaffold></div>
  </>;
}
function Harness({ help = false, onSearch = () => {} }: { help?: boolean; onSearch?: () => void }) {
  return <MemoryRouter initialEntries={['/contacts']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ShellContext.Provider value={{ openSearch: onSearch }}><CrmOnboardingProvider><Content help={help} /></CrmOnboardingProvider></ShellContext.Provider></MemoryRouter>;
}

describe('configuration, Help and shell integration', () => {
  it('never forces setup open and never counts navigation through the guide as configured data', async () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('0 de 5 etapas verificadas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuração' }));
    const dialog = await screen.findByRole('dialog', { name: 'Configurar CRM' });
    expect(within(dialog).getByRole('heading', { name: 'Configurar CRM' })).toHaveFocus();
    for (let i = 0; i < 4; i++) fireEvent.click(within(dialog).getByRole('button', { name: 'Próxima etapa' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar ao CRM' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('0 de 5 etapas verificadas')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(setupGuideKey(fixture.orgId, fixture.userId))!)).toEqual({ version: 1, stepId: 'activity' });
  });

  it('pauses with Esc and resumes after remount, without moving progress between organizations', async () => {
    const first = render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Abrir configuração' }); opener.focus(); fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Configurar CRM' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Etapa 3:/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    first.unmount();
    const second = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuração' }));
    await screen.findByRole('heading', { name: 'Cadastre seu primeiro contato' });
    fixture.orgId = 'different-org';
    second.rerender(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuração' }));
    await screen.findByRole('heading', { name: 'Identifique sua organização e seu perfil' });
  });

  it('updates the single checklist from real evidence and exposes query errors', () => {
    const result = render(<Harness />);
    fixture.evidence = { identity: 'done', pipeline: 'done', contact: 'done', opportunity: 'pending', activity: 'error' };
    result.rerender(<Harness />);
    expect(screen.getByText('3 de 5 etapas verificadas')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Algumas etapas não puderam ser consultadas');
    expect(screen.getByText('Não foi possível verificar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Verificar novamente' }));
    expect(fixture.refresh).toHaveBeenCalledOnce();
  });

  it('opens real settings without creating records and respects pipeline management access', async () => {
    fixture.canManage = false;
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuração' }));
    const dialog = await screen.findByRole('dialog', { name: 'Configurar CRM' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Etapa 2:/ }));
    expect(within(dialog).getByRole('button', { name: 'Configurar pipeline' })).toBeDisabled();
    expect(within(dialog).getByText(/exige um administrador/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Etapa 1:/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abrir meu perfil' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('route')).toHaveTextContent('/settings?tab=profile');
  });

  it('opens setup from Help while closing Help, and contains the eight guide destinations', async () => {
    render(<Harness help />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ajuda' }));
    const help = await screen.findByRole('dialog', { name: 'Ajuda do CRM' });
    expect(within(help).getAllByRole('button', { name: /^Abrir tela:/ })).toHaveLength(8);
    fireEvent.click(within(help).getByRole('button', { name: 'Configurar CRM' }));
    await screen.findByRole('dialog', { name: 'Configurar CRM' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ajuda do CRM' })).not.toBeInTheDocument());
    expect(document.querySelector('.product-tour-card')).toBeNull();
  });

  it('closes Help before navigating to a tour destination and makes no automatic tour request', async () => {
    render(<Harness help />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ajuda' }));
    const help = await screen.findByRole('dialog', { name: 'Ajuda do CRM' });
    fireEvent.click(within(help).getByRole('button', { name: 'Abrir tela: Pipeline comercial' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('route')).toHaveTextContent('/pipeline');
    expect(document.querySelector('.product-tour-card')).toBeNull();
  });

  it('provides shell search and the Copilot event without mounting legacy notification/insight queries', () => {
    const search = vi.fn(), copilot = vi.fn();
    window.addEventListener('empreende-crm:open-copilot', copilot);
    render(<Harness onSearch={search} />);
    fireEvent.click(screen.getByRole('button', { name: /Buscar no CRM/ }));
    expect(search).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Copiloto' }));
    expect(copilot).toHaveBeenCalledOnce();
    window.removeEventListener('empreende-crm:open-copilot', copilot);
  });

  it('responds to Settings manual event and pauses an active tour first', async () => {
    render(<Harness />);
    const launcher = await screen.findByRole('button', { name: 'Conhecer esta tela' });
    await waitFor(() => expect(launcher).toBeEnabled());
    fireEvent.click(launcher);
    await screen.findByRole('dialog', { name: 'Abra o relacionamento completo' });
    act(() => { window.dispatchEvent(new Event('empreende-crm:open-onboarding')); });
    await screen.findByRole('dialog', { name: 'Configurar CRM' });
    expect(screen.queryByRole('dialog', { name: 'Abra o relacionamento completo' })).not.toBeInTheDocument();
  });
});
