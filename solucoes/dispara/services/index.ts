/**
 * Service Exports
 *
 */

// ============================================================================
// DATABASE SERVICES
// ============================================================================
export { campaignService } from './campaignService';
export { contactService } from './contactService';
export { templateService } from './templateService';
export { leadFormService } from './leadFormService';
// ============================================================================
// SETTINGS SERVICE (usa credenciais salvas no Supabase/env)
// ============================================================================
export { settingsService, type OCRConfig, type OCRProviderType } from './settingsService';
// ============================================================================
// FLOWS SERVICE
// ============================================================================
export { flowsService } from './flowsService';
// ============================================================================
// META DIAGNOSTICS SERVICE
// ============================================================================
export { metaDiagnosticsService } from './metaDiagnosticsService';
