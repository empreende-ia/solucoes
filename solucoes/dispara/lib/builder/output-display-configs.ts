export type OutputDisplayConfig = {
  actionType: string;
  title?: string;
  fields?: Array<{ label: string; path: string }>;
};

export const OUTPUT_DISPLAY_CONFIGS: OutputDisplayConfig[] = [];
