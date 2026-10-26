import { describe, expect, it } from 'vitest';

import {
  buildCreatePayload,
  buildSendPayload,
  countBodyVariables,
  extractVariables,
  parseMetaTemplate,
  parseTemplateSendSpec,
  renderTemplateText,
  validateTemplateDraft,
  type TemplateDraft,
} from '../../supabase/functions/_shared/whatsapp-templates';

const validDraft: TemplateDraft = {
  name: 'retomada_diagnostico',
  category: 'UTILITY',
  language: 'pt_BR',
  headerText: 'Continuando nossa conversa',
  bodyText: 'Oi {{1}}! Ficamos de retomar sobre {{2}}. Ainda faz sentido para você?',
  footerText: 'Responda SAIR para não receber follow-ups',
  exampleValues: ['Marina', 'automação do atendimento'],
};

describe('validateTemplateDraft', () => {
  it('aceita um rascunho completo válido', () => {
    expect(validateTemplateDraft(validDraft)).toEqual([]);
  });

  it('aceita corpo sem variáveis e sem exemplos', () => {
    expect(validateTemplateDraft({ ...validDraft, bodyText: 'Podemos falar amanhã?', exampleValues: [] })).toEqual([]);
  });

  it('rejeita nome com maiúsculas, espaço ou vazio', () => {
    expect(validateTemplateDraft({ ...validDraft, name: 'Retomada' }).some((issue) => issue.field === 'name')).toBe(true);
    expect(validateTemplateDraft({ ...validDraft, name: 'retomada diagnostico' }).some((issue) => issue.field === 'name')).toBe(true);
    expect(validateTemplateDraft({ ...validDraft, name: '' }).some((issue) => issue.field === 'name')).toBe(true);
  });

  it('rejeita corpo acima de 1024 caracteres', () => {
    const issues = validateTemplateDraft({ ...validDraft, bodyText: `Olá ${'x'.repeat(1_030)}` });
    expect(issues.some((issue) => issue.field === 'bodyText')).toBe(true);
  });

  it('rejeita variáveis fora de sequência ou malformadas', () => {
    expect(validateTemplateDraft({ ...validDraft, bodyText: 'Oi {{1}}, sobre {{3}} certo?', exampleValues: ['a', 'b'] })
      .some((issue) => issue.field === 'bodyText')).toBe(true);
    expect(validateTemplateDraft({ ...validDraft, bodyText: 'Oi {{nome}}, tudo bem?', exampleValues: [] })
      .some((issue) => issue.field === 'bodyText')).toBe(true);
  });

  it('rejeita corpo começando ou terminando em variável (regra da Meta)', () => {
    expect(validateTemplateDraft({ ...validDraft, bodyText: '{{1}} — tudo bem?', exampleValues: ['Marina'] })
      .some((issue) => issue.message.includes('começar'))).toBe(true);
    expect(validateTemplateDraft({ ...validDraft, bodyText: 'Podemos falar sobre {{1}}', exampleValues: ['isso'] })
      .some((issue) => issue.message.includes('terminar'))).toBe(true);
  });

  it('exige um exemplo não vazio por variável', () => {
    expect(validateTemplateDraft({ ...validDraft, exampleValues: ['Marina'] }).some((issue) => issue.field === 'exampleValues')).toBe(true);
    expect(validateTemplateDraft({ ...validDraft, exampleValues: ['Marina', '  '] }).some((issue) => issue.field === 'exampleValues')).toBe(true);
  });

  it('rejeita variáveis em cabeçalho e rodapé', () => {
    expect(validateTemplateDraft({ ...validDraft, headerText: 'Oi {{1}}' }).some((issue) => issue.field === 'headerText')).toBe(true);
    expect(validateTemplateDraft({ ...validDraft, footerText: 'Até {{1}}' }).some((issue) => issue.field === 'footerText')).toBe(true);
  });
});

describe('extractVariables e countBodyVariables', () => {
  it('extrai números na ordem, contando distintas', () => {
    expect(extractVariables('a {{2}} b {{1}} c {{2}}')).toEqual([2, 1, 2]);
    expect(countBodyVariables('a {{2}} b {{1}} c {{2}}')).toBe(2);
    expect(countBodyVariables('sem variável')).toBe(0);
  });

  it('ignora variáveis malformadas', () => {
    expect(extractVariables('{{0}} {{-1}} {{x}} {{1.5}}')).toEqual([]);
  });
});

describe('buildCreatePayload', () => {
  it('monta componentes com header, body com exemplos e footer', () => {
    expect(buildCreatePayload(validDraft)).toEqual({
      name: 'retomada_diagnostico',
      language: 'pt_BR',
      category: 'UTILITY',
      allow_category_change: true,
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Continuando nossa conversa' },
        {
          type: 'BODY',
          text: 'Oi {{1}}! Ficamos de retomar sobre {{2}}. Ainda faz sentido para você?',
          example: { body_text: [['Marina', 'automação do atendimento']] },
        },
        { type: 'FOOTER', text: 'Responda SAIR para não receber follow-ups' },
      ],
    });
  });

  it('omite header, footer e example quando não usados', () => {
    const payload = buildCreatePayload({ ...validDraft, headerText: '', footerText: '', bodyText: 'Sem variáveis aqui.', exampleValues: [] });
    expect(payload.components).toEqual([{ type: 'BODY', text: 'Sem variáveis aqui.' }]);
  });

  it('sanitiza quebras de linha e tabs nos exemplos (a Cloud API rejeita)', () => {
    const payload = buildCreatePayload({ ...validDraft, exampleValues: ['Ma\nrina', 'automação\tdo atendimento'] });
    const body = (payload.components as Array<Record<string, unknown>>).find((component) => component.type === 'BODY')!;
    expect(body.example).toEqual({ body_text: [['Ma rina', 'automação do atendimento']] });
  });
});

describe('buildSendPayload', () => {
  it('inclui parâmetros do corpo quando existem', () => {
    expect(buildSendPayload({ name: 'retomada', language: 'pt_BR', bodyParams: ['Marina', 'automação'] })).toEqual({
      name: 'retomada',
      language: { code: 'pt_BR' },
      components: [{
        type: 'body',
        parameters: [{ type: 'text', text: 'Marina' }, { type: 'text', text: 'automação' }],
      }],
    });
  });

  it('omite components sem parâmetros', () => {
    expect(buildSendPayload({ name: 'retomada', language: 'pt_BR', bodyParams: [] })).toEqual({
      name: 'retomada',
      language: { code: 'pt_BR' },
    });
  });

  it('sanitiza parâmetros com quebra de linha, tab e espaços em sequência', () => {
    const payload = buildSendPayload({ name: 'retomada', language: 'pt_BR', bodyParams: ['Ma\nrina', 'muitos     espaços'] });
    const components = payload.components as Array<{ parameters: Array<{ text: string }> }>;
    expect(components[0].parameters.map((parameter) => parameter.text)).toEqual(['Ma rina', 'muitos   espaços']);
  });
});

describe('parseTemplateSendSpec', () => {
  it('lê a especificação válida de metadata.template', () => {
    expect(parseTemplateSendSpec({ template: { name: 'retomada', language: 'pt_BR', bodyParams: ['Marina'] } }))
      .toEqual({ name: 'retomada', language: 'pt_BR', bodyParams: ['Marina'] });
  });

  it('aceita bodyParams ausente como lista vazia', () => {
    expect(parseTemplateSendSpec({ template: { name: 'retomada', language: 'en_US' } }))
      .toEqual({ name: 'retomada', language: 'en_US', bodyParams: [] });
  });

  it('devolve null para formas inválidas', () => {
    expect(parseTemplateSendSpec(null)).toBeNull();
    expect(parseTemplateSendSpec({})).toBeNull();
    expect(parseTemplateSendSpec({ template: { name: 'Nome Ruim', language: 'pt_BR' } })).toBeNull();
    expect(parseTemplateSendSpec({ template: { name: 'ok', language: 'português' } })).toBeNull();
    expect(parseTemplateSendSpec({ template: { name: 'ok', language: 'pt_BR', bodyParams: [1] } })).toBeNull();
  });
});

describe('renderTemplateText', () => {
  it('substitui variáveis pelos valores', () => {
    expect(renderTemplateText('Oi {{1}}, sobre {{2}}?', ['Marina', 'preço'])).toBe('Oi Marina, sobre preço?');
  });

  it('preserva a variável sem valor correspondente', () => {
    expect(renderTemplateText('Oi {{1}}, sobre {{2}}?', ['Marina'])).toBe('Oi Marina, sobre {{2}}?');
  });
});

describe('parseMetaTemplate', () => {
  it('normaliza um template da Graph API', () => {
    expect(parseMetaTemplate({
      id: '123',
      name: 'retomada',
      status: 'APPROVED',
      category: 'UTILITY',
      language: 'pt_BR',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Cabeçalho' },
        { type: 'BODY', text: 'Corpo {{1}}' },
        { type: 'FOOTER', text: 'Rodapé' },
      ],
    })).toEqual({
      id: '123',
      name: 'retomada',
      status: 'APPROVED',
      category: 'UTILITY',
      language: 'pt_BR',
      bodyText: 'Corpo {{1}}',
      headerText: 'Cabeçalho',
      footerText: 'Rodapé',
      rejectedReason: null,
    });
  });

  it('tolera campos ausentes e rejeita formas sem nome', () => {
    const parsed = parseMetaTemplate({ name: 'minimo' });
    expect(parsed?.status).toBe('UNKNOWN');
    expect(parsed?.bodyText).toBe('');
    expect(parseMetaTemplate({})).toBeNull();
    expect(parseMetaTemplate(null)).toBeNull();
  });

  // A Graph API devolve a string literal 'NONE' para templates nunca rejeitados;
  // sem este tratamento, todo template aprovado mostraria motivo de rejeição.
  it("trata rejected_reason 'NONE' como ausência de motivo", () => {
    expect(parseMetaTemplate({ name: 'aprovado', rejected_reason: 'NONE' })?.rejectedReason).toBeNull();
    expect(parseMetaTemplate({ name: 'rejeitado', rejected_reason: 'INVALID_FORMAT' })?.rejectedReason).toBe('INVALID_FORMAT');
  });
});
