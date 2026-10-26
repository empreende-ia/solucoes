import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { CalendarError, connectionSignature, type CalendarStatus } from './calendar';

function makeStatus(overrides: Partial<CalendarStatus> = {}): CalendarStatus {
  return {
    provider: 'nylas',
    connected: true,
    status: 'active',
    accountEmail: 'comercial@empresa.com.br',
    grantProvider: 'google',
    calendarId: 'primary',
    syncEnabled: true,
    createMeet: true,
    timeZone: 'America/Sao_Paulo',
    lastSyncedAt: null,
    lastError: null,
    ...overrides,
  };
}

/**
 * O bug que estes testes travam: a tela confirmava a conexão assim que via
 * `connected: true`. Numa reconexão isso já era verdade antes de a janela
 * abrir, então ela dava sucesso dois segundos depois de o usuário clicar.
 */
describe('connectionSignature', () => {
  it('não confunde reconectar com conectar: erro e ativo têm assinaturas diferentes', () => {
    const comErro = makeStatus({ status: 'error' });
    const reconectada = makeStatus({ status: 'active' });
    expect(connectionSignature(comErro)).not.toBe(connectionSignature(reconectada));
  });

  it('muda quando a conta conectada muda', () => {
    const antes = makeStatus({ accountEmail: 'antiga@empresa.com.br' });
    const depois = makeStatus({ accountEmail: 'nova@empresa.com.br' });
    expect(connectionSignature(antes)).not.toBe(connectionSignature(depois));
  });

  it('muda quando o provedor por trás do grant muda', () => {
    expect(connectionSignature(makeStatus({ grantProvider: 'google' })))
      .not.toBe(connectionSignature(makeStatus({ grantProvider: 'microsoft' })));
  });

  it('não muda quando nada relevante mudou', () => {
    expect(connectionSignature(makeStatus({ lastSyncedAt: '2026-08-17T10:00:00Z' })))
      .toBe(connectionSignature(makeStatus({ lastSyncedAt: '2026-08-17T18:00:00Z' })));
  });

  it('é nula enquanto não há conexão', () => {
    expect(connectionSignature(makeStatus({ connected: false }))).toBeNull();
    expect(connectionSignature(null)).toBeNull();
    expect(connectionSignature(undefined)).toBeNull();
  });
});

/**
 * A distinção que estes testes protegem: antes, sessão expirada, falta de
 * permissão, function não publicada e erro de servidor viravam a mesma frase na
 * tela. Só as duas últimas são falha da instalação — e só elas podem virar
 * "a integração não está no ar" em vez de culpar quem está usando.
 */
describe('CalendarError.isStructural', () => {
  it('trata falta de publicação e erro de servidor como falha da instalação', () => {
    expect(new CalendarError('x', 404, null).isStructural).toBe(true);
    expect(new CalendarError('x', 500, null).isStructural).toBe(true);
    expect(new CalendarError('x', 503, null).isStructural).toBe(true);
  });

  it('não trata sessão nem permissão como falha da instalação', () => {
    expect(new CalendarError('x', 401, null).isStructural).toBe(false);
    expect(new CalendarError('x', 403, null).isStructural).toBe(false);
    expect(new CalendarError('x', 400, null).isStructural).toBe(false);
  });

  it('sem status conhecido, não assume falha da instalação', () => {
    expect(new CalendarError('x', null, null).isStructural).toBe(false);
  });

  it('preserva a mensagem crua do backend para o detalhe técnico', () => {
    const error = new CalendarError('Amigável', 500, 'column grant_id does not exist (42703)');
    expect(error.detail).toBe('column grant_id does not exist (42703)');
    expect(error.message).toBe('Amigável');
    expect(error).toBeInstanceOf(Error);
  });
});
