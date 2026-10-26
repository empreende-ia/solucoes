// Generated from the commercial PostgreSQL schema by scripts/generate-commercial-types.py.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type CommercialDatabase = { public: { Tables: {
  activities: {
    Row: {
      id: string;
      org_id: string;
      type: string;
      title: string;
      body: string | null;
      contact_id: string | null;
      company_id: string | null;
      deal_id: string | null;
      user_id: string | null;
      due_date: string | null;
      end_date: string | null;
      completed_at: string | null;
      created_at: string;
      updated_at: string;
      created_by: string | null;
    };
    Insert: {
      id?: string;
      org_id: string;
      type?: string;
      title: string;
      body?: string | null;
      contact_id?: string | null;
      company_id?: string | null;
      deal_id?: string | null;
      user_id?: string | null;
      due_date?: string | null;
      end_date?: string | null;
      completed_at?: string | null;
      created_at?: string;
      updated_at?: string;
      created_by?: string | null;
    };
    Update: {
      id?: string;
      org_id?: string;
      type?: string;
      title?: string;
      body?: string | null;
      contact_id?: string | null;
      company_id?: string | null;
      deal_id?: string | null;
      user_id?: string | null;
      due_date?: string | null;
      end_date?: string | null;
      completed_at?: string | null;
      created_at?: string;
      updated_at?: string;
      created_by?: string | null;
    };
    Relationships: [];
  };
  audit_logs: {
    Row: {
      id: string;
      org_id: string;
      user_id: string | null;
      entity_type: string;
      entity_id: string;
      action: string;
      changed_fields: string[];
      created_at: string;
    };
    Insert: {
      id?: string;
      org_id: string;
      user_id?: string | null;
      entity_type: string;
      entity_id: string;
      action: string;
      changed_fields?: string[];
      created_at?: string;
    };
    Update: {
      id?: string;
      org_id?: string;
      user_id?: string | null;
      entity_type?: string;
      entity_id?: string;
      action?: string;
      changed_fields?: string[];
      created_at?: string;
    };
    Relationships: [];
  };
  automation_logs: {
    Row: {
      id: string;
      org_id: string;
      automation_id: string;
      deal_id: string;
      activity_id: string | null;
      status: string;
      error_message: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      org_id: string;
      automation_id: string;
      deal_id: string;
      activity_id?: string | null;
      status: string;
      error_message?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      org_id?: string;
      automation_id?: string;
      deal_id?: string;
      activity_id?: string | null;
      status?: string;
      error_message?: string | null;
      created_at?: string;
    };
    Relationships: [];
  };
  automations: {
    Row: {
      id: string;
      org_id: string;
      name: string;
      trigger_type: string;
      is_active: boolean;
      task_title: string;
      due_days: number;
      created_by: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      org_id: string;
      name: string;
      trigger_type: string;
      is_active?: boolean;
      task_title: string;
      due_days?: number;
      created_by?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      org_id?: string;
      name?: string;
      trigger_type?: string;
      is_active?: boolean;
      task_title?: string;
      due_days?: number;
      created_by?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  companies: {
    Row: {
      id: string;
      org_id: string;
      name: string;
      domain: string | null;
      industry: string | null;
      size: string | null;
      revenue: number | null;
      website: string | null;
      linkedin_url: string | null;
      owner_id: string | null;
      created_at: string;
      updated_at: string;
      phone: string | null;
    };
    Insert: {
      id?: string;
      org_id: string;
      name: string;
      domain?: string | null;
      industry?: string | null;
      size?: string | null;
      revenue?: number | null;
      website?: string | null;
      linkedin_url?: string | null;
      owner_id?: string | null;
      created_at?: string;
      updated_at?: string;
      phone?: string | null;
    };
    Update: {
      id?: string;
      org_id?: string;
      name?: string;
      domain?: string | null;
      industry?: string | null;
      size?: string | null;
      revenue?: number | null;
      website?: string | null;
      linkedin_url?: string | null;
      owner_id?: string | null;
      created_at?: string;
      updated_at?: string;
      phone?: string | null;
    };
    Relationships: [];
  };
  contacts: {
    Row: {
      id: string;
      org_id: string;
      first_name: string;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      company_id: string | null;
      owner_id: string | null;
      status: string;
      job_title: string | null;
      source: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      org_id: string;
      first_name: string;
      last_name?: string | null;
      email?: string | null;
      phone?: string | null;
      company_id?: string | null;
      owner_id?: string | null;
      status?: string;
      job_title?: string | null;
      source?: string | null;
      notes?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      org_id?: string;
      first_name?: string;
      last_name?: string | null;
      email?: string | null;
      phone?: string | null;
      company_id?: string | null;
      owner_id?: string | null;
      status?: string;
      job_title?: string | null;
      source?: string | null;
      notes?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  deal_stage_history: {
    Row: {
      id: string;
      org_id: string;
      deal_id: string;
      from_stage_id: string | null;
      to_stage_id: string;
      from_status: string | null;
      to_status: string;
      changed_by: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      org_id: string;
      deal_id: string;
      from_stage_id?: string | null;
      to_stage_id: string;
      from_status?: string | null;
      to_status: string;
      changed_by?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      org_id?: string;
      deal_id?: string;
      from_stage_id?: string | null;
      to_stage_id?: string;
      from_status?: string | null;
      to_status?: string;
      changed_by?: string | null;
      created_at?: string;
    };
    Relationships: [];
  };
  deals: {
    Row: {
      id: string;
      org_id: string;
      pipeline_id: string;
      stage_id: string;
      title: string;
      value: number;
      currency: string;
      contact_id: string | null;
      company_id: string | null;
      owner_id: string | null;
      close_date: string | null;
      probability: number | null;
      status: string;
      lost_reason: string | null;
      stage_entered_at: string;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      org_id: string;
      pipeline_id: string;
      stage_id: string;
      title: string;
      value?: number;
      currency?: string;
      contact_id?: string | null;
      company_id?: string | null;
      owner_id?: string | null;
      close_date?: string | null;
      probability?: number | null;
      status?: string;
      lost_reason?: string | null;
      stage_entered_at?: string;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      org_id?: string;
      pipeline_id?: string;
      stage_id?: string;
      title?: string;
      value?: number;
      currency?: string;
      contact_id?: string | null;
      company_id?: string | null;
      owner_id?: string | null;
      close_date?: string | null;
      probability?: number | null;
      status?: string;
      lost_reason?: string | null;
      stage_entered_at?: string;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  email_templates: {
    Row: {
      id: string;
      org_id: string;
      name: string;
      subject: string;
      body: string;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      org_id: string;
      name: string;
      subject?: string;
      body?: string;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      org_id?: string;
      name?: string;
      subject?: string;
      body?: string;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  integration_configs: {
    Row: {
      id: string;
      org_id: string;
      provider: string;
      enabled: boolean;
      last_checked_at: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      org_id: string;
      provider: string;
      enabled?: boolean;
      last_checked_at?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      org_id?: string;
      provider?: string;
      enabled?: boolean;
      last_checked_at?: string | null;
      created_at?: string;
    };
    Relationships: [];
  };
  invitations: {
    Row: {
      id: string;
      org_id: string;
      email: string;
      role: string;
      invited_by: string | null;
      accepted_at: string | null;
      expires_at: string;
      created_at: string;
    };
    Insert: {
      id?: string;
      org_id: string;
      email: string;
      role?: string;
      invited_by?: string | null;
      accepted_at?: string | null;
      expires_at?: string;
      created_at?: string;
    };
    Update: {
      id?: string;
      org_id?: string;
      email?: string;
      role?: string;
      invited_by?: string | null;
      accepted_at?: string | null;
      expires_at?: string;
      created_at?: string;
    };
    Relationships: [];
  };
  onboarding_progress: {
    Row: {
      id: string;
      org_id: string;
      user_id: string;
      dismissed_at: string | null;
      updated_at: string;
    };
    Insert: {
      id?: string;
      org_id: string;
      user_id: string;
      dismissed_at?: string | null;
      updated_at?: string;
    };
    Update: {
      id?: string;
      org_id?: string;
      user_id?: string;
      dismissed_at?: string | null;
      updated_at?: string;
    };
    Relationships: [];
  };
  organizations: {
    Row: {
      id: string;
      name: string;
      domain: string | null;
      logo_url: string | null;
      plan: string;
      created_at: string;
    };
    Insert: {
      id?: string;
      name: string;
      domain?: string | null;
      logo_url?: string | null;
      plan?: string;
      created_at?: string;
    };
    Update: {
      id?: string;
      name?: string;
      domain?: string | null;
      logo_url?: string | null;
      plan?: string;
      created_at?: string;
    };
    Relationships: [];
  };
  payments: {
    Row: {
      id: string;
      org_id: string;
      description: string;
      amount: number;
      currency: string;
      status: string;
      contact_id: string | null;
      company_id: string | null;
      deal_id: string | null;
      due_date: string;
      paid_at: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      org_id: string;
      description: string;
      amount: number;
      currency?: string;
      status?: string;
      contact_id?: string | null;
      company_id?: string | null;
      deal_id?: string | null;
      due_date: string;
      paid_at?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      org_id?: string;
      description?: string;
      amount?: number;
      currency?: string;
      status?: string;
      contact_id?: string | null;
      company_id?: string | null;
      deal_id?: string | null;
      due_date?: string;
      paid_at?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  pipeline_stages: {
    Row: {
      id: string;
      org_id: string;
      pipeline_id: string;
      name: string;
      order: number;
      color: string;
      win_probability: number;
      created_at: string;
    };
    Insert: {
      id?: string;
      org_id: string;
      pipeline_id: string;
      name: string;
      order?: number;
      color?: string;
      win_probability?: number;
      created_at?: string;
    };
    Update: {
      id?: string;
      org_id?: string;
      pipeline_id?: string;
      name?: string;
      order?: number;
      color?: string;
      win_probability?: number;
      created_at?: string;
    };
    Relationships: [];
  };
  pipelines: {
    Row: {
      id: string;
      org_id: string;
      name: string;
      currency: string;
      is_default: boolean;
      created_at: string;
    };
    Insert: {
      id?: string;
      org_id: string;
      name: string;
      currency?: string;
      is_default?: boolean;
      created_at?: string;
    };
    Update: {
      id?: string;
      org_id?: string;
      name?: string;
      currency?: string;
      is_default?: boolean;
      created_at?: string;
    };
    Relationships: [];
  };
  profiles: {
    Row: {
      id: string;
      org_id: string | null;
      name: string;
      email: string;
      avatar_url: string | null;
      onboarding_completed: boolean;
      onboarding_step: number;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id: string;
      org_id?: string | null;
      name?: string;
      email?: string;
      avatar_url?: string | null;
      onboarding_completed?: boolean;
      onboarding_step?: number;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      org_id?: string | null;
      name?: string;
      email?: string;
      avatar_url?: string | null;
      onboarding_completed?: boolean;
      onboarding_step?: number;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  risk_rules: {
    Row: {
      id: string;
      org_id: string;
      name: string;
      type: string;
      enabled: boolean;
      threshold_days: number;
      priority: number;
    };
    Insert: {
      id?: string;
      org_id: string;
      name: string;
      type: string;
      enabled?: boolean;
      threshold_days?: number;
      priority?: number;
    };
    Update: {
      id?: string;
      org_id?: string;
      name?: string;
      type?: string;
      enabled?: boolean;
      threshold_days?: number;
      priority?: number;
    };
    Relationships: [];
  };
  user_roles: {
    Row: {
      id: string;
      user_id: string;
      org_id: string;
      role: string;
    };
    Insert: {
      id?: string;
      user_id: string;
      org_id: string;
      role: string;
    };
    Update: {
      id?: string;
      user_id?: string;
      org_id?: string;
      role?: string;
    };
    Relationships: [];
  };
}; Views: { [_ in never]: never }; Functions: {
create_workspace: { Args: { p_name: string }; Returns: string };
set_member_role: { Args: { p_user_id: string; p_role: string }; Returns: undefined };
accept_invitation: { Args: { p_invitation_id: string }; Returns: string };
move_deal: { Args: { p_deal_id: string; p_stage_id: string; p_status?: string; p_lost_reason?: string }; Returns: Json };
search_crm: { Args: { p_query: string; p_limit?: number }; Returns: {entity:string;id:string;title:string;subtitle:string;path:string}[] };
}; Enums: { [_ in never]: never }; CompositeTypes: { [_ in never]: never }; } };
export type CrmRow<T extends keyof CommercialDatabase["public"]["Tables"]> = CommercialDatabase["public"]["Tables"][T]["Row"];
