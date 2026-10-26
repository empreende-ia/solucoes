import { getAllActions } from "./plugins";

export type StepImporter = {
  importer: () => Promise<unknown>;
  stepFunction: string;
};

const STEP_IMPORTERS: Record<string, () => Promise<unknown>> = {
  "whatsapp/send-message": () => import("./steps/whatsapp/send-message"),
  "whatsapp/ask-question": () => import("./steps/whatsapp/ask-question"),
  "whatsapp/send-template": () => import("./steps/whatsapp/send-template"),
  "whatsapp/send-media": () => import("./steps/whatsapp/send-media"),
  "whatsapp/send-buttons": () => import("./steps/whatsapp/send-buttons"),
  "whatsapp/send-list": () => import("./steps/whatsapp/send-list"),
  "contacts/add-tag": () => import("./steps/contacts/add-tag"),
  "contacts/remove-tag": () => import("./steps/contacts/remove-tag"),
  "crm/move-pipeline": () => import("./steps/crm/move-pipeline"),
};

export function getStepImporter(actionType: string): StepImporter | null {
  const actions = getAllActions();
  const action = actions.find(
    (item) =>
      item.id === actionType ||
      item.slug === actionType ||
      item.label === actionType ||
      `${item.integration}/${item.slug}` === actionType
  );

  if (!action) {
    return null;
  }

  const importer = STEP_IMPORTERS[action.stepImportPath];
  if (!importer) {
    return null;
  }

  return {
    importer,
    stepFunction: action.stepFunction,
  };
}

export function getActionLabel(actionType: string): string {
  const action = getAllActions().find(
    (item) =>
      item.id === actionType ||
      item.slug === actionType ||
      item.label === actionType ||
      `${item.integration}/${item.slug}` === actionType
  );
  return action?.label ?? actionType;
}
