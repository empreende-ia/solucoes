import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { createDefaultAgentConfig } from '@/domain/agent-config';
import { applyAgentSetupProposal, type AgentSetupProposal } from './agent-setup';

const proposal: AgentSetupProposal = {
  identity: {
    agentName: 'Lia', role: 'Consultora', companyName: 'Acme', companyDescription: 'Serviços B2B',
    whatCompanySells: 'Consultoria', primaryAudience: 'Pequenas empresas', introduction: 'Olá',
    website: 'https://acme.example', segment: 'Consultoria', serviceMode: 'remote',
    serviceRegions: ['Brasil'], differentiators: ['Implantação acompanhada'], excludedProfiles: [],
    primaryGoals: ['qualify_and_schedule'],
    offerings: [{ name: 'Diagnóstico', summary: 'Análise inicial', audience: 'Gestores', problemSolved: 'Falta de processo', relatedLink: '', active: true }],
  },
  salesProcess: {
    model: 'qualification_and_scheduling', desiredOutcomes: ['schedule_meeting'],
    stages: [{ name: 'Descoberta', objective: 'Entender a necessidade', active: true }],
    qualificationFields: [{ name: 'Dor principal', description: 'Problema prioritário', dataType: 'text', priority: 'required', captureRule: 'Perguntar se ainda desconhecido', crmSource: '', options: [] }],
    positiveCriteria: ['Dor clara'], negativeCriteria: [],
    communication: { formality: 'balanced', emojiUsage: 'light', idealMessageLength: 240, maximumMessageLength: 600, oneQuestionAtATime: true, answerDirectQuestionsFirst: true, useLeadName: true },
  },
  customInstructions: 'Evite jargão.',
  suggestedFacts: [], missingInformation: [], assumptions: [], sources: [],
};

describe('configuração assistida', () => {
  it('aplica apenas blocos confirmados e cria identificadores estruturados', () => {
    const current = createDefaultAgentConfig({ agentName: 'Lara', companyName: 'Original' });
    current.identity.socialProof = [{ id: crypto.randomUUID(), claim: 'Prova existente', source: 'Fonte', approved: true }];

    const result = applyAgentSetupProposal(current, proposal, {
      identity: true,
      sales: true,
      behavior: false,
    });

    expect(result.identity.companyName).toBe('Acme');
    expect(result.identity.offerings[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.identity.socialProof[0].claim).toBe('Prova existente');
    expect(result.salesProcess.stages[0].order).toBe(0);
    expect(result.salesProcess.qualificationFields[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.customInstructions).toBe('');
  });

  it('mantém os blocos atuais quando a pessoa adia ou rejeita a proposta', () => {
    const current = createDefaultAgentConfig({ agentName: 'Lara', companyName: 'Original' });
    const result = applyAgentSetupProposal(current, proposal, {
      identity: false,
      sales: false,
      behavior: false,
    });

    expect(result.identity.companyName).toBe('Original');
    expect(result.salesProcess.model).toBe('consultative');
    expect(result.customInstructions).toBe('');
  });
});
