export type DealStatus = 'open' | 'won' | 'lost';
export type Deal = {
  id: string; org_id: string; pipeline_id: string; stage_id: string;
  title: string; value: number; currency: string; contact_id: string | null;
  company_id: string | null; owner_id: string | null; close_date: string | null;
  probability: number | null; status: DealStatus; lost_reason: string | null;
  stage_entered_at: string; created_at: string; updated_at: string;
};
export type DealPipeline = { id: string; org_id: string; name: string; currency: string; is_default: boolean };
export type DealStage = { id: string; org_id: string; pipeline_id: string; name: string; order: number; color: string | null; win_probability: number };
export type DealPerson = { id: string; full_name: string };
export type DealContact = { id: string; full_name: string; company_id: string | null };
export type DealCompany = { id: string; name: string };
export type DealActivity = { id: string; org_id: string; deal_id: string | null; title: string; type: string; due_date: string | null; completed_at: string | null; user_id: string | null };
export type DealHistory = { id: string; org_id: string; deal_id: string; from_stage_id: string | null; to_stage_id: string; changed_by: string | null; created_at: string };
export type DealDraft = {
  title: string; pipeline_id: string; stage_id: string; value: string; currency: string;
  contact_id: string; company_id: string; owner_id: string; close_date: string;
  probability: string; status: DealStatus; lost_reason: string;
};
export type DealFilters = { pipelineId: string; ownerId: string; status: string; search: string };
