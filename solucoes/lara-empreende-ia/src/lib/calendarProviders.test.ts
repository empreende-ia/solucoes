import { describe, expect, it } from 'vitest';

import {
  calendarProviderLabel,
  describeCalendarProvider,
  listCalendarProviders,
} from './calendarProviders';

describe('listCalendarProviders', () => {
  it('mostra só o que a conta Nylas tem habilitado', () => {
    const providers = listCalendarProviders(['google']);
    expect(providers.map((provider) => provider.id)).toEqual(['google']);
  });

  it('mantém a ordem de exibição, não a ordem que o backend mandou', () => {
    const providers = listCalendarProviders(['icloud', 'microsoft', 'google']);
    expect(providers.map((provider) => provider.id)).toEqual(['google', 'microsoft', 'icloud']);
  });

  it('ignora connector que a interface não sabe apresentar', () => {
    // 'imap' e 'virtual-calendar' existem no Nylas mas não são caminhos que
    // oferecemos; um botão para eles levaria a uma tela de erro do Nylas.
    const providers = listCalendarProviders(['google', 'imap', 'virtual-calendar']);
    expect(providers.map((provider) => provider.id)).toEqual(['google']);
  });

  it('aceita identificador em caixa alta', () => {
    expect(listCalendarProviders(['GOOGLE']).map((provider) => provider.id)).toEqual(['google']);
  });

  // Lista vazia faz a tela cair no botão único e deixar a escolha com o Nylas —
  // é o comportamento certo quando não deu para consultar os connectors.
  it('devolve vazio quando o backend não soube informar', () => {
    expect(listCalendarProviders(null)).toEqual([]);
    expect(listCalendarProviders(undefined)).toEqual([]);
    expect(listCalendarProviders([])).toEqual([]);
  });
});

describe('describeCalendarProvider', () => {
  it('sabe qual sala de reunião cada provedor cria', () => {
    expect(describeCalendarProvider('google')?.meetingRoom).toBe('Google Meet');
    expect(describeCalendarProvider('microsoft')?.meetingRoom).toBe('Microsoft Teams');
    expect(describeCalendarProvider('icloud')?.meetingRoom).toBeNull();
  });

  it('marca o iCloud como dependente de senha de app', () => {
    const icloud = describeCalendarProvider('icloud');
    expect(icloud?.appPassword?.steps.length).toBeGreaterThan(0);
    expect(icloud?.appPassword?.helpUrl).toContain('appleid.apple.com');
    expect(describeCalendarProvider('google')?.appPassword).toBeUndefined();
  });

  it('devolve null para provedor ausente ou desconhecido', () => {
    expect(describeCalendarProvider(null)).toBeNull();
    expect(describeCalendarProvider('')).toBeNull();
    expect(describeCalendarProvider('exchange')).toBeNull();
  });
});

describe('calendarProviderLabel', () => {
  it('traduz o identificador do grant para o nome que a pessoa reconhece', () => {
    expect(calendarProviderLabel('microsoft')).toBe('Outlook');
  });

  // Um grant antigo pode apontar para algo fora do catálogo; a tela não pode
  // ficar sem título por causa disso.
  it('cai no rótulo genérico quando não conhece o provedor', () => {
    expect(calendarProviderLabel('exchange')).toBe('Agenda conectada');
    expect(calendarProviderLabel(null)).toBe('Agenda conectada');
  });
});
