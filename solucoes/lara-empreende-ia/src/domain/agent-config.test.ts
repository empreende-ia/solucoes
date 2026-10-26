import { describe, expect, it } from 'vitest';

import {
  agentConfigSchema,
  createDefaultAgentConfig,
  parseAgentConfig,
  safeParseAgentConfig,
} from './agent-config';

describe('agentConfigSchema', () => {
  it('cria uma configuração inicial segura sem prompt ou upload', () => {
    const config = createDefaultAgentConfig({
      agentName: 'Lia',
      companyName: 'Acme',
    });

    expect(config.identity.agentName).toBe('Lia');
    expect(config.identity.companyName).toBe('Acme');
    expect(config.salesProcess.communication.answerDirectQuestionsFirst).toBe(true);
    expect(config.salesProcess.followUp.respectOptOut).toBe(true);
    expect(config.knowledgePolicy.trustOrder[0]).toBe('live_tool');
    expect(config.actions.find((action) => action.actionId === 'appointments')?.enabled).toBe(false);
    expect(config.actions.find((action) => action.actionId === 'human_handoff')?.enabled).toBe(true);
  });

  it('completa configurações parciais vindas do backfill', () => {
    const config = parseAgentConfig({
      schemaVersion: 1,
      identity: { agentName: 'Lara', companyName: 'Empreende.IA' },
      migration: { legacyPrompt: '<system_instruction />' },
    });

    expect(config.salesProcess.model).toBe('consultative');
    expect(config.knowledgePolicy.unknownAnswerPolicy).toBe('clarify_then_handoff');
    expect(config.migration?.legacyPrompt).toBe('<system_instruction />');
  });

  it('rejeita versão desconhecida do contrato', () => {
    const result = safeParseAgentConfig({ schemaVersion: 2 });
    expect(result.success).toBe(false);
  });

  it('não permite desativar o respeito a opt-out', () => {
    const result = agentConfigSchema.safeParse({
      schemaVersion: 1,
      salesProcess: { followUp: { respectOptOut: false } },
    });

    expect(result.success).toBe(false);
  });

  it('preserva lacunas temporárias no rascunho para o autosave', () => {
    const config = createDefaultAgentConfig();
    config.identity.agentName = '';
    config.identity.role = '';

    expect(agentConfigSchema.safeParse(config).success).toBe(true);
  });

  it('completa contratos de ação ausentes em rascunhos anteriores', () => {
    const config = parseAgentConfig({
      schemaVersion: 1,
      identity: { agentName: 'Lara', companyName: 'Empreende.IA' },
      actions: [],
    });

    expect(config.actions.map((action) => action.actionId)).toEqual([
      'appointments',
      'human_handoff',
    ]);
    expect(config.actions.every((action) => action.requiresExplicitConfirmation)).toBe(true);
    expect(config.actions.every((action) => action.simulationMode)).toBe(true);
  });

  it('não permite remover confirmação explícita nem simulação das ações', () => {
    const result = agentConfigSchema.safeParse({
      schemaVersion: 1,
      actions: [{
        actionId: 'appointments',
        requiresExplicitConfirmation: false,
        simulationMode: false,
      }],
    });

    expect(result.success).toBe(false);
  });
});
