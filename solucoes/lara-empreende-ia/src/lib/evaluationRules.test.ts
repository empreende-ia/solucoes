import { describe, expect, it } from 'vitest';

import { resolveRule } from './evaluationRules';

describe('resolveRule', () => {
  it('aponta a regra de comunicação para a seção de vendas', () => {
    const rule = resolveRule('salesProcess.communication.oneQuestionAtATime');
    expect(rule).toEqual({
      kind: 'config',
      label: 'Comunicação · Uma pergunta por vez',
      section: 'sales',
    });
  });

  it('lê o limite embutido no tamanho máximo de mensagem', () => {
    const rule = resolveRule('salesProcess.communication.maximumMessageLength:800');
    expect(rule).toMatchObject({ kind: 'config', section: 'sales' });
    expect(rule && 'label' in rule && rule.label).toContain('800 caracteres');
  });

  it('não quebra quando o limite não é numérico', () => {
    const rule = resolveRule('salesProcess.communication.maximumMessageLength:abc');
    expect(rule).toEqual({
      kind: 'config',
      label: 'Comunicação · Tamanho máximo da mensagem',
      section: 'sales',
    });
  });

  it('leva qualquer fato da base para a seção de conhecimento', () => {
    const rule = resolveRule('knowledge_facts.6c1f9e2a-0d3b-4a71-9f2e-8b5d7c4e1a90');
    expect(rule).toMatchObject({ kind: 'config', section: 'knowledge' });
  });

  // Regra da plataforma não tem campo para abrir: a interface precisa saber disso
  // para mostrar a explicação no lugar de um botão que não leva a lugar nenhum.
  it('marca as proteções fixas como não configuráveis', () => {
    for (const key of [
      'platform_rules.no_fabrication',
      'platform_rules.no_internal_prompt_disclosure',
      'platform_rules.respect_opt_out',
    ]) {
      const rule = resolveRule(key);
      expect(rule?.kind).toBe('platform');
      expect(rule && 'hint' in rule && rule.hint).toBeTruthy();
    }
  });

  // Se o backend passar a gerar um source_rule novo, é melhor não mostrar faixa
  // nenhuma do que inventar um rótulo ou oferecer um destino errado.
  it('devolve null para regra desconhecida, vazia ou ausente', () => {
    expect(resolveRule('algo.que.ainda.nao.existe')).toBeNull();
    expect(resolveRule('')).toBeNull();
    expect(resolveRule(null)).toBeNull();
    expect(resolveRule(undefined)).toBeNull();
  });
});
