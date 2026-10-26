import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PaymentForm } from './PaymentForm';
import { AutomationForm } from './AutomationForm';
import { TemplateForm } from './TemplateForm';
vi.mock('./data', () => ({ errorMessage: (error: Error) => error.message }));
const references = { contacts: [], companies: [], deals: [], people: [], pipelines: [], stages: [] };

describe('recuperação de falha nos formulários de operação', () => {
  it('mantém descrição/valor de pagamento e não fecha quando o servidor falha', async () => {
    const close = vi.fn(); const save = vi.fn().mockRejectedValue(new Error('Falha ao salvar'));
    render(<PaymentForm references={references} onSave={save} onClose={close} />);
    fireEvent.change(screen.getByLabelText('Descrição *'), { target: { value: 'Parcela inicial' } });
    fireEvent.change(screen.getByLabelText('Valor *'), { target: { value: '1200,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar lançamento' }));
    await screen.findByText('Falha ao salvar');
    expect(screen.getByLabelText('Descrição *')).toHaveValue('Parcela inicial');
    expect(screen.getByLabelText('Valor *')).toHaveValue('1200,50');
    expect(close).not.toHaveBeenCalled();
  });
  it('não ativa automação ao salvar rascunho e mantém configuração após falha', async () => {
    const close = vi.fn(); const save = vi.fn().mockRejectedValue(new Error('Falha ao salvar'));
    render(<AutomationForm onSave={save} onClose={close} />);
    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Primeiro retorno' } });
    fireEvent.change(screen.getByLabelText('Criar uma tarefa com o título *'), { target: { value: 'Retornar ao contato' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await screen.findByText('Falha ao salvar');
    expect(screen.getByLabelText('Nome *')).toHaveValue('Primeiro retorno');
    expect(save).toHaveBeenCalledWith({ name: 'Primeiro retorno', trigger_type: 'deal_created', task_title: 'Retornar ao contato', due_days: '1' });
    expect(close).not.toHaveBeenCalled();
  });
  it('preserva o corpo do modelo após erro de gravação', async () => {
    render(<TemplateForm onSave={vi.fn().mockRejectedValue(new Error('Falha ao salvar'))} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Nome do modelo *'), { target: { value: 'Retorno' } });
    fireEvent.change(screen.getByLabelText('Texto do rascunho *'), { target: { value: 'Olá! Vamos combinar o próximo passo?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar modelo' }));
    await screen.findByText('Falha ao salvar');
    expect(screen.getByLabelText('Texto do rascunho *')).toHaveValue('Olá! Vamos combinar o próximo passo?');
  });
});
