import { describe, expect, it } from 'vitest';

import { redactSensitiveText, redactSensitiveValue } from '../../supabase/functions/_shared/privacy';

describe('redação de dados sensíveis', () => {
  it('remove identificadores pessoais e credenciais do texto', () => {
    const result = redactSensitiveText(
      'Contato ana@empresa.com, +55 (11) 98765-4321, CPF 123.456.789-09 e access_token=segredo.',
    );

    expect(result).not.toContain('ana@empresa.com');
    expect(result).not.toContain('98765-4321');
    expect(result).not.toContain('123.456.789-09');
    expect(result).not.toContain('segredo');
  });

  it('redige campos sensíveis em estruturas sem alterar o objeto original', () => {
    const input = { title: 'Demonstração', customer: { email: 'a@b.com' }, accessToken: 'abc' };
    const result = redactSensitiveValue(input) as Record<string, unknown>;

    expect(result.accessToken).toBe('[dado sensível removido]');
    expect(JSON.stringify(result)).not.toContain('a@b.com');
    expect(input.accessToken).toBe('abc');
  });
});
