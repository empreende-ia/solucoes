import { describe, expect, it } from 'vitest';

import { chunkContent, parseFaqPairs } from '@/domain/knowledge';

describe('knowledge ingestion helpers', () => {
  it('divide prosa em trechos pesquisáveis dentro do limite', () => {
    const content = [
      'Primeiro parágrafo com uma informação comercial importante.',
      'Segundo parágrafo com detalhes complementares para a resposta.',
      'Terceiro parágrafo que deve continuar legível depois da divisão.',
    ].join('\n\n');

    const chunks = chunkContent(content, 100);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
    expect(chunks.join(' ')).toContain('informação comercial importante');
  });

  it('quebra conteúdo sem pontuação com sobreposição segura', () => {
    const chunks = chunkContent('a'.repeat(260), 100);

    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
    expect(chunks[0].slice(-12)).toBe(chunks[1].slice(0, 12));
  });

  it('indexa FAQ pela pergunta e preserva a orientação completa', () => {
    const pairs = parseFaqPairs(`
Pergunta: Posso parcelar o plano?
Resposta: Sim. O parcelamento aprovado está descrito na tabela comercial.

Como funciona o suporte?
O suporte acontece nos canais informados no contrato.
Não prometa prazo diferente.
    `);

    expect(pairs).toEqual([
      {
        question: 'Posso parcelar o plano?',
        answer: 'Sim. O parcelamento aprovado está descrito na tabela comercial.',
      },
      {
        question: 'Como funciona o suporte?',
        answer: 'O suporte acontece nos canais informados no contrato.\nNão prometa prazo diferente.',
      },
    ]);
  });
});
