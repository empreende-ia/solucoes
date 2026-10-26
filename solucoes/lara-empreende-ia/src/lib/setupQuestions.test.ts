import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { ANSWERABLE_FIELDS, resolveAnswerableField } from './setupQuestions';
import { applyAgentSetupProposal, type AgentSetupProposal } from '@/services/agent-setup';
import { createDefaultAgentConfig, parseAgentConfig } from '@/domain/agent-config';

const proposal = {
  identity: {
    agentName: 'Lara', role: 'Assistente', companyName: 'HG', companyDescription: '',
    whatCompanySells: '', primaryAudience: '', introduction: '', website: '', segment: '',
    serviceMode: 'remote', serviceRegions: [], differentiators: [], excludedProfiles: [],
    primaryGoals: ['qualify_and_schedule'], offerings: [],
  },
  salesProcess: {
    model: 'consultative', desiredOutcomes: [], stages: [], qualificationFields: [],
    positiveCriteria: [], negativeCriteria: [],
    communication: {
      formality: 'balanced', emojiUsage: 'none', idealMessageLength: 320,
      maximumMessageLength: 800, oneQuestionAtATime: true, answerDirectQuestionsFirst: true, useLeadName: true,
    },
  },
  customInstructions: '',
  suggestedFacts: [],
  missingInformation: [],
  assumptions: [],
  sources: [],
} as unknown as AgentSetupProposal;

describe('resolveAnswerableField', () => {
  it('grava texto no campo apontado sem tocar no resto', () => {
    const target = resolveAnswerableField('identity.primaryAudience');
    const next = target!.apply(proposal, '  Donos de agência  ');
    expect(next.identity.primaryAudience).toBe('Donos de agência');
    expect(next.identity.companyName).toBe('HG');
    expect(next.salesProcess.model).toBe('consultative');
  });

  it('quebra lista por linha e descarta linha vazia', () => {
    const target = resolveAnswerableField('identity.differentiators');
    const next = target!.apply(proposal, 'Implantação acompanhada\n\n  Comunidade ativa  \n');
    expect(next.identity.differentiators).toEqual(['Implantação acompanhada', 'Comunidade ativa']);
  });

  it('oferece escolha fixa para o objetivo de vendas', () => {
    const target = resolveAnswerableField('salesProcess.model');
    expect(target?.kind).toBe('choice');
    expect(target?.options?.map((option) => option.value)).toContain('qualification_and_scheduling');
    expect(target!.apply(proposal, 'direct_sale').salesProcess.model).toBe('direct_sale');
  });

  it('não muta a proposta original', () => {
    const target = resolveAnswerableField('identity.companyDescription');
    target!.apply(proposal, 'Consultoria de IA');
    expect(proposal.identity.companyDescription).toBe('');
  });

  // O modelo pode devolver um identificador fora da lista. Sem campo conhecido a
  // interface não abre caixa — melhor não responder do que gravar no lugar errado.
  it('devolve null para campo desconhecido, "outro" ou ausente', () => {
    expect(resolveAnswerableField('outro')).toBeNull();
    expect(resolveAnswerableField('identity.inventado')).toBeNull();
    expect(resolveAnswerableField('')).toBeNull();
    expect(resolveAnswerableField(null)).toBeNull();
  });

  it('resultados desejados só aceita valores do enum, nunca texto livre', () => {
    const target = resolveAnswerableField('salesProcess.desiredOutcomes');
    expect(target?.kind).toBe('multichoice');
    const next = target!.apply(proposal, 'schedule_meeting\nAgendar reunião de diagnóstico\nresolve_question');
    expect(next.salesProcess.desiredOutcomes).toEqual(['schedule_meeting', 'resolve_question']);
  });
});

// Toda resposta pendente termina em applyAgentSetupProposal → parseAgentConfig.
// Se algum campo aceitar um valor que o schema rejeita, o "Aplicar ao rascunho"
// quebra e a pessoa perde a revisão inteira — este contrato bloqueia a regressão.
describe('ANSWERABLE_FIELDS mantém a proposta aplicável', () => {
  const sampleFor = (field: string, kind: string, options?: Array<{ value: string }>): string => {
    if (kind === 'choice') return options?.[0]?.value ?? '';
    if (kind === 'multichoice') return (options ?? []).map((option) => option.value).join('\n');
    if (kind === 'list') return 'Primeira linha\nSegunda linha';
    return `Resposta de exemplo para ${field}`;
  };

  for (const [field, target] of Object.entries(ANSWERABLE_FIELDS)) {
    it(`"${field}" produz configuração válida após aplicar`, () => {
      const answered = target.apply(proposal, sampleFor(field, target.kind, target.options));
      const config = applyAgentSetupProposal(createDefaultAgentConfig(), answered, {
        identity: true,
        sales: true,
        behavior: true,
      });
      expect(() => parseAgentConfig(config)).not.toThrow();
    });
  }
});
