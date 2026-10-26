import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { ProductTourProvider, TourHelpCatalog, TourLauncher } from './ProductTourProvider';
import { readTourPreferences, tourStorageKey, writeTourPreferences, emptyTourPreferences } from './tour-state';
import { clippedTourRect, findTourTarget } from './tour-dom';
import type { TourScope } from './types';

let sequence = 0;
let scope: TourScope;
const bounds = { x: 0, y: 0, top: 100, left: 20, right: 500, bottom: 180, width: 480, height: 80, toJSON: () => ({}) };

beforeEach(() => {
  scope = { userId: `tour-test-${++sequence}`, orgId: 'test-org' };
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () {
    return (this.hidden ? [] : [bounds]) as unknown as DOMRectList;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(bounds);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Navigation() {
  const navigate = useNavigate();
  return <button data-testid="navigate" onClick={() => navigate('/tasks')}>Outra tela</button>;
}

function Harness({ activeScope = scope, blocked = false, hideSearch = false, showTargets = true, extraDialog = false, showHelp = false }: {
  activeScope?: TourScope | null; blocked?: boolean; hideSearch?: boolean; showTargets?: boolean; extraDialog?: boolean; showHelp?: boolean;
}) {
  return <MemoryRouter initialEntries={['/contacts']}><ProductTourProvider scope={activeScope} blocked={blocked}>
    <Navigation /><TourLauncher />
    <main data-product-tour="contacts"><h1>Contatos</h1>
      {showTargets && <><input hidden={hideSearch} data-tour="contacts-search" aria-label="Buscar contatos" /><div data-tour="contacts-filters">Filtros</div><button data-tour="contacts-create" onClick={() => { throw new Error('Tours must never click targets'); }}>Criar contato</button></>}
    </main>
    {extraDialog && <div role="dialog" aria-label="Formulário externo">Formulário</div>}
    {showHelp && <TourHelpCatalog />}
  </ProductTourProvider></MemoryRouter>;
}

async function startTour() {
  const launcher = await screen.findByRole('button', { name: 'Conhecer esta tela' });
  await waitFor(() => expect(launcher).toBeEnabled());
  launcher.focus();
  fireEvent.click(launcher);
  await screen.findByRole('dialog', { name: 'Encontre a pessoa certa' });
  return launcher;
}

describe('tour lifecycle in the actual Radix dialog', () => {
  it('offers a quiet invitation and does not automatically open by default', async () => {
    render(<Harness />);
    const launcher = await screen.findByRole('button', { name: 'Conhecer esta tela' });
    await waitFor(() => expect(launcher).toBeEnabled());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1300)); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(launcher);
  });

  it('pauses on Esc, returns focus, and continues by saved step without executing a target', async () => {
    render(<Harness />);
    const launcher = await startTour();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Encontre a pessoa certa' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    await screen.findByRole('dialog', { name: 'Reduza a lista com filtros' });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(launcher).toHaveFocus());
    expect(readTourPreferences(tourStorageKey(scope)).visits.contacts).toEqual({ version: 1, status: 'paused', stepId: 'contacts-filters' });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar tour' }));
    await screen.findByRole('dialog', { name: 'Reduza a lista com filtros' });
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    await screen.findByRole('dialog', { name: 'Cadastre com contexto' });
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(readTourPreferences(tourStorageKey(scope)).visits.contacts.status).toBe('completed');
    expect(screen.getByRole('button', { name: 'Tour desta tela' })).toBeEnabled();
  });

  it('treats X as pause, offers restart, and treats skipping as dismissal', async () => {
    render(<Harness />);
    await startTour();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pausar tour' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Recomeçar tour' }));
    await screen.findByRole('dialog', { name: 'Encontre a pessoa certa' });
    fireEvent.click(screen.getByRole('button', { name: 'Pular tour' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(readTourPreferences(tourStorageKey(scope)).visits.contacts.status).toBe('dismissed');
    expect(screen.getByRole('button', { name: 'Tour desta tela' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Recomeçar tour' })).not.toBeInTheDocument();
  });

  it('saves the current step across reload and ignores hidden steps when resuming', async () => {
    const first = render(<Harness />);
    await startTour();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    await screen.findByRole('dialog', { name: 'Reduza a lista com filtros' });
    first.unmount();
    render(<Harness hideSearch />);
    const launcher = await screen.findByRole('button', { name: 'Continuar tour' });
    await waitFor(() => expect(launcher).toBeEnabled());
    fireEvent.click(launcher);
    await screen.findByRole('dialog', { name: 'Reduza a lista com filtros' });
    expect(screen.getByText('Passo 1 de 2')).toBeInTheDocument();
  });

  it('pauses on navigation and leaves no delayed request that could reopen a different route', async () => {
    render(<Harness />);
    await startTour();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    fireEvent.click(screen.getByTestId('navigate'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(readTourPreferences(tourStorageKey(scope)).visits.contacts).toMatchObject({ status: 'paused', stepId: 'contacts-filters' });
  });

  it('isolates a scope change and sign-out synchronously without copying progress', async () => {
    const result = render(<Harness />);
    await startTour();
    const otherScope = { ...scope, orgId: 'other-org' };
    result.rerender(<Harness activeScope={otherScope} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const launcher = await screen.findByRole('button', { name: 'Conhecer esta tela' });
    await waitFor(() => expect(launcher).toBeEnabled());
    expect(readTourPreferences(tourStorageKey(otherScope)).visits).toEqual({});
    result.rerender(<Harness activeScope={null} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Entre em uma organização/ })).toBeDisabled());
  });

  it('defers to onboarding and external dialogs, and pauses when a form opens', async () => {
    const result = render(<Harness blocked />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Feche o formulário/ })).toBeDisabled());
    result.rerender(<Harness extraDialog />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Feche o formulário/ })).toBeDisabled());
    result.rerender(<Harness />);
    await startTour();
    result.rerender(<Harness extraDialog />);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Encontre a pessoa certa' })).not.toBeInTheDocument());
    expect(readTourPreferences(tourStorageKey(scope)).visits.contacts.status).toBe('paused');
    expect(screen.getByRole('dialog', { name: 'Formulário externo' })).toBeInTheDocument();
  });

  it('explains missing targets and never renders an empty mask without anchors', async () => {
    const result = render(<Harness showTargets={false} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /recursos desta tela estiverem visíveis/ })).toBeDisabled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    result.rerender(<Harness />);
    await startTour();
    result.rerender(<Harness hideSearch />);
    await screen.findByRole('dialog', { name: 'Este item mudou de lugar' });
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    await screen.findByRole('dialog', { name: 'Reduza a lista com filtros' });
  });

  it('never interrupts a focused text field with automatic guidance', async () => {
    writeTourPreferences(tourStorageKey(scope), { ...emptyTourPreferences(), automatic: true });
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: 'Buscar contatos' });
    input.focus();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1400)); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('provides eight replay destinations and saves the invitation preference independently', async () => {
    render(<Harness showHelp />);
    expect(screen.getAllByRole('button', { name: /^Abrir tela:/ })).toHaveLength(8);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar convites discretos nas telas novas' }));
    expect(readTourPreferences(tourStorageKey(scope)).invitations).toBe(false);
    expect(readTourPreferences(tourStorageKey(scope)).automatic).toBe(false);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tour desta tela' })).toBeEnabled());
  });
});

describe('target and spotlight geometry', () => {
  it('ignores hidden targets and catches invalid selectors', () => {
    render(<div><button data-tour="a" hidden>Hidden</button><button data-tour="a">Visible</button></div>);
    expect(findTourTarget('[data-tour="a"]')?.textContent).toBe('Visible');
    expect(findTourTarget('[')).toBeNull();
  });

  it('clips the spotlight to the actual scroll container', () => {
    render(<div data-testid="scroll" style={{ overflowX: 'hidden', overflowY: 'auto' }}><div data-testid="target">Card</div></div>);
    const parent = screen.getByTestId('scroll');
    vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue({ ...bounds, top: 120, bottom: 150, left: 50, right: 200, width: 150, height: 30 });
    expect(clippedTourRect(screen.getByTestId('target'))).toEqual({ top: 120, left: 50, width: 150, height: 30 });
  });
});
