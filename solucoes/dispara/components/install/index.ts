// Layout & Structure
export { InstallLayout } from './InstallLayout';
export { StepDots } from './StepDots';
export { StepCard } from './StepCard';

// Input & Icons
export { TokenInput } from './TokenInput';
export { ServiceIcon, getServiceGlowColor } from './ServiceIcon';
export type { ServiceType } from './ServiceIcon';

// Feedback
export { ValidatingOverlay } from './ValidatingOverlay';
export { SuccessCheckmark } from './SuccessCheckmark';

// Views (new unified architecture)
export { ProvisioningView } from './ProvisioningView';
export { SuccessView } from './SuccessView';
export { ErrorView } from './ErrorView';

// Forms (new unified architecture)
export * from './forms';

// Legacy Steps (deprecated - will be removed)
// Keep for backward compatibility during migration
export { IdentityStep } from './steps/IdentityStep';
export { VercelStep } from './steps/VercelStep';
export { SupabaseStep } from './steps/SupabaseStep';
