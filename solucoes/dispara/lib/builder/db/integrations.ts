import type { IntegrationConfig, IntegrationType } from "../types/integration";

export type IntegrationRecord = {
  id: string;
  userId?: string | null;
  name: string;
  type: IntegrationType;
  config: IntegrationConfig;
  createdAt: string;
  updatedAt: string;
  isManaged?: boolean;
};

export async function getIntegrationById(
  _integrationId: string
): Promise<IntegrationRecord | null> {
  return null;
}

export async function createIntegration(_data: {
  userId: string;
  name: string;
  type: IntegrationType;
  config: IntegrationConfig;
  isManaged?: boolean;
}): Promise<IntegrationRecord> {
  return {
    id: "integration_stub",
    userId: null,
    name: "Integration",
    type: "custom",
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function updateIntegration(
  integrationId: string,
  data: { name?: string; config?: IntegrationConfig }
): Promise<IntegrationRecord> {
  return {
    id: integrationId,
    userId: null,
    name: data.name ?? "Integration",
    type: "custom",
    config: data.config ?? {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function deleteIntegration(
  _integrationId: string,
  _userId?: string
): Promise<boolean> {
  return true;
}

export async function listIntegrationsByUser(
  _userId: string
): Promise<IntegrationRecord[]> {
  return [];
}

export async function validateWorkflowIntegrations(
  _nodes: Array<{ data?: { config?: { integrationId?: string } } }>,
  _userId: string
): Promise<{ valid: boolean; invalidIds?: string[] }> {
  return { valid: true };
}
