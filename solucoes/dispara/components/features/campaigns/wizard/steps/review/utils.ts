import type { FixedValueDialogSlot, TemplateVariables, TemplateVariableInfo } from './types';

/**
 * Helper function to format variable key for humans
 * @param key - Variable key (usually a number like "1", "2", etc.)
 * @returns Human-readable format like "1ª variável" or "variável {key}"
 */
export function formatVarKeyForHumans(key: string): string {
  const n = Number(key);
  if (Number.isFinite(n) && n > 0) return `${n}ª variável`;
  return `variável ${key}`;
}

/**
 * Creates a function to apply quick fill to template variables
 * @param templateVariables - Current template variables state
 * @param setTemplateVariables - Setter for template variables
 * @param templateVariableInfo - Info about template variable positions
 * @returns Function to apply quick fill for a specific slot
 */
export function createApplyQuickFill(
  templateVariables: TemplateVariables,
  setTemplateVariables: (vars: TemplateVariables) => void,
  templateVariableInfo?: TemplateVariableInfo
) {
  return (slot: FixedValueDialogSlot, value: string) => {
    if (slot.where === 'header') {
      const idx = (templateVariableInfo?.header || []).findIndex(
        (v) => String(v.key) === String(slot.key)
      );
      if (idx < 0) return;
      const newHeader = [...templateVariables.header];
      newHeader[idx] = value;
      setTemplateVariables({ ...templateVariables, header: newHeader });
      return;
    }

    if (slot.where === 'body') {
      const idx = (templateVariableInfo?.body || []).findIndex(
        (v) => String(v.key) === String(slot.key)
      );
      if (idx < 0) return;
      const newBody = [...templateVariables.body];
      newBody[idx] = value;
      setTemplateVariables({ ...templateVariables, body: newBody });
      return;
    }

    if (slot.where === 'button') {
      const buttonIdx = slot.buttonIndex ?? 0;
      const btnKey = `button_${buttonIdx}_0`;
      setTemplateVariables({
        ...templateVariables,
        buttons: { ...templateVariables.buttons, [btnKey]: value },
      });
    }
  };
}

/**
 * Get where label for display
 * @param where - Location type ('header' | 'body' | 'button')
 * @param buttonIndex - Optional button index
 * @returns Human-readable location label
 */
export function getWhereLabel(where: 'header' | 'body' | 'button', buttonIndex?: number): string {
  if (where === 'button') {
    const idx = Number(buttonIndex ?? 0) + 1;
    return `Botão ${idx}`;
  }
  return where === 'header' ? 'Cabeçalho' : 'Corpo';
}
