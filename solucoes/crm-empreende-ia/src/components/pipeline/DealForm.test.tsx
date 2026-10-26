import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DealForm } from './DealForm';
vi.mock('./data', () => ({ errorMessage: (error: Error) => error.message }));
const pipeline = { id: 'p', org_id: 'org', name: 'Comercial', currency: 'BRL', is_default: true };
const stages = [{ id: 's', org_id: 'org', pipeline_id: 'p', name: 'Proposta', order: 0, win_probability: 50, color: null }];

describe('formulário de oportunidade', () => {
  it('preserva os campos em falha de gravação e permite tentar novamente', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Falha de conexão')).mockResolvedValueOnce(undefined);
    const close = vi.fn();
    render(<DealForm pipeline={pipeline} stages={stages} contacts={[]} companies={[]} people={[]} onSave={save} onClose={close} />);
    fireEvent.change(screen.getByLabelText(/Nome da oportunidade/), { target: { value: 'Contrato anual' } });
    fireEvent.change(screen.getByLabelText(/Valor \(BRL\)/), { target: { value: '1250,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    await screen.findByText('Falha de conexão');
    expect(screen.getByLabelText(/Nome da oportunidade/)).toHaveValue('Contrato anual');
    expect(screen.getByLabelText(/Valor \(BRL\)/)).toHaveValue('1250,50');
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('não grava um valor inválido e explica o campo que precisa ser corrigido', async () => {
    const save = vi.fn();
    render(<DealForm pipeline={pipeline} stages={stages} contacts={[]} companies={[]} people={[]} onSave={save} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Nome da oportunidade/), { target: { value: 'Contrato anual' } });
    fireEvent.change(screen.getByLabelText(/Valor \(BRL\)/), { target: { value: '-99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar oportunidade' }));
    expect(await screen.findByText(/Informe um valor positivo ou zero/)).toBeVisible();
    expect(save).not.toHaveBeenCalled();
  });
});
