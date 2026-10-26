export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_action_runs: {
        Row: {
          action_key: string
          agent_version_id: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          error_code: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          input: Json
          mode: string
          output: Json
          source_message_id: string | null
          started_at: string
          status: string
          workspace_id: string
        }
        Insert: {
          action_key: string
          agent_version_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          input?: Json
          mode?: string
          output?: Json
          source_message_id?: string | null
          started_at?: string
          status?: string
          workspace_id: string
        }
        Update: {
          action_key?: string
          agent_version_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          input?: Json
          mode?: string
          output?: Json
          source_message_id?: string | null
          started_at?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_action_runs_agent_version_id_fkey"
            columns: ["agent_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_runs_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          agent_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          workspace_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          agent_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          workspace_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          agent_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_audit_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_drafts: {
        Row: {
          agent_id: string
          base_version_id: string | null
          config: Json
          created_at: string
          created_by: string | null
          id: string
          revision: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          agent_id: string
          base_version_id?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          revision?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          agent_id?: string
          base_version_id?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          revision?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_drafts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_drafts_base_version_fk"
            columns: ["base_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_drafts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_operation_rate_limits: {
        Row: {
          created_at: string
          operation: string
          request_count: number
          subject_key: string
          updated_at: string
          window_key: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          operation: string
          request_count?: number
          subject_key: string
          updated_at?: string
          window_key: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          operation?: string
          request_count?: number
          subject_key?: string
          updated_at?: string
          window_key?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_operation_rate_limits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runtime_events: {
        Row: {
          agent_id: string
          agent_version_id: string
          compiler_version: string
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          error_code: string | null
          estimated_cost: number | null
          event_kind: string
          guards: Json
          handoff: boolean
          id: string
          latency_ms: number | null
          metadata: Json
          model_name: string | null
          model_provider: string | null
          route: string | null
          source_message_id: string | null
          sources: Json
          tools: Json
          workspace_id: string
        }
        Insert: {
          agent_id: string
          agent_version_id: string
          compiler_version: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_code?: string | null
          estimated_cost?: number | null
          event_kind: string
          guards?: Json
          handoff?: boolean
          id?: string
          latency_ms?: number | null
          metadata?: Json
          model_name?: string | null
          model_provider?: string | null
          route?: string | null
          source_message_id?: string | null
          sources?: Json
          tools?: Json
          workspace_id: string
        }
        Update: {
          agent_id?: string
          agent_version_id?: string
          compiler_version?: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_code?: string | null
          estimated_cost?: number | null
          event_kind?: string
          guards?: Json
          handoff?: boolean
          id?: string
          latency_ms?: number | null
          metadata?: Json
          model_name?: string | null
          model_provider?: string | null
          route?: string | null
          source_message_id?: string | null
          sources?: Json
          tools?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runtime_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runtime_events_agent_version_id_fkey"
            columns: ["agent_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runtime_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runtime_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runtime_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runtime_events_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runtime_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_suggestions: {
        Row: {
          agent_id: string
          applied_entity_id: string | null
          applied_entity_type: string | null
          created_at: string
          evidence: Json
          fingerprint: string
          id: string
          proposed_change: Json
          rationale: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_conversation_id: string | null
          status: string
          suggestion_type: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agent_id: string
          applied_entity_id?: string | null
          applied_entity_type?: string | null
          created_at?: string
          evidence?: Json
          fingerprint: string
          id?: string
          proposed_change?: Json
          rationale: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_conversation_id?: string | null
          status?: string
          suggestion_type: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          agent_id?: string
          applied_entity_id?: string | null
          applied_entity_type?: string | null
          created_at?: string
          evidence?: Json
          fingerprint?: string
          id?: string
          proposed_change?: Json
          rationale?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_conversation_id?: string | null
          status?: string
          suggestion_type?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_suggestions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_suggestions_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_suggestions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_versions: {
        Row: {
          accepted_warnings: Json
          agent_id: string
          checksum: string
          compiled_prompt: string
          compiler_version: string
          config: Json
          created_at: string
          created_by: string | null
          evaluation_run_id: string | null
          id: string
          label: string | null
          published_at: string
          restored_from_version_id: string | null
          source: string
          version_number: number
          workspace_id: string
        }
        Insert: {
          accepted_warnings?: Json
          agent_id: string
          checksum: string
          compiled_prompt: string
          compiler_version?: string
          config: Json
          created_at?: string
          created_by?: string | null
          evaluation_run_id?: string | null
          id?: string
          label?: string | null
          published_at?: string
          restored_from_version_id?: string | null
          source?: string
          version_number: number
          workspace_id: string
        }
        Update: {
          accepted_warnings?: Json
          agent_id?: string
          checksum?: string
          compiled_prompt?: string
          compiler_version?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          evaluation_run_id?: string | null
          id?: string
          label?: string | null
          published_at?: string
          restored_from_version_id?: string | null
          source?: string
          version_number?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_versions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_versions_evaluation_run_id_fkey"
            columns: ["evaluation_run_id"]
            isOneToOne: false
            referencedRelation: "eval_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_versions_restored_from_version_id_fkey"
            columns: ["restored_from_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          published_version_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          published_version_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          published_version_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_published_version_fk"
            columns: ["published_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          attendees: string[] | null
          calendar_provider: string | null
          calendar_sync_error: string | null
          calendar_sync_status: string
          calendar_synced_at: string | null
          contact_id: string | null
          created_at: string
          date: string
          description: string | null
          duration: number
          external_calendar_event_id: string | null
          id: string
          meeting_url: string | null
          metadata: Json | null
          status: string | null
          time: string
          title: string
          type: Database["public"]["Enums"]["appointment_type"]
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          attendees?: string[] | null
          calendar_provider?: string | null
          calendar_sync_error?: string | null
          calendar_sync_status?: string
          calendar_synced_at?: string | null
          contact_id?: string | null
          created_at?: string
          date: string
          description?: string | null
          duration?: number
          external_calendar_event_id?: string | null
          id?: string
          meeting_url?: string | null
          metadata?: Json | null
          status?: string | null
          time: string
          title: string
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          attendees?: string[] | null
          calendar_provider?: string | null
          calendar_sync_error?: string | null
          calendar_sync_status?: string
          calendar_synced_at?: string | null
          contact_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          duration?: number
          external_calendar_event_id?: string | null
          id?: string
          meeting_url?: string | null
          metadata?: Json | null
          status?: string | null
          time?: string
          title?: string
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_integrations: {
        Row: {
          access_token: string | null
          account_email: string | null
          calendar_id: string
          create_meet: boolean
          created_at: string
          grant_id: string | null
          grant_provider: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          owner_user_id: string
          provider: string
          refresh_token: string | null
          scopes: string[]
          status: string
          sync_enabled: boolean
          time_zone: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          account_email?: string | null
          calendar_id?: string
          create_meet?: boolean
          created_at?: string
          grant_id?: string | null
          grant_provider?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          owner_user_id: string
          provider?: string
          refresh_token?: string | null
          scopes?: string[]
          status?: string
          sync_enabled?: boolean
          time_zone?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          account_email?: string | null
          calendar_id?: string
          create_meet?: boolean
          created_at?: string
          grant_id?: string | null
          grant_provider?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          owner_user_id?: string
          provider?: string
          refresh_token?: string | null
          scopes?: string[]
          status?: string
          sync_enabled?: boolean
          time_zone?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      calendar_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          state_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          state_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          state_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      channel_connections: {
        Row: {
          connected_at: string | null
          created_at: string
          disconnected_at: string | null
          display_name: string | null
          id: string
          metadata: Json | null
          platform: string
          provider: string
          status: string
          updated_at: string
          username: string | null
          zernio_account_id: string
          zernio_profile_id: string | null
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          display_name?: string | null
          id?: string
          metadata?: Json | null
          platform: string
          provider?: string
          status?: string
          updated_at?: string
          username?: string | null
          zernio_account_id: string
          zernio_profile_id?: string | null
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          display_name?: string | null
          id?: string
          metadata?: Json | null
          platform?: string
          provider?: string
          status?: string
          updated_at?: string
          username?: string | null
          zernio_account_id?: string
          zernio_profile_id?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          avatar_url: string | null
          blocked_at: string | null
          blocked_reason: string | null
          call_name: string | null
          client_memory: Json | null
          created_at: string
          email: string | null
          first_contact_date: string
          id: string
          instagram_user_id: string | null
          instagram_username: string | null
          is_blocked: boolean | null
          is_business: boolean | null
          last_activity: string
          name: string | null
          notes: string | null
          phone_number: string | null
          profile_picture_url: string | null
          tags: string[] | null
          updated_at: string
          user_id: string | null
          whatsapp_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          call_name?: string | null
          client_memory?: Json | null
          created_at?: string
          email?: string | null
          first_contact_date?: string
          id?: string
          instagram_user_id?: string | null
          instagram_username?: string | null
          is_blocked?: boolean | null
          is_business?: boolean | null
          last_activity?: string
          name?: string | null
          notes?: string | null
          phone_number?: string | null
          profile_picture_url?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
          whatsapp_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          call_name?: string | null
          client_memory?: Json | null
          created_at?: string
          email?: string | null
          first_contact_date?: string
          id?: string
          instagram_user_id?: string | null
          instagram_username?: string | null
          is_blocked?: boolean | null
          is_business?: boolean | null
          last_activity?: string
          name?: string | null
          notes?: string | null
          phone_number?: string | null
          profile_picture_url?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
          whatsapp_id?: string | null
        }
        Relationships: []
      }
      conversation_states: {
        Row: {
          conversation_id: string
          created_at: string
          current_state: string
          id: string
          last_action: string | null
          last_action_at: string | null
          scheduling_context: Json | null
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          current_state?: string
          id?: string
          last_action?: string | null
          last_action_at?: string | null
          scheduling_context?: Json | null
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          current_state?: string
          id?: string
          last_action?: string | null
          last_action_at?: string | null
          scheduling_context?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_states_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_team: Database["public"]["Enums"]["team_assignment"] | null
          assigned_user_id: string | null
          channel: string
          contact_id: string
          created_at: string
          id: string
          is_active: boolean
          lara_context: Json | null
          last_message_at: string
          metadata: Json | null
          started_at: string
          status: Database["public"]["Enums"]["conversation_status"]
          tags: string[] | null
          updated_at: string
          user_id: string | null
          workspace_id: string | null
          zernio_account_id: string | null
          zernio_conversation_id: string | null
        }
        Insert: {
          assigned_team?: Database["public"]["Enums"]["team_assignment"] | null
          assigned_user_id?: string | null
          channel?: string
          contact_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          lara_context?: Json | null
          last_message_at?: string
          metadata?: Json | null
          started_at?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
          zernio_account_id?: string | null
          zernio_conversation_id?: string | null
        }
        Update: {
          assigned_team?: Database["public"]["Enums"]["team_assignment"] | null
          assigned_user_id?: string | null
          channel?: string
          contact_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          lara_context?: Json | null
          last_message_at?: string
          metadata?: Json | null
          started_at?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
          zernio_account_id?: string | null
          zernio_conversation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_activities: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string
          description: string | null
          id: string
          is_completed: boolean | null
          scheduled_at: string | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          description?: string | null
          id?: string
          is_completed?: boolean | null
          scheduled_at?: string | null
          title: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          description?: string | null
          id?: string
          is_completed?: boolean | null
          scheduled_at?: string | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          company: string | null
          contact_id: string | null
          created_at: string | null
          due_date: string | null
          id: string
          lost_at: string | null
          lost_reason: string | null
          notes: string | null
          owner_id: string | null
          priority: string | null
          stage: string | null
          stage_id: string
          tags: string[] | null
          title: string
          updated_at: string | null
          user_id: string | null
          value: number | null
          won_at: string | null
          workspace_id: string | null
        }
        Insert: {
          company?: string | null
          contact_id?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          priority?: string | null
          stage?: string | null
          stage_id: string
          tags?: string[] | null
          title: string
          updated_at?: string | null
          user_id?: string | null
          value?: number | null
          won_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          company?: string | null
          contact_id?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          priority?: string | null
          stage?: string | null
          stage_id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
          value?: number | null
          won_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      eval_results: {
        Row: {
          attempts: number
          case_id: string | null
          category: string
          checker_details: Json
          created_at: string
          expected_behavior: string
          expected_content: string | null
          grounding: Json | null
          id: string
          judge_reason: string | null
          latency_ms: number | null
          query: string
          reply: string | null
          result_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_verdict: string | null
          run_id: string
          severity: string
          verdict: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          case_id?: string | null
          category: string
          checker_details?: Json
          created_at?: string
          expected_behavior: string
          expected_content?: string | null
          grounding?: Json | null
          id?: string
          judge_reason?: string | null
          latency_ms?: number | null
          query: string
          reply?: string | null
          result_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_verdict?: string | null
          run_id: string
          severity?: string
          verdict: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          case_id?: string | null
          category?: string
          checker_details?: Json
          created_at?: string
          expected_behavior?: string
          expected_content?: string | null
          grounding?: Json | null
          id?: string
          judge_reason?: string | null
          latency_ms?: number | null
          query?: string
          reply?: string | null
          result_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_verdict?: string | null
          run_id?: string
          severity?: string
          verdict?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eval_results_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "golden_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eval_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "eval_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eval_results_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      eval_runs: {
        Row: {
          accepted_warnings: number
          agent_id: string
          compiler_version: string | null
          config_snapshot: Json | null
          created_at: string
          critical_failures: number
          draft_id: string | null
          draft_revision: number | null
          errored: number
          failed: number
          finished_at: string | null
          gate_status: string
          id: string
          model_mode: string | null
          passed: number
          prompt_source: string
          started_by: string | null
          status: string
          technical_failures: number
          test_prompt: string | null
          total_cases: number
          unstable: number
          warnings: number
          workspace_id: string
        }
        Insert: {
          accepted_warnings?: number
          agent_id: string
          compiler_version?: string | null
          config_snapshot?: Json | null
          created_at?: string
          critical_failures?: number
          draft_id?: string | null
          draft_revision?: number | null
          errored?: number
          failed?: number
          finished_at?: string | null
          gate_status?: string
          id?: string
          model_mode?: string | null
          passed?: number
          prompt_source?: string
          started_by?: string | null
          status?: string
          technical_failures?: number
          test_prompt?: string | null
          total_cases?: number
          unstable?: number
          warnings?: number
          workspace_id: string
        }
        Update: {
          accepted_warnings?: number
          agent_id?: string
          compiler_version?: string | null
          config_snapshot?: Json | null
          created_at?: string
          critical_failures?: number
          draft_id?: string | null
          draft_revision?: number | null
          errored?: number
          failed?: number
          finished_at?: string | null
          gate_status?: string
          id?: string
          model_mode?: string | null
          passed?: number
          prompt_source?: string
          started_by?: string | null
          status?: string
          technical_failures?: number
          test_prompt?: string | null
          total_cases?: number
          unstable?: number
          warnings?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eval_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eval_runs_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "agent_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eval_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      golden_cases: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          category: string
          created_at: string
          expected_behavior: string
          expected_content: string | null
          id: string
          is_active: boolean
          messages: Json
          notes: string | null
          origin: string
          query: string
          scenario_key: string | null
          severity: string
          source_rule: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          category?: string
          created_at?: string
          expected_behavior: string
          expected_content?: string | null
          id?: string
          is_active?: boolean
          messages?: Json
          notes?: string | null
          origin?: string
          query: string
          scenario_key?: string | null
          severity?: string
          source_rule?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          category?: string
          created_at?: string
          expected_behavior?: string
          expected_content?: string | null
          id?: string
          is_active?: boolean
          messages?: Json
          notes?: string | null
          origin?: string
          query?: string
          scenario_key?: string | null
          severity?: string
          source_rule?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golden_cases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          fts: unknown
          id: string
          workspace_id: string
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          document_id: string
          fts?: unknown
          id?: string
          workspace_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          fts?: unknown
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          chunk_count: number
          content: string
          created_at: string
          doc_type: string
          error_message: string | null
          fingerprint: string | null
          id: string
          ingestion_report: Json
          is_active: boolean
          source_url: string | null
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          chunk_count?: number
          content: string
          created_at?: string
          doc_type?: string
          error_message?: string | null
          fingerprint?: string | null
          id?: string
          ingestion_report?: Json
          is_active?: boolean
          source_url?: string | null
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          chunk_count?: number
          content?: string
          created_at?: string
          doc_type?: string
          error_message?: string | null
          fingerprint?: string | null
          id?: string
          ingestion_report?: Json
          is_active?: boolean
          source_url?: string | null
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_facts: {
        Row: {
          always_include: boolean
          category: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          expires_at: string | null
          fact: string
          fts: unknown
          id: string
          is_active: boolean
          question: string | null
          source: string | null
          status: string
          title: string
          updated_at: string
          valid_from: string
          workspace_id: string
        }
        Insert: {
          always_include?: boolean
          category?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          expires_at?: string | null
          fact: string
          fts?: unknown
          id?: string
          is_active?: boolean
          question?: string | null
          source?: string | null
          status?: string
          title: string
          updated_at?: string
          valid_from?: string
          workspace_id: string
        }
        Update: {
          always_include?: boolean
          category?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          expires_at?: string | null
          fact?: string
          fts?: unknown
          id?: string
          is_active?: boolean
          question?: string | null
          source?: string | null
          status?: string
          title?: string
          updated_at?: string
          valid_from?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_facts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lara_processing_queue: {
        Row: {
          contact_id: string
          context_data: Json | null
          conversation_id: string
          created_at: string
          error_message: string | null
          id: string
          message_id: string
          priority: number
          processed_at: string | null
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }
        Insert: {
          contact_id: string
          context_data?: Json | null
          conversation_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_id: string
          priority?: number
          processed_at?: string | null
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Update: {
          contact_id?: string
          context_data?: Json | null
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string
          priority?: number
          processed_at?: string | null
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Relationships: []
      }
      lara_settings: {
        Row: {
          adaptive_response_enabled: boolean
          ai_model: string | null
          ai_model_mode: string | null
          ai_provider: string
          ai_scheduling_enabled: boolean | null
          anthropic_api_key: string | null
          async_booking_enabled: boolean | null
          audio_response_enabled: boolean | null
          auto_response_enabled: boolean
          business_days: number[]
          business_hours_end: string
          business_hours_start: string
          company_name: string | null
          created_at: string
          demo_mode_enabled: boolean
          elevenlabs_api_key: string | null
          elevenlabs_model: string | null
          elevenlabs_similarity_boost: number
          elevenlabs_speaker_boost: boolean
          elevenlabs_speed: number | null
          elevenlabs_stability: number
          elevenlabs_style: number
          elevenlabs_voice_id: string
          id: string
          is_active: boolean
          message_breaking_enabled: boolean
          nylas_api_key: string | null
          nylas_api_uri: string | null
          nylas_client_id: string | null
          onboarding_completed_at: string | null
          onboarding_dismissed_at: string | null
          openai_api_key: string | null
          response_delay_max: number
          response_delay_min: number
          route_all_to_receiver_enabled: boolean
          sdr_name: string | null
          system_prompt_override: string | null
          test_phone_numbers: Json | null
          test_system_prompt: string | null
          timezone: string
          updated_at: string
          user_id: string | null
          whatsapp_access_token: string | null
          whatsapp_business_account_id: string | null
          whatsapp_phone_number_id: string | null
          whatsapp_verify_token: string | null
          whatsapp_webhook_key: string | null
          zernio_api_key: string | null
          zernio_profile_id: string | null
          zernio_webhook_id: string | null
          zernio_webhook_secret: string | null
        }
        Insert: {
          adaptive_response_enabled?: boolean
          ai_model?: string | null
          ai_model_mode?: string | null
          ai_provider?: string
          ai_scheduling_enabled?: boolean | null
          anthropic_api_key?: string | null
          async_booking_enabled?: boolean | null
          audio_response_enabled?: boolean | null
          auto_response_enabled?: boolean
          business_days?: number[]
          business_hours_end?: string
          business_hours_start?: string
          company_name?: string | null
          created_at?: string
          demo_mode_enabled?: boolean
          elevenlabs_api_key?: string | null
          elevenlabs_model?: string | null
          elevenlabs_similarity_boost?: number
          elevenlabs_speaker_boost?: boolean
          elevenlabs_speed?: number | null
          elevenlabs_stability?: number
          elevenlabs_style?: number
          elevenlabs_voice_id?: string
          id?: string
          is_active?: boolean
          message_breaking_enabled?: boolean
          nylas_api_key?: string | null
          nylas_api_uri?: string | null
          nylas_client_id?: string | null
          onboarding_completed_at?: string | null
          onboarding_dismissed_at?: string | null
          openai_api_key?: string | null
          response_delay_max?: number
          response_delay_min?: number
          route_all_to_receiver_enabled?: boolean
          sdr_name?: string | null
          system_prompt_override?: string | null
          test_phone_numbers?: Json | null
          test_system_prompt?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string | null
          whatsapp_access_token?: string | null
          whatsapp_business_account_id?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_verify_token?: string | null
          whatsapp_webhook_key?: string | null
          zernio_api_key?: string | null
          zernio_profile_id?: string | null
          zernio_webhook_id?: string | null
          zernio_webhook_secret?: string | null
        }
        Update: {
          adaptive_response_enabled?: boolean
          ai_model?: string | null
          ai_model_mode?: string | null
          ai_provider?: string
          ai_scheduling_enabled?: boolean | null
          anthropic_api_key?: string | null
          async_booking_enabled?: boolean | null
          audio_response_enabled?: boolean | null
          auto_response_enabled?: boolean
          business_days?: number[]
          business_hours_end?: string
          business_hours_start?: string
          company_name?: string | null
          created_at?: string
          demo_mode_enabled?: boolean
          elevenlabs_api_key?: string | null
          elevenlabs_model?: string | null
          elevenlabs_similarity_boost?: number
          elevenlabs_speaker_boost?: boolean
          elevenlabs_speed?: number | null
          elevenlabs_stability?: number
          elevenlabs_style?: number
          elevenlabs_voice_id?: string
          id?: string
          is_active?: boolean
          message_breaking_enabled?: boolean
          nylas_api_key?: string | null
          nylas_api_uri?: string | null
          nylas_client_id?: string | null
          onboarding_completed_at?: string | null
          onboarding_dismissed_at?: string | null
          openai_api_key?: string | null
          response_delay_max?: number
          response_delay_min?: number
          route_all_to_receiver_enabled?: boolean
          sdr_name?: string | null
          system_prompt_override?: string | null
          test_phone_numbers?: Json | null
          test_system_prompt?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string | null
          whatsapp_access_token?: string | null
          whatsapp_business_account_id?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_verify_token?: string | null
          whatsapp_webhook_key?: string | null
          zernio_api_key?: string | null
          zernio_profile_id?: string | null
          zernio_webhook_id?: string | null
          zernio_webhook_secret?: string | null
        }
        Relationships: []
      }
      message_grouping_queue: {
        Row: {
          contacts_data: Json | null
          created_at: string
          id: string
          message_data: Json
          message_id: string | null
          phone_number_id: string
          process_after: string | null
          processed: boolean
          whatsapp_message_id: string
        }
        Insert: {
          contacts_data?: Json | null
          created_at?: string
          id?: string
          message_data: Json
          message_id?: string | null
          phone_number_id: string
          process_after?: string | null
          processed?: boolean
          whatsapp_message_id: string
        }
        Update: {
          contacts_data?: Json | null
          created_at?: string
          id?: string
          message_data?: Json
          message_id?: string | null
          phone_number_id?: string
          process_after?: string | null
          processed?: boolean
          whatsapp_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_grouping_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_processing_queue: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          phone_number_id: string
          priority: number
          processed_at: string | null
          raw_data: Json
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
          whatsapp_message_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          phone_number_id: string
          priority?: number
          processed_at?: string | null
          raw_data: Json
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
          whatsapp_message_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          phone_number_id?: string
          priority?: number
          processed_at?: string | null
          raw_data?: Json
          retry_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
          whatsapp_message_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          from_type: Database["public"]["Enums"]["message_from"]
          id: string
          lara_response_time: number | null
          media_type: string | null
          media_url: string | null
          metadata: Json | null
          processed_by_lara: boolean | null
          read_at: string | null
          reply_to_id: string | null
          sent_at: string
          status: Database["public"]["Enums"]["message_status"]
          type: Database["public"]["Enums"]["message_type"]
          whatsapp_message_id: string | null
          zernio_message_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          from_type: Database["public"]["Enums"]["message_from"]
          id?: string
          lara_response_time?: number | null
          media_type?: string | null
          media_url?: string | null
          metadata?: Json | null
          processed_by_lara?: boolean | null
          read_at?: string | null
          reply_to_id?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["message_status"]
          type?: Database["public"]["Enums"]["message_type"]
          whatsapp_message_id?: string | null
          zernio_message_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          from_type?: Database["public"]["Enums"]["message_from"]
          id?: string
          lara_response_time?: number | null
          media_type?: string | null
          media_url?: string | null
          metadata?: Json | null
          processed_by_lara?: boolean | null
          read_at?: string | null
          reply_to_id?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["message_status"]
          type?: Database["public"]["Enums"]["message_type"]
          whatsapp_message_id?: string | null
          zernio_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          ai_trigger_criteria: string | null
          color: string
          created_at: string | null
          id: string
          is_active: boolean | null
          is_ai_managed: boolean | null
          is_system: boolean | null
          position: number
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ai_trigger_criteria?: string | null
          color?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_ai_managed?: boolean | null
          is_system?: boolean | null
          position?: number
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ai_trigger_criteria?: string | null
          color?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_ai_managed?: boolean | null
          is_system?: boolean | null
          position?: number
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prompt_versions: {
        Row: {
          blocks: Json
          content: string
          created_at: string
          created_by: string | null
          eval_run_id: string | null
          id: string
          label: string | null
          source: string
        }
        Insert: {
          blocks?: Json
          content: string
          created_at?: string
          created_by?: string | null
          eval_run_id?: string | null
          id?: string
          label?: string | null
          source?: string
        }
        Update: {
          blocks?: Json
          content?: string
          created_at?: string
          created_by?: string | null
          eval_run_id?: string | null
          id?: string
          label?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_versions_eval_run_id_fkey"
            columns: ["eval_run_id"]
            isOneToOne: false
            referencedRelation: "eval_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      send_queue: {
        Row: {
          contact_id: string
          content: string | null
          conversation_id: string
          created_at: string
          error_message: string | null
          from_type: string
          id: string
          media_url: string | null
          message_id: string | null
          message_type: string
          metadata: Json | null
          priority: number
          retry_count: number
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }
        Insert: {
          contact_id: string
          content?: string | null
          conversation_id: string
          created_at?: string
          error_message?: string | null
          from_type?: string
          id?: string
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          metadata?: Json | null
          priority?: number
          retry_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Update: {
          contact_id?: string
          content?: string | null
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          from_type?: string
          id?: string
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          metadata?: Json | null
          priority?: number
          retry_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "send_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_allowlist: {
        Row: {
          app_role: Database["public"]["Enums"]["app_role"]
          can_publish_agent: boolean
          claimed_at: string | null
          created_at: string
          email: string
          invite_sent_at: string | null
          invited_by: string | null
          invited_by_name: string | null
          invited_name: string | null
          note: string | null
          workspace_role: Database["public"]["Enums"]["workspace_member_role"]
        }
        Insert: {
          app_role?: Database["public"]["Enums"]["app_role"]
          can_publish_agent?: boolean
          claimed_at?: string | null
          created_at?: string
          email: string
          invite_sent_at?: string | null
          invited_by?: string | null
          invited_by_name?: string | null
          invited_name?: string | null
          note?: string | null
          workspace_role?: Database["public"]["Enums"]["workspace_member_role"]
        }
        Update: {
          app_role?: Database["public"]["Enums"]["app_role"]
          can_publish_agent?: boolean
          claimed_at?: string | null
          created_at?: string
          email?: string
          invite_sent_at?: string | null
          invited_by?: string | null
          invited_by_name?: string | null
          invited_name?: string | null
          note?: string | null
          workspace_role?: Database["public"]["Enums"]["workspace_member_role"]
        }
        Relationships: []
      }
      tag_definitions: {
        Row: {
          category: string
          color: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          label: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      team_functions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          avatar: string | null
          created_at: string
          email: string
          function_id: string | null
          id: string
          last_active: string | null
          name: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          team_id: string | null
          updated_at: string
          user_id: string | null
          weight: number | null
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          email: string
          function_id?: string | null
          id?: string
          last_active?: string | null
          name: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
          weight?: number | null
        }
        Update: {
          avatar?: string | null
          created_at?: string
          email?: string
          function_id?: string | null
          id?: string
          last_active?: string | null
          name?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "team_functions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      unanswered_questions: {
        Row: {
          contact_id: string | null
          context: string | null
          conversation_id: string | null
          created_at: string
          id: string
          kind: string
          last_seen_at: string
          metadata: Json
          normalized_question: string | null
          occurrence_count: number
          question: string
          resolution_proof: Json
          resolved_at: string | null
          resolved_by: string | null
          resolved_fact_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          contact_id?: string | null
          context?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          last_seen_at?: string
          metadata?: Json
          normalized_question?: string | null
          occurrence_count?: number
          question: string
          resolution_proof?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_fact_id?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          contact_id?: string | null
          context?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          last_seen_at?: string
          metadata?: Json
          normalized_question?: string | null
          occurrence_count?: number
          question?: string
          resolution_proof?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_fact_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unanswered_questions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unanswered_questions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unanswered_questions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unanswered_questions_resolved_fact_id_fkey"
            columns: ["resolved_fact_id"]
            isOneToOne: false
            referencedRelation: "knowledge_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unanswered_questions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          can_publish_agent: boolean
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_member_role"]
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          can_publish_agent?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_member_role"]
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          can_publish_agent?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_member_role"]
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      zernio_webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_id: string
          event_type: string
          id: string
          payload: Json
          processed: boolean
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_id: string
          event_type: string
          id?: string
          payload?: Json
          processed?: boolean
        }
        Update: {
          created_at?: string
          error?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      contacts_with_stats: {
        Row: {
          blocked_at: string | null
          blocked_reason: string | null
          call_name: string | null
          client_memory: Json | null
          created_at: string | null
          email: string | null
          first_contact_date: string | null
          human_messages: number | null
          id: string | null
          is_blocked: boolean | null
          is_business: boolean | null
          lara_messages: number | null
          last_activity: string | null
          name: string | null
          notes: string | null
          phone_number: string | null
          profile_picture_url: string | null
          tags: string[] | null
          total_messages: number | null
          updated_at: string | null
          user_id: string | null
          user_messages: number | null
          whatsapp_id: string | null
        }
        Relationships: []
      }
      lara_settings_public: {
        Row: {
          company_name: string | null
          demo_mode_enabled: boolean | null
          has_anthropic: boolean | null
          has_custom_prompt: boolean | null
          has_elevenlabs: boolean | null
          has_openai: boolean | null
          has_whatsapp_cloud: boolean | null
          has_zernio: boolean | null
          id: string | null
          is_active: boolean | null
          onboarding_completed_at: string | null
          onboarding_dismissed_at: string | null
          sdr_name: string | null
          updated_at: string | null
        }
        Insert: {
          company_name?: string | null
          demo_mode_enabled?: boolean | null
          has_anthropic?: never
          has_custom_prompt?: never
          has_elevenlabs?: never
          has_openai?: never
          has_whatsapp_cloud?: never
          has_zernio?: never
          id?: string | null
          is_active?: boolean | null
          onboarding_completed_at?: string | null
          onboarding_dismissed_at?: string | null
          sdr_name?: string | null
          updated_at?: string | null
        }
        Update: {
          company_name?: string | null
          demo_mode_enabled?: boolean | null
          has_anthropic?: never
          has_custom_prompt?: never
          has_elevenlabs?: never
          has_openai?: never
          has_whatsapp_cloud?: never
          has_zernio?: never
          id?: string | null
          is_active?: boolean | null
          onboarding_completed_at?: string | null
          onboarding_dismissed_at?: string | null
          sdr_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      signup_invites: {
        Row: {
          app_role: Database["public"]["Enums"]["app_role"] | null
          can_publish_agent: boolean | null
          claimed_at: string | null
          created_at: string | null
          email: string | null
          invite_sent_at: string | null
          invited_by_name: string | null
          invited_name: string | null
          situacao: string | null
          workspace_role:
            | Database["public"]["Enums"]["workspace_member_role"]
            | null
        }
        Insert: {
          app_role?: Database["public"]["Enums"]["app_role"] | null
          can_publish_agent?: boolean | null
          claimed_at?: string | null
          created_at?: string | null
          email?: string | null
          invite_sent_at?: string | null
          invited_by_name?: string | null
          invited_name?: string | null
          situacao?: never
          workspace_role?:
            | Database["public"]["Enums"]["workspace_member_role"]
            | null
        }
        Update: {
          app_role?: Database["public"]["Enums"]["app_role"] | null
          can_publish_agent?: boolean | null
          claimed_at?: string | null
          created_at?: string | null
          email?: string | null
          invite_sent_at?: string | null
          invited_by_name?: string | null
          invited_name?: string | null
          situacao?: never
          workspace_role?:
            | Database["public"]["Enums"]["workspace_member_role"]
            | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_edit_agent: {
        Args: { _user_id?: string; _workspace_id: string }
        Returns: boolean
      }
      can_publish_agent: {
        Args: { _user_id?: string; _workspace_id: string }
        Returns: boolean
      }
      claim_lara_processing_batch: {
        Args: { p_limit?: number }
        Returns: {
          contact_id: string
          context_data: Json | null
          conversation_id: string
          created_at: string
          error_message: string | null
          id: string
          message_id: string
          priority: number
          processed_at: string | null
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "lara_processing_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_message_processing_batch: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          error_message: string | null
          id: string
          phone_number_id: string
          priority: number
          processed_at: string | null
          raw_data: Json
          retry_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
          whatsapp_message_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "message_processing_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_send_queue_batch: {
        Args: { p_limit?: number }
        Returns: {
          contact_id: string
          content: string | null
          conversation_id: string
          created_at: string
          error_message: string | null
          from_type: string
          id: string
          media_url: string | null
          message_id: string | null
          message_type: string
          metadata: Json | null
          priority: number
          retry_count: number
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "send_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_processed_message_queue: { Args: never; Returns: undefined }
      cleanup_processed_queues: { Args: never; Returns: undefined }
      consume_agent_rate_limit: {
        Args: {
          _max_requests: number
          _operation: string
          _subject_key: string
          _window_seconds: number
          _workspace_id: string
        }
        Returns: boolean
      }
      conversation_delivery_trace: {
        Args: { _conversation_id: string }
        Returns: {
          detalhe: string
          em: string
          etapa: string
          situacao: string
          tentativas: number
        }[]
      }
      current_workspace_id: { Args: never; Returns: string }
      delete_test_conversation: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      enqueue_lara_processing: {
        Args: {
          p_contact_id: string
          p_context?: Json
          p_conversation_id: string
          p_delay_seconds?: number
          p_message_id: string
        }
        Returns: string
      }
      enqueue_outbound_message: {
        Args: {
          _content?: string
          _conversation_id: string
          _message_id?: string
        }
        Returns: string
      }
      ensure_edge_secrets: {
        Args: { p_project_url: string; p_service_role_key: string }
        Returns: undefined
      }
      ensure_workspace_membership: {
        Args: { _user_id: string }
        Returns: string
      }
      get_auth_user_id: { Args: never; Returns: string }
      get_current_agent_context: {
        Args: never
        Returns: {
          agent_id: string
          agent_name: string
          agent_status: string
          base_version_id: string
          can_publish: boolean
          draft_config: Json
          draft_id: string
          draft_revision: number
          draft_updated_at: string
          member_role: Database["public"]["Enums"]["workspace_member_role"]
          published_version_id: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      get_or_create_conversation_state: {
        Args: { p_conversation_id: string }
        Returns: {
          conversation_id: string
          created_at: string
          current_state: string
          id: string
          last_action: string | null
          last_action_at: string | null
          scheduling_context: Json | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_workspace_admin: {
        Args: { _user_id?: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id?: string; _workspace_id: string }
        Returns: boolean
      }
      lara_delivery_scoreboard: {
        Args: { _days?: number }
        Returns: {
          com_agendamento: number
          conversas: number
          falhas_na_fila: number
          fim: string
          inicio: string
          mediana_primeira_resposta_segundos: number
          periodo: string
          sem_humano: number
        }[]
      }
      normalize_unanswered_text: { Args: { p_text: string }; Returns: string }
      publish_agent_draft: {
        Args: {
          _accepted_warnings?: Json
          _agent_id: string
          _evaluation_run_id?: string
          _expected_revision: number
          _label?: string
        }
        Returns: {
          accepted_warnings: Json
          agent_id: string
          checksum: string
          compiled_prompt: string
          compiler_version: string
          config: Json
          created_at: string
          created_by: string | null
          evaluation_run_id: string | null
          id: string
          label: string | null
          published_at: string
          restored_from_version_id: string | null
          source: string
          version_number: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      publish_compiled_agent_draft: {
        Args: {
          _accepted_warnings?: Json
          _actor_user_id: string
          _agent_id: string
          _compiled_prompt: string
          _compiler_version: string
          _evaluation_run_id?: string
          _expected_revision: number
          _label?: string
        }
        Returns: {
          accepted_warnings: Json
          agent_id: string
          checksum: string
          compiled_prompt: string
          compiler_version: string
          config: Json
          created_at: string
          created_by: string | null
          evaluation_run_id: string | null
          id: string
          label: string | null
          published_at: string
          restored_from_version_id: string | null
          source: string
          version_number: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_agent_product_event: {
        Args: {
          _agent_id: string
          _event: string
          _metadata?: Json
          _step?: string
        }
        Returns: undefined
      }
      restore_agent_version_to_draft: {
        Args: {
          _agent_id: string
          _expected_revision: number
          _version_id: string
        }
        Returns: {
          agent_id: string
          base_version_id: string | null
          config: Json
          created_at: string
          created_by: string | null
          id: string
          revision: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_drafts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_agent_suggestion: {
        Args: {
          _applied_entity_id?: string
          _applied_entity_type?: string
          _status: string
          _suggestion_id: string
        }
        Returns: {
          agent_id: string
          applied_entity_id: string | null
          applied_entity_type: string | null
          created_at: string
          evidence: Json
          fingerprint: string
          id: string
          proposed_change: Json
          rationale: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_conversation_id: string | null
          status: string
          suggestion_type: string
          title: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_suggestions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_evaluation_result: {
        Args: {
          _accept_scenario?: boolean
          _result_id: string
          _verdict: string
        }
        Returns: {
          attempts: number
          case_id: string | null
          category: string
          checker_details: Json
          created_at: string
          expected_behavior: string
          expected_content: string | null
          grounding: Json | null
          id: string
          judge_reason: string | null
          latency_ms: number | null
          query: string
          reply: string | null
          result_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_verdict: string | null
          run_id: string
          severity: string
          verdict: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "eval_results"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_signup_invite: {
        Args: { _actor_id: string; _email: string }
        Returns: Json
      }
      save_agent_draft: {
        Args: { _agent_id: string; _config: Json; _expected_revision: number }
        Returns: {
          agent_id: string
          base_version_id: string | null
          config: Json
          created_at: string
          created_by: string | null
          id: string
          revision: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_drafts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_knowledge: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          content: string
          rank: number
          source_id: string
          source_type: string
          title: string
        }[]
      }
      search_workspace_knowledge: {
        Args: { _workspace_id: string; p_limit?: number; p_query: string }
        Returns: {
          content: string
          rank: number
          source_id: string
          source_type: string
          title: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_client_memory: {
        Args: { p_contact_id: string; p_new_memory: Json }
        Returns: undefined
      }
      update_conversation_state: {
        Args: {
          p_action?: string
          p_context?: Json
          p_conversation_id: string
          p_new_state: string
        }
        Returns: {
          conversation_id: string
          created_at: string
          current_state: string
          id: string
          last_action: string | null
          last_action_at: string | null
          scheduling_context: Json | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      write_knowledge_document: {
        Args: {
          _chunks: string[]
          _content: string
          _doc_type: string
          _document_id: string
          _error_message: string
          _fingerprint: string
          _ingestion_report: Json
          _is_active: boolean
          _source_url: string
          _status: string
          _title: string
        }
        Returns: {
          chunk_count: number
          content: string
          created_at: string
          doc_type: string
          error_message: string | null
          fingerprint: string | null
          id: string
          ingestion_report: Json
          is_active: boolean
          source_url: string | null
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "user"
      appointment_type: "demo" | "meeting" | "support" | "followup"
      conversation_status: "lara" | "human" | "paused"
      member_role: "admin" | "manager" | "agent"
      member_status: "active" | "invited" | "disabled"
      message_from: "user" | "lara" | "human"
      message_status: "sent" | "delivered" | "read" | "failed" | "processing"
      message_type: "text" | "audio" | "image" | "document" | "video"
      queue_status: "pending" | "processing" | "completed" | "failed"
      team_assignment:
        | "comercial"
        | "tecnico"
        | "operacional"
        | "vendas"
        | "suporte"
      workspace_member_role: "admin" | "editor" | "observer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "user"],
      appointment_type: ["demo", "meeting", "support", "followup"],
      conversation_status: ["lara", "human", "paused"],
      member_role: ["admin", "manager", "agent"],
      member_status: ["active", "invited", "disabled"],
      message_from: ["user", "lara", "human"],
      message_status: ["sent", "delivered", "read", "failed", "processing"],
      message_type: ["text", "audio", "image", "document", "video"],
      queue_status: ["pending", "processing", "completed", "failed"],
      team_assignment: [
        "comercial",
        "tecnico",
        "operacional",
        "vendas",
        "suporte",
      ],
      workspace_member_role: ["admin", "editor", "observer"],
    },
  },
} as const
