/**
 * Centralized query invalidation utilities.
 * Use these to ensure consistent cache invalidation across the app.
 */

import { QueryClient } from '@tanstack/react-query'

/**
 * Invalidate all campaign-related queries.
 * Use after creating, updating, or deleting campaigns.
 */
export function invalidateCampaigns(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['campaigns'] })
  queryClient.invalidateQueries({ queryKey: ['recentCampaigns'] })
}

/**
 * Invalidate a specific campaign and related queries.
 * Use after updating a single campaign's details.
 */
export function invalidateCampaign(queryClient: QueryClient, campaignId: string) {
  queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
  queryClient.invalidateQueries({ queryKey: ['campaigns'] })
  queryClient.invalidateQueries({ queryKey: ['campaignMessages', campaignId] })
  queryClient.invalidateQueries({ queryKey: ['campaignMetrics', campaignId] })
}

/**
 * Invalidate all contact-related queries.
 * Use after creating, updating, or deleting contacts.
 */
export function invalidateContacts(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['contacts'] })
  queryClient.invalidateQueries({ queryKey: ['contactStats'] })
  queryClient.invalidateQueries({ queryKey: ['contactTags'] })
}

/**
 * Invalidate a specific contact and related queries.
 * Use after updating a single contact.
 */
export function invalidateContact(queryClient: QueryClient, contactId: string) {
  invalidateContacts(queryClient)
  queryClient.invalidateQueries({ queryKey: ['contact', contactId] })
}

/**
 * Invalidate all template-related queries.
 * Use after creating, updating, or deleting templates.
 */
export function invalidateTemplates(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['templates'] })
  queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual'] })
}

/**
 * Invalidate all flow/miniapp-related queries.
 */
export function invalidateFlows(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['flows'] })
  queryClient.invalidateQueries({ queryKey: ['flowSubmissions'] })
}

/**
 * Invalidate all lead form-related queries.
 */
export function invalidateLeadForms(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['leadForms'] })
}

/**
 * Invalidate dashboard stats.
 */
export function invalidateDashboard(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['dashboardStats'] })
  queryClient.invalidateQueries({ queryKey: ['recentCampaigns'] })
}

/**
 * Invalidate settings-related queries.
 * Includes all variations of settings queries used across the app.
 */
export function invalidateSettings(queryClient: QueryClient) {
  // Core settings queries
  queryClient.invalidateQueries({ queryKey: ['settings'] })
  queryClient.invalidateQueries({ queryKey: ['allSettings'] }) // Consolidated query
  queryClient.invalidateQueries({ queryKey: ['accountLimits'] })
  queryClient.invalidateQueries({ queryKey: ['phoneNumbers'] })
  // Test contact (multiple query key variations)
  queryClient.invalidateQueries({ queryKey: ['testContact'] })
  queryClient.invalidateQueries({ queryKey: ['test-contact'] })
  // Meta App config
  queryClient.invalidateQueries({ queryKey: ['metaAppConfig'] })
  // System status
  queryClient.invalidateQueries({ queryKey: ['systemStatus'] })
}

/**
 * Invalidate custom fields queries.
 * Includes all variations of custom fields query keys.
 */
export function invalidateCustomFields(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['customFields'] })
  queryClient.invalidateQueries({ queryKey: ['customFields', 'contact'] })
  queryClient.invalidateQueries({ queryKey: ['custom-fields', 'contact'] })
}

/**
 * Object-based API for query invalidation.
 * Provides a cleaner syntax with method chaining potential.
 *
 * @example
 * queryInvalidation.campaigns(queryClient)
 * queryInvalidation.campaign(queryClient, campaignId)
 */
export const queryInvalidation = {
  campaigns: invalidateCampaigns,
  campaign: invalidateCampaign,
  contacts: invalidateContacts,
  contact: invalidateContact,
  templates: invalidateTemplates,
  flows: invalidateFlows,
  leadForms: invalidateLeadForms,
  dashboard: invalidateDashboard,
  settings: invalidateSettings,
  customFields: invalidateCustomFields,
} as const
