import type { ComponentType } from "react";
import type { IntegrationType } from "./types/integration";

export type SelectOption = {
  value: string;
  label: string;
};

export type ActionConfigFieldBase = {
  key: string;
  label: string;
  type:
    | "template-input"
    | "template-textarea"
    | "text"
    | "number"
    | "select"
    | "schema-builder";
  placeholder?: string;
  defaultValue?: string;
  example?: string;
  options?: SelectOption[];
  rows?: number;
  min?: number;
  required?: boolean;
  showWhen?: {
    field: string;
    equals: string;
  };
};

export type ActionConfigFieldGroup = {
  label: string;
  type: "group";
  fields: ActionConfigFieldBase[];
  defaultExpanded?: boolean;
};

export type ActionConfigField = ActionConfigFieldBase | ActionConfigFieldGroup;

export type OutputField = {
  field: string;
  description: string;
};

export type ResultComponentProps = {
  output: unknown;
  input?: unknown;
};

export type OutputDisplayConfig =
  | {
      type: "image" | "video" | "url";
      field: string;
    }
  | {
      type: "component";
      component: ComponentType<ResultComponentProps>;
    };

export type PluginAction = {
  slug: string;
  label: string;
  description: string;
  category: string;
  stepFunction: string;
  stepImportPath: string;
  configFields: ActionConfigField[];
  outputFields?: OutputField[];
  outputConfig?: OutputDisplayConfig;
  codegenTemplate?: string;
};

export type ActionWithFullId = PluginAction & {
  id: string;
  integration: IntegrationType;
};

export type IntegrationPlugin = {
  type: IntegrationType;
  label: string;
  description: string;
  icon?: ComponentType<{ className?: string }>;
  formFields?: Array<{
    id: string;
    label: string;
    type: "text" | "password" | "url";
    placeholder?: string;
    helpText?: string;
    helpLink?: { text: string; url: string };
    configKey: string;
    envVar?: string;
  }>;
  actions: PluginAction[];
};

const integrations: IntegrationPlugin[] = [
  {
    type: "whatsapp",
    label: "WhatsApp",
    description: "Enviar mensagens no WhatsApp",
    actions: [
      {
        slug: "send-message",
        label: "Enviar mensagem",
        description: "Enviar uma mensagem de texto",
        category: "WhatsApp",
        stepFunction: "sendMessageStep",
        stepImportPath: "whatsapp/send-message",
        configFields: [
          {
            key: "toSource",
            label: "Destinatario",
            type: "select",
            options: [
              { label: "Da mensagem recebida", value: "inbound" },
              { label: "Numero manual", value: "manual" },
            ],
            defaultValue: "inbound",
          },
          {
            key: "to",
            label: "Para",
            type: "template-input",
            placeholder: "+5511999999999",
            showWhen: { field: "toSource", equals: "manual" },
          },
          {
            key: "message",
            label: "Mensagem",
            type: "template-textarea",
            placeholder: "Digite sua mensagem",
            required: true,
          },
          {
            key: "previewUrl",
            label: "URL de preview",
            type: "select",
            options: [
              { label: "Desligado", value: "false" },
              { label: "Ligado", value: "true" },
            ],
          },
        ],
        outputFields: [{ field: "messageId", description: "ID da mensagem" }],
      },
      {
        slug: "ask-question",
        label: "Perguntar",
        description: "Fazer uma pergunta e aguardar a resposta",
        category: "WhatsApp",
        stepFunction: "askQuestionStep",
        stepImportPath: "whatsapp/ask-question",
        configFields: [
          {
            key: "toSource",
            label: "Destinatario",
            type: "select",
            options: [
              { label: "Da mensagem recebida", value: "inbound" },
              { label: "Numero manual", value: "manual" },
            ],
            defaultValue: "inbound",
          },
          {
            key: "to",
            label: "Para",
            type: "template-input",
            placeholder: "+5511999999999",
            showWhen: { field: "toSource", equals: "manual" },
          },
          {
            key: "message",
            label: "Pergunta",
            type: "template-textarea",
            placeholder: "Digite sua pergunta",
            required: true,
          },
          {
            key: "variableKey",
            label: "Salvar resposta como",
            type: "text",
            placeholder: "user_answer",
            required: true,
          },
        ],
        outputFields: [
          { field: "status", description: "Status da conversa" },
          { field: "conversationId", description: "ID da conversa" },
        ],
      },
      {
        slug: "send-template",
        label: "Enviar template",
        description: "Enviar uma mensagem de template",
        category: "WhatsApp",
        stepFunction: "sendTemplateStep",
        stepImportPath: "whatsapp/send-template",
        configFields: [
          {
            key: "toSource",
            label: "Destinatario",
            type: "select",
            options: [
              { label: "Da mensagem recebida", value: "inbound" },
              { label: "Numero manual", value: "manual" },
            ],
            defaultValue: "inbound",
          },
          {
            key: "to",
            label: "Para",
            type: "template-input",
            placeholder: "+5511999999999",
            showWhen: { field: "toSource", equals: "manual" },
          },
          {
            key: "templateName",
            label: "Nome do template",
            type: "text",
            placeholder: "welcome_message",
            required: true,
          },
          {
            key: "language",
            label: "Idioma",
            type: "text",
            placeholder: "pt_BR",
            defaultValue: "pt_BR",
          },
          {
            key: "parameterFormat",
            label: "Formato dos parametros",
            type: "select",
            options: [
              { label: "Posicional", value: "positional" },
              { label: "Nomeado", value: "named" },
            ],
            defaultValue: "positional",
          },
          {
            key: "bodyParams",
            label: "Parametros do corpo (JSON)",
            type: "template-textarea",
            placeholder: '[{"key":"1","text":"John"}]',
            rows: 4,
          },
          {
            key: "headerParams",
            label: "Parametros do cabecalho (JSON)",
            type: "template-textarea",
            placeholder: '[{"key":"1","text":"Hello"}]',
            rows: 3,
          },
          {
            key: "buttonParams",
            label: "Parâmetros do botão (JSON)",
            type: "template-textarea",
            placeholder: '[{"index":0,"params":[{"text":"https://example.com"}]}]',
            rows: 3,
          },
        ],
        outputFields: [{ field: "messageId", description: "ID da mensagem" }],
      },
      {
        slug: "send-media",
        label: "Enviar midia",
        description: "Enviar imagem, video, audio ou documento",
        category: "WhatsApp",
        stepFunction: "sendMediaStep",
        stepImportPath: "whatsapp/send-media",
        configFields: [
          {
            key: "toSource",
            label: "Destinatario",
            type: "select",
            options: [
              { label: "Da mensagem recebida", value: "inbound" },
              { label: "Numero manual", value: "manual" },
            ],
            defaultValue: "inbound",
          },
          {
            key: "to",
            label: "Para",
            type: "template-input",
            placeholder: "+5511999999999",
            showWhen: { field: "toSource", equals: "manual" },
          },
          {
            key: "mediaType",
            label: "Tipo de midia",
            type: "select",
            options: [
              { label: "Imagem", value: "image" },
              { label: "Video", value: "video" },
              { label: "Audio", value: "audio" },
              { label: "Documento", value: "document" },
              { label: "Sticker", value: "sticker" },
            ],
            defaultValue: "image",
          },
          {
            key: "mediaUrl",
            label: "URL da midia",
            type: "template-input",
            placeholder: "https://example.com/file.png",
          },
          {
            key: "mediaId",
            label: "ID da midia",
            type: "text",
            placeholder: "Use if already uploaded",
          },
          {
            key: "caption",
            label: "Legenda",
            type: "template-textarea",
            placeholder: "Optional caption",
            rows: 3,
          },
          {
            key: "filename",
            label: "Nome do arquivo",
            type: "text",
            placeholder: "document.pdf",
          },
        ],
        outputFields: [{ field: "messageId", description: "ID da mensagem" }],
      },
      {
        slug: "send-buttons",
        label: "Botoes",
        description: "Enviar botoes interativos de resposta",
        category: "WhatsApp",
        stepFunction: "sendButtonsStep",
        stepImportPath: "whatsapp/send-buttons",
        configFields: [
          {
            key: "toSource",
            label: "Destinatario",
            type: "select",
            options: [
              { label: "Da mensagem recebida", value: "inbound" },
              { label: "Numero manual", value: "manual" },
            ],
            defaultValue: "inbound",
          },
          {
            key: "to",
            label: "Para",
            type: "template-input",
            placeholder: "+5511999999999",
            showWhen: { field: "toSource", equals: "manual" },
          },
          {
            key: "body",
            label: "Corpo",
            type: "template-textarea",
            placeholder: "Choose an option",
            rows: 3,
            required: true,
          },
          {
            key: "headerText",
            label: "Texto do cabecalho",
            type: "text",
            placeholder: "Optional header",
          },
          {
            key: "footer",
            label: "Rodapé",
            type: "text",
            placeholder: "Optional footer",
          },
          {
            key: "buttons",
            label: "Botoes (JSON)",
            type: "template-textarea",
            placeholder: '[{"id":"yes","title":"Yes"},{"id":"no","title":"No"}]',
            rows: 4,
            required: true,
          },
        ],
        outputFields: [{ field: "messageId", description: "ID da mensagem" }],
      },
      {
        slug: "send-list",
        label: "Lista",
        description: "Enviar uma lista interativa",
        category: "WhatsApp",
        stepFunction: "sendListStep",
        stepImportPath: "whatsapp/send-list",
        configFields: [
          {
            key: "toSource",
            label: "Destinatario",
            type: "select",
            options: [
              { label: "Da mensagem recebida", value: "inbound" },
              { label: "Numero manual", value: "manual" },
            ],
            defaultValue: "inbound",
          },
          {
            key: "to",
            label: "Para",
            type: "template-input",
            placeholder: "+5511999999999",
            showWhen: { field: "toSource", equals: "manual" },
          },
          {
            key: "body",
            label: "Corpo",
            type: "template-textarea",
            placeholder: "Select an option",
            rows: 3,
            required: true,
          },
          {
            key: "buttonText",
            label: "Texto do botão",
            type: "text",
            placeholder: "Options",
            required: true,
          },
          {
            key: "headerText",
            label: "Texto do cabecalho",
            type: "text",
            placeholder: "Optional header",
          },
          {
            key: "footer",
            label: "Rodapé",
            type: "text",
            placeholder: "Optional footer",
          },
          {
            key: "sections",
            label: "Secoes (JSON)",
            type: "template-textarea",
            placeholder:
              '[{"title":"Main","rows":[{"id":"1","title":"Option 1","description":"Details"}]}]',
            rows: 5,
            required: true,
          },
        ],
        outputFields: [{ field: "messageId", description: "ID da mensagem" }],
      },
    ],
  },
  {
    type: "contacts",
    label: "Contatos",
    description: "Ações sobre o contato (tags)",
    actions: [
      {
        slug: "add-tag",
        label: "Adicionar tag",
        description: "Adiciona uma ou mais tags ao contato",
        category: "Contatos",
        stepFunction: "addTagStep",
        stepImportPath: "contacts/add-tag",
        configFields: [
          {
            key: "tags",
            label: "Tags (JSON array)",
            type: "template-textarea",
            placeholder: '["cliente-quente"]',
            required: true,
          },
        ],
        outputFields: [{ field: "contactId", description: "ID do contato" }],
      },
      {
        slug: "remove-tag",
        label: "Remover tag",
        description: "Remove uma ou mais tags do contato",
        category: "Contatos",
        stepFunction: "removeTagStep",
        stepImportPath: "contacts/remove-tag",
        configFields: [
          {
            key: "tags",
            label: "Tags (JSON array)",
            type: "template-textarea",
            placeholder: '["cliente-frio"]',
            required: true,
          },
        ],
        outputFields: [{ field: "contactId", description: "ID do contato" }],
      },
    ],
  },
  {
    type: "crm",
    label: "CRM",
    description: "Pipelines e oportunidades",
    actions: [
      {
        slug: "move-pipeline",
        label: "Mover no pipeline",
        description:
          "Cria/move a oportunidade do contato para uma etapa do pipeline",
        category: "CRM",
        stepFunction: "movePipelineStep",
        stepImportPath: "crm/move-pipeline",
        configFields: [
          {
            key: "pipelineId",
            label: "Pipeline",
            type: "text",
            required: true,
          },
          { key: "stageId", label: "Etapa", type: "text", required: true },
          {
            key: "oppStatus",
            label: "Status da oportunidade",
            type: "select",
            options: [
              { label: "Aberta", value: "open" },
              { label: "Ganha", value: "won" },
              { label: "Perdida", value: "lost" },
              { label: "Abandonada", value: "abandoned" },
            ],
            defaultValue: "open",
          },
        ],
        outputFields: [
          { field: "opportunityId", description: "ID da oportunidade" },
        ],
      },
    ],
  },
];

function getSafeIntegrations(): IntegrationPlugin[] {
  return integrations.filter((integration) => Array.isArray(integration.actions));
}

export function isFieldGroup(
  field: ActionConfigField
): field is ActionConfigFieldGroup {
  return field.type === "group";
}

export function computeActionId(
  integration: IntegrationType,
  slug: string
): string {
  return `${integration}/${slug}`;
}

export function flattenConfigFields(
  fields: ActionConfigField[]
): ActionConfigFieldBase[] {
  const flattened: ActionConfigFieldBase[] = [];
  for (const field of fields) {
    if (isFieldGroup(field)) {
      flattened.push(...field.fields);
    } else {
      flattened.push(field);
    }
  }
  return flattened;
}

export function getAllIntegrations(): IntegrationPlugin[] {
  return getSafeIntegrations();
}

export function getIntegration(type: IntegrationType | undefined) {
  if (!type) return undefined;
  return getSafeIntegrations().find((integration) => integration.type === type);
}

export function getIntegrationLabels(): Record<string, string> {
  return getSafeIntegrations().reduce((acc, integration) => {
    acc[integration.type] = integration.label;
    return acc;
  }, {} as Record<string, string>);
}

export function getSortedIntegrationTypes(): IntegrationType[] {
  return getSafeIntegrations()
    .map((integration) => integration.type)
    .sort((a, b) => a.localeCompare(b));
}

export function getActionsByCategory(): Record<string, ActionWithFullId[]> {
  const categories: Record<string, ActionWithFullId[]> = {};

  for (const integration of getSafeIntegrations()) {
    const actions = Array.isArray(integration.actions)
      ? integration.actions
      : [];
    for (const action of actions) {
      const category = action.category || "Other";
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push({
        ...action,
        id: computeActionId(integration.type, action.slug),
        integration: integration.type,
      });
    }
  }

  return categories;
}

export function getAllActions(): ActionWithFullId[] {
  const categories = getActionsByCategory();
  return Object.values(categories).flat();
}

const LEGACY_ACTION_LABELS: Record<string, string> = {
  "Send Message": "whatsapp/send-message",
  "Ask Question": "whatsapp/ask-question",
  "Send Template": "whatsapp/send-template",
  "Send Media": "whatsapp/send-media",
  Buttons: "whatsapp/send-buttons",
  List: "whatsapp/send-list",
};

export function findActionById(actionId?: string): ActionWithFullId | undefined {
  if (!actionId) return undefined;
  const legacyId = LEGACY_ACTION_LABELS[actionId];
  if (legacyId) {
    const legacyMatch = getAllActions().find((action) => action.id === legacyId);
    if (legacyMatch) {
      return legacyMatch;
    }
  }
  return getAllActions().find(
    (action) =>
      action.id === actionId ||
      action.slug === actionId ||
      `${action.integration}/${action.slug}` === actionId ||
      action.label === actionId
  );
}

export function getCredentialMapping(_type: IntegrationType) {
  return {};
}
