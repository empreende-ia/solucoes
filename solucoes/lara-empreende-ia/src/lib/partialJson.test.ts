import { describe, expect, it } from 'vitest';

import { completePartialJson } from './partialJson';

const FULL = { identity: { agentName: 'Lara', companyName: 'Empreende.IA' }, salesProcess: { stages: [{ name: 'Descoberta' }] }, suggestedFacts: [] };
const FULL_TEXT = JSON.stringify(FULL);

describe('completePartialJson', () => {
  it('parseia JSON completo e devolve null sem chave de abertura', () => {
    expect(completePartialJson(FULL_TEXT)).toEqual(FULL);
    expect(completePartialJson('ainda escrevendo...')).toBeNull();
  });

  it('fecha cortes no meio de string, depois de dois-pontos e depois de vírgula', () => {
    const midString = completePartialJson('{"identity":{"agentName":"Ni') as Record<string, { agentName: string }>;
    expect(midString.identity.agentName).toBe('Ni');

    const afterColon = completePartialJson('{"identity":{"agentName":') as Record<string, { agentName: null }>;
    expect(afterColon.identity.agentName).toBeNull();

    const afterComma = completePartialJson('{"identity":{"agentName":"Lara",') as Record<string, { agentName: string }>;
    expect(afterComma.identity.agentName).toBe('Lara');
  });

  it('apara literais e números truncados', () => {
    const midLiteral = completePartialJson('{"a":{"active":tru') as Record<string, Record<string, unknown>>;
    expect(midLiteral.a).toEqual({ active: null });

    const midNumber = completePartialJson('{"a":12,"b":3.') as Record<string, number>;
    expect(midNumber.a).toBe(12);
  });

  it('fecha arrays aninhados e preserva itens completos', () => {
    const parsed = completePartialJson('{"suggestedFacts":[{"title":"Preço","fact":"R$ 100"},{"title":"Hor') as {
      suggestedFacts: Array<{ title: string }>;
    };
    expect(parsed.suggestedFacts).toHaveLength(2);
    expect(parsed.suggestedFacts[0].title).toBe('Preço');
  });

  it('ignora chaves e colchetes dentro de strings', () => {
    const parsed = completePartialJson('{"body":"use {{1}} e [colchetes] aqui","next":"par') as Record<string, string>;
    expect(parsed.body).toBe('use {{1}} e [colchetes] aqui');
    expect(parsed.next).toBe('par');
  });

  it('progride monotonicamente ao longo de um stream simulado', () => {
    let lastKeys = 0;
    for (let cut = 10; cut <= FULL_TEXT.length; cut += 7) {
      const parsed = completePartialJson(FULL_TEXT.slice(0, cut));
      if (parsed && typeof parsed === 'object') {
        const keys = Object.keys(parsed as object).length;
        expect(keys).toBeGreaterThanOrEqual(lastKeys);
        lastKeys = keys;
      }
    }
    expect(lastKeys).toBe(3);
  });
});
