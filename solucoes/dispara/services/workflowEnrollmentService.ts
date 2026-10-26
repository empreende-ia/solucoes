/**
 * Workflow Enrollment Service
 * Inscrição em massa de contatos em workflows PUBLICADOS — o "Add to Workflow"
 * do GHL. O processamento é assíncrono via pg_cron (~25 contatos/min).
 */

export interface WorkflowSummary {
  id: string;
  name: string;
  /** 'published' = aceita inscrição em massa */
  status?: string;
  lastPublishedVersion?: number | null;
}

export interface EnrollResult {
  success: boolean;
  requested: number;
  enrolled: number;
  alreadyActive: number;
  blockedByReentry: number;
}

export const workflowEnrollmentService = {
  /** Lista todos os workflows (filtre por status === 'published' no consumidor) */
  listWorkflows: async (): Promise<WorkflowSummary[]> => {
    const response = await fetch('/api/builder/workflows', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Falha ao buscar workflows');
    }
    return response.json();
  },

  /** Inscreve contatos num workflow publicado (409 se não publicado) */
  enroll: async (workflowId: string, contactIds: string[]): Promise<EnrollResult> => {
    const response = await fetch(`/api/builder/workflows/${workflowId}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactIds }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Falha ao adicionar contatos ao workflow');
    }

    return response.json();
  },
};
