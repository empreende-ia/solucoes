import { describe, expect, it } from 'vitest';

import { textToTurns, turnsToText, type ScenarioTurn } from './scenarioTurns';

// R12 — abrir e salvar o editor de uma situação de teste não pode mudar a
// conversa: a versão anterior quebrava um turno multi-parágrafo em vários e
// classificava as continuações do agente como falas do lead.
describe('scenarioTurns', () => {
  it('turno com parágrafos sobrevive ao round-trip sem mudar quantidade nem papéis', () => {
    const turns: ScenarioTurn[] = [
      { role: 'user', content: 'Quero saber mais sobre o plano.' },
      { role: 'assistant', content: 'Podemos sim!\n\nQuer agendar quinta às 14h?' },
    ];
    const roundTrip = textToTurns(turnsToText(turns));
    expect(roundTrip).toHaveLength(2);
    expect(roundTrip[1].role).toBe('assistant');
    expect(roundTrip[1].content).toContain('Quer agendar quinta às 14h?');
  });

  it('round-trip é idempotente: serializar de novo dá o mesmo texto', () => {
    const turns: ScenarioTurn[] = [
      { role: 'user', content: 'Oi.' },
      { role: 'assistant', content: 'Olá! Tudo bem?\nComo posso ajudar hoje?' },
      { role: 'user', content: 'Tenho uma dúvida.' },
    ];
    const once = turnsToText(textToTurns(turnsToText(turns)));
    const twice = turnsToText(textToTurns(once));
    expect(twice).toBe(once);
  });

  it('parágrafos separados por linha em branco sobrevivem ao round-trip', () => {
    // A primeira versão da correção descartava linhas em branco: "\n\n" dentro
    // de um turno virava "\n" e a formatação da fala mudava só de abrir e salvar.
    const turns: ScenarioTurn[] = [
      { role: 'assistant', content: 'Primeiro parágrafo.\n\nSegundo parágrafo.' },
    ];
    const roundTrip = textToTurns(turnsToText(turns));
    expect(roundTrip).toHaveLength(1);
    expect(roundTrip[0].content).toBe('Primeiro parágrafo.\n\nSegundo parágrafo.');
  });

  it('linha sem prefixo anexa ao turno anterior, nunca vira lead', () => {
    const parsed = textToTurns('Agente: Primeira linha.\nSegunda linha da mesma fala.');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].role).toBe('assistant');
    expect(parsed[0].content).toBe('Primeira linha.\nSegunda linha da mesma fala.');
  });

  it('prefixos aceitos: Cliente/Lead viram user, Agente/Lara/Assistente viram assistant', () => {
    const parsed = textToTurns('Lead: oi\nLara: olá\nCliente: certo\nAssistente: fechado');
    expect(parsed.map((turn) => turn.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('texto sem nenhum prefixo vira um único turno de lead', () => {
    const parsed = textToTurns('só uma mensagem solta');
    expect(parsed).toEqual([{ role: 'user', content: 'só uma mensagem solta' }]);
  });
});
