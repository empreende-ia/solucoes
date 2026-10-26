'use client'

import { FlowFormFieldType, FlowFormSpecV1 } from '@/lib/flow-form'

/**
 * Label mapping for field types (Portuguese)
 */
export const FIELD_TYPE_LABEL: Record<FlowFormFieldType, string> = {
  short_text: 'Texto curto',
  long_text: 'Texto longo',
  email: 'E-mail',
  phone: 'Telefone',
  number: 'Número',
  date: 'Data',
  dropdown: 'Lista (dropdown)',
  single_choice: 'Escolha única',
  multi_choice: 'Múltipla escolha',
  optin: 'Opt-in (checkbox)',
}

/**
 * Props for the main FlowFormBuilder component
 */
export interface FlowFormBuilderProps {
  flowName: string
  currentSpec: unknown
  isSaving: boolean
  showHeaderActions?: boolean
  showTechFields?: boolean
  registerActions?: (actions: {
    openAI: () => void
    openTemplate: () => void
    setScreenId: (value: string) => void
  }) => void
  onActionComplete?: () => void
  onSave: (patch: { spec: unknown; flowJson: unknown }) => void
  onPreviewScreenIdChange?: (screenId: string | null) => void
  onPreviewChange?: (payload: {
    form: FlowFormSpecV1
    generatedJson: unknown
    issues: string[]
    dirty: boolean
  }) => void
}

/**
 * Props for FieldEditor component
 */
export interface FieldEditorProps {
  field: any
  index: number
  totalFields: number
  questionRef: (el: HTMLInputElement | null) => void
  onUpdate: (index: number, patch: any) => void
  onMove: (index: number, direction: 'up' | 'down') => void
  onDuplicate: (index: number) => void
  onRemove: (index: number) => void
}

/**
 * Props for FieldList component
 */
export interface FieldListProps {
  fields: any[]
  questionRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>
  onUpdateField: (index: number, patch: any) => void
  onMoveField: (index: number, direction: 'up' | 'down') => void
  onDuplicateField: (index: number) => void
  onRemoveField: (index: number) => void
  onAddField: (type: FlowFormFieldType) => void
}

/**
 * Props for FormHeader component
 */
export interface FormHeaderProps {
  showHeaderActions: boolean
  onOpenAI: () => void
  onOpenTemplate: () => void
}

/**
 * Props for FormMetadata component
 */
export interface FormMetadataProps {
  form: FlowFormSpecV1
  showIntro: boolean
  showTechFields: boolean
  dirty: boolean
  issues: string[]
  canSave: boolean
  onUpdate: (patch: Partial<FlowFormSpecV1>) => void
  onSave: () => void
}

/**
 * Props for AIGenerateDialog component
 */
export interface AIGenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  flowName: string
  onGenerated: (form: FlowFormSpecV1) => void
  onActionComplete?: () => void
}

/**
 * Resultado da importação de template (inclui info sobre template dinâmico)
 */
export interface TemplateImportResult {
  form: FlowFormSpecV1
  /** Se é template dinâmico, inclui o flowJson pré-construído */
  dynamicFlowJson?: Record<string, unknown>
  /** Key do template (para referência) */
  templateKey?: string
}

/**
 * Props for TemplateImportDialog component
 */
export interface TemplateImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  flowName: string
  onImported: (result: TemplateImportResult) => void
  onActionComplete?: () => void
}

/**
 * Props for IssuesAlert component
 */
export interface IssuesAlertProps {
  issues: string[]
}
