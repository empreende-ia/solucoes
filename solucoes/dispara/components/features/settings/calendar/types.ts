import type { UseCalendarBookingReturn } from '../../../../hooks/settings/useCalendarBooking';

/**
 * Props comuns para componentes do Wizard
 */
export interface WizardStepProps {
  calendarCredsStatus: UseCalendarBookingReturn['calendarCredsStatus'];
  calendarAuthStatus: UseCalendarBookingReturn['calendarAuthStatus'];
}

/**
 * Props para o step de Checklist (Step 0)
 */
export interface WizardStepChecklistProps {
  // No additional props needed
}

/**
 * Props para o step de Credenciais (Step 1)
 */
export interface WizardStepCredentialsProps extends WizardStepProps {
  // Loading states
  calendarCredsLoading: boolean;
  calendarCredsSaving: boolean;

  // Draft values
  calendarClientIdDraft: string;
  calendarClientSecretDraft: string;
  calendarBaseUrl: string;
  calendarBaseUrlDraft: string;
  calendarBaseUrlEditing: boolean;
  calendarRedirectUrl: string;

  // Validation
  calendarClientIdValid: boolean;
  calendarClientSecretValid: boolean;
  calendarCredsFormValid: boolean;
  calendarCredsSourceLabel: string;

  // Handlers
  setCalendarClientIdDraft: (value: string) => void;
  setCalendarClientSecretDraft: (value: string) => void;
  setCalendarBaseUrlDraft: (value: string) => void;
  setCalendarBaseUrlEditing: (editing: boolean) => void;
  handleSaveCalendarCreds: () => Promise<void>;
  handleRemoveCalendarCreds: () => Promise<void>;
  handleCopyCalendarValue: (value: string, label: string) => Promise<void>;
}

/**
 * Props para o step de Conexão (Step 2)
 */
export interface WizardStepConnectProps extends WizardStepProps {
  calendarConnectLoading: boolean;
  handleConnectCalendar: () => void;
  handleDisconnectCalendar: () => Promise<void>;
  fetchCalendarAuthStatus: () => Promise<void>;
}

/**
 * Props para o step de Seleção de Calendário (Step 3)
 */
export interface WizardStepCalendarSelectionProps extends WizardStepProps {
  calendarList: UseCalendarBookingReturn['calendarList'];
  calendarListLoading: boolean;
  calendarListError: string | null;
  calendarSelectionId: string;
  calendarSelectionSaving: boolean;
  calendarListQuery: string;
  filteredCalendarList: UseCalendarBookingReturn['filteredCalendarList'];
  selectedCalendarTimeZone: string;

  setCalendarSelectionId: (id: string) => void;
  setCalendarListQuery: (query: string) => void;
  fetchCalendarList: () => Promise<void>;
  handleSaveCalendarSelection: () => Promise<boolean>;
}

/**
 * Props para a Sidebar do Wizard
 */
export interface WizardSidebarProps {
  calendarWizardStep: number;
  calendarCredsStatus: UseCalendarBookingReturn['calendarCredsStatus'];
  calendarAuthStatus: UseCalendarBookingReturn['calendarAuthStatus'];
  handleCalendarWizardStepClick: (step: number) => void;
}

/**
 * Props para o Modal do Wizard
 */
export interface CalendarWizardModalProps {
  isCalendarWizardOpen: boolean;
  setIsCalendarWizardOpen: (open: boolean) => void;
  calendarWizardStep: number;
  calendarWizardError: string | null;
  calendarWizardCanContinue: boolean;
  calendarTestLoading: boolean;

  // Step errors
  calendarCredsError: string | null;
  calendarAuthError: string | null;
  calendarListError: string | null;

  // Sidebar props
  calendarCredsStatus: UseCalendarBookingReturn['calendarCredsStatus'];
  calendarAuthStatus: UseCalendarBookingReturn['calendarAuthStatus'];
  handleCalendarWizardStepClick: (step: number) => void;

  // Navigation
  handleCalendarWizardBack: () => void;
  handleCalendarWizardNext: () => Promise<void>;

  // Step 1 props
  calendarCredsLoading: boolean;
  calendarCredsSaving: boolean;
  calendarClientIdDraft: string;
  calendarClientSecretDraft: string;
  calendarBaseUrl: string;
  calendarBaseUrlDraft: string;
  calendarBaseUrlEditing: boolean;
  calendarRedirectUrl: string;
  calendarClientIdValid: boolean;
  calendarClientSecretValid: boolean;
  calendarCredsFormValid: boolean;
  calendarCredsSourceLabel: string;
  setCalendarClientIdDraft: (value: string) => void;
  setCalendarClientSecretDraft: (value: string) => void;
  setCalendarBaseUrlDraft: (value: string) => void;
  setCalendarBaseUrlEditing: (editing: boolean) => void;
  handleSaveCalendarCreds: () => Promise<void>;
  handleRemoveCalendarCreds: () => Promise<void>;
  handleCopyCalendarValue: (value: string, label: string) => Promise<void>;

  // Step 2 props
  calendarConnectLoading: boolean;
  handleConnectCalendar: () => void;
  handleDisconnectCalendar: () => Promise<void>;
  fetchCalendarAuthStatus: () => Promise<void>;

  // Step 3 props
  calendarList: UseCalendarBookingReturn['calendarList'];
  calendarListLoading: boolean;
  calendarSelectionId: string;
  calendarSelectionSaving: boolean;
  calendarListQuery: string;
  filteredCalendarList: UseCalendarBookingReturn['filteredCalendarList'];
  selectedCalendarTimeZone: string;
  setCalendarSelectionId: (id: string) => void;
  setCalendarListQuery: (query: string) => void;
  fetchCalendarList: () => Promise<void>;
  handleSaveCalendarSelection: () => Promise<boolean>;
}

/**
 * Props para a seção de Status do Calendário
 */
export interface CalendarStatusSectionProps {
  calendarAuthLoading: boolean;
  calendarAuthStatus: UseCalendarBookingReturn['calendarAuthStatus'];
  calendarTestLoading: boolean;
  calendarTestResult: UseCalendarBookingReturn['calendarTestResult'];
  handlePrimaryCalendarAction: () => void;
  handleCalendarTestEvent: () => Promise<boolean>;
  setCalendarWizardStep: (step: number) => void;
  setCalendarWizardError: (error: string | null) => void;
  setIsCalendarWizardOpen: (open: boolean) => void;
}

/**
 * Props para a seção de Configuração de Booking
 */
export interface BookingConfigSectionProps {
  calendarBookingLoading?: boolean;
  calendarBooking?: {
    ok: boolean;
    source?: 'db' | 'default';
  } | null;
  isEditingCalendarBooking: boolean;
  setIsEditingCalendarBooking: (editing: boolean) => void;
  calendarDraft: UseCalendarBookingReturn['calendarDraft'];
  updateCalendarDraft: UseCalendarBookingReturn['updateCalendarDraft'];
  updateWorkingHours: UseCalendarBookingReturn['updateWorkingHours'];
  handleSaveCalendarBooking: () => Promise<void>;
  isSavingCalendarBooking?: boolean;
}
