/**
 * Dispara Design System - Pattern Components
 *
 * Componentes de padrões para garantir consistência em:
 * - Layouts de página
 * - Estatísticas e métricas
 * - Filtros e busca
 * - Tabelas e listas
 * - Ações e botões
 * - Paginação
 *
 * @example
 * ```tsx
 * import {
 *   ListPageLayout,
 *   StatsCard,
 *   StatsRow,
 *   FilterBar,
 *   Pagination,
 *   PrimaryAction,
 * } from '@/components/patterns'
 * ```
 */

// =============================================================================
// STATS
// =============================================================================
export {
  StatsCard,
  StatsRow,
  type StatsCardProps,
  type StatsCardVariant,
  type StatsRowProps,
} from './stats-card'

// =============================================================================
// FILTER BAR
// =============================================================================
export {
  FilterBar,
  ResultsInfo,
  type FilterBarProps,
  type FilterConfig,
  type FilterOption,
  type ResultsInfoProps,
} from './filter-bar'

// =============================================================================
// LIST PAGE LAYOUT
// =============================================================================
export {
  ListPageLayout,
  TabButton,
  TableContainer,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  EmptyState,
  LoadingState,
  type ListPageLayoutProps,
  type TabButtonProps,
  type TableContainerProps,
  type TableHeaderProps,
  type TableBodyProps,
  type TableRowProps,
  type TableCellProps,
  type EmptyStateProps,
  type LoadingStateProps,
} from './list-page-layout'

// =============================================================================
// PAGINATION
// =============================================================================
export {
  Pagination,
  type PaginationProps,
} from './pagination'

// =============================================================================
// ACTION BUTTONS
// =============================================================================
export {
  PrimaryAction,
  SecondaryAction,
  DestructiveAction,
  HighlightAction,
  IconAction,
  ActionGroup,
  type ActionButtonProps,
  type IconActionProps,
  type ActionGroupProps,
} from './action-buttons'

// =============================================================================
// STEPPER (Wizard Navigation)
// =============================================================================
export {
  Stepper,
  VerticalStepper,
  type Step,
  type StepperProps,
  type VerticalStepperProps,
} from './stepper'

// =============================================================================
// FORM SECTION (Form Building Blocks)
// =============================================================================
export {
  FormSection,
  FormField,
  FormRow,
  FormDivider,
  type FormSectionProps,
  type FormFieldProps,
  type FormRowProps,
  type FormDividerProps,
} from './form-section'

// =============================================================================
// SUMMARY PANEL (Wizard Sidebar)
// =============================================================================
export {
  SummaryPanel,
  SummaryItem,
  SummaryGroup,
  SummaryDivider,
  SummaryPreview,
  SummaryAlert,
  SummaryStats,
  type SummaryPanelProps,
  type SummaryItemProps,
  type SummaryGroupProps,
  type SummaryDividerProps,
  type SummaryPreviewProps,
  type SummaryAlertProps,
  type SummaryStatsProps,
} from './summary-panel'

// =============================================================================
// WIZARD PAGE LAYOUT
// =============================================================================
export {
  WizardPageLayout,
  WizardContent,
  WizardActions,
  StepIndicator,
  type WizardPageLayoutProps,
  type WizardContentProps,
  type WizardActionsProps,
  type StepIndicatorProps,
} from './wizard-page-layout'
