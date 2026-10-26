import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DealBoard } from './DealBoard';
import type { Deal, DealStage } from '@/lib/deal-types';
const deal: Deal = { id: 'deal', org_id: 'org', pipeline_id: 'p', stage_id: 'stage-a', title: 'Proposta anual', value: 2500, currency: 'BRL', contact_id: null, company_id: null, owner_id: 'owner', close_date: null, probability: 20, status: 'open', lost_reason: null, stage_entered_at: '2026-09-01', created_at: '2026-09-01', updated_at: '2026-09-01' };
const stages: DealStage[] = [{ id: 'stage-a', org_id: 'org', pipeline_id: 'p', name: 'Etapa renomeada', order: 0, color: null, win_probability: 20 }, { id: 'stage-b', org_id: 'org', pipeline_id: 'p', name: 'Proposta', order: 1, color: null, win_probability: 50 }];

describe('quadro comercial acessível', () => {
  it('agrupa por ID mesmo após renomear etapa e abre o registro correto', () => {
    const open = vi.fn();
    render(<MemoryRouter><DealBoard deals={[deal]} stages={stages} people={[{ id: 'owner', full_name: 'Pessoa responsável' }]} nextActions={new Map()} currency="BRL" canWrite busy={false} onOpen={open} onMove={vi.fn()} /></MemoryRouter>);
    const column = screen.getByRole('region', { name: 'Etapa Etapa renomeada' });
    expect(within(column).getByText('Pessoa responsável')).toBeVisible();
    fireEvent.click(within(column).getByRole('button', { name: deal.title }));
    expect(open).toHaveBeenCalledWith(deal);
    expect(within(screen.getByRole('region', { name: 'Etapa Proposta' })).queryByText(deal.title)).not.toBeInTheDocument();
  });
  it('oferece leitura sem disponibilizar arraste ou movimentação a quem não pode escrever', () => {
    render(<MemoryRouter><DealBoard deals={[deal]} stages={stages} people={[]} nextActions={new Map()} currency="BRL" canWrite={false} busy={false} onOpen={vi.fn()} onMove={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /Arrastar Proposta/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mover ou alterar situação/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: deal.title })).toBeEnabled();
  });
});
