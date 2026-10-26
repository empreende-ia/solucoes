export type SetupStepId = 'identity' | 'pipeline' | 'contact' | 'opportunity' | 'activity';
export type SetupStatus = 'done' | 'pending' | 'error';
export interface SetupStep { id: SetupStepId; title: string; description: string; path: string; action: string; admin?: boolean }
export interface SetupEvidence { identity: SetupStatus; pipeline: SetupStatus; contact: SetupStatus; opportunity: SetupStatus; activity: SetupStatus }

export const SETUP_STEPS: SetupStep[] = [
  { id: 'identity', title: 'Identifique sua organização e seu perfil', description: 'Confira o nome da organização e o nome que identifica você na equipe.', path: '/settings?tab=organization', action: 'Abrir dados da organização' },
  { id: 'pipeline', title: 'Prepare seu processo comercial', description: 'Mantenha ao menos um pipeline com etapas. As etapas representam o caminho real de uma negociação.', path: '/settings?tab=pipelines', action: 'Configurar pipeline', admin: true },
  { id: 'contact', title: 'Cadastre seu primeiro contato', description: 'Registre uma pessoa com quem sua equipe se relaciona e confira os dados antes de salvar.', path: '/contacts', action: 'Abrir contatos' },
  { id: 'opportunity', title: 'Registre uma oportunidade', description: 'Associe uma negociação ao seu pipeline para acompanhar responsável, valor e etapa.', path: '/pipeline', action: 'Abrir oportunidades' },
  { id: 'activity', title: 'Combine uma próxima ação', description: 'Registre uma tarefa, retorno ou reunião com o contexto necessário para dar continuidade ao trabalho.', path: '/tasks', action: 'Abrir tarefas' },
];

export function emptySetupEvidence(): SetupEvidence {
  return { identity: 'pending', pipeline: 'pending', contact: 'pending', opportunity: 'pending', activity: 'pending' };
}

export function setupGuideKey(orgId: string, userId: string): string {
  return `empreende-crm:setup-guide:v1:${encodeURIComponent(orgId)}:${encodeURIComponent(userId)}`;
}

/** Only guide position is local; completion always comes from current CRM records. */
export function parseGuideStep(value: string | null): SetupStepId | null {
  if (!value) return null;
  try {
    const item = JSON.parse(value);
    return item?.version === 1 && SETUP_STEPS.some((step) => step.id === item.stepId) ? item.stepId : null;
  } catch { return null; }
}

export function nextSetupStep(evidence: SetupEvidence): SetupStepId {
  return SETUP_STEPS.find((step) => evidence[step.id] !== 'done')?.id ?? SETUP_STEPS[0].id;
}
