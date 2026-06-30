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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      _backfill_audit_b1_pre: {
        Row: {
          captured_at: string
          entity_id: string
          id: string
          organization_id: string
          sub: string
        }
        Insert: {
          captured_at?: string
          entity_id: string
          id?: string
          organization_id: string
          sub: string
        }
        Update: {
          captured_at?: string
          entity_id?: string
          id?: string
          organization_id?: string
          sub?: string
        }
        Relationships: []
      }
      _backfill_audit_b1_universe: {
        Row: {
          captured_at: string
          entity_id: string
          id: string
          lead_deleted_at: string | null
          lead_id: string
          organization_id: string
          status: string | null
          sub: string
        }
        Insert: {
          captured_at?: string
          entity_id: string
          id?: string
          lead_deleted_at?: string | null
          lead_id: string
          organization_id: string
          status?: string | null
          sub: string
        }
        Update: {
          captured_at?: string
          entity_id?: string
          id?: string
          lead_deleted_at?: string | null
          lead_id?: string
          organization_id?: string
          status?: string | null
          sub?: string
        }
        Relationships: []
      }
      _backfill_map_005: {
        Row: {
          created_at: string
          id: string
          new_created_by: string
          old_created_by: string
          row_pk: string
          table_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_created_by: string
          old_created_by: string
          row_pk: string
          table_name: string
        }
        Update: {
          created_at?: string
          id?: string
          new_created_by?: string
          old_created_by?: string
          row_pk?: string
          table_name?: string
        }
        Relationships: []
      }
      _backfill_map_006_proposal_sends_sent_by: {
        Row: {
          frozen_at: string | null
          id: string | null
          old_sent_by: string | null
        }
        Insert: {
          frozen_at?: string | null
          id?: string | null
          old_sent_by?: string | null
        }
        Update: {
          frozen_at?: string | null
          id?: string | null
          old_sent_by?: string | null
        }
        Relationships: []
      }
      _backfill_map_007_quote_templates_created_by: {
        Row: {
          id: string | null
          old_created_by: string | null
        }
        Insert: {
          id?: string | null
          old_created_by?: string | null
        }
        Update: {
          id?: string | null
          old_created_by?: string | null
        }
        Relationships: []
      }
      _backfill_map_007_quotes_created_by: {
        Row: {
          id: string | null
          old_created_by: string | null
        }
        Insert: {
          id?: string | null
          old_created_by?: string | null
        }
        Update: {
          id?: string | null
          old_created_by?: string | null
        }
        Relationships: []
      }
      _backfill_map_20260429_marketing_lists_identity: {
        Row: {
          captured_at: string | null
          id: string | null
          new_created_by: string | null
          new_organization_id: string | null
          old_created_by: string | null
          old_organization_id: string | null
        }
        Insert: {
          captured_at?: string | null
          id?: string | null
          new_created_by?: string | null
          new_organization_id?: string | null
          old_created_by?: string | null
          old_organization_id?: string | null
        }
        Update: {
          captured_at?: string | null
          id?: string | null
          new_created_by?: string | null
          new_organization_id?: string | null
          old_created_by?: string | null
          old_organization_id?: string | null
        }
        Relationships: []
      }
      account_deletion_requests: {
        Row: {
          created_at: string
          id: string
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          rejection_reason: string | null
          requested_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          rejection_reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          rejection_reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      activities: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          completed: boolean | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          deal_id: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          organization_id: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          completed?: boolean | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string | null
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          completed?: boolean | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_company_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      administrative_divisions: {
        Row: {
          admin_level: number
          area_km2: number | null
          code: string | null
          country_code: string
          created_at: string
          id: string
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
          name_ascii: string | null
          parent_id: string | null
          population: number | null
          updated_at: string
        }
        Insert: {
          admin_level: number
          area_km2?: number | null
          code?: string | null
          country_code: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
          name_ascii?: string | null
          parent_id?: string | null
          population?: number | null
          updated_at?: string
        }
        Update: {
          admin_level?: number
          area_km2?: number | null
          code?: string | null
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          name_ascii?: string | null
          parent_id?: string | null
          population?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "administrative_divisions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "administrative_divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_assistant_config: {
        Row: {
          config_key: string
          config_value: string
          created_at: string
          description: string | null
          id: string
          updated_at: string
        }
        Insert: {
          config_key: string
          config_value: string
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          config_key?: string
          config_value?: string
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_assistant_conversations: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          session_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          session_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          session_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_assistant_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_assistant_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          deep_links: Json | null
          id: string
          rating: number | null
          rating_feedback: string | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          deep_links?: Json | null
          id?: string
          rating?: number | null
          rating_feedback?: string | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          deep_links?: Json | null
          id?: string
          rating?: number | null
          rating_feedback?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_assistant_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_assistant_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          conversation_type: string
          created_at: string
          id: string
          model_used: string | null
          organization_id: string | null
          query: string
          response_message: string | null
          suggestions: Json | null
          tips: Json | null
          tokens_used: number | null
          user_id: string | null
        }
        Insert: {
          conversation_type?: string
          created_at?: string
          id?: string
          model_used?: string | null
          organization_id?: string | null
          query: string
          response_message?: string | null
          suggestions?: Json | null
          tips?: Json | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Update: {
          conversation_type?: string
          created_at?: string
          id?: string
          model_used?: string | null
          organization_id?: string | null
          query?: string
          response_message?: string | null
          suggestions?: Json | null
          tips?: Json | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_suggestion_ratings: {
        Row: {
          conversation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          organization_id: string | null
          query_context: string | null
          rating: number
          suggestion_category: string | null
          suggestion_name: string
          suggestion_type: string | null
          was_added: boolean | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string | null
          query_context?: string | null
          rating: number
          suggestion_category?: string | null
          suggestion_name: string
          suggestion_type?: string | null
          was_added?: boolean | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string | null
          query_context?: string | null
          rating?: number
          suggestion_category?: string | null
          suggestion_name?: string
          suggestion_type?: string | null
          was_added?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestion_ratings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestion_ratings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_settings: {
        Row: {
          alert_type: string
          created_at: string
          days_threshold: number | null
          id: string
          is_active: boolean
          kind: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          days_threshold?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          days_threshold?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_addresses: {
        Row: {
          address_key: string
          city: string
          country: string
          created_at: string
          created_by: string | null
          district: string | null
          extra: string | null
          floor: string | null
          id: string
          number: string
          postal_code: string
          street: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          address_key: string
          city: string
          country?: string
          created_at?: string
          created_by?: string | null
          district?: string | null
          extra?: string | null
          floor?: string | null
          id?: string
          number: string
          postal_code: string
          street: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          address_key?: string
          city?: string
          country?: string
          created_at?: string
          created_by?: string | null
          district?: string | null
          extra?: string | null
          floor?: string | null
          id?: string
          number?: string
          postal_code?: string
          street?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anew_addresses_created_by_anew_users_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_clients: {
        Row: {
          assigned_to: string | null
          client_type: string | null
          created_at: string | null
          created_by: string | null
          custom_fields: Json | null
          deleted_at: string | null
          deleted_by: string | null
          entity_id: string
          id: string
          last_interaction_at: string | null
          notes: string | null
          organization_id: string
          root_organization_id: string
          source_id: string | null
          source_type: string | null
          status: string | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          client_type?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_fields?: Json | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id: string
          id?: string
          last_interaction_at?: string | null
          notes?: string | null
          organization_id: string
          root_organization_id: string
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          client_type?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_fields?: Json | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id?: string
          id?: string
          last_interaction_at?: string | null
          notes?: string | null
          organization_id?: string
          root_organization_id?: string
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anew_clients_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_clients_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "anew_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_contacts: {
        Row: {
          assigned_to: string | null
          call_center_assigned_to: string | null
          call_center_notes: string | null
          call_center_priority: number | null
          call_center_scheduled_for: string | null
          call_center_status: string | null
          converted_at: string | null
          converted_to_client_id: string | null
          created_at: string | null
          created_by: string | null
          custom_fields: Json | null
          deleted_at: string | null
          deleted_by: string | null
          entity_id: string
          id: string
          last_interaction_at: string | null
          notes: string | null
          organization_id: string
          position: string | null
          root_organization_id: string
          source_id: string | null
          source_lead_id: string | null
          source_type: string | null
          status: string | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          call_center_assigned_to?: string | null
          call_center_notes?: string | null
          call_center_priority?: number | null
          call_center_scheduled_for?: string | null
          call_center_status?: string | null
          converted_at?: string | null
          converted_to_client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_fields?: Json | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id: string
          id?: string
          last_interaction_at?: string | null
          notes?: string | null
          organization_id: string
          position?: string | null
          root_organization_id: string
          source_id?: string | null
          source_lead_id?: string | null
          source_type?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          call_center_assigned_to?: string | null
          call_center_notes?: string | null
          call_center_priority?: number | null
          call_center_scheduled_for?: string | null
          call_center_status?: string | null
          converted_at?: string | null
          converted_to_client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_fields?: Json | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id?: string
          id?: string
          last_interaction_at?: string | null
          notes?: string | null
          organization_id?: string
          position?: string | null
          root_organization_id?: string
          source_id?: string | null
          source_lead_id?: string | null
          source_type?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anew_contacts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_contacts_created_by_anew_users_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_contacts_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "anew_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_contacts_root_organization_id_fkey"
            columns: ["root_organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_entities: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string
          first_name: string | null
          id: string
          last_name: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      anew_entity_addresses: {
        Row: {
          address_id: string
          address_type: string | null
          created_at: string
          created_by: string | null
          entity_id: string
          id: string
          is_fiscal: boolean | null
          is_primary: boolean | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          address_id: string
          address_type?: string | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          id?: string
          is_fiscal?: boolean | null
          is_primary?: boolean | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          address_id?: string
          address_type?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          id?: string
          is_fiscal?: boolean | null
          is_primary?: boolean | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anew_entity_addresses_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "anew_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_entity_addresses_created_by_anew_users_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_entity_emails: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          email_type: string | null
          entity_id: string
          id: string
          is_primary: boolean | null
          is_verified: boolean | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          email_type?: string | null
          entity_id: string
          id?: string
          is_primary?: boolean | null
          is_verified?: boolean | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          email_type?: string | null
          entity_id?: string
          id?: string
          is_primary?: boolean | null
          is_verified?: boolean | null
        }
        Relationships: []
      }
      anew_entity_fiscal_entities: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          fiscal_entity_id: string
          id: string
          is_primary: boolean | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          fiscal_entity_id: string
          id?: string
          is_primary?: boolean | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          fiscal_entity_id?: string
          id?: string
          is_primary?: boolean | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anew_entity_fiscal_entities_created_by_anew_users_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_entity_history: {
        Row: {
          change_type: string
          changed_by: string | null
          created_at: string
          entity_id: string
          field_name: string | null
          id: string
          metadata: Json | null
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          change_type: string
          changed_by?: string | null
          created_at?: string
          entity_id: string
          field_name?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          change_type?: string
          changed_by?: string | null
          created_at?: string
          entity_id?: string
          field_name?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: []
      }
      anew_entity_org_links: {
        Row: {
          created_at: string
          entity_id: string
          is_primary: boolean
          organization_id: string
          shared_at: string | null
          shared_by: string | null
          shared_from_org_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          is_primary?: boolean
          organization_id: string
          shared_at?: string | null
          shared_by?: string | null
          shared_from_org_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          is_primary?: boolean
          organization_id?: string
          shared_at?: string | null
          shared_by?: string | null
          shared_from_org_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anew_entity_org_links_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "anew_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_entity_org_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_entity_org_links_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_entity_org_links_shared_from_org_id_fkey"
            columns: ["shared_from_org_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_entity_phones: {
        Row: {
          country_code: string | null
          created_at: string
          created_by: string | null
          entity_id: string
          id: string
          is_primary: boolean | null
          phone_number: string
          phone_type: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          id?: string
          is_primary?: boolean | null
          phone_number: string
          phone_type?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          id?: string
          is_primary?: boolean | null
          phone_number?: string
          phone_type?: string | null
        }
        Relationships: []
      }
      anew_entity_relationships: {
        Row: {
          created_at: string
          created_by: string | null
          from_entity_id: string
          id: string
          is_primary: boolean | null
          relationship_type: string
          root_organization_id: string
          status: string
          title: string | null
          to_entity_id: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_entity_id: string
          id?: string
          is_primary?: boolean | null
          relationship_type: string
          root_organization_id: string
          status?: string
          title?: string | null
          to_entity_id: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_entity_id?: string
          id?: string
          is_primary?: boolean | null
          relationship_type?: string
          root_organization_id?: string
          status?: string
          title?: string | null
          to_entity_id?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      anew_entity_roles: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          entity_id: string
          id: string
          organization_id: string
          previous_status: string | null
          role: string
          source_id: string | null
          source_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id: string
          id?: string
          organization_id: string
          previous_status?: string | null
          role: string
          source_id?: string | null
          source_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id?: string
          id?: string
          organization_id?: string
          previous_status?: string | null
          role?: string
          source_id?: string | null
          source_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      anew_hierarchy: {
        Row: {
          child_org_id: string
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean | null
          metadata: Json | null
          parent_org_id: string
          relationship_type: string
        }
        Insert: {
          child_org_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean | null
          metadata?: Json | null
          parent_org_id: string
          relationship_type?: string
        }
        Update: {
          child_org_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean | null
          metadata?: Json | null
          parent_org_id?: string
          relationship_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "anew_hierarchy_child_org_id_fkey"
            columns: ["child_org_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_hierarchy_parent_org_id_fkey"
            columns: ["parent_org_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_leads: {
        Row: {
          assigned_to: string | null
          callback_notes: string | null
          callback_scheduled_at: string | null
          campaign_id: string | null
          contact_attempts: number | null
          converted_at: string | null
          converted_by: string | null
          converted_to_client_id: string | null
          converted_to_contact_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          entity_id: string | null
          field_values: Json
          id: string
          last_contact_at: string | null
          last_contact_by: string | null
          last_contact_result: string | null
          notes: string | null
          organization_id: string
          root_organization_id: string
          scheduled_visit_id: string | null
          search_text: string | null
          source: string | null
          source_id: string | null
          status: string | null
          tags: string[] | null
          updated_at: string
          workflow_stage_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          callback_notes?: string | null
          callback_scheduled_at?: string | null
          campaign_id?: string | null
          contact_attempts?: number | null
          converted_at?: string | null
          converted_by?: string | null
          converted_to_client_id?: string | null
          converted_to_contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id?: string | null
          field_values?: Json
          id?: string
          last_contact_at?: string | null
          last_contact_by?: string | null
          last_contact_result?: string | null
          notes?: string | null
          organization_id: string
          root_organization_id: string
          scheduled_visit_id?: string | null
          search_text?: string | null
          source?: string | null
          source_id?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string
          workflow_stage_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          callback_notes?: string | null
          callback_scheduled_at?: string | null
          campaign_id?: string | null
          contact_attempts?: number | null
          converted_at?: string | null
          converted_by?: string | null
          converted_to_client_id?: string | null
          converted_to_contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id?: string | null
          field_values?: Json
          id?: string
          last_contact_at?: string | null
          last_contact_by?: string | null
          last_contact_result?: string | null
          notes?: string | null
          organization_id?: string
          root_organization_id?: string
          scheduled_visit_id?: string | null
          search_text?: string | null
          source?: string | null
          source_id?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string
          workflow_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anew_leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_leads_converted_by_fkey"
            columns: ["converted_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_leads_converted_to_client_id_fkey"
            columns: ["converted_to_client_id"]
            isOneToOne: false
            referencedRelation: "anew_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_leads_converted_to_contact_id_fkey"
            columns: ["converted_to_contact_id"]
            isOneToOne: false
            referencedRelation: "anew_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_leads_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "anew_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_leads_last_contact_by_fkey"
            columns: ["last_contact_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_leads_root_organization_id_fkey"
            columns: ["root_organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_leads_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_leads_workflow_stage_id_fkey"
            columns: ["workflow_stage_id"]
            isOneToOne: false
            referencedRelation: "lead_workflow_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_member_hierarchy: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          member_id: string
          organization_id: string
          relationship_type: string
          reports_to_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          member_id: string
          organization_id: string
          relationship_type?: string
          reports_to_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          member_id?: string
          organization_id?: string
          relationship_type?: string
          reports_to_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anew_member_hierarchy_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_member_hierarchy_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_member_hierarchy_reports_to_id_fkey"
            columns: ["reports_to_id"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_membership_extra_permissions: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          membership_id: string
          permission_code: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          membership_id: string
          permission_code: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          membership_id?: string
          permission_code?: string
        }
        Relationships: []
      }
      anew_membership_permission_scopes: {
        Row: {
          created_at: string
          id: string
          membership_id: string
          permission_code: string
          scope_level: Database["public"]["Enums"]["anew_scope_level"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          membership_id: string
          permission_code: string
          scope_level?: Database["public"]["Enums"]["anew_scope_level"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          membership_id?: string
          permission_code?: string
          scope_level?: Database["public"]["Enums"]["anew_scope_level"]
          updated_at?: string
        }
        Relationships: []
      }
      anew_memberships: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          join_method: string | null
          metadata: Json | null
          organization_id: string
          relationship_type: string
          role_id: string
          start_date: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          join_method?: string | null
          metadata?: Json | null
          organization_id: string
          relationship_type?: string
          role_id: string
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          join_method?: string | null
          metadata?: Json | null
          organization_id?: string
          relationship_type?: string
          role_id?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      anew_org_addresses: {
        Row: {
          address_id: string
          created_at: string
          created_by: string | null
          id: string
          is_fiscal: boolean
          org_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          address_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_fiscal?: boolean
          org_id: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          address_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_fiscal?: boolean
          org_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anew_org_addresses_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "anew_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_org_addresses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_org_associations: {
        Row: {
          associated_org_id: string
          association_type: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
        }
        Insert: {
          associated_org_id: string
          association_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
        }
        Update: {
          associated_org_id?: string
          association_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
        }
        Relationships: []
      }
      anew_org_fiscal_entities: {
        Row: {
          created_at: string | null
          created_by: string | null
          fiscal_entity_id: string
          id: string
          is_primary: boolean | null
          organization_id: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          fiscal_entity_id: string
          id?: string
          is_primary?: boolean | null
          organization_id: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          fiscal_entity_id?: string
          id?: string
          is_primary?: boolean | null
          organization_id?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      anew_org_template_nodes: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          name: string
          parent_node_id: string | null
          sort_order: number | null
          template_id: string
          type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          name: string
          parent_node_id?: string | null
          sort_order?: number | null
          template_id: string
          type?: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          parent_node_id?: string | null
          sort_order?: number | null
          template_id?: string
          type?: string
        }
        Relationships: []
      }
      anew_org_templates: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          name: string
          recommended_modules: Json | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name: string
          recommended_modules?: Json | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name?: string
          recommended_modules?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      anew_organizations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entity_id: string | null
          id: string
          is_fiscal: boolean | null
          logo_url: string | null
          metadata: Json | null
          name: string
          phone: string | null
          sector: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_id?: string | null
          id?: string
          is_fiscal?: boolean | null
          logo_url?: string | null
          metadata?: Json | null
          name: string
          phone?: string | null
          sector?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_id?: string | null
          id?: string
          is_fiscal?: boolean | null
          logo_url?: string | null
          metadata?: Json | null
          name?: string
          phone?: string | null
          sector?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      anew_permissions: {
        Row: {
          category: string
          code: string
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_dangerous: boolean | null
          name: string
          parent_code: string | null
          scope: string | null
          supports_scope: boolean
          updated_at: string | null
        }
        Insert: {
          category: string
          code: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_dangerous?: boolean | null
          name: string
          parent_code?: string | null
          scope?: string | null
          supports_scope?: boolean
          updated_at?: string | null
        }
        Update: {
          category?: string
          code?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_dangerous?: boolean | null
          name?: string
          parent_code?: string | null
          scope?: string | null
          supports_scope?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      anew_relations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_bidirectional: boolean | null
          metadata: Json | null
          relation_label: string | null
          relation_type: string
          source_org_id: string
          target_org_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_bidirectional?: boolean | null
          metadata?: Json | null
          relation_label?: string | null
          relation_type?: string
          source_org_id: string
          target_org_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_bidirectional?: boolean | null
          metadata?: Json | null
          relation_label?: string | null
          relation_type?: string
          source_org_id?: string
          target_org_id?: string
        }
        Relationships: []
      }
      anew_role_permissions: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          permission_code: string
          role_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          permission_code: string
          role_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          permission_code?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anew_role_permissions_created_by_anew_users_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_roles: {
        Row: {
          can_sign_contracts: boolean
          code: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean | null
          is_system: boolean | null
          name: string
          organization_id: string | null
          updated_at: string | null
        }
        Insert: {
          can_sign_contracts?: boolean
          code: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_system?: boolean | null
          name: string
          organization_id?: string | null
          updated_at?: string | null
        }
        Update: {
          can_sign_contracts?: boolean
          code?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_system?: boolean | null
          name?: string
          organization_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      anew_user_fiscal_entities: {
        Row: {
          created_at: string | null
          created_by: string | null
          fiscal_entity_id: string
          id: string
          is_primary: boolean | null
          user_id: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          fiscal_entity_id: string
          id?: string
          is_primary?: boolean | null
          user_id: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          fiscal_entity_id?: string
          id?: string
          is_primary?: boolean | null
          user_id?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      anew_user_reports: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          percentage: number | null
          report_type: string | null
          reporter_user_id: string
          reports_to_user_id: string
          since: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          percentage?: number | null
          report_type?: string | null
          reporter_user_id: string
          reports_to_user_id: string
          since?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          percentage?: number | null
          report_type?: string | null
          reporter_user_id?: string
          reports_to_user_id?: string
          since?: string | null
        }
        Relationships: []
      }
      anew_users: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          created_at: string
          created_by: string | null
          custom_attributes: Json | null
          description: string | null
          email: string
          email_signature: string | null
          entity_id: string | null
          has_completed_welcome: boolean | null
          id: string
          location: string | null
          name: string
          phone: string | null
          position: string | null
          registration_origin: string
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          custom_attributes?: Json | null
          description?: string | null
          email: string
          email_signature?: string | null
          entity_id?: string | null
          has_completed_welcome?: boolean | null
          id?: string
          location?: string | null
          name: string
          phone?: string | null
          position?: string | null
          registration_origin?: string
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          custom_attributes?: Json | null
          description?: string | null
          email?: string
          email_signature?: string | null
          entity_id?: string | null
          has_completed_welcome?: boolean | null
          id?: string
          location?: string | null
          name?: string
          phone?: string | null
          position?: string | null
          registration_origin?: string
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          api_key: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          key_name: string
          last_used_at: string | null
          organization_id: string | null
          usage_count: number
        }
        Insert: {
          api_key: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_name: string
          last_used_at?: string | null
          organization_id?: string | null
          usage_count?: number
        }
        Update: {
          api_key?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_name?: string
          last_used_at?: string | null
          organization_id?: string | null
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_categories: {
        Row: {
          created_at: string
          created_by: string
          default_depreciation_method: string | null
          default_useful_life_years: number | null
          description: string | null
          id: string
          name: string
          parent_category_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          default_depreciation_method?: string | null
          default_useful_life_years?: number | null
          description?: string | null
          id?: string
          name: string
          parent_category_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          default_depreciation_method?: string | null
          default_useful_life_years?: number | null
          description?: string | null
          id?: string
          name?: string
          parent_category_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_documents: {
        Row: {
          asset_id: string
          created_at: string
          created_by: string
          document_name: string
          document_type: string
          document_url: string | null
          expiry_date: string | null
          id: string
          issue_date: string | null
          notes: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by: string
          document_name: string
          document_type: string
          document_url?: string | null
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          notes?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by?: string
          document_name?: string
          document_type?: string
          document_url?: string | null
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_documents_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_downtime: {
        Row: {
          asset_id: string
          created_at: string
          created_by: string
          description: string | null
          downtime_end: string | null
          downtime_start: string
          duration_hours: number | null
          id: string
          impact: string | null
          reason: string
          work_order_id: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by: string
          description?: string | null
          downtime_end?: string | null
          downtime_start: string
          duration_hours?: number | null
          id?: string
          impact?: string | null
          reason: string
          work_order_id?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          downtime_end?: string | null
          downtime_start?: string
          duration_hours?: number | null
          id?: string
          impact?: string | null
          reason?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_downtime_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_downtime_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_inspections: {
        Row: {
          asset_id: string
          attachments: Json | null
          certificate_expiry: string | null
          certificate_number: string | null
          created_at: string
          created_by: string
          findings: string | null
          id: string
          inspection_date: string
          inspection_type: string
          inspector_id: string | null
          inspector_name: string | null
          issues_found: Json | null
          next_inspection_due: string | null
          recommendations: string | null
          status: string
        }
        Insert: {
          asset_id: string
          attachments?: Json | null
          certificate_expiry?: string | null
          certificate_number?: string | null
          created_at?: string
          created_by: string
          findings?: string | null
          id?: string
          inspection_date: string
          inspection_type: string
          inspector_id?: string | null
          inspector_name?: string | null
          issues_found?: Json | null
          next_inspection_due?: string | null
          recommendations?: string | null
          status: string
        }
        Update: {
          asset_id?: string
          attachments?: Json | null
          certificate_expiry?: string | null
          certificate_number?: string | null
          created_at?: string
          created_by?: string
          findings?: string | null
          id?: string
          inspection_date?: string
          inspection_type?: string
          inspector_id?: string | null
          inspector_name?: string | null
          issues_found?: Json | null
          next_inspection_due?: string | null
          recommendations?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_inspections_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          acquisition_cost: number | null
          acquisition_date: string | null
          asset_code: string
          business_unit_id: string | null
          category_id: string | null
          company_id: string | null
          created_at: string
          created_by: string
          criticality_level:
            | Database["public"]["Enums"]["priority_level"]
            | null
          current_value: number | null
          custom_fields: Json | null
          depreciation_method: string | null
          description: string | null
          id: string
          location_id: string | null
          manufacturer: string | null
          model: string | null
          name: string
          notes: string | null
          ownership_type: string | null
          parent_asset_id: string | null
          qr_code: string | null
          residual_value: number | null
          responsible_department: string | null
          responsible_user_id: string | null
          rfid_tag: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["asset_status"]
          supplier_id: string | null
          updated_at: string
          useful_life_years: number | null
          warranty_expiry: string | null
          warranty_notes: string | null
        }
        Insert: {
          acquisition_cost?: number | null
          acquisition_date?: string | null
          asset_code: string
          business_unit_id?: string | null
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by: string
          criticality_level?:
            | Database["public"]["Enums"]["priority_level"]
            | null
          current_value?: number | null
          custom_fields?: Json | null
          depreciation_method?: string | null
          description?: string | null
          id?: string
          location_id?: string | null
          manufacturer?: string | null
          model?: string | null
          name: string
          notes?: string | null
          ownership_type?: string | null
          parent_asset_id?: string | null
          qr_code?: string | null
          residual_value?: number | null
          responsible_department?: string | null
          responsible_user_id?: string | null
          rfid_tag?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          supplier_id?: string | null
          updated_at?: string
          useful_life_years?: number | null
          warranty_expiry?: string | null
          warranty_notes?: string | null
        }
        Update: {
          acquisition_cost?: number | null
          acquisition_date?: string | null
          asset_code?: string
          business_unit_id?: string | null
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          criticality_level?:
            | Database["public"]["Enums"]["priority_level"]
            | null
          current_value?: number | null
          custom_fields?: Json | null
          depreciation_method?: string | null
          description?: string | null
          id?: string
          location_id?: string | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          ownership_type?: string | null
          parent_asset_id?: string | null
          qr_code?: string | null
          residual_value?: number | null
          responsible_department?: string | null
          responsible_user_id?: string | null
          rfid_tag?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          supplier_id?: string | null
          updated_at?: string
          useful_life_years?: number | null
          warranty_expiry?: string | null
          warranty_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      attribute_option_group_values: {
        Row: {
          created_at: string
          display_name: string | null
          group_id: string
          hex_color: string | null
          id: string
          is_active: boolean
          sort_order: number | null
          updated_at: string
          value_text: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          group_id: string
          hex_color?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number | null
          updated_at?: string
          value_text: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          group_id?: string
          hex_color?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number | null
          updated_at?: string
          value_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribute_option_group_values_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "attribute_option_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      attribute_option_groups: {
        Row: {
          attribute_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          attribute_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          attribute_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribute_option_groups_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "product_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribute_option_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribute_option_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attribute_translations: {
        Row: {
          attribute_id: string
          created_at: string
          id: string
          label: string
          language_code: string
          updated_at: string
        }
        Insert: {
          attribute_id: string
          created_at?: string
          id?: string
          label: string
          language_code: string
          updated_at?: string
        }
        Update: {
          attribute_id?: string
          created_at?: string
          id?: string
          label?: string
          language_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribute_translations_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "product_attributes"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_to_business_user_map: {
        Row: {
          auth_user_id: string
          business_user_id: string
          frozen_at: string
          notes: string | null
        }
        Insert: {
          auth_user_id: string
          business_user_id: string
          frozen_at?: string
          notes?: string | null
        }
        Update: {
          auth_user_id?: string
          business_user_id?: string
          frozen_at?: string
          notes?: string | null
        }
        Relationships: []
      }
      auto_schedule_rules: {
        Row: {
          allowed_days: number[] | null
          board_id: string | null
          buffer_after_minutes: number | null
          buffer_before_minutes: number | null
          created_at: string
          created_by: string
          duration_minutes: number | null
          earliest_time: string | null
          id: string
          is_active: boolean | null
          latest_time: string | null
          max_items_per_day: number | null
          name: string
          organization_id: string | null
          preferred_resources: string[] | null
          priority: number | null
          respect_capacity: boolean | null
          strategy: string | null
          trigger_conditions: Json | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          allowed_days?: number[] | null
          board_id?: string | null
          buffer_after_minutes?: number | null
          buffer_before_minutes?: number | null
          created_at?: string
          created_by: string
          duration_minutes?: number | null
          earliest_time?: string | null
          id?: string
          is_active?: boolean | null
          latest_time?: string | null
          max_items_per_day?: number | null
          name: string
          organization_id?: string | null
          preferred_resources?: string[] | null
          priority?: number | null
          respect_capacity?: boolean | null
          strategy?: string | null
          trigger_conditions?: Json | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          allowed_days?: number[] | null
          board_id?: string | null
          buffer_after_minutes?: number | null
          buffer_before_minutes?: number | null
          created_at?: string
          created_by?: string
          duration_minutes?: number | null
          earliest_time?: string | null
          id?: string
          is_active?: boolean | null
          latest_time?: string | null
          max_items_per_day?: number | null
          name?: string
          organization_id?: string | null
          preferred_resources?: string[] | null
          priority?: number | null
          respect_capacity?: boolean | null
          strategy?: string | null
          trigger_conditions?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_schedule_rules_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "schedule_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_schedule_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      board_schedule_fields: {
        Row: {
          board_id: string
          created_at: string
          field_id: string
          id: string
          is_visible: boolean | null
          sort_order: number | null
          width: number | null
        }
        Insert: {
          board_id: string
          created_at?: string
          field_id: string
          id?: string
          is_visible?: boolean | null
          sort_order?: number | null
          width?: number | null
        }
        Update: {
          board_id?: string
          created_at?: string
          field_id?: string
          id?: string
          is_visible?: boolean | null
          sort_order?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "board_schedule_fields_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "schedule_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_schedule_fields_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "schedule_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_tokens: {
        Row: {
          action: string
          created_at: string
          expires_at: string
          id: string
          schedule_item_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          action: string
          created_at?: string
          expires_at: string
          id?: string
          schedule_item_id: string
          token?: string
          used_at?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          expires_at?: string
          id?: string
          schedule_item_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_tokens_schedule_item_id_fkey"
            columns: ["schedule_item_id"]
            isOneToOne: false
            referencedRelation: "schedule_items"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_organizations: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_companies_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          organization_id: string | null
          slug: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          organization_id?: string | null
          slug: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          organization_id?: string | null
          slug?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brands_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brands_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_choice_groups: {
        Row: {
          bundle_id: string
          created_at: string
          description: string | null
          id: string
          is_required: boolean
          max_selections: number
          min_selections: number
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          max_selections?: number
          min_selections?: number
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          max_selections?: number
          min_selections?: number
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_choice_groups_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_components: {
        Row: {
          bundle_id: string
          choice_group_id: string | null
          created_at: string
          custom_discount_fixed: number | null
          custom_discount_percent: number | null
          custom_price: number | null
          id: string
          is_optional: boolean
          pricing_mode: Database["public"]["Enums"]["component_pricing_mode"]
          product_id: string | null
          quantity: number
          service_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          bundle_id: string
          choice_group_id?: string | null
          created_at?: string
          custom_discount_fixed?: number | null
          custom_discount_percent?: number | null
          custom_price?: number | null
          id?: string
          is_optional?: boolean
          pricing_mode?: Database["public"]["Enums"]["component_pricing_mode"]
          product_id?: string | null
          quantity?: number
          service_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          bundle_id?: string
          choice_group_id?: string | null
          created_at?: string
          custom_discount_fixed?: number | null
          custom_discount_percent?: number | null
          custom_price?: number | null
          id?: string
          is_optional?: boolean
          pricing_mode?: Database["public"]["Enums"]["component_pricing_mode"]
          product_id?: string | null
          quantity?: number
          service_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_components_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_components_choice_group_id_fkey"
            columns: ["choice_group_id"]
            isOneToOne: false
            referencedRelation: "bundle_choice_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_components_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_components_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      bundles: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          discount_fixed: number | null
          discount_percent: number | null
          fixed_price: number | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          organization_id: string | null
          pricing_type: Database["public"]["Enums"]["bundle_pricing_type"]
          sku: string
          status: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          discount_fixed?: number | null
          discount_percent?: number | null
          fixed_price?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          organization_id?: string | null
          pricing_type?: Database["public"]["Enums"]["bundle_pricing_type"]
          sku: string
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          discount_fixed?: number | null
          discount_percent?: number | null
          fixed_price?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          organization_id?: string | null
          pricing_type?: Database["public"]["Enums"]["bundle_pricing_type"]
          sku?: string
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bundles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_unit_addresses: {
        Row: {
          business_unit_id: string
          city: string | null
          country: string | null
          created_at: string
          district: string | null
          floor_number: string | null
          id: string
          is_primary: boolean | null
          municipality: string | null
          number: string | null
          postal_code: string | null
          street: string | null
          updated_at: string
        }
        Insert: {
          business_unit_id: string
          city?: string | null
          country?: string | null
          created_at?: string
          district?: string | null
          floor_number?: string | null
          id?: string
          is_primary?: boolean | null
          municipality?: string | null
          number?: string | null
          postal_code?: string | null
          street?: string | null
          updated_at?: string
        }
        Update: {
          business_unit_id?: string
          city?: string | null
          country?: string | null
          created_at?: string
          district?: string | null
          floor_number?: string | null
          id?: string
          is_primary?: boolean | null
          municipality?: string | null
          number?: string | null
          postal_code?: string | null
          street?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_unit_addresses_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      business_unit_admins: {
        Row: {
          business_unit_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          business_unit_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          business_unit_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_unit_admins_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      business_unit_departments: {
        Row: {
          business_unit_id: string
          created_at: string
          department_id: string
          id: string
        }
        Insert: {
          business_unit_id: string
          created_at?: string
          department_id: string
          id?: string
        }
        Update: {
          business_unit_id?: string
          created_at?: string
          department_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_unit_areas_business_area_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_unit_areas_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      business_units: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          email: string | null
          id: string
          manager_id: string | null
          name: string
          phone: string | null
          phone_country_code: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          manager_id?: string | null
          name: string
          phone?: string | null
          phone_country_code?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          manager_id?: string | null
          name?: string
          phone?: string | null
          phone_country_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      call_center_history: {
        Row: {
          changed_at: string
          changed_by: string
          contact_id: string
          id: string
          new_status: Database["public"]["Enums"]["call_center_status"]
          notes: string | null
          old_status: Database["public"]["Enums"]["call_center_status"] | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          contact_id: string
          id?: string
          new_status: Database["public"]["Enums"]["call_center_status"]
          notes?: string | null
          old_status?: Database["public"]["Enums"]["call_center_status"] | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          contact_id?: string
          id?: string
          new_status?: Database["public"]["Enums"]["call_center_status"]
          notes?: string | null
          old_status?: Database["public"]["Enums"]["call_center_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "call_center_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_branding: {
        Row: {
          accent_color: string | null
          back_button_bg_color: string | null
          back_button_border_color: string | null
          back_button_hover_bg_color: string | null
          back_button_text: string | null
          back_button_text_color: string | null
          background_color: string | null
          background_image_url: string | null
          border_radius: string | null
          button_option_border_radius: string | null
          button_option_border_width: string | null
          button_option_padding: string | null
          button_text_color: string | null
          campaign_id: string
          card_border_color: string | null
          card_border_radius: string | null
          card_border_width: string | null
          card_icon_border_radius: string | null
          card_icon_size: string | null
          card_min_height: string | null
          card_padding: string | null
          card_style: string | null
          checkbox_border_radius: string | null
          checkbox_border_width: string | null
          checkbox_padding: string | null
          checkbox_size: string | null
          contact_soon_text: string | null
          continue_button_text: string | null
          created_at: string
          created_by: string | null
          custom_css: string | null
          date_placeholder: string | null
          error_display_style: string | null
          error_message: string | null
          error_title: string | null
          favicon_url: string | null
          font_family: string | null
          footer_text: string | null
          form_error_message: string | null
          form_error_title: string | null
          form_subtitle: string | null
          form_title: string | null
          heading_font_family: string | null
          icon_color: string | null
          icon_selected_color: string | null
          id: string
          info_block_background_opacity: string | null
          info_block_border_radius: string | null
          info_block_padding: string | null
          input_background_color: string | null
          input_border_color: string | null
          input_border_radius: string | null
          input_border_width: string | null
          input_focus_border_color: string | null
          input_font_size: string | null
          input_padding: string | null
          loading_text: string | null
          location_not_available_title: string | null
          location_rejection_message: string | null
          logo_url: string | null
          multi_select_placeholder: string | null
          nav_button_border_radius: string | null
          nav_button_font_size: string | null
          nav_button_padding: string | null
          next_button_text: string | null
          of_text: string | null
          previous_button_text: string | null
          primary_color: string | null
          privacy_policy_label: string | null
          privacy_policy_url: string | null
          progress_animation: boolean | null
          progress_bar_border_radius: string | null
          progress_bar_height: string | null
          progress_indicator_style: string | null
          radio_border_radius: string | null
          radio_border_width: string | null
          radio_button_color: string | null
          radio_circle_size: string | null
          radio_inner_size: string | null
          radio_padding: string | null
          redirecting_text: string | null
          required_field_label: string | null
          secondary_color: string | null
          seconds_text: string | null
          select_border_radius: string | null
          select_border_width: string | null
          select_placeholder: string | null
          show_progress_bar: boolean | null
          show_step_indicator: boolean | null
          show_step_titles: boolean | null
          step_border_color: string | null
          step_border_radius: string | null
          step_border_width: string | null
          step_counter_style: string | null
          step_loading_text: string | null
          step_padding: string | null
          step_shadow: string | null
          step_text: string | null
          submit_button_text: string | null
          submitting_text: string | null
          success_border_radius: string | null
          success_display_style: string | null
          success_icon_size: string | null
          success_message: string | null
          success_redirect_delay_seconds: number | null
          success_redirect_url: string | null
          success_title: string | null
          terms_label: string | null
          terms_url: string | null
          text_color: string | null
          thank_you_text: string | null
          updated_at: string
          validation_error_text: string | null
        }
        Insert: {
          accent_color?: string | null
          back_button_bg_color?: string | null
          back_button_border_color?: string | null
          back_button_hover_bg_color?: string | null
          back_button_text?: string | null
          back_button_text_color?: string | null
          background_color?: string | null
          background_image_url?: string | null
          border_radius?: string | null
          button_option_border_radius?: string | null
          button_option_border_width?: string | null
          button_option_padding?: string | null
          button_text_color?: string | null
          campaign_id: string
          card_border_color?: string | null
          card_border_radius?: string | null
          card_border_width?: string | null
          card_icon_border_radius?: string | null
          card_icon_size?: string | null
          card_min_height?: string | null
          card_padding?: string | null
          card_style?: string | null
          checkbox_border_radius?: string | null
          checkbox_border_width?: string | null
          checkbox_padding?: string | null
          checkbox_size?: string | null
          contact_soon_text?: string | null
          continue_button_text?: string | null
          created_at?: string
          created_by?: string | null
          custom_css?: string | null
          date_placeholder?: string | null
          error_display_style?: string | null
          error_message?: string | null
          error_title?: string | null
          favicon_url?: string | null
          font_family?: string | null
          footer_text?: string | null
          form_error_message?: string | null
          form_error_title?: string | null
          form_subtitle?: string | null
          form_title?: string | null
          heading_font_family?: string | null
          icon_color?: string | null
          icon_selected_color?: string | null
          id?: string
          info_block_background_opacity?: string | null
          info_block_border_radius?: string | null
          info_block_padding?: string | null
          input_background_color?: string | null
          input_border_color?: string | null
          input_border_radius?: string | null
          input_border_width?: string | null
          input_focus_border_color?: string | null
          input_font_size?: string | null
          input_padding?: string | null
          loading_text?: string | null
          location_not_available_title?: string | null
          location_rejection_message?: string | null
          logo_url?: string | null
          multi_select_placeholder?: string | null
          nav_button_border_radius?: string | null
          nav_button_font_size?: string | null
          nav_button_padding?: string | null
          next_button_text?: string | null
          of_text?: string | null
          previous_button_text?: string | null
          primary_color?: string | null
          privacy_policy_label?: string | null
          privacy_policy_url?: string | null
          progress_animation?: boolean | null
          progress_bar_border_radius?: string | null
          progress_bar_height?: string | null
          progress_indicator_style?: string | null
          radio_border_radius?: string | null
          radio_border_width?: string | null
          radio_button_color?: string | null
          radio_circle_size?: string | null
          radio_inner_size?: string | null
          radio_padding?: string | null
          redirecting_text?: string | null
          required_field_label?: string | null
          secondary_color?: string | null
          seconds_text?: string | null
          select_border_radius?: string | null
          select_border_width?: string | null
          select_placeholder?: string | null
          show_progress_bar?: boolean | null
          show_step_indicator?: boolean | null
          show_step_titles?: boolean | null
          step_border_color?: string | null
          step_border_radius?: string | null
          step_border_width?: string | null
          step_counter_style?: string | null
          step_loading_text?: string | null
          step_padding?: string | null
          step_shadow?: string | null
          step_text?: string | null
          submit_button_text?: string | null
          submitting_text?: string | null
          success_border_radius?: string | null
          success_display_style?: string | null
          success_icon_size?: string | null
          success_message?: string | null
          success_redirect_delay_seconds?: number | null
          success_redirect_url?: string | null
          success_title?: string | null
          terms_label?: string | null
          terms_url?: string | null
          text_color?: string | null
          thank_you_text?: string | null
          updated_at?: string
          validation_error_text?: string | null
        }
        Update: {
          accent_color?: string | null
          back_button_bg_color?: string | null
          back_button_border_color?: string | null
          back_button_hover_bg_color?: string | null
          back_button_text?: string | null
          back_button_text_color?: string | null
          background_color?: string | null
          background_image_url?: string | null
          border_radius?: string | null
          button_option_border_radius?: string | null
          button_option_border_width?: string | null
          button_option_padding?: string | null
          button_text_color?: string | null
          campaign_id?: string
          card_border_color?: string | null
          card_border_radius?: string | null
          card_border_width?: string | null
          card_icon_border_radius?: string | null
          card_icon_size?: string | null
          card_min_height?: string | null
          card_padding?: string | null
          card_style?: string | null
          checkbox_border_radius?: string | null
          checkbox_border_width?: string | null
          checkbox_padding?: string | null
          checkbox_size?: string | null
          contact_soon_text?: string | null
          continue_button_text?: string | null
          created_at?: string
          created_by?: string | null
          custom_css?: string | null
          date_placeholder?: string | null
          error_display_style?: string | null
          error_message?: string | null
          error_title?: string | null
          favicon_url?: string | null
          font_family?: string | null
          footer_text?: string | null
          form_error_message?: string | null
          form_error_title?: string | null
          form_subtitle?: string | null
          form_title?: string | null
          heading_font_family?: string | null
          icon_color?: string | null
          icon_selected_color?: string | null
          id?: string
          info_block_background_opacity?: string | null
          info_block_border_radius?: string | null
          info_block_padding?: string | null
          input_background_color?: string | null
          input_border_color?: string | null
          input_border_radius?: string | null
          input_border_width?: string | null
          input_focus_border_color?: string | null
          input_font_size?: string | null
          input_padding?: string | null
          loading_text?: string | null
          location_not_available_title?: string | null
          location_rejection_message?: string | null
          logo_url?: string | null
          multi_select_placeholder?: string | null
          nav_button_border_radius?: string | null
          nav_button_font_size?: string | null
          nav_button_padding?: string | null
          next_button_text?: string | null
          of_text?: string | null
          previous_button_text?: string | null
          primary_color?: string | null
          privacy_policy_label?: string | null
          privacy_policy_url?: string | null
          progress_animation?: boolean | null
          progress_bar_border_radius?: string | null
          progress_bar_height?: string | null
          progress_indicator_style?: string | null
          radio_border_radius?: string | null
          radio_border_width?: string | null
          radio_button_color?: string | null
          radio_circle_size?: string | null
          radio_inner_size?: string | null
          radio_padding?: string | null
          redirecting_text?: string | null
          required_field_label?: string | null
          secondary_color?: string | null
          seconds_text?: string | null
          select_border_radius?: string | null
          select_border_width?: string | null
          select_placeholder?: string | null
          show_progress_bar?: boolean | null
          show_step_indicator?: boolean | null
          show_step_titles?: boolean | null
          step_border_color?: string | null
          step_border_radius?: string | null
          step_border_width?: string | null
          step_counter_style?: string | null
          step_loading_text?: string | null
          step_padding?: string | null
          step_shadow?: string | null
          step_text?: string | null
          submit_button_text?: string | null
          submitting_text?: string | null
          success_border_radius?: string | null
          success_display_style?: string | null
          success_icon_size?: string | null
          success_message?: string | null
          success_redirect_delay_seconds?: number | null
          success_redirect_url?: string | null
          success_title?: string | null
          terms_label?: string | null
          terms_url?: string | null
          text_color?: string | null
          thank_you_text?: string | null
          updated_at?: string
          validation_error_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_branding_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_contacts: {
        Row: {
          campaign_id: string
          clicked_at: string | null
          contact_id: string
          created_at: string
          id: string
          opened_at: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          clicked_at?: string | null
          contact_id: string
          created_at?: string
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          clicked_at?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_districts: {
        Row: {
          campaign_id: string
          created_at: string
          district_id: string
          id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          district_id: string
          id?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          district_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_districts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_districts_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "administrative_divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_events: {
        Row: {
          campaign_id: string
          channel_id: string | null
          client_id: string | null
          contact_id: string | null
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
        }
        Insert: {
          campaign_id: string
          channel_id?: string | null
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
        }
        Update: {
          campaign_id?: string
          channel_id?: string | null
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_form_sections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_visible: boolean | null
          sort_order: number | null
          step_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean | null
          sort_order?: number | null
          step_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean | null
          sort_order?: number | null
          step_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_form_sections_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "campaign_form_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_form_steps: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          next_button_text: string | null
          previous_button_text: string | null
          sort_order: number
          step_description: string | null
          step_number: number
          step_subtitle: string | null
          step_title: string
          submit_button_text: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          next_button_text?: string | null
          previous_button_text?: string | null
          sort_order?: number
          step_description?: string | null
          step_number?: number
          step_subtitle?: string | null
          step_title?: string
          submit_button_text?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          next_button_text?: string | null
          previous_button_text?: string | null
          sort_order?: number
          step_description?: string | null
          step_number?: number
          step_subtitle?: string | null
          step_title?: string
          submit_button_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_form_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_goals: {
        Row: {
          campaign_id: string
          created_at: string
          current_value: number | null
          end_date: string | null
          goal_type: string
          id: string
          start_date: string | null
          target_value: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          current_value?: number | null
          end_date?: string | null
          goal_type: string
          id?: string
          start_date?: string | null
          target_value: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          current_value?: number | null
          end_date?: string | null
          goal_type?: string
          id?: string
          start_date?: string | null
          target_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_goals_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_leads: {
        Row: {
          anew_lead_id: string | null
          campaign_id: string
          channel_id: string | null
          client_id: string | null
          contact_id: string | null
          content: string | null
          conversion_value: number | null
          converted_at: string | null
          created_at: string
          id: string
          landing_page: string | null
          medium: string | null
          notes: string | null
          referrer: string | null
          source: string | null
          status: string | null
          term: string | null
          updated_at: string
        }
        Insert: {
          anew_lead_id?: string | null
          campaign_id: string
          channel_id?: string | null
          client_id?: string | null
          contact_id?: string | null
          content?: string | null
          conversion_value?: number | null
          converted_at?: string | null
          created_at?: string
          id?: string
          landing_page?: string | null
          medium?: string | null
          notes?: string | null
          referrer?: string | null
          source?: string | null
          status?: string | null
          term?: string | null
          updated_at?: string
        }
        Update: {
          anew_lead_id?: string | null
          campaign_id?: string
          channel_id?: string | null
          client_id?: string | null
          contact_id?: string | null
          content?: string | null
          conversion_value?: number | null
          converted_at?: string | null
          created_at?: string
          id?: string
          landing_page?: string | null
          medium?: string | null
          notes?: string | null
          referrer?: string | null
          source?: string | null
          status?: string | null
          term?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_anew_lead_id_fkey"
            columns: ["anew_lead_id"]
            isOneToOne: false
            referencedRelation: "anew_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_marketing_lists: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          marketing_list_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          marketing_list_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          marketing_list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_marketing_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_marketing_lists_marketing_list_id_fkey"
            columns: ["marketing_list_id"]
            isOneToOne: false
            referencedRelation: "marketing_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_organizations: {
        Row: {
          campaign_id: string
          created_at: string | null
          id: string
          organization_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_organizations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_routing_rules: {
        Row: {
          action_type: string
          campaign_id: string
          created_at: string
          created_by: string | null
          description: string | null
          field_key: string
          field_value: string
          id: string
          is_active: boolean
          name: string
          operator: string
          organization_id: string | null
          priority: number
          stop_on_match: boolean
          target_business_unit_id: string | null
          target_department_id: string | null
          target_employee_id: string | null
          target_organization_id: string | null
          target_priority: string | null
          target_status: string | null
          updated_at: string
        }
        Insert: {
          action_type?: string
          campaign_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          field_key: string
          field_value: string
          id?: string
          is_active?: boolean
          name: string
          operator?: string
          organization_id?: string | null
          priority?: number
          stop_on_match?: boolean
          target_business_unit_id?: string | null
          target_department_id?: string | null
          target_employee_id?: string | null
          target_organization_id?: string | null
          target_priority?: string | null
          target_status?: string | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          field_key?: string
          field_value?: string
          id?: string
          is_active?: boolean
          name?: string
          operator?: string
          organization_id?: string | null
          priority?: number
          stop_on_match?: boolean
          target_business_unit_id?: string | null
          target_department_id?: string | null
          target_employee_id?: string | null
          target_organization_id?: string | null
          target_priority?: string | null
          target_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_routing_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_routing_rules_company_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_routing_rules_target_business_unit_id_fkey"
            columns: ["target_business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_routing_rules_target_department_id_fkey"
            columns: ["target_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_routing_rules_target_employee_id_fkey"
            columns: ["target_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_routing_rules_target_organization_id_fkey"
            columns: ["target_organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sources: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          source_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          source_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sources_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_step_info_blocks: {
        Row: {
          content: string
          created_at: string
          icon_type: string | null
          id: string
          is_visible: boolean | null
          sort_order: number | null
          step_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          icon_type?: string | null
          id?: string
          is_visible?: boolean | null
          sort_order?: number | null
          step_id: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          icon_type?: string | null
          id?: string
          is_visible?: boolean | null
          sort_order?: number | null
          step_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_step_info_blocks_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "campaign_form_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          budget: number | null
          country_code: string | null
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          form_id: string | null
          has_ai_scheduling: boolean | null
          has_scheduling: boolean
          id: string
          iframe_enabled: boolean | null
          location_required: boolean
          name: string
          organization_id: string | null
          root_organization_id: string | null
          scheduling_board_id: string | null
          scheduling_default_duration: number | null
          scheduling_description_fields: string[] | null
          source_id: string | null
          start_date: string | null
          status: string
          total_conversions: number | null
          total_leads: number | null
          total_revenue: number | null
          total_spend: number | null
          type: string
          updated_at: string
        }
        Insert: {
          budget?: number | null
          country_code?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_date?: string | null
          form_id?: string | null
          has_ai_scheduling?: boolean | null
          has_scheduling?: boolean
          id?: string
          iframe_enabled?: boolean | null
          location_required?: boolean
          name: string
          organization_id?: string | null
          root_organization_id?: string | null
          scheduling_board_id?: string | null
          scheduling_default_duration?: number | null
          scheduling_description_fields?: string[] | null
          source_id?: string | null
          start_date?: string | null
          status?: string
          total_conversions?: number | null
          total_leads?: number | null
          total_revenue?: number | null
          total_spend?: number | null
          type?: string
          updated_at?: string
        }
        Update: {
          budget?: number | null
          country_code?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          form_id?: string | null
          has_ai_scheduling?: boolean | null
          has_scheduling?: boolean
          id?: string
          iframe_enabled?: boolean | null
          location_required?: boolean
          name?: string
          organization_id?: string | null
          root_organization_id?: string | null
          scheduling_board_id?: string | null
          scheduling_default_duration?: number | null
          scheduling_description_fields?: string[] | null
          source_id?: string | null
          start_date?: string | null
          status?: string
          total_conversions?: number | null
          total_leads?: number | null
          total_revenue?: number | null
          total_spend?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_organization_id_anew_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_root_organization_id_fkey"
            columns: ["root_organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_scheduling_board_id_fkey"
            columns: ["scheduling_board_id"]
            isOneToOne: false
            referencedRelation: "schedule_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_items: {
        Row: {
          ativo: boolean | null
          business_unit_id: string | null
          categoria: string
          created_at: string
          created_by: string
          custo_mao_obra: number | null
          custo_material: number | null
          descricao: string
          id: string
          int_default: number | null
          item_code: string | null
          iva_default: number | null
          margem_default: number | null
          modelos_associados: Json | null
          ordem: number | null
          organization_id: string | null
          preco_venda: number | null
          subcategoria: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean | null
          business_unit_id?: string | null
          categoria: string
          created_at?: string
          created_by: string
          custo_mao_obra?: number | null
          custo_material?: number | null
          descricao: string
          id?: string
          int_default?: number | null
          item_code?: string | null
          iva_default?: number | null
          margem_default?: number | null
          modelos_associados?: Json | null
          ordem?: number | null
          organization_id?: string | null
          preco_venda?: number | null
          subcategoria?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean | null
          business_unit_id?: string | null
          categoria?: string
          created_at?: string
          created_by?: string
          custo_mao_obra?: number | null
          custo_material?: number | null
          descricao?: string
          id?: string
          int_default?: number | null
          item_code?: string | null
          iva_default?: number | null
          margem_default?: number | null
          modelos_associados?: Json | null
          ordem?: number | null
          organization_id?: string | null
          preco_venda?: number | null
          subcategoria?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      category_attribute_palettes: {
        Row: {
          additional_values: Json | null
          attribute_id: string
          base_group_id: string | null
          category_id: string
          created_at: string
          excluded_values: Json | null
          id: string
          updated_at: string
        }
        Insert: {
          additional_values?: Json | null
          attribute_id: string
          base_group_id?: string | null
          category_id: string
          created_at?: string
          excluded_values?: Json | null
          id?: string
          updated_at?: string
        }
        Update: {
          additional_values?: Json | null
          attribute_id?: string
          base_group_id?: string | null
          category_id?: string
          created_at?: string
          excluded_values?: Json | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_attribute_palettes_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "product_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_attribute_palettes_base_group_id_fkey"
            columns: ["base_group_id"]
            isOneToOne: false
            referencedRelation: "attribute_option_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_attribute_palettes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_attributes: {
        Row: {
          attribute_id: string
          category_id: string
          created_at: string
          id: string
          is_required: boolean | null
          sort_order: number | null
        }
        Insert: {
          attribute_id: string
          category_id: string
          created_at?: string
          id?: string
          is_required?: boolean | null
          sort_order?: number | null
        }
        Update: {
          attribute_id?: string
          category_id?: string
          created_at?: string
          id?: string
          is_required?: boolean | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "category_attributes_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "product_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_attributes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_translations: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          id: string
          language_code: string
          name: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          language_code: string
          name: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          language_code?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_translations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_metrics: {
        Row: {
          bounces: number | null
          channel_id: string
          clicks: number | null
          conversions: number | null
          created_at: string
          engagement: number | null
          id: string
          impressions: number | null
          leads: number | null
          metric_date: string
          opens: number | null
          reach: number | null
          revenue: number | null
          spend: number | null
          unsubscribes: number | null
          updated_at: string
        }
        Insert: {
          bounces?: number | null
          channel_id: string
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          engagement?: number | null
          id?: string
          impressions?: number | null
          leads?: number | null
          metric_date: string
          opens?: number | null
          reach?: number | null
          revenue?: number | null
          spend?: number | null
          unsubscribes?: number | null
          updated_at?: string
        }
        Update: {
          bounces?: number | null
          channel_id?: string
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          engagement?: number | null
          id?: string
          impressions?: number | null
          leads?: number | null
          metric_date?: string
          opens?: number | null
          reach?: number | null
          revenue?: number | null
          spend?: number | null
          unsubscribes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_metrics_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_spend_entries: {
        Row: {
          amount: number
          channel_id: string
          created_at: string
          created_by: string | null
          currency: string
          ends_on: string | null
          entry_type: string
          external_ref: string | null
          id: string
          interval_count: number | null
          interval_unit: string | null
          notes: string | null
          source: string
          starts_on: string
          updated_at: string
        }
        Insert: {
          amount?: number
          channel_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_on?: string | null
          entry_type?: string
          external_ref?: string | null
          id?: string
          interval_count?: number | null
          interval_unit?: string | null
          notes?: string | null
          source?: string
          starts_on?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          channel_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_on?: string | null
          entry_type?: string
          external_ref?: string | null
          id?: string
          interval_count?: number | null
          interval_unit?: string | null
          notes?: string | null
          source?: string
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_spend_entries_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_spend_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_types: {
        Row: {
          created_at: string | null
          created_by: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          label: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      channel_utm_mappings: {
        Row: {
          campaign_id: string
          channel_id: string
          created_at: string
          id: string
          is_active: boolean
          match_priority: number
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          campaign_id: string
          channel_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          match_priority?: number
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          campaign_id?: string
          channel_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          match_priority?: number
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_utm_mappings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_utm_mappings_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          campaign_id: string
          config: Json | null
          created_at: string
          created_by: string
          creative_url: string | null
          description: string | null
          end_date: string | null
          external_id: string | null
          id: string
          is_active: boolean
          metrics: Json | null
          name: string
          source_id: string | null
          start_date: string | null
          target_audience: string | null
          type: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          config?: Json | null
          created_at?: string
          created_by: string
          creative_url?: string | null
          description?: string | null
          end_date?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          metrics?: Json | null
          name: string
          source_id?: string | null
          start_date?: string | null
          target_audience?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          config?: Json | null
          created_at?: string
          created_by?: string
          creative_url?: string | null
          description?: string | null
          end_date?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          metrics?: Json | null
          name?: string
          source_id?: string | null
          start_date?: string | null
          target_audience?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_created_by_anew_users_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      client_business_units: {
        Row: {
          business_unit_id: string
          client_id: string
          company_id: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
        }
        Insert: {
          business_unit_id: string
          client_id: string
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
        }
        Update: {
          business_unit_id?: string
          client_id?: string
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_business_units_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_business_units_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_business_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_companies: {
        Row: {
          client_id: string
          company_id: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
        }
        Insert: {
          client_id: string
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
        }
        Update: {
          client_id?: string
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_companies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_attachments: {
        Row: {
          attachment_type: string | null
          contract_id: string
          created_at: string
          created_by: string
          file_name: string
          file_type: string | null
          file_url: string
          id: string
        }
        Insert: {
          attachment_type?: string | null
          contract_id: string
          created_at?: string
          created_by: string
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
        }
        Update: {
          attachment_type?: string | null
          contract_id?: string
          created_at?: string
          created_by?: string
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_attachments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "client_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_clauses: {
        Row: {
          clause_text: string
          clause_title: string
          contract_id: string
          created_at: string
          created_by: string
          id: string
          is_included: boolean | null
          is_optional: boolean | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          clause_text: string
          clause_title: string
          contract_id: string
          created_at?: string
          created_by: string
          id?: string
          is_included?: boolean | null
          is_optional?: boolean | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          clause_text?: string
          clause_title?: string
          contract_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_included?: boolean | null
          is_optional?: boolean | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_clauses_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "client_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_email_logs: {
        Row: {
          contract_id: string | null
          created_by: string | null
          email_type: string
          error_message: string | null
          id: string
          proposal_id: string | null
          sent_at: string | null
          status: string | null
          subject: string | null
          to_email: string
        }
        Insert: {
          contract_id?: string | null
          created_by?: string | null
          email_type: string
          error_message?: string | null
          id?: string
          proposal_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          to_email: string
        }
        Update: {
          contract_id?: string | null
          created_by?: string | null
          email_type?: string
          error_message?: string | null
          id?: string
          proposal_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_email_logs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "client_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contract_email_logs_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_events: {
        Row: {
          client_ip: string | null
          contract_id: string
          created_at: string
          created_by: string | null
          description: string | null
          event_type: string
          id: string
          new_values: Json | null
          old_values: Json | null
          user_agent: string | null
        }
        Insert: {
          client_ip?: string | null
          contract_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_type: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
        }
        Update: {
          client_ip?: string | null
          contract_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_type?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "client_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_parties: {
        Row: {
          client_id: string | null
          contract_id: string
          created_at: string
          id: string
          is_signatory: boolean | null
          role: string
          signature_ip: string | null
          signature_user_agent: string | null
          signed_at: string | null
          signing_email: string
          signing_name: string | null
          signing_order: number | null
          status: string
        }
        Insert: {
          client_id?: string | null
          contract_id: string
          created_at?: string
          id?: string
          is_signatory?: boolean | null
          role?: string
          signature_ip?: string | null
          signature_user_agent?: string | null
          signed_at?: string | null
          signing_email: string
          signing_name?: string | null
          signing_order?: number | null
          status?: string
        }
        Update: {
          client_id?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          is_signatory?: boolean | null
          role?: string
          signature_ip?: string | null
          signature_user_agent?: string | null
          signed_at?: string | null
          signing_email?: string
          signing_name?: string | null
          signing_order?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_parties_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "client_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_signature_requests: {
        Row: {
          contract_id: string
          contract_version_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          provider: string
          provider_envelope_id: string | null
          status: string
        }
        Insert: {
          contract_id: string
          contract_version_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          provider?: string
          provider_envelope_id?: string | null
          status?: string
        }
        Update: {
          contract_id?: string
          contract_version_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          provider?: string
          provider_envelope_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_signature_requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "client_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contract_signature_requests_contract_version_id_fkey"
            columns: ["contract_version_id"]
            isOneToOne: false
            referencedRelation: "client_contract_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_signature_tokens: {
        Row: {
          attempts: number | null
          contract_party_id: string
          created_at: string
          id: string
          signature_request_id: string
          token_hash: string
          used_at: string | null
          valid_until: string
        }
        Insert: {
          attempts?: number | null
          contract_party_id: string
          created_at?: string
          id?: string
          signature_request_id: string
          token_hash: string
          used_at?: string | null
          valid_until: string
        }
        Update: {
          attempts?: number | null
          contract_party_id?: string
          created_at?: string
          id?: string
          signature_request_id?: string
          token_hash?: string
          used_at?: string | null
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_signature_tokens_contract_party_id_fkey"
            columns: ["contract_party_id"]
            isOneToOne: false
            referencedRelation: "client_contract_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contract_signature_tokens_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: false
            referencedRelation: "client_contract_signature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_template_variables: {
        Row: {
          created_at: string
          data_type: string
          default_value: string | null
          description: string | null
          id: string
          is_required: boolean | null
          template_id: string
          variable_name: string
        }
        Insert: {
          created_at?: string
          data_type?: string
          default_value?: string | null
          description?: string | null
          id?: string
          is_required?: boolean | null
          template_id: string
          variable_name: string
        }
        Update: {
          created_at?: string
          data_type?: string
          default_value?: string | null
          description?: string | null
          id?: string
          is_required?: boolean | null
          template_id?: string
          variable_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_template_variables_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "client_contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_templates: {
        Row: {
          background_color: string | null
          body_html: string
          company_id: string | null
          created_at: string
          created_by: string
          description: string | null
          doc_settings: Json | null
          footer_text: string | null
          header_text: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          language: string | null
          logo_url: string | null
          name: string
          organization_id: string | null
          primary_color: string | null
          secondary_color: string | null
          show_proposal_details: boolean | null
          show_total_value: boolean | null
          signatory_role_id: string | null
          signatory_user_id: string | null
          text_color: string | null
          updated_at: string
        }
        Insert: {
          background_color?: string | null
          body_html: string
          company_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          doc_settings?: Json | null
          footer_text?: string | null
          header_text?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          language?: string | null
          logo_url?: string | null
          name: string
          organization_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          show_proposal_details?: boolean | null
          show_total_value?: boolean | null
          signatory_role_id?: string | null
          signatory_user_id?: string | null
          text_color?: string | null
          updated_at?: string
        }
        Update: {
          background_color?: string | null
          body_html?: string
          company_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          doc_settings?: Json | null
          footer_text?: string | null
          header_text?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          language?: string | null
          logo_url?: string | null
          name?: string
          organization_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          show_proposal_details?: boolean | null
          show_total_value?: boolean | null
          signatory_role_id?: string | null
          signatory_user_id?: string | null
          text_color?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_variable_values: {
        Row: {
          contract_version_id: string
          created_at: string
          id: string
          value_bool: boolean | null
          value_date: string | null
          value_json: Json | null
          value_number: number | null
          value_string: string | null
          variable_name: string
        }
        Insert: {
          contract_version_id: string
          created_at?: string
          id?: string
          value_bool?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_string?: string | null
          variable_name: string
        }
        Update: {
          contract_version_id?: string
          created_at?: string
          id?: string
          value_bool?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_string?: string | null
          variable_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_variable_values_contract_version_id_fkey"
            columns: ["contract_version_id"]
            isOneToOne: false
            referencedRelation: "client_contract_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_versions: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string
          custom_clauses_text: string | null
          generated_body: string | null
          id: string
          is_final: boolean | null
          pdf_draft_url: string | null
          pdf_signed_url: string | null
          template_id: string | null
          version_number: number
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by: string
          custom_clauses_text?: string | null
          generated_body?: string | null
          id?: string
          is_final?: boolean | null
          pdf_draft_url?: string | null
          pdf_signed_url?: string | null
          template_id?: string | null
          version_number?: number
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string
          custom_clauses_text?: string | null
          generated_body?: string | null
          id?: string
          is_final?: boolean | null
          pdf_draft_url?: string | null
          pdf_signed_url?: string | null
          template_id?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_versions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "client_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contract_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "client_contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contracts: {
        Row: {
          accepted_at: string | null
          client_id: string | null
          company_signature_date: string | null
          company_signed_by_id: string | null
          company_signed_by_name: string | null
          contract_body_html: string | null
          contract_number: string | null
          contract_template_id: string | null
          created_at: string
          created_by: string
          currency: string | null
          current_version_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          end_date: string | null
          entity_id: string | null
          id: string
          notes: string | null
          organization_id: string
          payment_terms: string | null
          prompt_values: Json | null
          proposal_id: string | null
          quote_id: string | null
          root_organization_id: string | null
          signature_date: string | null
          signature_image: string | null
          signature_ip: string | null
          signed_by_name: string | null
          start_date: string | null
          status: string
          status_changed_at: string | null
          status_changed_by: string | null
          template_id: string | null
          total_value: number | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          client_id?: string | null
          company_signature_date?: string | null
          company_signed_by_id?: string | null
          company_signed_by_name?: string | null
          contract_body_html?: string | null
          contract_number?: string | null
          contract_template_id?: string | null
          created_at?: string
          created_by: string
          currency?: string | null
          current_version_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          end_date?: string | null
          entity_id?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          payment_terms?: string | null
          prompt_values?: Json | null
          proposal_id?: string | null
          quote_id?: string | null
          root_organization_id?: string | null
          signature_date?: string | null
          signature_image?: string | null
          signature_ip?: string | null
          signed_by_name?: string | null
          start_date?: string | null
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          template_id?: string | null
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          client_id?: string | null
          company_signature_date?: string | null
          company_signed_by_id?: string | null
          company_signed_by_name?: string | null
          contract_body_html?: string | null
          contract_number?: string | null
          contract_template_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string | null
          current_version_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          end_date?: string | null
          entity_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          payment_terms?: string | null
          prompt_values?: Json | null
          proposal_id?: string | null
          quote_id?: string | null
          root_organization_id?: string | null
          signature_date?: string | null
          signature_image?: string | null
          signature_ip?: string | null
          signed_by_name?: string | null
          start_date?: string | null
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          template_id?: string | null
          total_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contracts_client_id_anew_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "anew_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_contract_template_id_fkey"
            columns: ["contract_template_id"]
            isOneToOne: false
            referencedRelation: "client_contract_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "anew_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_root_organization_id_fkey"
            columns: ["root_organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "client_contract_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_client_contracts_current_version"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "client_contract_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_managers: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean | null
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean | null
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_managers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_marketing_lists: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          list_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          list_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_marketing_lists_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_marketing_lists_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "marketing_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_access_log: {
        Row: {
          action: string
          created_at: string
          document_id: string
          document_type: string
          id: string
          ip_address: string | null
          portal_user_id: string
          user_agent: string | null
        }
        Insert: {
          action?: string
          created_at?: string
          document_id: string
          document_type: string
          id?: string
          ip_address?: string | null
          portal_user_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          document_id?: string
          document_type?: string
          id?: string
          ip_address?: string | null
          portal_user_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_access_log_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "client_portal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_documents: {
        Row: {
          created_at: string
          document_id: string
          document_type: Database["public"]["Enums"]["portal_document_type"]
          entity_id: string | null
          id: string
          is_visible: boolean
          organization_id: string
          portal_user_id: string
          published_at: string
          published_by: string | null
          revoked_at: string | null
          revoked_by: string | null
          source_proposal_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id: string
          document_type: Database["public"]["Enums"]["portal_document_type"]
          entity_id?: string | null
          id?: string
          is_visible?: boolean
          organization_id: string
          portal_user_id: string
          published_at?: string
          published_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          source_proposal_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          document_type?: Database["public"]["Enums"]["portal_document_type"]
          entity_id?: string | null
          id?: string
          is_visible?: boolean
          organization_id?: string
          portal_user_id?: string
          published_at?: string
          published_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          source_proposal_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_documents_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "client_portal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_users: {
        Row: {
          auth_user_id: string
          client_id: string | null
          contact_id: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          first_login: boolean
          first_login_at: string | null
          id: string
          last_login_at: string | null
          organization_id: string
          password_changed_at: string | null
          portal_status: string
          proposal_id: string | null
          quote_id: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          client_id?: string | null
          contact_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          first_login?: boolean
          first_login_at?: string | null
          id?: string
          last_login_at?: string | null
          organization_id: string
          password_changed_at?: string | null
          portal_status?: string
          proposal_id?: string | null
          quote_id?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          client_id?: string | null
          contact_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          first_login?: boolean
          first_login_at?: string | null
          id?: string
          last_login_at?: string | null
          organization_id?: string
          password_changed_at?: string | null
          portal_status?: string
          proposal_id?: string | null
          quote_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "anew_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "anew_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "client_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "anew_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          assigned_to: string | null
          business_unit_id: string | null
          client_type: Database["public"]["Enums"]["client_type"]
          company_id: string | null
          company_name: string | null
          created_at: string
          created_by: string
          custom_fields: Json | null
          department_id: string | null
          email: string | null
          entity_id: string | null
          first_name: string | null
          id: string
          industry: string | null
          last_name: string | null
          notes: string | null
          organization_id: string | null
          phone: string | null
          phone_country_code: string | null
          position: string | null
          root_organization_id: string | null
          source: string | null
          source_contact_id: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
          tenant_id: string | null
          updated_at: string
          vat: string | null
          website: string | null
        }
        Insert: {
          assigned_to?: string | null
          business_unit_id?: string | null
          client_type?: Database["public"]["Enums"]["client_type"]
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          created_by: string
          custom_fields?: Json | null
          department_id?: string | null
          email?: string | null
          entity_id?: string | null
          first_name?: string | null
          id?: string
          industry?: string | null
          last_name?: string | null
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          phone_country_code?: string | null
          position?: string | null
          root_organization_id?: string | null
          source?: string | null
          source_contact_id?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string
          vat?: string | null
          website?: string | null
        }
        Update: {
          assigned_to?: string | null
          business_unit_id?: string | null
          client_type?: Database["public"]["Enums"]["client_type"]
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string
          custom_fields?: Json | null
          department_id?: string | null
          email?: string | null
          entity_id?: string | null
          first_name?: string | null
          id?: string
          industry?: string | null
          last_name?: string | null
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          phone_country_code?: string | null
          position?: string | null
          root_organization_id?: string | null
          source?: string | null
          source_contact_id?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string
          vat?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_area_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_source_contact_id_fkey"
            columns: ["source_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          brand_color: string | null
          city: string | null
          company_code: string | null
          contact_unique_keys: string[] | null
          country: string | null
          created_at: string
          created_by: string
          email: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          phone: string | null
          phone_country_code: string | null
          tenant_id: string | null
          updated_at: string
          vat: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          brand_color?: string | null
          city?: string | null
          company_code?: string | null
          contact_unique_keys?: string[] | null
          country?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          phone_country_code?: string | null
          tenant_id?: string | null
          updated_at?: string
          vat?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          brand_color?: string | null
          city?: string | null
          company_code?: string | null
          contact_unique_keys?: string[] | null
          country?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          phone_country_code?: string | null
          tenant_id?: string | null
          updated_at?: string
          vat?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      company_ai_knowledge: {
        Row: {
          assistant_personality: string | null
          benefits: Json | null
          brand_name: string
          client_found_message: string | null
          client_mode_enabled: boolean | null
          client_not_found_message: string | null
          client_question: string | null
          client_validation_fields: Json | null
          contact_info: Json | null
          created_at: string
          created_by: string | null
          custom_prompt: string | null
          description: string | null
          fallback_contact_message: string | null
          fallback_contact_phone: string | null
          id: string
          initial_options: Json | null
          initial_question: string | null
          is_active: boolean | null
          new_client_cta: string | null
          organization_id: string
          promotions: Json | null
          services: Json | null
          show_proposals: boolean | null
          show_visits: boolean | null
          tagline: string | null
          updated_at: string
          welcome_message: string | null
          widget_open_by_default: boolean | null
          working_hours: string | null
        }
        Insert: {
          assistant_personality?: string | null
          benefits?: Json | null
          brand_name: string
          client_found_message?: string | null
          client_mode_enabled?: boolean | null
          client_not_found_message?: string | null
          client_question?: string | null
          client_validation_fields?: Json | null
          contact_info?: Json | null
          created_at?: string
          created_by?: string | null
          custom_prompt?: string | null
          description?: string | null
          fallback_contact_message?: string | null
          fallback_contact_phone?: string | null
          id?: string
          initial_options?: Json | null
          initial_question?: string | null
          is_active?: boolean | null
          new_client_cta?: string | null
          organization_id: string
          promotions?: Json | null
          services?: Json | null
          show_proposals?: boolean | null
          show_visits?: boolean | null
          tagline?: string | null
          updated_at?: string
          welcome_message?: string | null
          widget_open_by_default?: boolean | null
          working_hours?: string | null
        }
        Update: {
          assistant_personality?: string | null
          benefits?: Json | null
          brand_name?: string
          client_found_message?: string | null
          client_mode_enabled?: boolean | null
          client_not_found_message?: string | null
          client_question?: string | null
          client_validation_fields?: Json | null
          contact_info?: Json | null
          created_at?: string
          created_by?: string | null
          custom_prompt?: string | null
          description?: string | null
          fallback_contact_message?: string | null
          fallback_contact_phone?: string | null
          id?: string
          initial_options?: Json | null
          initial_question?: string | null
          is_active?: boolean | null
          new_client_cta?: string | null
          organization_id?: string
          promotions?: Json | null
          services?: Json | null
          show_proposals?: boolean | null
          show_visits?: boolean | null
          tagline?: string | null
          updated_at?: string
          welcome_message?: string | null
          widget_open_by_default?: boolean | null
          working_hours?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_ai_knowledge_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_groups: {
        Row: {
          business_unit_id: string | null
          company_id: string | null
          created_at: string
          created_by: string
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          business_unit_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          business_unit_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_groups_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_groups_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_business_units: {
        Row: {
          business_unit_id: string
          contact_id: string
          created_at: string
          id: string
        }
        Insert: {
          business_unit_id: string
          contact_id: string
          created_at?: string
          id?: string
        }
        Update: {
          business_unit_id?: string
          contact_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_business_units_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_business_units_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_custom_fields: {
        Row: {
          created_at: string
          field_type: string
          id: string
          label: string
          name: string
          options: string[] | null
          organization_id: string | null
          required: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_type: string
          id?: string
          label: string
          name: string
          options?: string[] | null
          organization_id?: string | null
          required?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_type?: string
          id?: string
          label?: string
          name?: string
          options?: string[] | null
          organization_id?: string | null
          required?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_custom_fields_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_status_history: {
        Row: {
          changed_by: string | null
          contact_id: string
          created_at: string
          id: string
          new_status: string | null
          old_status: string | null
        }
        Insert: {
          changed_by?: string | null
          contact_id: string
          created_at?: string
          id?: string
          new_status?: string | null
          old_status?: string | null
        }
        Update: {
          changed_by?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          new_status?: string | null
          old_status?: string | null
        }
        Relationships: []
      }
      contact_tags: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          entity_id: string
          id: string
          organization_id: string | null
          tag: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          id?: string
          organization_id?: string | null
          tag: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          id?: string
          organization_id?: string | null
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "anew_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          assigned_to: string | null
          business_unit_id: string | null
          call_center_assigned_to: string | null
          call_center_notes: string | null
          call_center_priority: number | null
          call_center_scheduled_for: string | null
          call_center_status:
            | Database["public"]["Enums"]["call_center_status"]
            | null
          client_id: string | null
          company_id: string | null
          converted_at: string | null
          converted_to_client_id: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json | null
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          email: string | null
          entity_id: string | null
          first_name: string
          id: string
          is_deleted: boolean | null
          is_primary: boolean | null
          last_interaction_at: string | null
          last_name: string
          notes: string | null
          organization_id: string | null
          phone: string | null
          phone_country_code: string | null
          position: string | null
          root_organization_id: string | null
          source: string | null
          source_id: string | null
          source_lead_id: string | null
          source_type: string | null
          status: string | null
          tenant_id: string | null
          updated_at: string
          vat: string | null
        }
        Insert: {
          assigned_to?: string | null
          business_unit_id?: string | null
          call_center_assigned_to?: string | null
          call_center_notes?: string | null
          call_center_priority?: number | null
          call_center_scheduled_for?: string | null
          call_center_status?:
            | Database["public"]["Enums"]["call_center_status"]
            | null
          client_id?: string | null
          company_id?: string | null
          converted_at?: string | null
          converted_to_client_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          email?: string | null
          entity_id?: string | null
          first_name: string
          id?: string
          is_deleted?: boolean | null
          is_primary?: boolean | null
          last_interaction_at?: string | null
          last_name: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          phone_country_code?: string | null
          position?: string | null
          root_organization_id?: string | null
          source?: string | null
          source_id?: string | null
          source_lead_id?: string | null
          source_type?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string
          vat?: string | null
        }
        Update: {
          assigned_to?: string | null
          business_unit_id?: string | null
          call_center_assigned_to?: string | null
          call_center_notes?: string | null
          call_center_priority?: number | null
          call_center_scheduled_for?: string | null
          call_center_status?:
            | Database["public"]["Enums"]["call_center_status"]
            | null
          client_id?: string | null
          company_id?: string | null
          converted_at?: string | null
          converted_to_client_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json | null
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          email?: string | null
          entity_id?: string | null
          first_name?: string
          id?: string
          is_deleted?: boolean | null
          is_primary?: boolean | null
          last_interaction_at?: string | null
          last_name?: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          phone_country_code?: string | null
          position?: string | null
          root_organization_id?: string | null
          source?: string | null
          source_id?: string | null
          source_lead_id?: string | null
          source_type?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string
          vat?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_assigned_to_anew_users_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_business_area_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_converted_to_client_id_fkey"
            columns: ["converted_to_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_created_by_anew_users_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_source_lead_id_fkey"
            columns: ["source_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_assets: {
        Row: {
          asset_id: string
          contract_id: string
          coverage_notes: string | null
          created_at: string
          id: string
        }
        Insert: {
          asset_id: string
          contract_id: string
          coverage_notes?: string | null
          created_at?: string
          id?: string
        }
        Update: {
          asset_id?: string
          contract_id?: string
          coverage_notes?: string | null
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_documents: {
        Row: {
          contract_id: string
          created_at: string
          document_type: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          notes: string | null
          organization_id: string
          uploaded_by: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          document_type?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          notes?: string | null
          organization_id: string
          uploaded_by?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          document_type?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          notes?: string | null
          organization_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "client_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_sends: {
        Row: {
          browser: string | null
          channel: string | null
          contract_id: string | null
          created_at: string
          device_type: string | null
          first_link_clicked_at: string | null
          first_opened_at: string | null
          id: string
          ip_address: string | null
          last_opened_at: string | null
          location_city: string | null
          location_country: string | null
          message: string | null
          open_count: number | null
          organization_id: string | null
          os: string | null
          recipient_email: string | null
          recipient_name: string | null
          sent_at: string
          sent_by: string | null
          status: string | null
          subject: string | null
          total_view_time_seconds: number | null
        }
        Insert: {
          browser?: string | null
          channel?: string | null
          contract_id?: string | null
          created_at?: string
          device_type?: string | null
          first_link_clicked_at?: string | null
          first_opened_at?: string | null
          id?: string
          ip_address?: string | null
          last_opened_at?: string | null
          location_city?: string | null
          location_country?: string | null
          message?: string | null
          open_count?: number | null
          organization_id?: string | null
          os?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string | null
          subject?: string | null
          total_view_time_seconds?: number | null
        }
        Update: {
          browser?: string | null
          channel?: string | null
          contract_id?: string | null
          created_at?: string
          device_type?: string | null
          first_link_clicked_at?: string | null
          first_opened_at?: string | null
          id?: string
          ip_address?: string | null
          last_opened_at?: string | null
          location_city?: string | null
          location_country?: string | null
          message?: string | null
          open_count?: number | null
          organization_id?: string | null
          os?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string | null
          subject?: string | null
          total_view_time_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_sends_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "client_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_sends_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_stage_actions: {
        Row: {
          action_config: Json | null
          action_type: string
          created_at: string | null
          created_by: string | null
          execution_order: number | null
          id: string
          is_active: boolean | null
          organization_id: string | null
          stage_id: string
          updated_at: string | null
        }
        Insert: {
          action_config?: Json | null
          action_type: string
          created_at?: string | null
          created_by?: string | null
          execution_order?: number | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          stage_id: string
          updated_at?: string | null
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          created_at?: string | null
          created_by?: string | null
          execution_order?: number | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          stage_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      countries: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          phone_code: string | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          phone_code?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone_code?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      country_address_configs: {
        Row: {
          admin_level_1_values: Json | null
          admin_level_2_values: Json | null
          admin_level_3_values: Json | null
          country_code: string
          country_name: string
          created_at: string
          field_order: Json | null
          id: string
          is_active: boolean | null
          label_address_line1: string | null
          label_address_line2: string | null
          label_address_line3: string | null
          label_admin_level_1: string | null
          label_admin_level_2: string | null
          label_admin_level_3: string | null
          label_dependent_locality: string | null
          label_locality: string | null
          label_postal_code: string | null
          label_sorting_code: string | null
          postal_code_example: string | null
          postal_code_format: string | null
          require_address_line1: boolean | null
          require_address_line2: boolean | null
          require_admin_level_1: boolean | null
          require_admin_level_2: boolean | null
          require_admin_level_3: boolean | null
          require_locality: boolean | null
          require_postal_code: boolean | null
          show_address_line1: boolean | null
          show_address_line2: boolean | null
          show_address_line3: boolean | null
          show_admin_level_1: boolean | null
          show_admin_level_2: boolean | null
          show_admin_level_3: boolean | null
          show_dependent_locality: boolean | null
          show_locality: boolean | null
          show_postal_code: boolean | null
          show_sorting_code: boolean | null
          updated_at: string
        }
        Insert: {
          admin_level_1_values?: Json | null
          admin_level_2_values?: Json | null
          admin_level_3_values?: Json | null
          country_code: string
          country_name: string
          created_at?: string
          field_order?: Json | null
          id?: string
          is_active?: boolean | null
          label_address_line1?: string | null
          label_address_line2?: string | null
          label_address_line3?: string | null
          label_admin_level_1?: string | null
          label_admin_level_2?: string | null
          label_admin_level_3?: string | null
          label_dependent_locality?: string | null
          label_locality?: string | null
          label_postal_code?: string | null
          label_sorting_code?: string | null
          postal_code_example?: string | null
          postal_code_format?: string | null
          require_address_line1?: boolean | null
          require_address_line2?: boolean | null
          require_admin_level_1?: boolean | null
          require_admin_level_2?: boolean | null
          require_admin_level_3?: boolean | null
          require_locality?: boolean | null
          require_postal_code?: boolean | null
          show_address_line1?: boolean | null
          show_address_line2?: boolean | null
          show_address_line3?: boolean | null
          show_admin_level_1?: boolean | null
          show_admin_level_2?: boolean | null
          show_admin_level_3?: boolean | null
          show_dependent_locality?: boolean | null
          show_locality?: boolean | null
          show_postal_code?: boolean | null
          show_sorting_code?: boolean | null
          updated_at?: string
        }
        Update: {
          admin_level_1_values?: Json | null
          admin_level_2_values?: Json | null
          admin_level_3_values?: Json | null
          country_code?: string
          country_name?: string
          created_at?: string
          field_order?: Json | null
          id?: string
          is_active?: boolean | null
          label_address_line1?: string | null
          label_address_line2?: string | null
          label_address_line3?: string | null
          label_admin_level_1?: string | null
          label_admin_level_2?: string | null
          label_admin_level_3?: string | null
          label_dependent_locality?: string | null
          label_locality?: string | null
          label_postal_code?: string | null
          label_sorting_code?: string | null
          postal_code_example?: string | null
          postal_code_format?: string | null
          require_address_line1?: boolean | null
          require_address_line2?: boolean | null
          require_admin_level_1?: boolean | null
          require_admin_level_2?: boolean | null
          require_admin_level_3?: boolean | null
          require_locality?: boolean | null
          require_postal_code?: boolean | null
          show_address_line1?: boolean | null
          show_address_line2?: boolean | null
          show_address_line3?: boolean | null
          show_admin_level_1?: boolean | null
          show_admin_level_2?: boolean | null
          show_admin_level_3?: boolean | null
          show_dependent_locality?: boolean | null
          show_locality?: boolean | null
          show_postal_code?: boolean | null
          show_sorting_code?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      custom_contract_variables: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          default_value: string | null
          description: string | null
          id: string
          is_active: boolean | null
          label: string
          linked_field_key: string | null
          organization_id: string
          prompt_type: string
          sort_order: number | null
          updated_at: string | null
          variable_key: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          default_value?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          linked_field_key?: string | null
          organization_id: string
          prompt_type?: string
          sort_order?: number | null
          updated_at?: string | null
          variable_key: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          default_value?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          linked_field_key?: string | null
          organization_id?: string
          prompt_type?: string
          sort_order?: number | null
          updated_at?: string | null
          variable_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_contract_variables_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_need_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      deal_need_items: {
        Row: {
          created_at: string
          deal_need_id: string
          id: string
          item_type: string
          notes: string | null
          product_id: string | null
          quantity: number | null
          service_id: string | null
          sort_order: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          deal_need_id: string
          id?: string
          item_type: string
          notes?: string | null
          product_id?: string | null
          quantity?: number | null
          service_id?: string | null
          sort_order?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          deal_need_id?: string
          id?: string
          item_type?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number | null
          service_id?: string | null
          sort_order?: number | null
          unit_price?: number | null
        }
        Relationships: []
      }
      deal_needs: {
        Row: {
          attachments: Json | null
          category_id: string | null
          category_name: string | null
          checklist: Json | null
          created_at: string
          created_by: string | null
          custom_fields: Json | null
          deal_id: string
          description: string | null
          estimate_max: number | null
          estimate_min: number | null
          id: string
          initial_estimate: number | null
          internal_notes: string | null
          measurement_values: Json | null
          measurements: Json | null
          priority: string | null
          sort_order: number | null
          status: string | null
          technical_notes: string | null
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          category_id?: string | null
          category_name?: string | null
          checklist?: Json | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json | null
          deal_id: string
          description?: string | null
          estimate_max?: number | null
          estimate_min?: number | null
          id?: string
          initial_estimate?: number | null
          internal_notes?: string | null
          measurement_values?: Json | null
          measurements?: Json | null
          priority?: string | null
          sort_order?: number | null
          status?: string | null
          technical_notes?: string | null
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          category_id?: string | null
          category_name?: string | null
          checklist?: Json | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json | null
          deal_id?: string
          description?: string | null
          estimate_max?: number | null
          estimate_min?: number | null
          id?: string
          initial_estimate?: number | null
          internal_notes?: string | null
          measurement_values?: Json | null
          measurements?: Json | null
          priority?: string | null
          sort_order?: number | null
          status?: string | null
          technical_notes?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_needs_created_by_anew_users_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stage_actions: {
        Row: {
          action_config: Json | null
          action_type: string
          created_at: string
          created_by: string | null
          execution_order: number | null
          id: string
          is_active: boolean | null
          organization_id: string
          stage_id: string
          updated_at: string
        }
        Insert: {
          action_config?: Json | null
          action_type: string
          created_at?: string
          created_by?: string | null
          execution_order?: number | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          stage_id: string
          updated_at?: string
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          created_at?: string
          created_by?: string | null
          execution_order?: number | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          stage_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      deal_stage_transitions: {
        Row: {
          created_at: string
          created_by: string | null
          from_stage_id: string
          id: string
          organization_id: string | null
          to_stage_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_stage_id: string
          id?: string
          organization_id?: string | null
          to_stage_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_stage_id?: string
          id?: string
          organization_id?: string | null
          to_stage_id?: string
        }
        Relationships: []
      }
      deal_stages: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_final: boolean
          is_lost: boolean
          is_won: boolean
          name: string
          order_index: number
          stage_key: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_final?: boolean
          is_lost?: boolean
          is_won?: boolean
          name: string
          order_index: number
          stage_key?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_final?: boolean
          is_lost?: boolean
          is_won?: boolean
          name?: string
          order_index?: number
          stage_key?: string | null
        }
        Relationships: []
      }
      deals: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          entity_id: string | null
          expected_close_date: string | null
          id: string
          lead_id: string | null
          lost_reason: string | null
          organization_id: string | null
          probability: number | null
          root_organization_id: string | null
          stage_id: string
          title: string
          updated_at: string
          value: number | null
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          entity_id?: string | null
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          lost_reason?: string | null
          organization_id?: string | null
          probability?: number | null
          root_organization_id?: string | null
          stage_id: string
          title: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          entity_id?: string | null
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          lost_reason?: string | null
          organization_id?: string | null
          probability?: number | null
          root_organization_id?: string | null
          stage_id?: string
          title?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "anew_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "anew_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "anew_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "anew_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_root_organization_id_fkey"
            columns: ["root_organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      department_admins: {
        Row: {
          created_at: string
          department_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_area_admins_business_area_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      department_business_units: {
        Row: {
          business_unit_id: string
          created_at: string
          department_id: string
          id: string
        }
        Insert: {
          business_unit_id: string
          created_at?: string
          department_id: string
          id?: string
        }
        Update: {
          business_unit_id?: string
          created_at?: string
          department_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_business_units_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_business_units_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      department_companies: {
        Row: {
          company_id: string
          created_at: string | null
          department_id: string
          id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          department_id: string
          id?: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          department_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_companies_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      department_tenants: {
        Row: {
          created_at: string
          department_id: string
          id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_tenants_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          area_code: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          area_code?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          area_code?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          document_type: string
          entity_id: string
          entity_type: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          notes: string | null
          organization_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_type?: string
          entity_id: string
          entity_type: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          notes?: string | null
          organization_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          notes?: string | null
          organization_id?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      driver_info: {
        Row: {
          certifications: string[] | null
          created_at: string
          driving_score: number | null
          employee_id: string
          id: string
          is_active: boolean | null
          license_categories: string[] | null
          license_expiry: string | null
          license_number: string
          notes: string | null
          total_accidents: number | null
          total_infractions: number | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          certifications?: string[] | null
          created_at?: string
          driving_score?: number | null
          employee_id: string
          id?: string
          is_active?: boolean | null
          license_categories?: string[] | null
          license_expiry?: string | null
          license_number: string
          notes?: string | null
          total_accidents?: number | null
          total_infractions?: number | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          certifications?: string[] | null
          created_at?: string
          driving_score?: number | null
          employee_id?: string
          id?: string
          is_active?: boolean | null
          license_categories?: string[] | null
          license_expiry?: string | null
          license_number?: string
          notes?: string | null
          total_accidents?: number | null
          total_infractions?: number | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_info_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_info_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          body_html: string | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          error_message: string | null
          from_email: string
          id: string
          organization_id: string | null
          sent_at: string | null
          sent_by: string | null
          smtp_id: string | null
          smtp_source: string | null
          status: string
          subject: string
          to_email: string
          user_id: string | null
        }
        Insert: {
          body_html?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          error_message?: string | null
          from_email: string
          id?: string
          organization_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          smtp_id?: string | null
          smtp_source?: string | null
          status?: string
          subject: string
          to_email: string
          user_id?: string | null
        }
        Update: {
          body_html?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          error_message?: string | null
          from_email?: string
          id?: string
          organization_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          smtp_id?: string | null
          smtp_source?: string | null
          status?: string
          subject?: string
          to_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_company_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          created_at: string
          created_by: string | null
          custom_variables: Json
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          module: string
          name: string
          organization_id: string
          subject: string
          trigger_delay_hours: number
          trigger_phase: string | null
          trigger_type: string
          updated_at: string
          variables: Json
        }
        Insert: {
          body_html: string
          created_at?: string
          created_by?: string | null
          custom_variables?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          module: string
          name: string
          organization_id: string
          subject: string
          trigger_delay_hours?: number
          trigger_phase?: string | null
          trigger_type?: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          body_html?: string
          created_at?: string
          created_by?: string | null
          custom_variables?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          module?: string
          name?: string
          organization_id?: string
          subject?: string
          trigger_delay_hours?: number
          trigger_phase?: string | null
          trigger_type?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_business_units: {
        Row: {
          business_unit_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          is_primary: boolean | null
        }
        Insert: {
          business_unit_id: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          is_primary?: boolean | null
        }
        Update: {
          business_unit_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          is_primary?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_business_units_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_business_units_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_companies: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          is_primary: boolean | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          is_primary?: boolean | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          is_primary?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_companies_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_departments: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string
          employee_id: string
          id: string
          is_primary: boolean | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id: string
          employee_id: string
          id?: string
          is_primary?: boolean | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string
          employee_id?: string
          id?: string
          is_primary?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_business_areas_business_area_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_business_areas_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_invite_links: {
        Row: {
          address_number: string | null
          birth_date: string | null
          business_unit_id: string | null
          city: string | null
          company_id: string | null
          create_user: boolean | null
          created_at: string | null
          created_by: string
          current_uses: number | null
          default_language: string | null
          default_role_id: string | null
          department_id: string | null
          department_name: string | null
          description: string | null
          district: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_phone_country_code: string | null
          employment_type: string | null
          expires_at: string | null
          first_name: string | null
          floor_number: string | null
          hire_date: string | null
          id: string
          invite_code: string
          is_active: boolean | null
          job_category_id: string | null
          languages: Json | null
          last_name: string | null
          max_uses: number | null
          municipality: string | null
          name: string
          nationalities: string[] | null
          nib: string | null
          nif_vat: string | null
          notes: string | null
          phone: string | null
          phone_country_code: string | null
          position: string | null
          postal_code: string | null
          salary: number | null
          schedule: string | null
          social_security: string | null
          street: string | null
          updated_at: string | null
          user_password: string | null
          user_type: string | null
        }
        Insert: {
          address_number?: string | null
          birth_date?: string | null
          business_unit_id?: string | null
          city?: string | null
          company_id?: string | null
          create_user?: boolean | null
          created_at?: string | null
          created_by: string
          current_uses?: number | null
          default_language?: string | null
          default_role_id?: string | null
          department_id?: string | null
          department_name?: string | null
          description?: string | null
          district?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_phone_country_code?: string | null
          employment_type?: string | null
          expires_at?: string | null
          first_name?: string | null
          floor_number?: string | null
          hire_date?: string | null
          id?: string
          invite_code: string
          is_active?: boolean | null
          job_category_id?: string | null
          languages?: Json | null
          last_name?: string | null
          max_uses?: number | null
          municipality?: string | null
          name: string
          nationalities?: string[] | null
          nib?: string | null
          nif_vat?: string | null
          notes?: string | null
          phone?: string | null
          phone_country_code?: string | null
          position?: string | null
          postal_code?: string | null
          salary?: number | null
          schedule?: string | null
          social_security?: string | null
          street?: string | null
          updated_at?: string | null
          user_password?: string | null
          user_type?: string | null
        }
        Update: {
          address_number?: string | null
          birth_date?: string | null
          business_unit_id?: string | null
          city?: string | null
          company_id?: string | null
          create_user?: boolean | null
          created_at?: string | null
          created_by?: string
          current_uses?: number | null
          default_language?: string | null
          default_role_id?: string | null
          department_id?: string | null
          department_name?: string | null
          description?: string | null
          district?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_phone_country_code?: string | null
          employment_type?: string | null
          expires_at?: string | null
          first_name?: string | null
          floor_number?: string | null
          hire_date?: string | null
          id?: string
          invite_code?: string
          is_active?: boolean | null
          job_category_id?: string | null
          languages?: Json | null
          last_name?: string | null
          max_uses?: number | null
          municipality?: string | null
          name?: string
          nationalities?: string[] | null
          nib?: string | null
          nif_vat?: string | null
          notes?: string | null
          phone?: string | null
          phone_country_code?: string | null
          position?: string | null
          postal_code?: string | null
          salary?: number | null
          schedule?: string | null
          social_security?: string | null
          street?: string | null
          updated_at?: string | null
          user_password?: string | null
          user_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_invite_links_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invite_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invite_links_default_role_id_fkey"
            columns: ["default_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invite_links_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invite_links_job_category_id_fkey"
            columns: ["job_category_id"]
            isOneToOne: false
            referencedRelation: "job_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_tenants: {
        Row: {
          created_at: string
          created_by: string
          employee_id: string
          id: string
          is_primary: boolean | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          employee_id: string
          id?: string
          is_primary?: boolean | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          employee_id?: string
          id?: string
          is_primary?: boolean | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_tenants_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_vacations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          days: number
          employee_id: string
          end_date: string
          id: string
          notes: string | null
          start_date: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          days: number
          employee_id: string
          end_date: string
          id?: string
          notes?: string | null
          start_date: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          days?: number
          employee_id?: string
          end_date?: string
          id?: string
          notes?: string | null
          start_date?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_vacations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          birth_date: string | null
          business_unit_id: string | null
          city: string | null
          company_id: string | null
          created_at: string
          created_by: string
          department: string | null
          district: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_phone_country_code: string | null
          emergency_phone_country_code: string | null
          employee_number: string
          employment_type: string | null
          first_name: string
          floor_number: string | null
          hire_date: string | null
          id: string
          job_category_id: string | null
          languages: Json | null
          last_name: string
          municipality: string | null
          nationalities: string[] | null
          nib: string | null
          nif_vat: string | null
          notes: string | null
          number: string | null
          phone: string | null
          phone_country_code: string | null
          position: string | null
          postal_code: string | null
          reports_to: string | null
          salary: number | null
          schedule: string | null
          social_security: string | null
          status: string | null
          street: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          birth_date?: string | null
          business_unit_id?: string | null
          city?: string | null
          company_id?: string | null
          created_at?: string
          created_by: string
          department?: string | null
          district?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_phone_country_code?: string | null
          emergency_phone_country_code?: string | null
          employee_number: string
          employment_type?: string | null
          first_name: string
          floor_number?: string | null
          hire_date?: string | null
          id?: string
          job_category_id?: string | null
          languages?: Json | null
          last_name: string
          municipality?: string | null
          nationalities?: string[] | null
          nib?: string | null
          nif_vat?: string | null
          notes?: string | null
          number?: string | null
          phone?: string | null
          phone_country_code?: string | null
          position?: string | null
          postal_code?: string | null
          reports_to?: string | null
          salary?: number | null
          schedule?: string | null
          social_security?: string | null
          status?: string | null
          street?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          birth_date?: string | null
          business_unit_id?: string | null
          city?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          department?: string | null
          district?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_phone_country_code?: string | null
          emergency_phone_country_code?: string | null
          employee_number?: string
          employment_type?: string | null
          first_name?: string
          floor_number?: string | null
          hire_date?: string | null
          id?: string
          job_category_id?: string | null
          languages?: Json | null
          last_name?: string
          municipality?: string | null
          nationalities?: string[] | null
          nib?: string | null
          nif_vat?: string | null
          notes?: string | null
          number?: string | null
          phone?: string | null
          phone_country_code?: string | null
          position?: string | null
          postal_code?: string | null
          reports_to?: string | null
          salary?: number | null
          schedule?: string | null
          social_security?: string | null
          status?: string | null
          street?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_job_category_id_fkey"
            columns: ["job_category_id"]
            isOneToOne: false
            referencedRelation: "job_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_change_log: {
        Row: {
          action: string
          change_reason: string | null
          changed_at: string
          changed_by: string
          company_id: string | null
          entity_id: string
          entity_type: string
          field_changed: string | null
          id: string
          metadata: Json | null
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          action: string
          change_reason?: string | null
          changed_at?: string
          changed_by: string
          company_id?: string | null
          entity_id: string
          entity_type: string
          field_changed?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          action?: string
          change_reason?: string | null
          changed_at?: string
          changed_by?: string
          company_id?: string | null
          entity_id?: string
          entity_type?: string
          field_changed?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_change_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_interactions: {
        Row: {
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          entity_id: string
          id: string
          interaction_at: string
          interaction_type: string
          next_action_channel: string | null
          next_action_date: string | null
          next_action_type: string | null
          notes: string | null
          organization_id: string | null
          result: string | null
          root_organization_id: string | null
          sentiment: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          entity_id: string
          id?: string
          interaction_at?: string
          interaction_type?: string
          next_action_channel?: string | null
          next_action_date?: string | null
          next_action_type?: string | null
          notes?: string | null
          organization_id?: string | null
          result?: string | null
          root_organization_id?: string | null
          sentiment?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          entity_id?: string
          id?: string
          interaction_at?: string
          interaction_type?: string
          next_action_channel?: string | null
          next_action_date?: string | null
          next_action_type?: string | null
          notes?: string | null
          organization_id?: string | null
          result?: string | null
          root_organization_id?: string | null
          sentiment?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_interactions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "anew_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_interactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_interactions_root_organization_id_fkey"
            columns: ["root_organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_entities: {
        Row: {
          commercial_name: string | null
          country_code: string
          created_at: string | null
          created_by: string | null
          id: string
          is_verified: boolean | null
          legal_name: string | null
          metadata: Json | null
          nif: string
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          commercial_name?: string | null
          country_code?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_verified?: boolean | null
          legal_name?: string | null
          metadata?: Json | null
          nif: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          commercial_name?: string | null
          country_code?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_verified?: boolean | null
          legal_name?: string | null
          metadata?: Json | null
          nif?: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_entities_created_by_anew_users_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_builder_flows: {
        Row: {
          created_at: string
          created_by: string
          edges: Json
          id: string
          name: string
          nodes: Json
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          edges?: Json
          id?: string
          name?: string
          nodes?: Json
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          edges?: Json
          id?: string
          name?: string
          nodes?: Json
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_builder_flows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      form_branding: {
        Row: {
          accent_color: string | null
          back_button_bg_color: string | null
          back_button_border_color: string | null
          back_button_hover_bg_color: string | null
          back_button_text: string | null
          back_button_text_color: string | null
          background_color: string | null
          background_image_url: string | null
          border_radius: string | null
          button_option_border_radius: string | null
          button_option_border_width: string | null
          button_option_padding: string | null
          button_text_color: string | null
          card_border_color: string | null
          card_border_radius: string | null
          card_border_width: string | null
          card_icon_border_radius: string | null
          card_icon_size: string | null
          card_min_height: string | null
          card_padding: string | null
          card_style: string | null
          checkbox_border_radius: string | null
          checkbox_border_width: string | null
          checkbox_padding: string | null
          checkbox_size: string | null
          contact_soon_text: string | null
          container_padding_x: string | null
          container_padding_y: string | null
          continue_button_text: string | null
          created_at: string
          created_by: string | null
          custom_css: string | null
          date_placeholder: string | null
          error_display_style: string | null
          error_message: string | null
          error_title: string | null
          favicon_url: string | null
          font_family: string | null
          footer_text: string | null
          form_error_message: string | null
          form_error_title: string | null
          form_id: string
          form_subtitle: string | null
          form_title: string | null
          heading_font_family: string | null
          icon_color: string | null
          icon_selected_color: string | null
          id: string
          iframe_flush_embed: boolean
          info_block_background_opacity: string | null
          info_block_border_radius: string | null
          info_block_padding: string | null
          input_background_color: string | null
          input_border_color: string | null
          input_border_radius: string | null
          input_border_width: string | null
          input_focus_border_color: string | null
          input_font_size: string | null
          input_padding: string | null
          layout_config: Json
          loading_text: string | null
          location_not_available_title: string | null
          location_rejection_message: string | null
          logo_url: string | null
          multi_select_placeholder: string | null
          nav_button_border_radius: string | null
          nav_button_font_size: string | null
          nav_button_padding: string | null
          next_button_text: string | null
          of_text: string | null
          previous_button_text: string | null
          primary_color: string | null
          privacy_policy_label: string | null
          privacy_policy_url: string | null
          progress_bar_border_radius: string | null
          progress_bar_height: string | null
          progress_indicator_style: string | null
          radio_border_radius: string | null
          radio_border_width: string | null
          radio_button_color: string | null
          radio_circle_size: string | null
          radio_inner_size: string | null
          radio_padding: string | null
          redirecting_text: string | null
          required_field_label: string | null
          secondary_color: string | null
          seconds_text: string | null
          select_border_radius: string | null
          select_border_width: string | null
          select_placeholder: string | null
          show_form_title: boolean | null
          show_progress_bar: boolean | null
          show_step_indicator: boolean | null
          show_step_titles: boolean | null
          step_border_color: string | null
          step_border_radius: string | null
          step_border_width: string | null
          step_counter_style: string | null
          step_loading_text: string | null
          step_padding: string | null
          step_shadow: string | null
          step_text: string | null
          submit_button_text: string | null
          submitting_text: string | null
          success_border_radius: string | null
          success_display_style: string | null
          success_icon_size: string | null
          success_message: string | null
          success_redirect_delay_seconds: number | null
          success_redirect_url: string | null
          success_title: string | null
          terms_label: string | null
          terms_url: string | null
          text_color: string | null
          thank_you_text: string | null
          updated_at: string
          validation_error_text: string | null
        }
        Insert: {
          accent_color?: string | null
          back_button_bg_color?: string | null
          back_button_border_color?: string | null
          back_button_hover_bg_color?: string | null
          back_button_text?: string | null
          back_button_text_color?: string | null
          background_color?: string | null
          background_image_url?: string | null
          border_radius?: string | null
          button_option_border_radius?: string | null
          button_option_border_width?: string | null
          button_option_padding?: string | null
          button_text_color?: string | null
          card_border_color?: string | null
          card_border_radius?: string | null
          card_border_width?: string | null
          card_icon_border_radius?: string | null
          card_icon_size?: string | null
          card_min_height?: string | null
          card_padding?: string | null
          card_style?: string | null
          checkbox_border_radius?: string | null
          checkbox_border_width?: string | null
          checkbox_padding?: string | null
          checkbox_size?: string | null
          contact_soon_text?: string | null
          container_padding_x?: string | null
          container_padding_y?: string | null
          continue_button_text?: string | null
          created_at?: string
          created_by?: string | null
          custom_css?: string | null
          date_placeholder?: string | null
          error_display_style?: string | null
          error_message?: string | null
          error_title?: string | null
          favicon_url?: string | null
          font_family?: string | null
          footer_text?: string | null
          form_error_message?: string | null
          form_error_title?: string | null
          form_id: string
          form_subtitle?: string | null
          form_title?: string | null
          heading_font_family?: string | null
          icon_color?: string | null
          icon_selected_color?: string | null
          id?: string
          iframe_flush_embed?: boolean
          info_block_background_opacity?: string | null
          info_block_border_radius?: string | null
          info_block_padding?: string | null
          input_background_color?: string | null
          input_border_color?: string | null
          input_border_radius?: string | null
          input_border_width?: string | null
          input_focus_border_color?: string | null
          input_font_size?: string | null
          input_padding?: string | null
          layout_config?: Json
          loading_text?: string | null
          location_not_available_title?: string | null
          location_rejection_message?: string | null
          logo_url?: string | null
          multi_select_placeholder?: string | null
          nav_button_border_radius?: string | null
          nav_button_font_size?: string | null
          nav_button_padding?: string | null
          next_button_text?: string | null
          of_text?: string | null
          previous_button_text?: string | null
          primary_color?: string | null
          privacy_policy_label?: string | null
          privacy_policy_url?: string | null
          progress_bar_border_radius?: string | null
          progress_bar_height?: string | null
          progress_indicator_style?: string | null
          radio_border_radius?: string | null
          radio_border_width?: string | null
          radio_button_color?: string | null
          radio_circle_size?: string | null
          radio_inner_size?: string | null
          radio_padding?: string | null
          redirecting_text?: string | null
          required_field_label?: string | null
          secondary_color?: string | null
          seconds_text?: string | null
          select_border_radius?: string | null
          select_border_width?: string | null
          select_placeholder?: string | null
          show_form_title?: boolean | null
          show_progress_bar?: boolean | null
          show_step_indicator?: boolean | null
          show_step_titles?: boolean | null
          step_border_color?: string | null
          step_border_radius?: string | null
          step_border_width?: string | null
          step_counter_style?: string | null
          step_loading_text?: string | null
          step_padding?: string | null
          step_shadow?: string | null
          step_text?: string | null
          submit_button_text?: string | null
          submitting_text?: string | null
          success_border_radius?: string | null
          success_display_style?: string | null
          success_icon_size?: string | null
          success_message?: string | null
          success_redirect_delay_seconds?: number | null
          success_redirect_url?: string | null
          success_title?: string | null
          terms_label?: string | null
          terms_url?: string | null
          text_color?: string | null
          thank_you_text?: string | null
          updated_at?: string
          validation_error_text?: string | null
        }
        Update: {
          accent_color?: string | null
          back_button_bg_color?: string | null
          back_button_border_color?: string | null
          back_button_hover_bg_color?: string | null
          back_button_text?: string | null
          back_button_text_color?: string | null
          background_color?: string | null
          background_image_url?: string | null
          border_radius?: string | null
          button_option_border_radius?: string | null
          button_option_border_width?: string | null
          button_option_padding?: string | null
          button_text_color?: string | null
          card_border_color?: string | null
          card_border_radius?: string | null
          card_border_width?: string | null
          card_icon_border_radius?: string | null
          card_icon_size?: string | null
          card_min_height?: string | null
          card_padding?: string | null
          card_style?: string | null
          checkbox_border_radius?: string | null
          checkbox_border_width?: string | null
          checkbox_padding?: string | null
          checkbox_size?: string | null
          contact_soon_text?: string | null
          container_padding_x?: string | null
          container_padding_y?: string | null
          continue_button_text?: string | null
          created_at?: string
          created_by?: string | null
          custom_css?: string | null
          date_placeholder?: string | null
          error_display_style?: string | null
          error_message?: string | null
          error_title?: string | null
          favicon_url?: string | null
          font_family?: string | null
          footer_text?: string | null
          form_error_message?: string | null
          form_error_title?: string | null
          form_id?: string
          form_subtitle?: string | null
          form_title?: string | null
          heading_font_family?: string | null
          icon_color?: string | null
          icon_selected_color?: string | null
          id?: string
          iframe_flush_embed?: boolean
          info_block_background_opacity?: string | null
          info_block_border_radius?: string | null
          info_block_padding?: string | null
          input_background_color?: string | null
          input_border_color?: string | null
          input_border_radius?: string | null
          input_border_width?: string | null
          input_focus_border_color?: string | null
          input_font_size?: string | null
          input_padding?: string | null
          layout_config?: Json
          loading_text?: string | null
          location_not_available_title?: string | null
          location_rejection_message?: string | null
          logo_url?: string | null
          multi_select_placeholder?: string | null
          nav_button_border_radius?: string | null
          nav_button_font_size?: string | null
          nav_button_padding?: string | null
          next_button_text?: string | null
          of_text?: string | null
          previous_button_text?: string | null
          primary_color?: string | null
          privacy_policy_label?: string | null
          privacy_policy_url?: string | null
          progress_bar_border_radius?: string | null
          progress_bar_height?: string | null
          progress_indicator_style?: string | null
          radio_border_radius?: string | null
          radio_border_width?: string | null
          radio_button_color?: string | null
          radio_circle_size?: string | null
          radio_inner_size?: string | null
          radio_padding?: string | null
          redirecting_text?: string | null
          required_field_label?: string | null
          secondary_color?: string | null
          seconds_text?: string | null
          select_border_radius?: string | null
          select_border_width?: string | null
          select_placeholder?: string | null
          show_form_title?: boolean | null
          show_progress_bar?: boolean | null
          show_step_indicator?: boolean | null
          show_step_titles?: boolean | null
          step_border_color?: string | null
          step_border_radius?: string | null
          step_border_width?: string | null
          step_counter_style?: string | null
          step_loading_text?: string | null
          step_padding?: string | null
          step_shadow?: string | null
          step_text?: string | null
          submit_button_text?: string | null
          submitting_text?: string | null
          success_border_radius?: string | null
          success_display_style?: string | null
          success_icon_size?: string | null
          success_message?: string | null
          success_redirect_delay_seconds?: number | null
          success_redirect_url?: string | null
          success_title?: string | null
          terms_label?: string | null
          terms_url?: string | null
          text_color?: string | null
          thank_you_text?: string | null
          updated_at?: string
          validation_error_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_branding_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: true
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_districts: {
        Row: {
          created_at: string
          district_id: string
          form_id: string
          id: string
        }
        Insert: {
          created_at?: string
          district_id: string
          form_id: string
          id?: string
        }
        Update: {
          created_at?: string
          district_id?: string
          form_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_districts_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "administrative_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_districts_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          client_field_mapping: string | null
          contact_field_mapping: string | null
          created_at: string
          created_by: string | null
          display_style: string | null
          field_key: string
          field_label: string
          field_type: string
          form_id: string
          help_text: string | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          is_unique: boolean | null
          max_length: number | null
          max_value: number | null
          min_length: number | null
          min_value: number | null
          option_icon_names: Json | null
          options: Json | null
          pattern: string | null
          pattern_message: string | null
          placeholder: string | null
          sort_order: number | null
          step_number: number
        }
        Insert: {
          client_field_mapping?: string | null
          contact_field_mapping?: string | null
          created_at?: string
          created_by?: string | null
          display_style?: string | null
          field_key: string
          field_label: string
          field_type?: string
          form_id: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          is_unique?: boolean | null
          max_length?: number | null
          max_value?: number | null
          min_length?: number | null
          min_value?: number | null
          option_icon_names?: Json | null
          options?: Json | null
          pattern?: string | null
          pattern_message?: string | null
          placeholder?: string | null
          sort_order?: number | null
          step_number?: number
        }
        Update: {
          client_field_mapping?: string | null
          contact_field_mapping?: string | null
          created_at?: string
          created_by?: string | null
          display_style?: string | null
          field_key?: string
          field_label?: string
          field_type?: string
          form_id?: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          is_unique?: boolean | null
          max_length?: number | null
          max_value?: number | null
          min_length?: number | null
          min_value?: number | null
          option_icon_names?: Json | null
          options?: Json | null
          pattern?: string | null
          pattern_message?: string | null
          placeholder?: string | null
          sort_order?: number | null
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_steps: {
        Row: {
          created_at: string
          form_id: string
          id: string
          next_button_text: string | null
          previous_button_text: string | null
          scheduling_board_id: string | null
          scheduling_duration_minutes: number | null
          scheduling_postal_code_field_key: string | null
          sort_order: number | null
          step_description: string | null
          step_number: number
          step_subtitle: string | null
          step_title: string
          step_type: string
          submit_button_text: string | null
        }
        Insert: {
          created_at?: string
          form_id: string
          id?: string
          next_button_text?: string | null
          previous_button_text?: string | null
          scheduling_board_id?: string | null
          scheduling_duration_minutes?: number | null
          scheduling_postal_code_field_key?: string | null
          sort_order?: number | null
          step_description?: string | null
          step_number?: number
          step_subtitle?: string | null
          step_title: string
          step_type?: string
          submit_button_text?: string | null
        }
        Update: {
          created_at?: string
          form_id?: string
          id?: string
          next_button_text?: string | null
          previous_button_text?: string | null
          scheduling_board_id?: string | null
          scheduling_duration_minutes?: number | null
          scheduling_postal_code_field_key?: string | null
          sort_order?: number | null
          step_description?: string | null
          step_number?: number
          step_subtitle?: string | null
          step_title?: string
          step_type?: string
          submit_button_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_steps_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_steps_scheduling_board_id_fkey"
            columns: ["scheduling_board_id"]
            isOneToOne: false
            referencedRelation: "schedule_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      form_tracking_pixels: {
        Row: {
          config: Json | null
          created_at: string | null
          created_by: string | null
          form_id: string
          id: string
          is_active: boolean | null
          pixel_id: string
          pixel_name: string | null
          pixel_type: string
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          form_id: string
          id?: string
          is_active?: boolean | null
          pixel_id: string
          pixel_name?: string | null
          pixel_type: string
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          form_id?: string
          id?: string
          is_active?: boolean | null
          pixel_id?: string
          pixel_name?: string | null
          pixel_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_tracking_pixels_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          branding: Json | null
          country_code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          form_type: string | null
          gtm_id: string | null
          id: string
          iframe_enabled: boolean | null
          is_active: boolean | null
          is_primary: boolean | null
          location_required: boolean | null
          name: string
          organization_id: string | null
          settings: Json | null
          slug: string
          updated_at: string
        }
        Insert: {
          branding?: Json | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          form_type?: string | null
          gtm_id?: string | null
          id?: string
          iframe_enabled?: boolean | null
          is_active?: boolean | null
          is_primary?: boolean | null
          location_required?: boolean | null
          name: string
          organization_id?: string | null
          settings?: Json | null
          slug: string
          updated_at?: string
        }
        Update: {
          branding?: Json | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          form_type?: string | null
          gtm_id?: string | null
          id?: string
          iframe_enabled?: boolean | null
          is_active?: boolean | null
          is_primary?: boolean | null
          location_required?: boolean | null
          name?: string
          organization_id?: string | null
          settings?: Json | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_logs: {
        Row: {
          anomaly_reason: string | null
          consumption_rate: number | null
          created_at: string
          created_by: string
          distance_since_last_fill: number | null
          driver_id: string | null
          fill_date: string
          fuel_card_number: string | null
          fuel_type: string
          id: string
          is_anomaly: boolean | null
          location: string | null
          notes: string | null
          odometer_reading: number
          quantity: number
          station_name: string | null
          total_cost: number
          unit_price: number
          vehicle_id: string
        }
        Insert: {
          anomaly_reason?: string | null
          consumption_rate?: number | null
          created_at?: string
          created_by: string
          distance_since_last_fill?: number | null
          driver_id?: string | null
          fill_date?: string
          fuel_card_number?: string | null
          fuel_type: string
          id?: string
          is_anomaly?: boolean | null
          location?: string | null
          notes?: string | null
          odometer_reading: number
          quantity: number
          station_name?: string | null
          total_cost: number
          unit_price: number
          vehicle_id: string
        }
        Update: {
          anomaly_reason?: string | null
          consumption_rate?: number | null
          created_at?: string
          created_by?: string
          distance_since_last_fill?: number | null
          driver_id?: string | null
          fill_date?: string
          fuel_card_number?: string | null
          fuel_type?: string
          id?: string
          is_anomaly?: boolean | null
          location?: string | null
          notes?: string | null
          odometer_reading?: number
          quantity?: number
          station_name?: string | null
          total_cost?: number
          unit_price?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      help_article_sections: {
        Row: {
          article_id: string
          content: string
          created_at: string
          id: string
          language_code: string | null
          sort_order: number | null
          title: string
        }
        Insert: {
          article_id: string
          content: string
          created_at?: string
          id?: string
          language_code?: string | null
          sort_order?: number | null
          title: string
        }
        Update: {
          article_id?: string
          content?: string
          created_at?: string
          id?: string
          language_code?: string | null
          sort_order?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_article_sections_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "help_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      help_articles: {
        Row: {
          category: string | null
          content: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          language_code: string | null
          page_key: string
          sort_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          language_code?: string | null
          page_key: string
          sort_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          language_code?: string | null
          page_key?: string
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      help_faqs: {
        Row: {
          answer: string
          category: string
          company_id: string | null
          created_at: string
          icon: string | null
          id: string
          is_active: boolean | null
          language_code: string | null
          page_key: string
          question: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          answer: string
          category: string
          company_id?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          language_code?: string | null
          page_key: string
          question: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string
          company_id?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          language_code?: string | null
          page_key?: string
          question?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_faqs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      help_quick_tips: {
        Row: {
          color: string | null
          company_id: string | null
          created_at: string
          icon: string | null
          id: string
          is_active: boolean | null
          label: string
          language_code: string | null
          page_key: string
          sort_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          company_id?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          language_code?: string | null
          page_key: string
          sort_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          company_id?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          language_code?: string | null
          page_key?: string
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_quick_tips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      help_request_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string
          help_request_id: string
          id: string
          notified_at: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          help_request_id: string
          id?: string
          notified_at?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          help_request_id?: string
          id?: string
          notified_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_request_assignees_help_request_id_fkey"
            columns: ["help_request_id"]
            isOneToOne: false
            referencedRelation: "help_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      help_requests: {
        Row: {
          company_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          note: string | null
          priority: string | null
          requested_by: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          note?: string | null
          priority?: string | null
          requested_by: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          note?: string | null
          priority?: string | null
          requested_by?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      help_workflow_steps: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          language_code: string | null
          page_key: string
          step_number: number
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          language_code?: string | null
          page_key: string
          step_number: number
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          language_code?: string | null
          page_key?: string
          step_number?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_workflow_steps_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_backfill_snapshots: {
        Row: {
          batch_id: string
          column_name: string
          id: string
          metadata: Json
          old_value: string | null
          row_id: string
          snapshot_created_at: string
          snapshot_reason: string
          table_name: string
        }
        Insert: {
          batch_id?: string
          column_name: string
          id?: string
          metadata?: Json
          old_value?: string | null
          row_id: string
          snapshot_created_at?: string
          snapshot_reason: string
          table_name: string
        }
        Update: {
          batch_id?: string
          column_name?: string
          id?: string
          metadata?: Json
          old_value?: string | null
          row_id?: string
          snapshot_created_at?: string
          snapshot_reason?: string
          table_name?: string
        }
        Relationships: []
      }
      incidents: {
        Row: {
          actual_cost: number | null
          attachments: Json | null
          created_at: string
          created_by: string
          description: string
          driver_id: string | null
          estimated_cost: number | null
          id: string
          incident_date: string
          incident_type: Database["public"]["Enums"]["incident_type"]
          injuries: boolean | null
          location: string | null
          resolution_date: string | null
          resolution_notes: string | null
          route_id: string | null
          severity: string | null
          status: string | null
          title: string
          updated_at: string
          vehicle_damaged: boolean | null
          vehicle_id: string
        }
        Insert: {
          actual_cost?: number | null
          attachments?: Json | null
          created_at?: string
          created_by: string
          description: string
          driver_id?: string | null
          estimated_cost?: number | null
          id?: string
          incident_date?: string
          incident_type: Database["public"]["Enums"]["incident_type"]
          injuries?: boolean | null
          location?: string | null
          resolution_date?: string | null
          resolution_notes?: string | null
          route_id?: string | null
          severity?: string | null
          status?: string | null
          title: string
          updated_at?: string
          vehicle_damaged?: boolean | null
          vehicle_id: string
        }
        Update: {
          actual_cost?: number | null
          attachments?: Json | null
          created_at?: string
          created_by?: string
          description?: string
          driver_id?: string | null
          estimated_cost?: number | null
          id?: string
          incident_date?: string
          incident_type?: Database["public"]["Enums"]["incident_type"]
          injuries?: boolean | null
          location?: string | null
          resolution_date?: string | null
          resolution_notes?: string | null
          route_id?: string | null
          severity?: string | null
          status?: string | null
          title?: string
          updated_at?: string
          vehicle_damaged?: boolean | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_chat_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          participant_one: string
          participant_two: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          participant_one: string
          participant_two: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          participant_one?: string
          participant_two?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_chat_conversations_participant_one_fkey"
            columns: ["participant_one"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_chat_conversations_participant_two_fkey"
            columns: ["participant_two"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "internal_chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_link_bu_roles: {
        Row: {
          business_unit_id: string
          created_at: string
          id: string
          invite_link_id: string
          role_id: string
        }
        Insert: {
          business_unit_id: string
          created_at?: string
          id?: string
          invite_link_id: string
          role_id: string
        }
        Update: {
          business_unit_id?: string
          created_at?: string
          id?: string
          invite_link_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_link_bu_roles_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_link_bu_roles_invite_link_id_fkey"
            columns: ["invite_link_id"]
            isOneToOne: false
            referencedRelation: "employee_invite_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_link_bu_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_link_business_units: {
        Row: {
          business_unit_id: string
          created_at: string
          id: string
          invite_link_id: string
        }
        Insert: {
          business_unit_id: string
          created_at?: string
          id?: string
          invite_link_id: string
        }
        Update: {
          business_unit_id?: string
          created_at?: string
          id?: string
          invite_link_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_link_business_units_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_link_business_units_invite_link_id_fkey"
            columns: ["invite_link_id"]
            isOneToOne: false
            referencedRelation: "employee_invite_links"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_link_companies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          invite_link_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          invite_link_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          invite_link_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_link_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_link_companies_invite_link_id_fkey"
            columns: ["invite_link_id"]
            isOneToOne: false
            referencedRelation: "employee_invite_links"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_link_company_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          invite_link_id: string
          role_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          invite_link_id: string
          role_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          invite_link_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_link_company_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_link_company_roles_invite_link_id_fkey"
            columns: ["invite_link_id"]
            isOneToOne: false
            referencedRelation: "employee_invite_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_link_company_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_link_department_roles: {
        Row: {
          created_at: string
          department_id: string
          id: string
          invite_link_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          invite_link_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          invite_link_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_link_department_roles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_link_department_roles_invite_link_id_fkey"
            columns: ["invite_link_id"]
            isOneToOne: false
            referencedRelation: "employee_invite_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_link_department_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_link_departments: {
        Row: {
          created_at: string
          department_id: string
          id: string
          invite_link_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          invite_link_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          invite_link_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_link_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_link_departments_invite_link_id_fkey"
            columns: ["invite_link_id"]
            isOneToOne: false
            referencedRelation: "employee_invite_links"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_link_tenant_roles: {
        Row: {
          created_at: string
          id: string
          invite_link_id: string
          role_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_link_id: string
          role_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_link_id?: string
          role_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_link_tenant_roles_invite_link_id_fkey"
            columns: ["invite_link_id"]
            isOneToOne: false
            referencedRelation: "employee_invite_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_link_tenant_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_link_tenant_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_link_tenants: {
        Row: {
          created_at: string
          id: string
          invite_link_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_link_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_link_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_link_tenants_invite_link_id_fkey"
            columns: ["invite_link_id"]
            isOneToOne: false
            referencedRelation: "employee_invite_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_link_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_categories: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          level: number
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          level?: number
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          level?: number
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "job_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      job_category_translations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          job_category_id: string
          language_code: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          job_category_id: string
          language_code: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          job_category_id?: string
          language_code?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_category_translations_job_category_id_fkey"
            columns: ["job_category_id"]
            isOneToOne: false
            referencedRelation: "job_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_ai_scheduling_rules: {
        Row: {
          ai_considerations: string[] | null
          ai_system_prompt: string | null
          allowed_weekdays: number[] | null
          balance_workload: boolean | null
          buffer_after_minutes: number | null
          buffer_before_minutes: number | null
          campaign_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          earliest_start_time: string | null
          id: string
          is_active: boolean | null
          latest_end_time: string | null
          max_distance_km: number | null
          max_visits_per_day_per_employee: number | null
          max_visits_per_week_per_employee: number | null
          min_visit_duration_minutes: number | null
          name: string
          organization_id: string | null
          prioritize_nearest: boolean | null
          priority: number | null
          updated_at: string
          use_postal_code_proximity: boolean | null
          workload_weight_percent: number | null
        }
        Insert: {
          ai_considerations?: string[] | null
          ai_system_prompt?: string | null
          allowed_weekdays?: number[] | null
          balance_workload?: boolean | null
          buffer_after_minutes?: number | null
          buffer_before_minutes?: number | null
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          earliest_start_time?: string | null
          id?: string
          is_active?: boolean | null
          latest_end_time?: string | null
          max_distance_km?: number | null
          max_visits_per_day_per_employee?: number | null
          max_visits_per_week_per_employee?: number | null
          min_visit_duration_minutes?: number | null
          name: string
          organization_id?: string | null
          prioritize_nearest?: boolean | null
          priority?: number | null
          updated_at?: string
          use_postal_code_proximity?: boolean | null
          workload_weight_percent?: number | null
        }
        Update: {
          ai_considerations?: string[] | null
          ai_system_prompt?: string | null
          allowed_weekdays?: number[] | null
          balance_workload?: boolean | null
          buffer_after_minutes?: number | null
          buffer_before_minutes?: number | null
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          earliest_start_time?: string | null
          id?: string
          is_active?: boolean | null
          latest_end_time?: string | null
          max_distance_km?: number | null
          max_visits_per_day_per_employee?: number | null
          max_visits_per_week_per_employee?: number | null
          min_visit_duration_minutes?: number | null
          name?: string
          organization_id?: string | null
          prioritize_nearest?: boolean | null
          priority?: number | null
          updated_at?: string
          use_postal_code_proximity?: boolean | null
          workload_weight_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_ai_scheduling_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_ai_scheduling_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contact_history: {
        Row: {
          callback_scheduled_at: string | null
          contacted_at: string
          contacted_by: string
          created_at: string
          duration_seconds: number | null
          id: string
          lead_id: string
          notes: string | null
          organization_id: string | null
          result: string
        }
        Insert: {
          callback_scheduled_at?: string | null
          contacted_at?: string
          contacted_by: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          lead_id: string
          notes?: string | null
          organization_id?: string | null
          result: string
        }
        Update: {
          callback_scheduled_at?: string | null
          contacted_at?: string
          contacted_by?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          lead_id?: string
          notes?: string | null
          organization_id?: string | null
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_contact_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "anew_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_contact_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contact_results: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_negative: boolean | null
          is_positive: boolean | null
          name: string
          organization_id: string | null
          requires_callback: boolean | null
          requires_visit: boolean | null
          root_organization_id: string | null
          sort_order: number | null
          updated_at: string
          workflow_action: string | null
          workflow_next_status: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_negative?: boolean | null
          is_positive?: boolean | null
          name: string
          organization_id?: string | null
          requires_callback?: boolean | null
          requires_visit?: boolean | null
          root_organization_id?: string | null
          sort_order?: number | null
          updated_at?: string
          workflow_action?: string | null
          workflow_next_status?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_negative?: boolean | null
          is_positive?: boolean | null
          name?: string
          organization_id?: string | null
          requires_callback?: boolean | null
          requires_visit?: boolean | null
          root_organization_id?: string | null
          sort_order?: number | null
          updated_at?: string
          workflow_action?: string | null
          workflow_next_status?: string | null
        }
        Relationships: []
      }
      lead_field_definitions: {
        Row: {
          campaign_id: string | null
          client_field_mapping: string | null
          contact_field_mapping: string | null
          created_at: string
          created_by: string
          default_value: string | null
          display_style: string | null
          field_key: string
          field_label: string
          field_type: string
          help_text: string | null
          id: string
          is_active: boolean | null
          is_multi_select: boolean | null
          is_required: boolean | null
          is_unique: boolean | null
          max_length: number | null
          max_value: number | null
          min_length: number | null
          min_value: number | null
          option_icon_names: Json | null
          option_icons: Json | null
          option_images: Json | null
          options: Json | null
          organization_id: string | null
          pattern: string | null
          pattern_message: string | null
          placeholder: string | null
          section_id: string | null
          sort_order: number | null
          step_number: number
          step_title: string | null
          system_entity_country_code: string | null
          system_entity_organization_id: string | null
          system_entity_type: string | null
          updated_at: string
          validation_rules: Json | null
        }
        Insert: {
          campaign_id?: string | null
          client_field_mapping?: string | null
          contact_field_mapping?: string | null
          created_at?: string
          created_by: string
          default_value?: string | null
          display_style?: string | null
          field_key: string
          field_label: string
          field_type?: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_multi_select?: boolean | null
          is_required?: boolean | null
          is_unique?: boolean | null
          max_length?: number | null
          max_value?: number | null
          min_length?: number | null
          min_value?: number | null
          option_icon_names?: Json | null
          option_icons?: Json | null
          option_images?: Json | null
          options?: Json | null
          organization_id?: string | null
          pattern?: string | null
          pattern_message?: string | null
          placeholder?: string | null
          section_id?: string | null
          sort_order?: number | null
          step_number?: number
          step_title?: string | null
          system_entity_country_code?: string | null
          system_entity_organization_id?: string | null
          system_entity_type?: string | null
          updated_at?: string
          validation_rules?: Json | null
        }
        Update: {
          campaign_id?: string | null
          client_field_mapping?: string | null
          contact_field_mapping?: string | null
          created_at?: string
          created_by?: string
          default_value?: string | null
          display_style?: string | null
          field_key?: string
          field_label?: string
          field_type?: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_multi_select?: boolean | null
          is_required?: boolean | null
          is_unique?: boolean | null
          max_length?: number | null
          max_value?: number | null
          min_length?: number | null
          min_value?: number | null
          option_icon_names?: Json | null
          option_icons?: Json | null
          option_images?: Json | null
          options?: Json | null
          organization_id?: string | null
          pattern?: string | null
          pattern_message?: string | null
          placeholder?: string | null
          section_id?: string | null
          sort_order?: number | null
          step_number?: number
          step_title?: string | null
          system_entity_country_code?: string | null
          system_entity_organization_id?: string | null
          system_entity_type?: string | null
          updated_at?: string
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_field_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_field_definitions_company_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_field_definitions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "campaign_form_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          root_organization_id: string | null
          updated_at: string | null
          utm_aliases: string[]
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          root_organization_id?: string | null
          updated_at?: string | null
          utm_aliases?: string[]
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          root_organization_id?: string | null
          updated_at?: string | null
          utm_aliases?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_stage_actions: {
        Row: {
          action_config: Json | null
          action_type: string
          created_at: string
          created_by: string | null
          execution_order: number | null
          id: string
          is_active: boolean | null
          organization_id: string
          stage_id: string
          updated_at: string
        }
        Insert: {
          action_config?: Json | null
          action_type: string
          created_at?: string
          created_by?: string | null
          execution_order?: number | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          stage_id: string
          updated_at?: string
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          created_at?: string
          created_by?: string | null
          execution_order?: number | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          stage_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_stage_transitions: {
        Row: {
          created_at: string
          created_by: string | null
          from_stage_id: string
          id: string
          is_active: boolean | null
          label: string | null
          organization_id: string | null
          to_stage_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_stage_id: string
          id?: string
          is_active?: boolean | null
          label?: string | null
          organization_id?: string | null
          to_stage_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_stage_id?: string
          id?: string
          is_active?: boolean | null
          label?: string | null
          organization_id?: string | null
          to_stage_id?: string
        }
        Relationships: []
      }
      lead_workflow_stages: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          default_status: string | null
          id: string
          is_active: boolean | null
          is_conversion: boolean | null
          is_final: boolean | null
          is_rejection: boolean | null
          label: string
          name: string
          organization_id: string | null
          stage_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by: string
          default_status?: string | null
          id?: string
          is_active?: boolean | null
          is_conversion?: boolean | null
          is_final?: boolean | null
          is_rejection?: boolean | null
          label: string
          name: string
          organization_id?: string | null
          stage_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          default_status?: string | null
          id?: string
          is_active?: boolean | null
          is_conversion?: boolean | null
          is_final?: boolean | null
          is_rejection?: boolean | null
          label?: string
          name?: string
          organization_id?: string | null
          stage_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_workflow_stages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          business_unit_id: string | null
          callback_notes: string | null
          callback_scheduled_at: string | null
          campaign_id: string | null
          client_id: string | null
          company_id: string
          contact_attempts: number
          contact_id: string | null
          converted_at: string | null
          converted_by: string | null
          converted_to_contact_id: string | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          field_values: Json
          id: string
          last_contact_at: string | null
          last_contact_by: string | null
          last_contact_result: string | null
          notes: string | null
          organization_id: string | null
          root_organization_id: string | null
          scheduled_visit_id: string | null
          search_text: string | null
          source: string | null
          status: string | null
          tags: string[] | null
          updated_at: string
          workflow_stage_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          business_unit_id?: string | null
          callback_notes?: string | null
          callback_scheduled_at?: string | null
          campaign_id?: string | null
          client_id?: string | null
          company_id: string
          contact_attempts?: number
          contact_id?: string | null
          converted_at?: string | null
          converted_by?: string | null
          converted_to_contact_id?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          field_values?: Json
          id?: string
          last_contact_at?: string | null
          last_contact_by?: string | null
          last_contact_result?: string | null
          notes?: string | null
          organization_id?: string | null
          root_organization_id?: string | null
          scheduled_visit_id?: string | null
          search_text?: string | null
          source?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string
          workflow_stage_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          business_unit_id?: string | null
          callback_notes?: string | null
          callback_scheduled_at?: string | null
          campaign_id?: string | null
          client_id?: string | null
          company_id?: string
          contact_attempts?: number
          contact_id?: string | null
          converted_at?: string | null
          converted_by?: string | null
          converted_to_contact_id?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          field_values?: Json
          id?: string
          last_contact_at?: string | null
          last_contact_by?: string | null
          last_contact_result?: string | null
          notes?: string | null
          organization_id?: string | null
          root_organization_id?: string | null
          scheduled_visit_id?: string | null
          search_text?: string | null
          source?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string
          workflow_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_to_contact_id_fkey"
            columns: ["converted_to_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workflow_stage_id_fkey"
            columns: ["workflow_stage_id"]
            isOneToOne: false
            referencedRelation: "lead_workflow_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_ai_config: {
        Row: {
          callback_reminder_enabled: boolean | null
          callback_reminder_hours_before: number | null
          company_id: string | null
          created_at: string
          custom_alerts: Json | null
          days_without_contact_alert: number | null
          days_without_contact_enabled: boolean | null
          follow_up_days: number | null
          follow_up_reminder_enabled: boolean | null
          group_by_location_enabled: boolean | null
          high_value_threshold: number | null
          id: string
          location_radius_km: number | null
          min_leads_for_location_group: number | null
          new_leads_alert_enabled: boolean | null
          new_leads_check_hours: number | null
          priority_leads_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          callback_reminder_enabled?: boolean | null
          callback_reminder_hours_before?: number | null
          company_id?: string | null
          created_at?: string
          custom_alerts?: Json | null
          days_without_contact_alert?: number | null
          days_without_contact_enabled?: boolean | null
          follow_up_days?: number | null
          follow_up_reminder_enabled?: boolean | null
          group_by_location_enabled?: boolean | null
          high_value_threshold?: number | null
          id?: string
          location_radius_km?: number | null
          min_leads_for_location_group?: number | null
          new_leads_alert_enabled?: boolean | null
          new_leads_check_hours?: number | null
          priority_leads_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          callback_reminder_enabled?: boolean | null
          callback_reminder_hours_before?: number | null
          company_id?: string | null
          created_at?: string
          custom_alerts?: Json | null
          days_without_contact_alert?: number | null
          days_without_contact_enabled?: boolean | null
          follow_up_days?: number | null
          follow_up_reminder_enabled?: boolean | null
          group_by_location_enabled?: boolean | null
          high_value_threshold?: number | null
          id?: string
          location_radius_km?: number | null
          min_leads_for_location_group?: number | null
          new_leads_alert_enabled?: boolean | null
          new_leads_check_hours?: number | null
          priority_leads_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_ai_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          city: string | null
          company_id: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          created_by: string
          id: string
          is_active: boolean | null
          latitude: number | null
          location_type: string
          longitude: number | null
          name: string
          notes: string | null
          parent_location_id: string | null
          postal_code: string | null
          responsible_user_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          location_type: string
          longitude?: number | null
          name: string
          notes?: string | null
          parent_location_id?: string | null
          postal_code?: string | null
          responsible_user_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          location_type?: string
          longitude?: number | null
          name?: string
          notes?: string | null
          parent_location_id?: string | null
          postal_code?: string | null
          responsible_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_parent_location_id_fkey"
            columns: ["parent_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_orders: {
        Row: {
          completed_date: string | null
          created_at: string
          created_by: string
          description: string
          id: string
          labor_cost: number | null
          maintenance_plan_id: string | null
          maintenance_type: Database["public"]["Enums"]["maintenance_type"]
          odometer_reading: number | null
          order_number: string | null
          parts_cost: number | null
          parts_used: string[] | null
          scheduled_date: string | null
          status: string | null
          technician_notes: string | null
          total_cost: number | null
          updated_at: string
          vehicle_id: string
          workshop_contact: string | null
          workshop_name: string | null
        }
        Insert: {
          completed_date?: string | null
          created_at?: string
          created_by: string
          description: string
          id?: string
          labor_cost?: number | null
          maintenance_plan_id?: string | null
          maintenance_type: Database["public"]["Enums"]["maintenance_type"]
          odometer_reading?: number | null
          order_number?: string | null
          parts_cost?: number | null
          parts_used?: string[] | null
          scheduled_date?: string | null
          status?: string | null
          technician_notes?: string | null
          total_cost?: number | null
          updated_at?: string
          vehicle_id: string
          workshop_contact?: string | null
          workshop_name?: string | null
        }
        Update: {
          completed_date?: string | null
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          labor_cost?: number | null
          maintenance_plan_id?: string | null
          maintenance_type?: Database["public"]["Enums"]["maintenance_type"]
          odometer_reading?: number | null
          order_number?: string | null
          parts_cost?: number | null
          parts_used?: string[] | null
          scheduled_date?: string | null
          status?: string | null
          technician_notes?: string | null
          total_cost?: number | null
          updated_at?: string
          vehicle_id?: string
          workshop_contact?: string | null
          workshop_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_orders_maintenance_plan_id_fkey"
            columns: ["maintenance_plan_id"]
            isOneToOne: false
            referencedRelation: "maintenance_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_plans: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          interval_hours: number | null
          interval_km: number | null
          interval_months: number | null
          is_active: boolean | null
          last_performed_at: string | null
          last_performed_km: number | null
          maintenance_type: Database["public"]["Enums"]["maintenance_type"]
          name: string
          next_due_date: string | null
          next_due_km: number | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          interval_hours?: number | null
          interval_km?: number | null
          interval_months?: number | null
          is_active?: boolean | null
          last_performed_at?: string | null
          last_performed_km?: number | null
          maintenance_type?: Database["public"]["Enums"]["maintenance_type"]
          name: string
          next_due_date?: string | null
          next_due_km?: number | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          interval_hours?: number | null
          interval_km?: number | null
          interval_months?: number | null
          is_active?: boolean | null
          last_performed_at?: string | null
          last_performed_km?: number | null
          maintenance_type?: Database["public"]["Enums"]["maintenance_type"]
          name?: string
          next_due_date?: string | null
          next_due_km?: number | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_plans_assets: {
        Row: {
          asset_id: string
          auto_generate_work_order: boolean | null
          created_at: string
          created_by: string
          default_assigned_team: string | null
          default_assigned_to: string | null
          description: string | null
          estimated_cost: number | null
          estimated_duration_hours: number | null
          frequency_type: string | null
          id: string
          interval_days: number | null
          interval_hours: number | null
          is_active: boolean | null
          last_performed_at: string | null
          lead_time_days: number | null
          maintenance_type: Database["public"]["Enums"]["work_order_type"]
          next_due_date: string | null
          plan_name: string
          tasks: Json | null
          typical_parts: Json | null
          updated_at: string
        }
        Insert: {
          asset_id: string
          auto_generate_work_order?: boolean | null
          created_at?: string
          created_by: string
          default_assigned_team?: string | null
          default_assigned_to?: string | null
          description?: string | null
          estimated_cost?: number | null
          estimated_duration_hours?: number | null
          frequency_type?: string | null
          id?: string
          interval_days?: number | null
          interval_hours?: number | null
          is_active?: boolean | null
          last_performed_at?: string | null
          lead_time_days?: number | null
          maintenance_type?: Database["public"]["Enums"]["work_order_type"]
          next_due_date?: string | null
          plan_name: string
          tasks?: Json | null
          typical_parts?: Json | null
          updated_at?: string
        }
        Update: {
          asset_id?: string
          auto_generate_work_order?: boolean | null
          created_at?: string
          created_by?: string
          default_assigned_team?: string | null
          default_assigned_to?: string | null
          description?: string | null
          estimated_cost?: number | null
          estimated_duration_hours?: number | null
          frequency_type?: string | null
          id?: string
          interval_days?: number | null
          interval_hours?: number | null
          is_active?: boolean | null
          last_performed_at?: string | null
          lead_time_days?: number | null
          maintenance_type?: Database["public"]["Enums"]["work_order_type"]
          next_due_date?: string | null
          plan_name?: string
          tasks?: Json | null
          typical_parts?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_plans_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_list_business_units: {
        Row: {
          business_unit_id: string
          created_at: string | null
          id: string
          list_id: string
        }
        Insert: {
          business_unit_id: string
          created_at?: string | null
          id?: string
          list_id: string
        }
        Update: {
          business_unit_id?: string
          created_at?: string | null
          id?: string
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_list_business_units_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_list_business_units_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "marketing_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_list_companies: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          list_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          list_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_list_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_list_companies_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "marketing_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_list_contacts: {
        Row: {
          contact_id: string | null
          created_at: string | null
          id: string
          lead_id: string | null
          list_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          list_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_list_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_list_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_list_contacts_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "marketing_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_list_departments: {
        Row: {
          created_at: string
          department_id: string
          id: string
          list_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          list_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_list_business_areas_business_area_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_list_business_areas_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "marketing_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_lists: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string | null
          root_organization_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
          root_organization_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          root_organization_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_lists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_lists_root_organization_id_fkey"
            columns: ["root_organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          category: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          mime_type: string | null
          name: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          mime_type?: string | null
          name: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          mime_type?: string | null
          name?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      needs_assessment_field_configs: {
        Row: {
          created_at: string
          created_by: string | null
          field_type: string
          id: string
          is_active: boolean | null
          is_required: boolean | null
          name: string
          options: string[] | null
          organization_id: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          field_type: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          name: string
          options?: string[] | null
          organization_id: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          field_type?: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          name?: string
          options?: string[] | null
          organization_id?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      needs_assessment_settings: {
        Row: {
          created_at: string
          id: string
          measurement_fields: Json | null
          organization_id: string
          show_items_tab: boolean | null
          show_measurements_tab: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          measurement_fields?: Json | null
          organization_id: string
          show_items_tab?: boolean | null
          show_measurements_tab?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          measurement_fields?: Json | null
          organization_id?: string
          show_items_tab?: boolean | null
          show_measurements_tab?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      needs_assessment_template_fields: {
        Row: {
          created_at: string
          field_id: string
          id: string
          is_required: boolean | null
          sort_order: number | null
          template_id: string
        }
        Insert: {
          created_at?: string
          field_id: string
          id?: string
          is_required?: boolean | null
          sort_order?: number | null
          template_id: string
        }
        Update: {
          created_at?: string
          field_id?: string
          id?: string
          is_required?: boolean | null
          sort_order?: number | null
          template_id?: string
        }
        Relationships: []
      }
      needs_assessment_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          show_items_tab: boolean | null
          show_measurements_tab: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          show_items_tab?: boolean | null
          show_measurements_tab?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          show_items_tab?: boolean | null
          show_measurements_tab?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          client_no_contact_days_1: number
          client_no_contact_days_2: number
          client_no_contact_enabled: boolean
          contact_no_contact_days_1: number
          contact_no_contact_days_2: number
          contact_no_contact_enabled: boolean
          contract_expiring_days_1: number
          contract_expiring_days_2: number
          contract_expiring_enabled: boolean
          created_at: string
          email_hot_interest_opens: number
          email_tracking_enabled: boolean
          id: string
          organization_id: string
          proposal_expiring_days: number
          proposal_expiring_enabled: boolean
          proposal_no_response_days_1: number
          proposal_no_response_days_2: number
          proposal_no_response_days_3: number
          proposal_no_response_enabled: boolean
          scheduled_actions_enabled: boolean
          updated_at: string
        }
        Insert: {
          client_no_contact_days_1?: number
          client_no_contact_days_2?: number
          client_no_contact_enabled?: boolean
          contact_no_contact_days_1?: number
          contact_no_contact_days_2?: number
          contact_no_contact_enabled?: boolean
          contract_expiring_days_1?: number
          contract_expiring_days_2?: number
          contract_expiring_enabled?: boolean
          created_at?: string
          email_hot_interest_opens?: number
          email_tracking_enabled?: boolean
          id?: string
          organization_id: string
          proposal_expiring_days?: number
          proposal_expiring_enabled?: boolean
          proposal_no_response_days_1?: number
          proposal_no_response_days_2?: number
          proposal_no_response_days_3?: number
          proposal_no_response_enabled?: boolean
          scheduled_actions_enabled?: boolean
          updated_at?: string
        }
        Update: {
          client_no_contact_days_1?: number
          client_no_contact_days_2?: number
          client_no_contact_enabled?: boolean
          contact_no_contact_days_1?: number
          contact_no_contact_days_2?: number
          contact_no_contact_enabled?: boolean
          contract_expiring_days_1?: number
          contract_expiring_days_2?: number
          contract_expiring_enabled?: boolean
          created_at?: string
          email_hot_interest_opens?: number
          email_tracking_enabled?: boolean
          id?: string
          organization_id?: string
          proposal_expiring_days?: number
          proposal_expiring_enabled?: boolean
          proposal_no_response_days_1?: number
          proposal_no_response_days_2?: number
          proposal_no_response_days_3?: number
          proposal_no_response_enabled?: boolean
          scheduled_actions_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_config: Json | null
          action_type: string | null
          created_at: string
          data: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_dismissed: boolean
          is_read: boolean | null
          is_resolved: boolean
          kind: string
          link: string | null
          message: string
          organization_id: string | null
          priority: string | null
          read_at: string | null
          resolved_at: string | null
          resolved_reason: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_config?: Json | null
          action_type?: string | null
          created_at?: string
          data?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_dismissed?: boolean
          is_read?: boolean | null
          is_resolved?: boolean
          kind?: string
          link?: string | null
          message: string
          organization_id?: string | null
          priority?: string | null
          read_at?: string | null
          resolved_at?: string | null
          resolved_reason?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_config?: Json | null
          action_type?: string | null
          created_at?: string
          data?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_dismissed?: boolean
          is_read?: boolean | null
          is_resolved?: boolean
          kind?: string
          link?: string | null
          message?: string
          organization_id?: string | null
          priority?: string | null
          read_at?: string | null
          resolved_at?: string | null
          resolved_reason?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_document_settings: {
        Row: {
          company_name_override: string | null
          company_website: string | null
          created_at: string | null
          extra_settings: Json
          font_family: string | null
          footer_text: string | null
          header_layout: string | null
          header_show_separator: boolean | null
          id: string
          logo_url: string | null
          margin_bottom: number | null
          margin_left: number | null
          margin_right: number | null
          margin_top: number | null
          organization_id: string
          page_orientation: string | null
          page_size: string | null
          primary_color: string | null
          show_address: boolean | null
          show_email: boolean | null
          show_footer: boolean | null
          show_nif: boolean | null
          show_page_numbers: boolean | null
          show_phone: boolean | null
          show_website: boolean | null
          table_header_color: string | null
          updated_at: string | null
        }
        Insert: {
          company_name_override?: string | null
          company_website?: string | null
          created_at?: string | null
          extra_settings?: Json
          font_family?: string | null
          footer_text?: string | null
          header_layout?: string | null
          header_show_separator?: boolean | null
          id?: string
          logo_url?: string | null
          margin_bottom?: number | null
          margin_left?: number | null
          margin_right?: number | null
          margin_top?: number | null
          organization_id: string
          page_orientation?: string | null
          page_size?: string | null
          primary_color?: string | null
          show_address?: boolean | null
          show_email?: boolean | null
          show_footer?: boolean | null
          show_nif?: boolean | null
          show_page_numbers?: boolean | null
          show_phone?: boolean | null
          show_website?: boolean | null
          table_header_color?: string | null
          updated_at?: string | null
        }
        Update: {
          company_name_override?: string | null
          company_website?: string | null
          created_at?: string | null
          extra_settings?: Json
          font_family?: string | null
          footer_text?: string | null
          header_layout?: string | null
          header_show_separator?: boolean | null
          id?: string
          logo_url?: string | null
          margin_bottom?: number | null
          margin_left?: number | null
          margin_right?: number | null
          margin_top?: number | null
          organization_id?: string
          page_orientation?: string | null
          page_size?: string | null
          primary_color?: string | null
          show_address?: boolean | null
          show_email?: boolean | null
          show_footer?: boolean | null
          show_nif?: boolean | null
          show_page_numbers?: boolean | null
          show_phone?: boolean | null
          show_website?: boolean | null
          table_header_color?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_document_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_pipeline_config: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          modules: Json
          organization_id: string
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          modules?: Json
          organization_id: string
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          modules?: Json
          organization_id?: string
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      organization_smtp_settings: {
        Row: {
          created_at: string
          created_by: string | null
          daily_limit: number | null
          encryption: string | null
          from_email: string
          from_name: string
          id: string
          is_active: boolean
          is_default: boolean | null
          name: string | null
          organization_id: string
          smtp_host: string
          smtp_password: string
          smtp_port: number
          smtp_secure: boolean
          smtp_username: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          daily_limit?: number | null
          encryption?: string | null
          from_email: string
          from_name: string
          id?: string
          is_active?: boolean
          is_default?: boolean | null
          name?: string | null
          organization_id: string
          smtp_host: string
          smtp_password: string
          smtp_port?: number
          smtp_secure?: boolean
          smtp_username: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          daily_limit?: number | null
          encryption?: string | null
          from_email?: string
          from_name?: string
          id?: string
          is_active?: boolean
          is_default?: boolean | null
          name?: string | null
          organization_id?: string
          smtp_host?: string
          smtp_password?: string
          smtp_port?: number
          smtp_secure?: boolean
          smtp_username?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_smtp_settings_company_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_team_members: {
        Row: {
          id: string
          joined_at: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "organization_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_teams: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          leader_id: string | null
          name: string
          organization_id: string
          reports_to_team_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          leader_id?: string | null
          name: string
          organization_id: string
          reports_to_team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          leader_id?: string | null
          name?: string
          organization_id?: string
          reports_to_team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_teams_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_teams_reports_to_team_id_fkey"
            columns: ["reports_to_team_id"]
            isOneToOne: false
            referencedRelation: "organization_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      p0_backfill_rollback_snapshot: {
        Row: {
          batch_name: string
          captured_at: string
          column_name: string
          id: string
          new_value: string
          old_value: string
          row_pk: Json
          table_name: string
        }
        Insert: {
          batch_name: string
          captured_at?: string
          column_name: string
          id?: string
          new_value: string
          old_value: string
          row_pk: Json
          table_name: string
        }
        Update: {
          batch_name?: string
          captured_at?: string
          column_name?: string
          id?: string
          new_value?: string
          old_value?: string
          row_pk?: Json
          table_name?: string
        }
        Relationships: []
      }
      p1_identity_backfill_snapshots: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          new_value: string
          notes: string | null
          old_value: string
          target_column: string
          target_id: string
          target_table: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          new_value: string
          notes?: string | null
          old_value: string
          target_column: string
          target_id: string
          target_table: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          new_value?: string
          notes?: string | null
          old_value?: string
          target_column?: string
          target_id?: string
          target_table?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          codigo: string
          created_at: string
          descricao: string | null
          id: string
          modulo: string
        }
        Insert: {
          codigo: string
          created_at?: string
          descricao?: string | null
          id?: string
          modulo: string
        }
        Update: {
          codigo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          modulo?: string
        }
        Relationships: []
      }
      pipeline_links: {
        Row: {
          client_id: string | null
          contract_id: string | null
          created_at: string
          deal_id: string | null
          id: string
          lead_id: string | null
          organization_id: string
          proposal_id: string | null
          quote_id: string | null
          root_organization_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          proposal_id?: string | null
          quote_id?: string | null
          root_organization_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          proposal_id?: string | null
          quote_id?: string | null
          root_organization_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_templates: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          industry: string
          is_default: boolean | null
          modules: Json
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          industry: string
          is_default?: boolean | null
          modules?: Json
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          industry?: string
          is_default?: boolean | null
          modules?: Json
          name?: string
        }
        Relationships: []
      }
      postal_code_lookup: {
        Row: {
          admin_level_1: string | null
          admin_level_2: string | null
          admin_level_3: string | null
          country_code: string
          created_at: string
          dependent_locality: string | null
          id: string
          is_active: boolean | null
          latitude: number | null
          locality: string | null
          longitude: number | null
          postal_code: string
          source: string | null
          street_name: string | null
          street_type: string | null
          updated_at: string
        }
        Insert: {
          admin_level_1?: string | null
          admin_level_2?: string | null
          admin_level_3?: string | null
          country_code: string
          created_at?: string
          dependent_locality?: string | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          postal_code: string
          source?: string | null
          street_name?: string | null
          street_type?: string | null
          updated_at?: string
        }
        Update: {
          admin_level_1?: string | null
          admin_level_2?: string | null
          admin_level_3?: string | null
          country_code?: string
          created_at?: string
          dependent_locality?: string | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          postal_code?: string
          source?: string | null
          street_name?: string | null
          street_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      postal_codes: {
        Row: {
          country_code: string
          created_at: string
          district_id: string | null
          door_number_range: string | null
          id: string
          is_active: boolean | null
          latitude: number | null
          locality: string
          longitude: number | null
          municipality_id: string | null
          parish_id: string | null
          postal_code: string
          postal_code_extension: string | null
          street_name: string | null
          updated_at: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          district_id?: string | null
          door_number_range?: string | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          locality: string
          longitude?: number | null
          municipality_id?: string | null
          parish_id?: string | null
          postal_code: string
          postal_code_extension?: string | null
          street_name?: string | null
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          district_id?: string | null
          door_number_range?: string | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          locality?: string
          longitude?: number | null
          municipality_id?: string | null
          parish_id?: string | null
          postal_code?: string
          postal_code_extension?: string | null
          street_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "postal_codes_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "administrative_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "postal_codes_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "administrative_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "postal_codes_parish_id_fkey"
            columns: ["parish_id"]
            isOneToOne: false
            referencedRelation: "administrative_divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      price_contexts: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          organization_id: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          organization_id?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          organization_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_contexts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attribute_organizations: {
        Row: {
          attribute_id: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
        }
        Insert: {
          attribute_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          attribute_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: []
      }
      product_attribute_price_ranges: {
        Row: {
          attribute_id: string
          category_id: string | null
          cost_impact: number | null
          created_at: string
          id: string
          max_depth: number | null
          max_height: number | null
          max_value: number | null
          max_width: number | null
          min_depth: number | null
          min_height: number | null
          min_value: number
          min_width: number | null
          organization_id: string | null
          price_context_id: string | null
          price_per_unit: number
          product_id: string | null
          range_type: string
          updated_at: string
        }
        Insert: {
          attribute_id: string
          category_id?: string | null
          cost_impact?: number | null
          created_at?: string
          id?: string
          max_depth?: number | null
          max_height?: number | null
          max_value?: number | null
          max_width?: number | null
          min_depth?: number | null
          min_height?: number | null
          min_value?: number
          min_width?: number | null
          organization_id?: string | null
          price_context_id?: string | null
          price_per_unit?: number
          product_id?: string | null
          range_type?: string
          updated_at?: string
        }
        Update: {
          attribute_id?: string
          category_id?: string | null
          cost_impact?: number | null
          created_at?: string
          id?: string
          max_depth?: number | null
          max_height?: number | null
          max_value?: number | null
          max_width?: number | null
          min_depth?: number | null
          min_height?: number | null
          min_value?: number
          min_width?: number | null
          organization_id?: string | null
          price_context_id?: string | null
          price_per_unit?: number
          product_id?: string | null
          range_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_price_ranges_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "product_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_price_ranges_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_price_ranges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_price_ranges_price_context_id_fkey"
            columns: ["price_context_id"]
            isOneToOne: false
            referencedRelation: "price_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_price_ranges_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attribute_value_prices: {
        Row: {
          attribute_id: string
          category_id: string | null
          cost_impact: number | null
          created_at: string
          id: string
          is_available: boolean
          organization_id: string | null
          price: number
          price_context_id: string | null
          product_id: string | null
          sort_order: number
          updated_at: string
          value_option: string
        }
        Insert: {
          attribute_id: string
          category_id?: string | null
          cost_impact?: number | null
          created_at?: string
          id?: string
          is_available?: boolean
          organization_id?: string | null
          price?: number
          price_context_id?: string | null
          product_id?: string | null
          sort_order?: number
          updated_at?: string
          value_option: string
        }
        Update: {
          attribute_id?: string
          category_id?: string | null
          cost_impact?: number | null
          created_at?: string
          id?: string
          is_available?: boolean
          organization_id?: string | null
          price?: number
          price_context_id?: string | null
          product_id?: string | null
          sort_order?: number
          updated_at?: string
          value_option?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_value_prices_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "product_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_value_prices_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_value_prices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_value_prices_price_context_id_fkey"
            columns: ["price_context_id"]
            isOneToOne: false
            referencedRelation: "price_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_value_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attribute_values: {
        Row: {
          attribute_id: string
          created_at: string
          id: string
          product_id: string
          unit: string | null
          updated_at: string
          value_bool: boolean | null
          value_date: string | null
          value_json: Json | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          attribute_id: string
          created_at?: string
          id?: string
          product_id: string
          unit?: string | null
          updated_at?: string
          value_bool?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          attribute_id?: string
          created_at?: string
          id?: string
          product_id?: string
          unit?: string | null
          updated_at?: string
          value_bool?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_values_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "product_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_values_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attributes: {
        Row: {
          allowed_values: Json | null
          code: string
          created_at: string
          created_by: string
          has_hex_color: boolean | null
          id: string
          is_filterable: boolean | null
          is_measurement: boolean
          is_required: boolean | null
          is_variant_attribute: boolean | null
          is_variant_option: boolean
          label: string
          measurement_type: string | null
          options: Json | null
          organization_id: string | null
          price_per_unit: number | null
          pricing_dimension: string | null
          pricing_type: string | null
          pricing_unit: string | null
          sort_order: number | null
          type: Database["public"]["Enums"]["attribute_type"]
          unit: string | null
          updated_at: string
          valorization_type: string
          value_type: string
        }
        Insert: {
          allowed_values?: Json | null
          code: string
          created_at?: string
          created_by: string
          has_hex_color?: boolean | null
          id?: string
          is_filterable?: boolean | null
          is_measurement?: boolean
          is_required?: boolean | null
          is_variant_attribute?: boolean | null
          is_variant_option?: boolean
          label: string
          measurement_type?: string | null
          options?: Json | null
          organization_id?: string | null
          price_per_unit?: number | null
          pricing_dimension?: string | null
          pricing_type?: string | null
          pricing_unit?: string | null
          sort_order?: number | null
          type?: Database["public"]["Enums"]["attribute_type"]
          unit?: string | null
          updated_at?: string
          valorization_type?: string
          value_type?: string
        }
        Update: {
          allowed_values?: Json | null
          code?: string
          created_at?: string
          created_by?: string
          has_hex_color?: boolean | null
          id?: string
          is_filterable?: boolean | null
          is_measurement?: boolean
          is_required?: boolean | null
          is_variant_attribute?: boolean | null
          is_variant_option?: boolean
          label?: string
          measurement_type?: string | null
          options?: Json | null
          organization_id?: string | null
          price_per_unit?: number | null
          pricing_dimension?: string | null
          pricing_type?: string | null
          pricing_unit?: string | null
          sort_order?: number | null
          type?: Database["public"]["Enums"]["attribute_type"]
          unit?: string | null
          updated_at?: string
          valorization_type?: string
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attributes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attributes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          level: number | null
          name: string
          organization_id: string | null
          parent_category_id: string | null
          parent_id: string | null
          path: string
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          level?: number | null
          name: string
          organization_id?: string | null
          parent_category_id?: string | null
          parent_id?: string | null
          path: string
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          level?: number | null
          name?: string
          organization_id?: string | null
          parent_category_id?: string | null
          parent_id?: string | null
          path?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_category_organizations: {
        Row: {
          category_id: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_category_companies_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_category_organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_category_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_config_blocks: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_required: boolean
          label: string
          organization_id: string
          sort_order: number
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_required?: boolean
          label: string
          organization_id: string
          sort_order?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_required?: boolean
          label?: string
          organization_id?: string
          sort_order?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_config_blocks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "product_configuration_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      product_config_rules: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          message: string | null
          organization_id: string
          priority: number
          rule_type: string
          source_operator: string | null
          source_slot_id: string | null
          source_value: Json | null
          target_action: string
          target_slot_id: string | null
          target_value: Json | null
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          message?: string | null
          organization_id: string
          priority?: number
          rule_type: string
          source_operator?: string | null
          source_slot_id?: string | null
          source_value?: Json | null
          target_action: string
          target_slot_id?: string | null
          target_value?: Json | null
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          message?: string | null
          organization_id?: string
          priority?: number
          rule_type?: string
          source_operator?: string | null
          source_slot_id?: string | null
          source_value?: Json | null
          target_action?: string
          target_slot_id?: string | null
          target_value?: Json | null
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_config_rules_source_slot_id_fkey"
            columns: ["source_slot_id"]
            isOneToOne: false
            referencedRelation: "product_config_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_config_rules_target_slot_id_fkey"
            columns: ["target_slot_id"]
            isOneToOne: false
            referencedRelation: "product_config_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_config_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "product_configuration_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      product_config_slot_options: {
        Row: {
          attribute_value_id: string | null
          component_product_id: string | null
          created_at: string
          created_by: string
          default_quantity: number | null
          id: string
          is_enabled: boolean
          label: string
          metadata: Json
          organization_id: string
          slot_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          attribute_value_id?: string | null
          component_product_id?: string | null
          created_at?: string
          created_by: string
          default_quantity?: number | null
          id?: string
          is_enabled?: boolean
          label: string
          metadata?: Json
          organization_id: string
          slot_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          attribute_value_id?: string | null
          component_product_id?: string | null
          created_at?: string
          created_by?: string
          default_quantity?: number | null
          id?: string
          is_enabled?: boolean
          label?: string
          metadata?: Json
          organization_id?: string
          slot_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_config_slot_options_attribute_value_id_fkey"
            columns: ["attribute_value_id"]
            isOneToOne: false
            referencedRelation: "product_attribute_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_config_slot_options_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_config_slot_options_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "product_config_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      product_config_slots: {
        Row: {
          attribute_id: string | null
          block_id: string
          created_at: string
          created_by: string
          id: string
          inventory_behavior: string
          label: string
          max_quantity: number | null
          metadata: Json
          min_quantity: number | null
          organization_id: string
          pricing_behavior: string
          required: boolean
          slot_key: string
          slot_type: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          attribute_id?: string | null
          block_id: string
          created_at?: string
          created_by: string
          id?: string
          inventory_behavior?: string
          label: string
          max_quantity?: number | null
          metadata?: Json
          min_quantity?: number | null
          organization_id: string
          pricing_behavior?: string
          required?: boolean
          slot_key: string
          slot_type: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          attribute_id?: string | null
          block_id?: string
          created_at?: string
          created_by?: string
          id?: string
          inventory_behavior?: string
          label?: string
          max_quantity?: number | null
          metadata?: Json
          min_quantity?: number | null
          organization_id?: string
          pricing_behavior?: string
          required?: boolean
          slot_key?: string
          slot_type?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_config_slots_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "product_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_config_slots_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "product_config_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      product_configuration_templates: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          product_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          product_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          product_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_configuration_templates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          created_by: string
          id: string
          is_main: boolean | null
          product_id: string
          sort_order: number | null
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_main?: boolean | null
          product_id: string
          sort_order?: number | null
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_main?: boolean | null
          product_id?: string
          sort_order?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          media_type: string
          metadata: Json | null
          product_id: string | null
          sort_order: number
          thumbnail_url: string | null
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          media_type: string
          metadata?: Json | null
          product_id?: string | null
          sort_order?: number
          thumbnail_url?: string | null
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          media_type?: string
          metadata?: Json | null
          product_id?: string | null
          sort_order?: number
          thumbnail_url?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_models: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_models_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      product_organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_companies_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_organizations_created_by_anew_users_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_price_history: {
        Row: {
          changed_at: string
          changed_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          new_price: number
          old_price: number
          price_type: Database["public"]["Enums"]["price_type"]
          product_id: string
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          id?: string
          new_price: number
          old_price: number
          price_type: Database["public"]["Enums"]["price_type"]
          product_id: string
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          new_price?: number
          old_price?: number
          price_type?: Database["public"]["Enums"]["price_type"]
          product_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_price_history_changed_by_anew_users_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          created_at: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          price: number
          price_promo: number | null
          price_type: Database["public"]["Enums"]["price_type"]
          product_id: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          vat_rate: number | null
        }
        Insert: {
          created_at?: string
          created_by: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          price: number
          price_promo?: number | null
          price_type?: Database["public"]["Enums"]["price_type"]
          product_id: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          vat_rate?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          price?: number
          price_promo?: number | null
          price_type?: Database["public"]["Enums"]["price_type"]
          product_id?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_created_by_anew_users_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stock: {
        Row: {
          created_at: string
          id: string
          location_id: string | null
          product_id: string
          qty_available: number
          qty_max: number | null
          qty_min: number | null
          qty_reserved: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id?: string | null
          product_id: string
          qty_available?: number
          qty_max?: number | null
          qty_min?: number | null
          qty_reserved?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string | null
          product_id?: string
          qty_available?: number
          qty_max?: number | null
          qty_min?: number | null
          qty_reserved?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_stock_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_translations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          language_code: string
          name: string
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          language_code: string
          name: string
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          language_code?: string
          name?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_translations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand_id: string | null
          category_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          has_variants: boolean
          id: string
          is_active: boolean | null
          is_deleted: boolean
          is_purchasable: boolean
          is_sellable: boolean
          long_description: string | null
          model_id: string | null
          name: string
          organization_id: string | null
          product_kind: string | null
          short_description: string | null
          sku: string
          status: Database["public"]["Enums"]["product_status"]
          subcategory_id: string | null
          supplier_id: string | null
          uom_id: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          has_variants?: boolean
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean
          is_purchasable?: boolean
          is_sellable?: boolean
          long_description?: string | null
          model_id?: string | null
          name: string
          organization_id?: string | null
          product_kind?: string | null
          short_description?: string | null
          sku: string
          status?: Database["public"]["Enums"]["product_status"]
          subcategory_id?: string | null
          supplier_id?: string | null
          uom_id?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          has_variants?: boolean
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean
          is_purchasable?: boolean
          is_sellable?: boolean
          long_description?: string | null
          model_id?: string | null
          name?: string
          organization_id?: string | null
          product_kind?: string | null
          short_description?: string | null
          sku?: string
          status?: Database["public"]["Enums"]["product_status"]
          subcategory_id?: string | null
          supplier_id?: string | null
          uom_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "product_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "uom"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          employee_id: string | null
          full_name: string
          has_completed_welcome: boolean | null
          id: string
          phone: string | null
          phone_country_code: string | null
          tipo: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          full_name: string
          has_completed_welcome?: boolean | null
          id: string
          phone?: string | null
          phone_country_code?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          full_name?: string
          has_completed_welcome?: boolean | null
          id?: string
          phone?: string | null
          phone_country_code?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_access_tokens: {
        Row: {
          client_ip: string | null
          created_at: string
          id: string
          is_accepted: boolean | null
          proposal_id: string
          token_hash: string
          used_at: string | null
          user_agent: string | null
          valid_until: string
        }
        Insert: {
          client_ip?: string | null
          created_at?: string
          id?: string
          is_accepted?: boolean | null
          proposal_id: string
          token_hash: string
          used_at?: string | null
          user_agent?: string | null
          valid_until: string
        }
        Update: {
          client_ip?: string | null
          created_at?: string
          id?: string
          is_accepted?: boolean | null
          proposal_id?: string
          token_hash?: string
          used_at?: string | null
          user_agent?: string | null
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_access_tokens_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_deliveries: {
        Row: {
          created_at: string
          created_by: string
          delivery_channel: string
          error_message: string | null
          id: string
          message_id: string | null
          proposal_id: string
          sent_at: string | null
          status: string
          to_email: string
        }
        Insert: {
          created_at?: string
          created_by: string
          delivery_channel?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          proposal_id: string
          sent_at?: string | null
          status?: string
          to_email: string
        }
        Update: {
          created_at?: string
          created_by?: string
          delivery_channel?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          proposal_id?: string
          sent_at?: string | null
          status?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_deliveries_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_items: {
        Row: {
          created_at: string
          description: string
          id: string
          proposal_id: string
          quantity: number
          sort_order: number | null
          subtotal: number | null
          total: number | null
          unit_price: number
          updated_at: string
          vat_amount: number | null
          vat_rate: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          proposal_id: string
          quantity?: number
          sort_order?: number | null
          subtotal?: number | null
          total?: number | null
          unit_price?: number
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          proposal_id?: string
          quantity?: number
          sort_order?: number | null
          subtotal?: number | null
          total?: number | null
          unit_price?: number
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_manual_items: {
        Row: {
          created_at: string
          description: string
          id: string
          notes: string | null
          proposal_id: string
          quantity: number
          sort_order: number
          total: number | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          notes?: string | null
          proposal_id: string
          quantity?: number
          sort_order?: number
          total?: number | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          notes?: string | null
          proposal_id?: string
          quantity?: number
          sort_order?: number
          total?: number | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      proposal_quote_selections: {
        Row: {
          id: string
          proposal_id: string
          quote_id: string
          selected: boolean | null
          selected_at: string | null
        }
        Insert: {
          id?: string
          proposal_id: string
          quote_id: string
          selected?: boolean | null
          selected_at?: string | null
        }
        Update: {
          id?: string
          proposal_id?: string
          quote_id?: string
          selected?: boolean | null
          selected_at?: string | null
        }
        Relationships: []
      }
      proposal_rejection_reasons: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          label: string
          organization_id: string | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          organization_id?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          organization_id?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_rejection_reasons_company_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_sends: {
        Row: {
          browser: string | null
          channel: string
          created_at: string
          device_type: string | null
          first_link_clicked_at: string | null
          first_opened_at: string | null
          id: string
          ip_address: string | null
          last_opened_at: string | null
          location_city: string | null
          location_country: string | null
          message: string | null
          open_count: number | null
          organization_id: string | null
          os: string | null
          proposal_id: string
          recipient_email: string | null
          recipient_name: string | null
          sent_at: string
          sent_by: string | null
          status: string | null
          subject: string | null
          total_view_time_seconds: number | null
        }
        Insert: {
          browser?: string | null
          channel?: string
          created_at?: string
          device_type?: string | null
          first_link_clicked_at?: string | null
          first_opened_at?: string | null
          id?: string
          ip_address?: string | null
          last_opened_at?: string | null
          location_city?: string | null
          location_country?: string | null
          message?: string | null
          open_count?: number | null
          organization_id?: string | null
          os?: string | null
          proposal_id: string
          recipient_email?: string | null
          recipient_name?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string | null
          subject?: string | null
          total_view_time_seconds?: number | null
        }
        Update: {
          browser?: string | null
          channel?: string
          created_at?: string
          device_type?: string | null
          first_link_clicked_at?: string | null
          first_opened_at?: string | null
          id?: string
          ip_address?: string | null
          last_opened_at?: string | null
          location_city?: string | null
          location_country?: string | null
          message?: string | null
          open_count?: number | null
          organization_id?: string | null
          os?: string | null
          proposal_id?: string
          recipient_email?: string | null
          recipient_name?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string | null
          subject?: string | null
          total_view_time_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_sends_company_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_sends_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_stage_actions: {
        Row: {
          action_config: Json | null
          action_type: string
          created_at: string
          created_by: string | null
          execution_order: number
          id: string
          is_active: boolean
          organization_id: string
          stage_id: string
        }
        Insert: {
          action_config?: Json | null
          action_type: string
          created_at?: string
          created_by?: string | null
          execution_order?: number
          id?: string
          is_active?: boolean
          organization_id: string
          stage_id: string
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          created_at?: string
          created_by?: string | null
          execution_order?: number
          id?: string
          is_active?: boolean
          organization_id?: string
          stage_id?: string
        }
        Relationships: []
      }
      proposal_stage_transitions: {
        Row: {
          created_at: string
          created_by: string | null
          from_stage_id: string
          id: string
          is_active: boolean
          label: string | null
          organization_id: string
          to_stage_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_stage_id: string
          id?: string
          is_active?: boolean
          label?: string | null
          organization_id: string
          to_stage_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_stage_id?: string
          id?: string
          is_active?: boolean
          label?: string | null
          organization_id?: string
          to_stage_id?: string
        }
        Relationships: []
      }
      proposal_templates: {
        Row: {
          accent_color: string | null
          accept_enabled: boolean | null
          accept_verification_method: string | null
          background_color: string | null
          created_at: string
          created_by: string
          description: string | null
          design_settings: Json | null
          email_body: string | null
          email_subject: string | null
          font_family: string | null
          footer_text: string | null
          header_style: string | null
          header_text: string | null
          heading_font_family: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          logo_url: string | null
          name: string
          organization_id: string | null
          primary_color: string | null
          secondary_color: string | null
          sections: Json | null
          show_client_info: boolean | null
          show_company_info: boolean | null
          show_quote_details: boolean | null
          show_terms: boolean | null
          show_validity: boolean | null
          template_type: string
          terms_conditions: string | null
          text_color: string | null
          thank_you_message: string | null
          updated_at: string
          verification_email_body: string | null
          verification_email_subject: string | null
        }
        Insert: {
          accent_color?: string | null
          accept_enabled?: boolean | null
          accept_verification_method?: string | null
          background_color?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          design_settings?: Json | null
          email_body?: string | null
          email_subject?: string | null
          font_family?: string | null
          footer_text?: string | null
          header_style?: string | null
          header_text?: string | null
          heading_font_family?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          logo_url?: string | null
          name: string
          organization_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          sections?: Json | null
          show_client_info?: boolean | null
          show_company_info?: boolean | null
          show_quote_details?: boolean | null
          show_terms?: boolean | null
          show_validity?: boolean | null
          template_type?: string
          terms_conditions?: string | null
          text_color?: string | null
          thank_you_message?: string | null
          updated_at?: string
          verification_email_body?: string | null
          verification_email_subject?: string | null
        }
        Update: {
          accent_color?: string | null
          accept_enabled?: boolean | null
          accept_verification_method?: string | null
          background_color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          design_settings?: Json | null
          email_body?: string | null
          email_subject?: string | null
          font_family?: string | null
          footer_text?: string | null
          header_style?: string | null
          header_text?: string | null
          heading_font_family?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          logo_url?: string | null
          name?: string
          organization_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          sections?: Json | null
          show_client_info?: boolean | null
          show_company_info?: boolean | null
          show_quote_details?: boolean | null
          show_terms?: boolean | null
          show_validity?: boolean | null
          template_type?: string
          terms_conditions?: string | null
          text_color?: string | null
          thank_you_message?: string | null
          updated_at?: string
          verification_email_body?: string | null
          verification_email_subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_templates_company_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_verification_codes: {
        Row: {
          action: string | null
          code: string
          created_at: string
          destination: string
          expires_at: string
          id: string
          method: string
          proposal_id: string
          rejection_notes: string | null
          rejection_reason: string | null
          rejection_reason_code: string | null
          verified_at: string | null
        }
        Insert: {
          action?: string | null
          code: string
          created_at?: string
          destination: string
          expires_at: string
          id?: string
          method: string
          proposal_id: string
          rejection_notes?: string | null
          rejection_reason?: string | null
          rejection_reason_code?: string | null
          verified_at?: string | null
        }
        Update: {
          action?: string | null
          code?: string
          created_at?: string
          destination?: string
          expires_at?: string
          id?: string
          method?: string
          proposal_id?: string
          rejection_notes?: string | null
          rejection_reason?: string | null
          rejection_reason_code?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_verification_codes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_workflow_stages: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_final: boolean | null
          is_lost: boolean | null
          is_won: boolean | null
          label: string
          name: string
          organization_id: string | null
          stage_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_final?: boolean | null
          is_lost?: boolean | null
          is_won?: boolean | null
          label: string
          name: string
          organization_id?: string | null
          stage_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_final?: boolean | null
          is_lost?: boolean | null
          is_won?: boolean | null
          label?: string
          name?: string
          organization_id?: string | null
          stage_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_workflow_stages_company_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          acceptance_ip: string | null
          acceptance_user_agent: string | null
          accepted_at: string | null
          assigned_to: string | null
          client_contract_id: string | null
          client_id: string | null
          created_at: string
          created_by: string
          currency: string | null
          deal_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivered_at: string | null
          delivery_time_hours: number | null
          description: string | null
          document_url: string | null
          entity_id: string | null
          id: string
          is_deleted: boolean | null
          last_viewed_at: string | null
          notes: string | null
          organization_id: string | null
          probability: number | null
          proposal_number: string | null
          public_link_enabled: boolean | null
          public_token: string | null
          rejected_at: string | null
          rejection_notes: string | null
          rejection_reason: string | null
          rejection_reason_code: string | null
          rejection_reason_id: string | null
          request_date: string | null
          root_organization_id: string | null
          sent_at: string | null
          signature_image: string | null
          stage_id: string | null
          status: string | null
          template_id: string | null
          title: string
          tracking_token: string | null
          updated_at: string
          valid_until: string | null
          value: number
          view_count: number | null
          viewed_at: string | null
        }
        Insert: {
          acceptance_ip?: string | null
          acceptance_user_agent?: string | null
          accepted_at?: string | null
          assigned_to?: string | null
          client_contract_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by: string
          currency?: string | null
          deal_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivered_at?: string | null
          delivery_time_hours?: number | null
          description?: string | null
          document_url?: string | null
          entity_id?: string | null
          id?: string
          is_deleted?: boolean | null
          last_viewed_at?: string | null
          notes?: string | null
          organization_id?: string | null
          probability?: number | null
          proposal_number?: string | null
          public_link_enabled?: boolean | null
          public_token?: string | null
          rejected_at?: string | null
          rejection_notes?: string | null
          rejection_reason?: string | null
          rejection_reason_code?: string | null
          rejection_reason_id?: string | null
          request_date?: string | null
          root_organization_id?: string | null
          sent_at?: string | null
          signature_image?: string | null
          stage_id?: string | null
          status?: string | null
          template_id?: string | null
          title: string
          tracking_token?: string | null
          updated_at?: string
          valid_until?: string | null
          value: number
          view_count?: number | null
          viewed_at?: string | null
        }
        Update: {
          acceptance_ip?: string | null
          acceptance_user_agent?: string | null
          accepted_at?: string | null
          assigned_to?: string | null
          client_contract_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string | null
          deal_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivered_at?: string | null
          delivery_time_hours?: number | null
          description?: string | null
          document_url?: string | null
          entity_id?: string | null
          id?: string
          is_deleted?: boolean | null
          last_viewed_at?: string | null
          notes?: string | null
          organization_id?: string | null
          probability?: number | null
          proposal_number?: string | null
          public_link_enabled?: boolean | null
          public_token?: string | null
          rejected_at?: string | null
          rejection_notes?: string | null
          rejection_reason?: string | null
          rejection_reason_code?: string | null
          rejection_reason_id?: string | null
          request_date?: string | null
          root_organization_id?: string | null
          sent_at?: string | null
          signature_image?: string | null
          stage_id?: string | null
          status?: string | null
          template_id?: string | null
          title?: string
          tracking_token?: string | null
          updated_at?: string
          valid_until?: string | null
          value?: number
          view_count?: number | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_client_contract_id_fkey"
            columns: ["client_contract_id"]
            isOneToOne: false
            referencedRelation: "client_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "anew_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_root_organization_id_fkey"
            columns: ["root_organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "proposal_workflow_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "proposal_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          description: string
          id: string
          item_type: string
          notes: string | null
          product_id: string | null
          purchase_order_id: string
          quantity: number
          selected_attributes: Json | null
          service_id: string | null
          sku: string | null
          total_price: number
          unit_price: number
          updated_at: string
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          item_type: string
          notes?: string | null
          product_id?: string | null
          purchase_order_id: string
          quantity?: number
          selected_attributes?: Json | null
          service_id?: string | null
          sku?: string | null
          total_price?: number
          unit_price?: number
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          item_type?: string
          notes?: string | null
          product_id?: string | null
          purchase_order_id?: string
          quantity?: number
          selected_attributes?: Json | null
          service_id?: string | null
          sku?: string | null
          total_price?: number
          unit_price?: number
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          business_unit_id: string | null
          created_at: string
          created_by: string
          expected_delivery: string | null
          id: string
          notes: string | null
          order_date: string
          order_number: string
          organization_id: string
          status: string
          supplier_id: string | null
          total_value: number
          updated_at: string
        }
        Insert: {
          business_unit_id?: string | null
          created_at?: string
          created_by: string
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date: string
          order_number: string
          organization_id: string
          status?: string
          supplier_id?: string | null
          total_value?: number
          updated_at?: string
        }
        Update: {
          business_unit_id?: string | null
          created_at?: string
          created_by?: string
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_number?: string
          organization_id?: string
          status?: string
          supplier_id?: string | null
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_documents: {
        Row: {
          created_at: string
          created_by: string | null
          document_type: string
          file_name: string
          file_url: string
          id: string
          organization_id: string
          quote_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_type?: string
          file_name: string
          file_url: string
          id?: string
          organization_id: string
          quote_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_type?: string
          file_name?: string
          file_url?: string
          id?: string
          organization_id?: string
          quote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_documents_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_fees: {
        Row: {
          base_amount: number
          calculated_value: number
          created_at: string
          fee_type_id: string
          id: string
          quote_id: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          base_amount: number
          calculated_value: number
          created_at?: string
          fee_type_id: string
          id?: string
          quote_id: string
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          base_amount?: number
          calculated_value?: number
          created_at?: string
          fee_type_id?: string
          id?: string
          quote_id?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_fees_fee_type_id_fkey"
            columns: ["fee_type_id"]
            isOneToOne: false
            referencedRelation: "service_fee_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_fees_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_lines: {
        Row: {
          bundle_id: string | null
          catalog_item_id: string | null
          categoria: string
          cost_price: number | null
          created_at: string
          custo_mao_obra_unit: number | null
          custo_material_unit: number | null
          descricao_snapshot: string
          discount_percent: number | null
          id: string
          int_percent: number | null
          item_description: string | null
          iva_percent: number | null
          margem_percent: number | null
          ordem: number | null
          product_id: string | null
          qt: number | null
          quote_id: string
          section_name: string | null
          selected_attributes: Json | null
          service_id: string | null
          total_com_desconto: number | null
          total_com_iva: number | null
          total_sem_iva: number | null
          unidade: string | null
        }
        Insert: {
          bundle_id?: string | null
          catalog_item_id?: string | null
          categoria: string
          cost_price?: number | null
          created_at?: string
          custo_mao_obra_unit?: number | null
          custo_material_unit?: number | null
          descricao_snapshot: string
          discount_percent?: number | null
          id?: string
          int_percent?: number | null
          item_description?: string | null
          iva_percent?: number | null
          margem_percent?: number | null
          ordem?: number | null
          product_id?: string | null
          qt?: number | null
          quote_id: string
          section_name?: string | null
          selected_attributes?: Json | null
          service_id?: string | null
          total_com_desconto?: number | null
          total_com_iva?: number | null
          total_sem_iva?: number | null
          unidade?: string | null
        }
        Update: {
          bundle_id?: string | null
          catalog_item_id?: string | null
          categoria?: string
          cost_price?: number | null
          created_at?: string
          custo_mao_obra_unit?: number | null
          custo_material_unit?: number | null
          descricao_snapshot?: string
          discount_percent?: number | null
          id?: string
          int_percent?: number | null
          item_description?: string | null
          iva_percent?: number | null
          margem_percent?: number | null
          ordem?: number | null
          product_id?: string | null
          qt?: number | null
          quote_id?: string
          section_name?: string | null
          selected_attributes?: Json | null
          service_id?: string | null
          total_com_desconto?: number | null
          total_com_iva?: number | null
          total_sem_iva?: number | null
          unidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_lines_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_lines_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_lines_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_lines_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_sends: {
        Row: {
          browser: string | null
          channel: string
          created_at: string
          device_type: string | null
          first_link_clicked_at: string | null
          first_opened_at: string | null
          id: string
          ip_address: string | null
          last_opened_at: string | null
          location_city: string | null
          location_country: string | null
          message: string | null
          open_count: number | null
          organization_id: string | null
          os: string | null
          quote_id: string
          recipient_email: string
          recipient_name: string | null
          sent_at: string
          sent_by: string | null
          status: string | null
          subject: string | null
          total_view_time_seconds: number | null
        }
        Insert: {
          browser?: string | null
          channel?: string
          created_at?: string
          device_type?: string | null
          first_link_clicked_at?: string | null
          first_opened_at?: string | null
          id?: string
          ip_address?: string | null
          last_opened_at?: string | null
          location_city?: string | null
          location_country?: string | null
          message?: string | null
          open_count?: number | null
          organization_id?: string | null
          os?: string | null
          quote_id: string
          recipient_email: string
          recipient_name?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string | null
          subject?: string | null
          total_view_time_seconds?: number | null
        }
        Update: {
          browser?: string | null
          channel?: string
          created_at?: string
          device_type?: string | null
          first_link_clicked_at?: string | null
          first_opened_at?: string | null
          id?: string
          ip_address?: string | null
          last_opened_at?: string | null
          location_city?: string | null
          location_country?: string | null
          message?: string | null
          open_count?: number | null
          organization_id?: string | null
          os?: string | null
          quote_id?: string
          recipient_email?: string
          recipient_name?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string | null
          subject?: string | null
          total_view_time_seconds?: number | null
        }
        Relationships: []
      }
      quote_stage_actions: {
        Row: {
          action_config: Json | null
          action_type: string
          created_at: string | null
          created_by: string | null
          execution_order: number | null
          id: string
          is_active: boolean | null
          organization_id: string
          stage_id: string
          updated_at: string | null
        }
        Insert: {
          action_config?: Json | null
          action_type: string
          created_at?: string | null
          created_by?: string | null
          execution_order?: number | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          stage_id: string
          updated_at?: string | null
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          created_at?: string | null
          created_by?: string | null
          execution_order?: number | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          stage_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_stage_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_stage_actions_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "quote_workflow_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_template_items: {
        Row: {
          bundle_id: string | null
          created_at: string
          default_attributes: Json | null
          default_qt: number | null
          id: string
          item_type: string
          ordem: number | null
          product_id: string | null
          required: boolean | null
          service_id: string | null
          template_id: string
        }
        Insert: {
          bundle_id?: string | null
          created_at?: string
          default_attributes?: Json | null
          default_qt?: number | null
          id?: string
          item_type?: string
          ordem?: number | null
          product_id?: string | null
          required?: boolean | null
          service_id?: string | null
          template_id: string
        }
        Update: {
          bundle_id?: string | null
          created_at?: string
          default_attributes?: Json | null
          default_qt?: number | null
          id?: string
          item_type?: string
          ordem?: number | null
          product_id?: string | null
          required?: boolean | null
          service_id?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_template_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_template_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_template_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quote_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_templates: {
        Row: {
          active: boolean | null
          codigo: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          codigo: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          codigo?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_templates_company_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_workflow_stages: {
        Row: {
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_final: boolean | null
          is_lost: boolean | null
          is_won: boolean | null
          label: string | null
          name: string
          organization_id: string | null
          stage_order: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_final?: boolean | null
          is_lost?: boolean | null
          is_won?: boolean | null
          label?: string | null
          name: string
          organization_id?: string | null
          stage_order?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_final?: boolean | null
          is_lost?: boolean | null
          is_won?: boolean | null
          label?: string | null
          name?: string
          organization_id?: string | null
          stage_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_workflow_stages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          assigned_to: string | null
          business_unit_id: string | null
          client_notes: string | null
          cliente_id: string | null
          conditions: string | null
          created_at: string
          created_by: string
          deal_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivered_at: string | null
          delivery_time_hours: number | null
          desconto_global_percent: number | null
          entity_id: string | null
          estado: string | null
          id: string
          iva_rate: number | null
          modelo_base: string
          moeda: string | null
          obra_endereco: string | null
          obra_notas: string | null
          organization_id: string | null
          proposal_id: string | null
          quote_number: string | null
          request_date: string | null
          root_organization_id: string | null
          site_address_id: string | null
          subtotal: number | null
          template_id: string | null
          title: string | null
          total: number | null
          total_fees: number | null
          updated_at: string
          validade_dias: number | null
        }
        Insert: {
          accepted_at?: string | null
          assigned_to?: string | null
          business_unit_id?: string | null
          client_notes?: string | null
          cliente_id?: string | null
          conditions?: string | null
          created_at?: string
          created_by: string
          deal_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivered_at?: string | null
          delivery_time_hours?: number | null
          desconto_global_percent?: number | null
          entity_id?: string | null
          estado?: string | null
          id?: string
          iva_rate?: number | null
          modelo_base?: string
          moeda?: string | null
          obra_endereco?: string | null
          obra_notas?: string | null
          organization_id?: string | null
          proposal_id?: string | null
          quote_number?: string | null
          request_date?: string | null
          root_organization_id?: string | null
          site_address_id?: string | null
          subtotal?: number | null
          template_id?: string | null
          title?: string | null
          total?: number | null
          total_fees?: number | null
          updated_at?: string
          validade_dias?: number | null
        }
        Update: {
          accepted_at?: string | null
          assigned_to?: string | null
          business_unit_id?: string | null
          client_notes?: string | null
          cliente_id?: string | null
          conditions?: string | null
          created_at?: string
          created_by?: string
          deal_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivered_at?: string | null
          delivery_time_hours?: number | null
          desconto_global_percent?: number | null
          entity_id?: string | null
          estado?: string | null
          id?: string
          iva_rate?: number | null
          modelo_base?: string
          moeda?: string | null
          obra_endereco?: string | null
          obra_notas?: string | null
          organization_id?: string | null
          proposal_id?: string | null
          quote_number?: string | null
          request_date?: string | null
          root_organization_id?: string | null
          site_address_id?: string | null
          subtotal?: number | null
          template_id?: string | null
          title?: string | null
          total?: number | null
          total_fees?: number | null
          updated_at?: string
          validade_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "anew_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_root_organization_id_fkey"
            columns: ["root_organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_site_address_id_fkey"
            columns: ["site_address_id"]
            isOneToOne: false
            referencedRelation: "site_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_availability_rules: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_available: boolean | null
          resource_id: string
          start_time: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_available?: boolean | null
          resource_id: string
          start_time: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_available?: boolean | null
          resource_id?: string
          start_time?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_availability_rules_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "schedule_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_service_areas: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          is_active: boolean | null
          max_distance_km: number | null
          postal_code_prefix: string
          priority: number | null
          resource_id: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          is_active?: boolean | null
          max_distance_km?: number | null
          postal_code_prefix: string
          priority?: number | null
          resource_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          is_active?: boolean | null
          max_distance_km?: number | null
          postal_code_prefix?: string
          priority?: number | null
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_service_areas_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "schedule_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_time_off: {
        Row: {
          all_day: boolean | null
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          end_date: string
          end_time: string | null
          id: string
          notes: string | null
          reason: string | null
          resource_id: string
          start_date: string
          start_time: string | null
          title: string
        }
        Insert: {
          all_day?: boolean | null
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          end_date: string
          end_time?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          resource_id: string
          start_date: string
          start_time?: string | null
          title: string
        }
        Update: {
          all_day?: boolean | null
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          end_date?: string
          end_time?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          resource_id?: string
          start_date?: string
          start_time?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_time_off_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "schedule_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      role_calendar_permissions: {
        Row: {
          can_create_visits: boolean
          can_delete_all_visits: boolean
          can_delete_own_visits: boolean
          can_edit_all_visits: boolean
          can_edit_own_visits: boolean
          can_view_all_visits: boolean
          can_view_own_visits: boolean
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          can_create_visits?: boolean
          can_delete_all_visits?: boolean
          can_delete_own_visits?: boolean
          can_edit_all_visits?: boolean
          can_edit_own_visits?: boolean
          can_view_all_visits?: boolean
          can_view_own_visits?: boolean
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          can_create_visits?: boolean
          can_delete_all_visits?: boolean
          can_delete_own_visits?: boolean
          can_edit_all_visits?: boolean
          can_edit_own_visits?: boolean
          can_view_all_visits?: boolean
          can_view_own_visits?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role_id: string
          scope: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
          scope?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
          scope?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          allowed_user_types: string[] | null
          created_at: string
          created_by: string | null
          descricao: string | null
          empresa_id: string | null
          estado: string
          id: string
          is_template: boolean | null
          nome: string
          template_id: string | null
          template_key: string | null
          tenant_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          allowed_user_types?: string[] | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          empresa_id?: string | null
          estado?: string
          id?: string
          is_template?: boolean | null
          nome: string
          template_id?: string | null
          template_key?: string | null
          tenant_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          allowed_user_types?: string[] | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          empresa_id?: string | null
          estado?: string
          id?: string
          is_template?: boolean | null
          nome?: string
          template_id?: string | null
          template_key?: string | null
          tenant_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      route_stops: {
        Row: {
          actual_arrival: string | null
          actual_departure: string | null
          address: string | null
          completed: boolean | null
          created_at: string
          id: string
          location: string
          notes: string | null
          planned_arrival: string | null
          planned_departure: string | null
          route_id: string
          stop_order: number
        }
        Insert: {
          actual_arrival?: string | null
          actual_departure?: string | null
          address?: string | null
          completed?: boolean | null
          created_at?: string
          id?: string
          location: string
          notes?: string | null
          planned_arrival?: string | null
          planned_departure?: string | null
          route_id: string
          stop_order: number
        }
        Update: {
          actual_arrival?: string | null
          actual_departure?: string | null
          address?: string | null
          completed?: boolean | null
          created_at?: string
          id?: string
          location?: string
          notes?: string | null
          planned_arrival?: string | null
          planned_departure?: string | null
          route_id?: string
          stop_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          actual_distance: number | null
          actual_end: string | null
          actual_start: string | null
          business_unit_id: string | null
          company_id: string | null
          created_at: string
          created_by: string
          description: string | null
          driver_id: string | null
          id: string
          name: string
          notes: string | null
          planned_distance: number | null
          scheduled_end: string | null
          scheduled_start: string | null
          sla_compliance: boolean | null
          status: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          actual_distance?: number | null
          actual_end?: string | null
          actual_start?: string | null
          business_unit_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          driver_id?: string | null
          id?: string
          name: string
          notes?: string | null
          planned_distance?: number | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          sla_compliance?: boolean | null
          status?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          actual_distance?: number | null
          actual_end?: string | null
          actual_start?: string | null
          business_unit_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          driver_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          planned_distance?: number | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          sla_compliance?: boolean | null
          status?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_boards: {
        Row: {
          board_type: string | null
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean | null
          is_system_board: boolean | null
          name: string
          name_key: string | null
          organization_id: string | null
          settings: Json | null
          updated_at: string
        }
        Insert: {
          board_type?: string | null
          color?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system_board?: boolean | null
          name: string
          name_key?: string | null
          organization_id?: string | null
          settings?: Json | null
          updated_at?: string
        }
        Update: {
          board_type?: string | null
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system_board?: boolean | null
          name?: string
          name_key?: string | null
          organization_id?: string | null
          settings?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_boards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_fields: {
        Row: {
          created_at: string
          created_by: string
          default_value: string | null
          field_type: Database["public"]["Enums"]["schedule_field_type"]
          id: string
          is_required: boolean | null
          is_system: boolean | null
          label: string
          name: string
          options: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          default_value?: string | null
          field_type?: Database["public"]["Enums"]["schedule_field_type"]
          id?: string
          is_required?: boolean | null
          is_system?: boolean | null
          label: string
          name: string
          options?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          default_value?: string | null
          field_type?: Database["public"]["Enums"]["schedule_field_type"]
          id?: string
          is_required?: boolean | null
          is_system?: boolean | null
          label?: string
          name?: string
          options?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      schedule_holidays: {
        Row: {
          country_code: string
          created_at: string
          created_by: string
          holiday_date: string
          id: string
          is_custom: boolean
          is_recurring: boolean
          name: string
          organization_id: string | null
        }
        Insert: {
          country_code: string
          created_at?: string
          created_by: string
          holiday_date: string
          id?: string
          is_custom?: boolean
          is_recurring?: boolean
          name: string
          organization_id?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string
          created_by?: string
          holiday_date?: string
          id?: string
          is_custom?: boolean
          is_recurring?: boolean
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_holidays_company_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_invitations: {
        Row: {
          created_at: string
          email_sent: boolean | null
          email_sent_at: string | null
          id: string
          invited_at: string
          invited_by: string
          invitee_id: string
          invitee_type: string
          responded_at: string | null
          response_message: string | null
          schedule_item_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          invited_at?: string
          invited_by: string
          invitee_id: string
          invitee_type: string
          responded_at?: string | null
          response_message?: string | null
          schedule_item_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          invited_at?: string
          invited_by?: string
          invitee_id?: string
          invitee_type?: string
          responded_at?: string | null
          response_message?: string | null
          schedule_item_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_invitations_schedule_item_id_fkey"
            columns: ["schedule_item_id"]
            isOneToOne: false
            referencedRelation: "schedule_items"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_item_assignees: {
        Row: {
          confirmed_at: string | null
          created_at: string
          id: string
          item_id: string
          resource_id: string
          role: string | null
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          item_id: string
          resource_id: string
          role?: string | null
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          item_id?: string
          resource_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_item_assignees_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "schedule_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_item_assignees_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "schedule_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_item_events: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          event_type: Database["public"]["Enums"]["schedule_event_type"]
          id: string
          item_id: string
          new_values: Json | null
          old_values: Json | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          event_type: Database["public"]["Enums"]["schedule_event_type"]
          id?: string
          item_id: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          event_type?: Database["public"]["Enums"]["schedule_event_type"]
          id?: string
          item_id?: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_item_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "schedule_items"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_item_field_values: {
        Row: {
          created_at: string
          field_id: string
          id: string
          item_id: string
          updated_at: string
          value_date: string | null
          value_json: Json | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          field_id: string
          id?: string
          item_id: string
          updated_at?: string
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          field_id?: string
          id?: string
          item_id?: string
          updated_at?: string
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_item_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "schedule_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_item_field_values_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "schedule_items"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_items: {
        Row: {
          all_day: boolean | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          board_id: string
          client_id: string | null
          color: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          deal_id: string | null
          description: string | null
          duration_minutes: number | null
          employee_id: string | null
          end_datetime: string
          id: string
          location: string | null
          location_lat: number | null
          location_lng: number | null
          metadata: Json | null
          notes: string | null
          organization_id: string | null
          origin: Database["public"]["Enums"]["schedule_item_origin"]
          priority: number | null
          rejection_reason: string | null
          start_datetime: string
          status: Database["public"]["Enums"]["schedule_item_status"]
          tags: string[] | null
          time_off_type: string | null
          title: string
          updated_at: string
          user_id: string | null
          vacation_id: string | null
        }
        Insert: {
          all_day?: boolean | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          board_id: string
          client_id?: string | null
          color?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          deal_id?: string | null
          description?: string | null
          duration_minutes?: number | null
          employee_id?: string | null
          end_datetime: string
          id?: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          metadata?: Json | null
          notes?: string | null
          organization_id?: string | null
          origin?: Database["public"]["Enums"]["schedule_item_origin"]
          priority?: number | null
          rejection_reason?: string | null
          start_datetime: string
          status?: Database["public"]["Enums"]["schedule_item_status"]
          tags?: string[] | null
          time_off_type?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
          vacation_id?: string | null
        }
        Update: {
          all_day?: boolean | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          board_id?: string
          client_id?: string | null
          color?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          deal_id?: string | null
          description?: string | null
          duration_minutes?: number | null
          employee_id?: string | null
          end_datetime?: string
          id?: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          metadata?: Json | null
          notes?: string | null
          organization_id?: string | null
          origin?: Database["public"]["Enums"]["schedule_item_origin"]
          priority?: number | null
          rejection_reason?: string | null
          start_datetime?: string
          status?: Database["public"]["Enums"]["schedule_item_status"]
          tags?: string[] | null
          time_off_type?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
          vacation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_items_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "schedule_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_created_by_anew_users_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_user_id_anew_users_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_vacation_id_fkey"
            columns: ["vacation_id"]
            isOneToOne: false
            referencedRelation: "employee_vacations"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_resources: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          employee_id: string | null
          id: string
          is_active: boolean | null
          max_daily_capacity: number | null
          metadata: Json | null
          name: string
          organization_id: string | null
          resource_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by: string
          employee_id?: string | null
          id?: string
          is_active?: boolean | null
          max_daily_capacity?: number | null
          metadata?: Json | null
          name: string
          organization_id?: string | null
          resource_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          employee_id?: string | null
          id?: string
          is_active?: boolean | null
          max_daily_capacity?: number | null
          metadata?: Json | null
          name?: string
          organization_id?: string | null
          resource_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_resources_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_resources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_resources_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_settings: {
        Row: {
          country_code: string
          created_at: string
          created_by: string
          holiday_color: string | null
          id: string
          organization_id: string | null
          show_holidays: boolean
          show_weekends: boolean
          timezone: string
          updated_at: string
          week_starts_on: number
          weekend_color: string | null
          working_days: number[] | null
          working_hours_end: string | null
          working_hours_start: string | null
        }
        Insert: {
          country_code?: string
          created_at?: string
          created_by: string
          holiday_color?: string | null
          id?: string
          organization_id?: string | null
          show_holidays?: boolean
          show_weekends?: boolean
          timezone?: string
          updated_at?: string
          week_starts_on?: number
          weekend_color?: string | null
          working_days?: number[] | null
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string
          created_by?: string
          holiday_color?: string | null
          id?: string
          organization_id?: string | null
          show_holidays?: boolean
          show_weekends?: boolean
          timezone?: string
          updated_at?: string
          week_starts_on?: number
          weekend_color?: string | null
          working_days?: number[] | null
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_settings_company_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_emails: {
        Row: {
          body_html: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          entity_id: string
          entity_type: string
          error_message: string | null
          id: string
          organization_id: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          subject: string | null
          template_id: string | null
          to_email: string
          user_id: string
        }
        Insert: {
          body_html?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          id?: string
          organization_id?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          to_email: string
          user_id: string
        }
        Update: {
          body_html?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          organization_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          to_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_emails_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_emails_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_identity_backfill_snapshots: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          new_value: string
          old_value: string
          organization_id: string | null
          snapshot_reason: string
          target_column: string
          target_id: string
          target_table: string
        }
        Insert: {
          batch_id?: string
          created_at?: string
          id?: string
          new_value: string
          old_value: string
          organization_id?: string | null
          snapshot_reason?: string
          target_column: string
          target_id: string
          target_table: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          new_value?: string
          old_value?: string
          organization_id?: string | null
          snapshot_reason?: string
          target_column?: string
          target_id?: string
          target_table?: string
        }
        Relationships: []
      }
      scoped_api_tokens: {
        Row: {
          business_unit_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          organization_id: string | null
          scopes: string[]
          tenant_id: string | null
          token_key: string
          token_name: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          business_unit_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          organization_id?: string | null
          scopes?: string[]
          tenant_id?: string | null
          token_key?: string
          token_name: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          business_unit_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          organization_id?: string | null
          scopes?: string[]
          tenant_id?: string | null
          token_key?: string
          token_name?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "scoped_api_tokens_business_area_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scoped_api_tokens_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scoped_api_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scoped_api_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scoped_api_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string | null
          created_by: string
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          parent_id: string | null
          path: string | null
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          parent_id?: string | null
          path?: string | null
          slug: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          parent_id?: string | null
          path?: string | null
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_business_area_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      service_category_organizations: {
        Row: {
          category_id: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_category_organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      service_companies: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          service_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          service_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_companies_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_fee_types: {
        Row: {
          application_mode: string
          apply_vat: boolean
          calculation_type: string
          created_at: string
          created_by: string
          description: string | null
          fixed_amount: number | null
          id: string
          is_active: boolean
          name: string
          organization_id: string | null
          percentage: number | null
          service_id: string | null
          updated_at: string
          vat_rate: number
        }
        Insert: {
          application_mode?: string
          apply_vat?: boolean
          calculation_type: string
          created_at?: string
          created_by: string
          description?: string | null
          fixed_amount?: number | null
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string | null
          percentage?: number | null
          service_id?: string | null
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          application_mode?: string
          apply_vat?: boolean
          calculation_type?: string
          created_at?: string
          created_by?: string
          description?: string | null
          fixed_amount?: number | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string | null
          percentage?: number | null
          service_id?: string | null
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_fee_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_fee_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_fee_types_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_offerings: {
        Row: {
          base_price: number | null
          business_unit_id: string | null
          company_id: string | null
          created_at: string | null
          created_by: string
          currency: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          location_type: string | null
          service_id: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          base_price?: number | null
          business_unit_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by: string
          currency?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          location_type?: string | null
          service_id: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          base_price?: number | null
          business_unit_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string
          currency?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          location_type?: string | null
          service_id?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_offerings_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_offerings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_offerings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_offerings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          service_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      service_price_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          created_at: string
          currency: string
          id: string
          new_price: number
          old_price: number | null
          price_type: string
          service_id: string
          valid_from: string | null
          valid_to: string | null
          vat_rate: number | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          new_price: number
          old_price?: number | null
          price_type: string
          service_id: string
          valid_from?: string | null
          valid_to?: string | null
          vat_rate?: number | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          new_price?: number
          old_price?: number | null
          price_type?: string
          service_id?: string
          valid_from?: string | null
          valid_to?: string | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_price_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      service_prices: {
        Row: {
          created_at: string | null
          created_by: string
          currency: string
          id: string
          price: number
          price_type: string
          service_id: string
          updated_at: string | null
          valid_from: string | null
          valid_to: string | null
          vat_rate: number | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          currency?: string
          id?: string
          price: number
          price_type: string
          service_id: string
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
          vat_rate?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          currency?: string
          id?: string
          price?: number
          price_type?: string
          service_id?: string
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_prices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_prices_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          asset_id: string | null
          assigned_to: string | null
          attachments: Json | null
          company_id: string | null
          created_at: string
          description: string
          id: string
          location_id: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          request_number: string
          request_type: string | null
          requested_date: string
          requester_department: string | null
          requester_email: string | null
          requester_id: string
          requester_phone: string | null
          required_by_date: string | null
          resolution_notes: string | null
          resolved_date: string | null
          status: Database["public"]["Enums"]["request_status"]
          title: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          asset_id?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          company_id?: string | null
          created_at?: string
          description: string
          id?: string
          location_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          request_number: string
          request_type?: string | null
          requested_date?: string
          requester_department?: string | null
          requester_email?: string | null
          requester_id: string
          requester_phone?: string | null
          required_by_date?: string | null
          resolution_notes?: string | null
          resolved_date?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          title: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          asset_id?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          company_id?: string | null
          created_at?: string
          description?: string
          id?: string
          location_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          request_number?: string
          request_type?: string | null
          requested_date?: string
          requester_department?: string | null
          requester_email?: string | null
          requester_id?: string
          requester_phone?: string | null
          required_by_date?: string | null
          resolution_notes?: string | null
          resolved_date?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          title?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_translations: {
        Row: {
          created_at: string
          id: string
          language_code: string
          long_desc: string | null
          name: string
          service_id: string
          short_desc: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          language_code: string
          long_desc?: string | null
          name: string
          service_id: string
          short_desc?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          language_code?: string
          long_desc?: string | null
          name?: string
          service_id?: string
          short_desc?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_translations_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          business_unit_id: string | null
          created_at: string | null
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_active: boolean | null
          is_deleted: boolean
          long_desc: string | null
          name: string
          organization_id: string | null
          service_category_id: string | null
          service_subcategory_id: string | null
          service_type: string
          short_desc: string | null
          sku: string
          slug: string
          supplier_id: string | null
          updated_at: string | null
        }
        Insert: {
          business_unit_id?: string | null
          created_at?: string | null
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean
          long_desc?: string | null
          name: string
          organization_id?: string | null
          service_category_id?: string | null
          service_subcategory_id?: string | null
          service_type?: string
          short_desc?: string | null
          sku: string
          slug: string
          supplier_id?: string | null
          updated_at?: string | null
        }
        Update: {
          business_unit_id?: string | null
          created_at?: string | null
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean
          long_desc?: string | null
          name?: string
          organization_id?: string | null
          service_category_id?: string | null
          service_subcategory_id?: string | null
          service_type?: string
          short_desc?: string | null
          sku?: string
          slug?: string
          supplier_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_service_subcategory_id_fkey"
            columns: ["service_subcategory_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      site_addresses: {
        Row: {
          city: string | null
          client_id: string
          country_id: string | null
          created_at: string | null
          created_by: string
          district: string | null
          floor_number: string | null
          id: string
          is_primary: boolean | null
          latitude: number | null
          longitude: number | null
          municipality: string | null
          name: string | null
          notes: string | null
          number: string | null
          postal_code: string | null
          street: string | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          client_id: string
          country_id?: string | null
          created_at?: string | null
          created_by: string
          district?: string | null
          floor_number?: string | null
          id?: string
          is_primary?: boolean | null
          latitude?: number | null
          longitude?: number | null
          municipality?: string | null
          name?: string | null
          notes?: string | null
          number?: string | null
          postal_code?: string | null
          street?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          client_id?: string
          country_id?: string | null
          created_at?: string | null
          created_by?: string
          district?: string | null
          floor_number?: string | null
          id?: string
          is_primary?: boolean | null
          latitude?: number | null
          longitude?: number | null
          municipality?: string | null
          name?: string | null
          notes?: string | null
          number?: string | null
          postal_code?: string | null
          street?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_addresses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_addresses_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_otp_codes: {
        Row: {
          attempts: number
          auth_user_id: string | null
          code: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          ip_address: string | null
          max_attempts: number
          phone_number: string
          purpose: string
          reference_id: string | null
          reference_type: string | null
          user_agent: string | null
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          auth_user_id?: string | null
          code: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          ip_address?: string | null
          max_attempts?: number
          phone_number: string
          purpose?: string
          reference_id?: string | null
          reference_type?: string | null
          user_agent?: string | null
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          auth_user_id?: string | null
          code?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          max_attempts?: number
          phone_number?: string
          purpose?: string
          reference_id?: string | null
          reference_type?: string | null
          user_agent?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      spare_parts: {
        Row: {
          category: string | null
          compatible_with: Json | null
          created_at: string
          created_by: string
          description: string | null
          has_expiry: boolean | null
          id: string
          is_active: boolean | null
          max_stock_level: number | null
          min_stock_level: number | null
          name: string
          notes: string | null
          organization_id: string | null
          part_number: string
          preferred_supplier_id: string | null
          reorder_point: number | null
          reorder_quantity: number | null
          shelf_life_days: number | null
          storage_location: string | null
          unit_cost: number | null
          unit_of_measure: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          compatible_with?: Json | null
          created_at?: string
          created_by: string
          description?: string | null
          has_expiry?: boolean | null
          id?: string
          is_active?: boolean | null
          max_stock_level?: number | null
          min_stock_level?: number | null
          name: string
          notes?: string | null
          organization_id?: string | null
          part_number: string
          preferred_supplier_id?: string | null
          reorder_point?: number | null
          reorder_quantity?: number | null
          shelf_life_days?: number | null
          storage_location?: string | null
          unit_cost?: number | null
          unit_of_measure?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          compatible_with?: Json | null
          created_at?: string
          created_by?: string
          description?: string | null
          has_expiry?: boolean | null
          id?: string
          is_active?: boolean | null
          max_stock_level?: number | null
          min_stock_level?: number | null
          name?: string
          notes?: string | null
          organization_id?: string | null
          part_number?: string
          preferred_supplier_id?: string | null
          reorder_point?: number | null
          reorder_quantity?: number | null
          shelf_life_days?: number | null
          storage_location?: string | null
          unit_cost?: number | null
          unit_of_measure?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spare_parts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spare_parts_preferred_supplier_id_fkey"
            columns: ["preferred_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_levels: {
        Row: {
          created_at: string
          id: string
          last_counted_at: string | null
          last_counted_by: string | null
          location_id: string | null
          quantity_available: number | null
          quantity_on_hand: number
          quantity_reserved: number | null
          spare_part_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_counted_at?: string | null
          last_counted_by?: string | null
          location_id?: string | null
          quantity_available?: number | null
          quantity_on_hand?: number
          quantity_reserved?: number | null
          spare_part_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_counted_at?: string | null
          last_counted_by?: string | null
          location_id?: string | null
          quantity_available?: number | null
          quantity_on_hand?: number
          quantity_reserved?: number | null
          spare_part_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_spare_part_id_fkey"
            columns: ["spare_part_id"]
            isOneToOne: false
            referencedRelation: "spare_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          batch_number: string | null
          created_at: string
          created_by: string
          expiry_date: string | null
          id: string
          location_id: string | null
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes: string | null
          quantity: number
          reference_number: string | null
          spare_part_id: string
          total_cost: number | null
          unit_cost: number | null
          work_order_id: string | null
        }
        Insert: {
          batch_number?: string | null
          created_at?: string
          created_by: string
          expiry_date?: string | null
          id?: string
          location_id?: string | null
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          quantity: number
          reference_number?: string | null
          spare_part_id: string
          total_cost?: number | null
          unit_cost?: number | null
          work_order_id?: string | null
        }
        Update: {
          batch_number?: string | null
          created_at?: string
          created_by?: string
          expiry_date?: string | null
          id?: string
          location_id?: string | null
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          quantity?: number
          reference_number?: string | null
          spare_part_id?: string
          total_cost?: number | null
          unit_cost?: number | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_spare_part_id_fkey"
            columns: ["spare_part_id"]
            isOneToOne: false
            referencedRelation: "spare_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      stocks: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_counted: string | null
          location: string | null
          maximum_quantity: number
          minimum_quantity: number
          organization_id: string
          product_id: string
          quantity: number
          reorder_point: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          last_counted?: string | null
          location?: string | null
          maximum_quantity?: number
          minimum_quantity?: number
          organization_id: string
          product_id: string
          quantity?: number
          reorder_point?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_counted?: string | null
          location?: string | null
          maximum_quantity?: number
          minimum_quantity?: number
          organization_id?: string
          product_id?: string
          quantity?: number
          reorder_point?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stocks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocks_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      streets: {
        Row: {
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          municipality_id: string | null
          name: string
          name_ascii: string | null
          parish_id: string | null
          postal_code_id: string | null
          street_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          municipality_id?: string | null
          name: string
          name_ascii?: string | null
          parish_id?: string | null
          postal_code_id?: string | null
          street_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          municipality_id?: string | null
          name?: string
          name_ascii?: string | null
          parish_id?: string | null
          postal_code_id?: string | null
          street_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "streets_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "administrative_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streets_parish_id_fkey"
            columns: ["parish_id"]
            isOneToOne: false
            referencedRelation: "administrative_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streets_postal_code_id_fkey"
            columns: ["postal_code_id"]
            isOneToOne: false
            referencedRelation: "postal_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          business_unit_id: string | null
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          created_by: string
          department_id: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          organization_id: string | null
          phone: string | null
          phone_country_code: string | null
          postal_code: string | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          primary_contact_phone: string | null
          primary_contact_phone_country_code: string | null
          rating: number | null
          supplier_type: string[] | null
          tax_id: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          business_unit_id?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by: string
          department_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          phone_country_code?: string | null
          postal_code?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          primary_contact_phone_country_code?: string | null
          rating?: number | null
          supplier_type?: string[] | null
          tax_id?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          business_unit_id?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          department_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          phone_country_code?: string | null
          postal_code?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          primary_contact_phone_country_code?: string | null
          rating?: number | null
          supplier_type?: string[] | null
          tax_id?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_hub_comments: {
        Row: {
          author_id: string | null
          author_name: string
          content: string
          created_at: string
          entry_id: string
          id: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          content: string
          created_at?: string
          entry_id: string
          id?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          content?: string
          created_at?: string
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_hub_comments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "team_hub_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      team_hub_entries: {
        Row: {
          author_id: string | null
          author_name: string
          created_at: string
          description: string
          id: string
          priority: string
          status: string
          tags: string[] | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          created_at?: string
          description: string
          id?: string
          priority?: string
          status?: string
          tags?: string[] | null
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          created_at?: string
          description?: string
          id?: string
          priority?: string
          status?: string
          tags?: string[] | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_hub_entries_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_info: {
        Row: {
          certifications: string[] | null
          created_at: string
          hourly_rate: number | null
          id: string
          is_active: boolean | null
          notes: string | null
          skill_level: string | null
          specializations: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          certifications?: string[] | null
          created_at?: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          skill_level?: string | null
          specializations?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          certifications?: string[] | null
          created_at?: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          skill_level?: string | null
          specializations?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          config: Json | null
          contact_unique_key: string | null
          created_at: string
          created_by: string | null
          estado: string
          id: string
          nif: string | null
          nome: string
          org_chart_colors: Json | null
          updated_at: string
        }
        Insert: {
          config?: Json | null
          contact_unique_key?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          id?: string
          nif?: string | null
          nome: string
          org_chart_colors?: Json | null
          updated_at?: string
        }
        Update: {
          config?: Json | null
          contact_unique_key?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          id?: string
          nif?: string | null
          nome?: string
          org_chart_colors?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      uom: {
        Row: {
          base_uom_id: string | null
          code: string
          conversion_factor: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          organization_id: string | null
          root_organization_id: string | null
        }
        Insert: {
          base_uom_id?: string | null
          code: string
          conversion_factor?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          root_organization_id?: string | null
        }
        Update: {
          base_uom_id?: string | null
          code?: string
          conversion_factor?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          root_organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uom_base_uom_id_fkey"
            columns: ["base_uom_id"]
            isOneToOne: false
            referencedRelation: "uom"
            referencedColumns: ["id"]
          },
        ]
      }
      user_companies: {
        Row: {
          business_unit_id: string | null
          company_id: string
          created_at: string
          id: string
          tipo: string | null
          user_id: string
        }
        Insert: {
          business_unit_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          tipo?: string | null
          user_id: string
        }
        Update: {
          business_unit_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          tipo?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_companies_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_creation_templates: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          custom_attributes: Json | null
          default_relationship_type: string | null
          default_role_id: string | null
          description: string | null
          field_configs: Json | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_attributes?: Json | null
          default_relationship_type?: string | null
          default_role_id?: string | null
          description?: string | null
          field_configs?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_attributes?: Json | null
          default_relationship_type?: string | null
          default_role_id?: string | null
          description?: string | null
          field_configs?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_creation_templates_default_role_id_fkey"
            columns: ["default_role_id"]
            isOneToOne: false
            referencedRelation: "anew_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_menu_preferences: {
        Row: {
          created_at: string | null
          id: string
          menu_order: Json
          submenu_orders: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          menu_order?: Json
          submenu_orders?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          menu_order?: Json
          submenu_orders?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          is_online: boolean
          last_seen_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          is_online?: boolean
          last_seen_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          is_online?: boolean
          last_seen_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          department_id: string | null
          empresa_id: string | null
          id: string
          role_id: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          empresa_id?: string | null
          id?: string
          role_id: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          empresa_id?: string | null
          id?: string
          role_id?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_business_area_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_smtp_settings: {
        Row: {
          created_at: string
          daily_limit: number | null
          encryption: string | null
          from_email: string
          from_name: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string | null
          organization_id: string | null
          reply_to: string | null
          smtp_host: string
          smtp_password: string
          smtp_port: number
          smtp_secure: boolean | null
          smtp_username: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_limit?: number | null
          encryption?: string | null
          from_email: string
          from_name: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string | null
          organization_id?: string | null
          reply_to?: string | null
          smtp_host: string
          smtp_password: string
          smtp_port?: number
          smtp_secure?: boolean | null
          smtp_username: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_limit?: number | null
          encryption?: string | null
          from_email?: string
          from_name?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string | null
          organization_id?: string | null
          reply_to?: string | null
          smtp_host?: string
          smtp_password?: string
          smtp_port?: number
          smtp_secure?: boolean | null
          smtp_username?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_smtp_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_template_attributes: {
        Row: {
          attribute_key: string
          attribute_label: string
          attribute_type: string | null
          created_at: string | null
          id: string
          is_required: boolean | null
          options: Json | null
          sort_order: number | null
          template_id: string
        }
        Insert: {
          attribute_key: string
          attribute_label: string
          attribute_type?: string | null
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          options?: Json | null
          sort_order?: number | null
          template_id: string
        }
        Update: {
          attribute_key?: string
          attribute_label?: string
          attribute_type?: string | null
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          options?: Json | null
          sort_order?: number | null
          template_id?: string
        }
        Relationships: []
      }
      user_template_fields: {
        Row: {
          created_at: string | null
          default_value: string | null
          field_key: string
          field_label: string
          field_type: string | null
          id: string
          is_required: boolean | null
          is_visible: boolean | null
          sort_order: number | null
          template_id: string
        }
        Insert: {
          created_at?: string | null
          default_value?: string | null
          field_key: string
          field_label: string
          field_type?: string | null
          id?: string
          is_required?: boolean | null
          is_visible?: boolean | null
          sort_order?: number | null
          template_id: string
        }
        Update: {
          created_at?: string | null
          default_value?: string | null
          field_key?: string
          field_label?: string
          field_type?: string | null
          id?: string
          is_required?: boolean | null
          is_visible?: boolean | null
          sort_order?: number | null
          template_id?: string
        }
        Relationships: []
      }
      user_template_organizations: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          template_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          template_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_template_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_template_organizations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "user_creation_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tenants: {
        Row: {
          created_at: string
          id: string
          is_tenant_admin: boolean | null
          tenant_id: string
          tipo: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_tenant_admin?: boolean | null
          tenant_id: string
          tipo?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_tenant_admin?: boolean | null
          tenant_id?: string
          tipo?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_assignments: {
        Row: {
          created_at: string
          created_by: string
          driver_id: string
          end_date: string | null
          id: string
          is_current: boolean | null
          notes: string | null
          start_date: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          driver_id: string
          end_date?: string | null
          id?: string
          is_current?: boolean | null
          notes?: string | null
          start_date?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          driver_id?: string
          end_date?: string | null
          id?: string
          is_current?: boolean | null
          notes?: string | null
          start_date?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_documents: {
        Row: {
          created_at: string
          created_by: string
          document_name: string
          document_type: string
          document_url: string | null
          expiry_date: string | null
          id: string
          issue_date: string | null
          notes: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          document_name: string
          document_type: string
          document_url?: string | null
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          notes?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document_name?: string
          document_type?: string
          document_url?: string | null
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          notes?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          brand: string
          business_unit_id: string | null
          company_id: string | null
          created_at: string
          created_by: string
          current_driver_id: string | null
          current_odometer: number | null
          fuel_tank_capacity: number | null
          id: string
          inspection_expiry: string | null
          insurance_expiry: string | null
          insurance_policy: string | null
          lease_contract_number: string | null
          license_plate: string
          model: string
          notes: string | null
          ownership_type: string | null
          passenger_capacity: number | null
          status: Database["public"]["Enums"]["vehicle_status"]
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          vin: string | null
          volume_capacity: number | null
          weight_capacity: number | null
          year: number | null
        }
        Insert: {
          brand: string
          business_unit_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by: string
          current_driver_id?: string | null
          current_odometer?: number | null
          fuel_tank_capacity?: number | null
          id?: string
          inspection_expiry?: string | null
          insurance_expiry?: string | null
          insurance_policy?: string | null
          lease_contract_number?: string | null
          license_plate: string
          model: string
          notes?: string | null
          ownership_type?: string | null
          passenger_capacity?: number | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          vin?: string | null
          volume_capacity?: number | null
          weight_capacity?: number | null
          year?: number | null
        }
        Update: {
          brand?: string
          business_unit_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          current_driver_id?: string | null
          current_odometer?: number | null
          fuel_tank_capacity?: number | null
          id?: string
          inspection_expiry?: string | null
          insurance_expiry?: string | null
          insurance_policy?: string | null
          lease_contract_number?: string | null
          license_plate?: string
          model?: string
          notes?: string | null
          ownership_type?: string | null
          passenger_capacity?: number | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          vin?: string | null
          volume_capacity?: number | null
          weight_capacity?: number | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          business_unit_id: string | null
          capacity: number | null
          city: string | null
          code: string
          country: string | null
          created_at: string
          created_by: string
          email: string | null
          id: string
          is_active: boolean
          manager_name: string | null
          name: string
          organization_id: string
          phone: string | null
          phone_country_code: string | null
          postal_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_unit_id?: string | null
          capacity?: number | null
          city?: string | null
          code: string
          country?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          is_active?: boolean
          manager_name?: string | null
          name: string
          organization_id: string
          phone?: string | null
          phone_country_code?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_unit_id?: string | null
          capacity?: number | null
          city?: string | null
          code?: string
          country?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          is_active?: boolean
          manager_name?: string | null
          name?: string
          organization_id?: string
          phone?: string | null
          phone_country_code?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_parts: {
        Row: {
          created_at: string
          id: string
          quantity_used: number
          spare_part_id: string
          total_cost: number | null
          unit_cost: number | null
          work_order_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          quantity_used: number
          spare_part_id: string
          total_cost?: number | null
          unit_cost?: number | null
          work_order_id: string
        }
        Update: {
          created_at?: string
          id?: string
          quantity_used?: number
          spare_part_id?: string
          total_cost?: number | null
          unit_cost?: number | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_parts_spare_part_id_fkey"
            columns: ["spare_part_id"]
            isOneToOne: false
            referencedRelation: "spare_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          actual_downtime_hours: number | null
          actual_end: string | null
          actual_start: string | null
          asset_id: string | null
          assigned_team: string | null
          assigned_to: string | null
          attachments: Json | null
          causes_downtime: boolean | null
          checklist: Json | null
          company_id: string | null
          created_at: string
          created_by: string
          description: string | null
          estimated_cost: number | null
          estimated_downtime_hours: number | null
          external_cost: number | null
          id: string
          labor_cost: number | null
          location_id: string | null
          maintenance_plan_id: string | null
          parts_cost: number | null
          priority: Database["public"]["Enums"]["priority_level"]
          resolution_notes: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          status: Database["public"]["Enums"]["work_order_status"]
          supplier_id: string | null
          title: string
          total_cost: number | null
          updated_at: string
          work_order_number: string
          work_order_type: Database["public"]["Enums"]["work_order_type"]
        }
        Insert: {
          actual_downtime_hours?: number | null
          actual_end?: string | null
          actual_start?: string | null
          asset_id?: string | null
          assigned_team?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          causes_downtime?: boolean | null
          checklist?: Json | null
          company_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          estimated_cost?: number | null
          estimated_downtime_hours?: number | null
          external_cost?: number | null
          id?: string
          labor_cost?: number | null
          location_id?: string | null
          maintenance_plan_id?: string | null
          parts_cost?: number | null
          priority?: Database["public"]["Enums"]["priority_level"]
          resolution_notes?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          supplier_id?: string | null
          title: string
          total_cost?: number | null
          updated_at?: string
          work_order_number: string
          work_order_type: Database["public"]["Enums"]["work_order_type"]
        }
        Update: {
          actual_downtime_hours?: number | null
          actual_end?: string | null
          actual_start?: string | null
          asset_id?: string | null
          assigned_team?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          causes_downtime?: boolean | null
          checklist?: Json | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          estimated_cost?: number | null
          estimated_downtime_hours?: number | null
          external_cost?: number | null
          id?: string
          labor_cost?: number | null
          location_id?: string | null
          maintenance_plan_id?: string | null
          parts_cost?: number | null
          priority?: Database["public"]["Enums"]["priority_level"]
          resolution_notes?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          supplier_id?: string | null
          title?: string
          total_cost?: number | null
          updated_at?: string
          work_order_number?: string
          work_order_type?: Database["public"]["Enums"]["work_order_type"]
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_maintenance_plan_fkey"
            columns: ["maintenance_plan_id"]
            isOneToOne: false
            referencedRelation: "maintenance_plans_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_automation_rules: {
        Row: {
          action_config: Json | null
          action_stage_id: string | null
          action_type: string
          created_at: string
          created_by: string | null
          description: string | null
          execution_order: number | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          relationship_field: string | null
          source_entity: string
          stop_on_error: boolean | null
          target_entity: string
          trigger_conditions: Json | null
          trigger_stage_id: string | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_config?: Json | null
          action_stage_id?: string | null
          action_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          execution_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          relationship_field?: string | null
          source_entity: string
          stop_on_error?: boolean | null
          target_entity: string
          trigger_conditions?: Json | null
          trigger_stage_id?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          action_config?: Json | null
          action_stage_id?: string | null
          action_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          execution_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          relationship_field?: string | null
          source_entity?: string
          stop_on_error?: boolean | null
          target_entity?: string
          trigger_conditions?: Json | null
          trigger_stage_id?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_automation_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_execution_log: {
        Row: {
          action_type: string
          error_message: string | null
          executed_at: string
          executed_by: string | null
          execution_data: Json | null
          id: string
          rule_id: string | null
          source_entity: string
          source_record_id: string
          status: string
          target_entity: string
          target_record_id: string | null
        }
        Insert: {
          action_type: string
          error_message?: string | null
          executed_at?: string
          executed_by?: string | null
          execution_data?: Json | null
          id?: string
          rule_id?: string | null
          source_entity: string
          source_record_id: string
          status?: string
          target_entity: string
          target_record_id?: string | null
        }
        Update: {
          action_type?: string
          error_message?: string | null
          executed_at?: string
          executed_by?: string | null
          execution_data?: Json | null
          id?: string
          rule_id?: string | null
          source_entity?: string
          source_record_id?: string
          status?: string
          target_entity?: string
          target_record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_execution_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "workflow_automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_channel_lead_facts: {
        Row: {
          anew_lead_id: string | null
          campaign_id: string | null
          channel_id: string | null
          converted_to_client_id: string | null
          is_converted: boolean | null
          lead_key: string | null
          lead_status: string | null
          medium: string | null
          source: string | null
          touch_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anew_leads_converted_to_client_id_fkey"
            columns: ["converted_to_client_id"]
            isOneToOne: false
            referencedRelation: "anew_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_anew_lead_id_fkey"
            columns: ["anew_lead_id"]
            isOneToOne: false
            referencedRelation: "anew_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _configurator_can_access_product: {
        Args: { p_organization_id: string; p_product_id: string }
        Returns: boolean
      }
      archive_activity: { Args: { _activity_id: string }; Returns: boolean }
      archive_business_unit: {
        Args: { _business_unit_id: string }
        Returns: boolean
      }
      archive_campaign: { Args: { _campaign_id: string }; Returns: boolean }
      archive_company: { Args: { _company_id: string }; Returns: boolean }
      archive_contact: { Args: { _contact_id: string }; Returns: boolean }
      archive_deal: { Args: { _deal_id: string }; Returns: boolean }
      archive_proposal: { Args: { _proposal_id: string }; Returns: boolean }
      archive_quote: { Args: { _quote_id: string }; Returns: boolean }
      assign_address_to_org: {
        Args: {
          p_city?: string
          p_country?: string
          p_created_by?: string
          p_district?: string
          p_existing_address_id?: string
          p_existing_link_id?: string
          p_extra?: string
          p_floor?: string
          p_is_fiscal?: boolean
          p_number: string
          p_org_id: string
          p_postal_code?: string
          p_street: string
          p_unit?: string
        }
        Returns: string
      }
      bootstrap_org_creator: {
        Args: { p_organization_id: string; p_organization_name: string }
        Returns: Json
      }
      calculate_bundle_original_price: {
        Args: { p_bundle_id: string }
        Returns: number
      }
      calculate_distance_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      calculate_product_margin: {
        Args: { p_product_id: string }
        Returns: {
          margin_amount: number
          margin_percentage: number
          purchase_price: number
          retail_price: number
        }[]
      }
      can_assign_user_type: {
        Args: { _admin_user_id: string; _target_tipo: string }
        Returns: boolean
      }
      can_see_entity: {
        Args: { p_auth_uid: string; p_entity_id: string }
        Returns: boolean
      }
      check_schedule_conflict: {
        Args: {
          p_end: string
          p_exclude_item_id?: string
          p_resource_id: string
          p_start: string
        }
        Returns: boolean
      }
      cleanup_deleted_records: { Args: never; Returns: number }
      cleanup_duplicate_notifications: { Args: never; Returns: number }
      cleanup_orphan_notifications: { Args: never; Returns: number }
      clone_role_to_companies: {
        Args: { p_company_ids: string[]; p_template_id: string }
        Returns: {
          allowed_user_types: string[] | null
          created_at: string
          created_by: string | null
          descricao: string | null
          empresa_id: string | null
          estado: string
          id: string
          is_template: boolean | null
          nome: string
          template_id: string | null
          template_key: string | null
          tenant_id: string | null
          tipo: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "roles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_company_base_roles: {
        Args: { _company_id: string; _created_by: string }
        Returns: undefined
      }
      create_entity_with_contacts_and_roles: {
        Args: {
          p_addresses?: Json
          p_created_by?: string
          p_emails?: Json
          p_entity: Json
          p_organization_id: string
          p_phones?: Json
          p_roles?: Json
        }
        Returns: string
      }
      create_lead_entity_for_org: {
        Args: {
          p_display_name: string
          p_first_name?: string
          p_last_name?: string
          p_organization_id: string
        }
        Returns: string
      }
      create_tenant_base_roles: {
        Args: { _created_by: string; _tenant_id: string }
        Returns: undefined
      }
      create_tenant_template: {
        Args: {
          p_allowed_user_types?: string[]
          p_descricao?: string
          p_nome: string
          p_permission_ids?: string[]
          p_tenant_id: string
        }
        Returns: string
      }
      current_business_user_id: { Args: never; Returns: string }
      delete_organization_subtree: {
        Args: { p_root_org_id: string }
        Returns: string[]
      }
      duplicate_proposal: {
        Args: { new_title?: string; source_proposal_id: string }
        Returns: string
      }
      duplicate_quote: { Args: { source_quote_id: string }; Returns: string }
      ensure_entity_org_link: {
        Args: {
          p_entity_id: string
          p_is_primary?: boolean
          p_organization_id: string
        }
        Returns: undefined
      }
      find_entity_matches: {
        Args: {
          p_country_code?: string
          p_email?: string
          p_nif?: string
          p_org_id: string
          p_phone?: string
        }
        Returns: {
          display_name: string
          entity_id: string
          match_field: string
          owner_org_accessible: boolean
          primary_org_id: string
          primary_org_name: string
          scope: string
        }[]
      }
      find_nearest_resources: {
        Args: {
          p_board_id: string
          p_duration_minutes?: number
          p_limit?: number
          p_target_date: string
          p_target_postal_code: string
        }
        Returns: {
          available_slots: Json
          distance_km: number
          priority: number
          resource_id: string
          resource_name: string
          resource_type: string
        }[]
      }
      fn_channel_revenue_facts: {
        Args: { p_channel_id?: string; p_window_days?: number }
        Returns: {
          attributed_revenue: number
          channel_id: string
          contract_date: string
          contract_id: string
        }[]
      }
      generate_api_key: { Args: never; Returns: string }
      generate_client_contract_number: { Args: never; Returns: string }
      generate_po_number: { Args: never; Returns: string }
      generate_quote_number: { Args: never; Returns: string }
      get_admin_business_area_ids: {
        Args: { _user_id: string }
        Returns: {
          business_area_id: string
        }[]
      }
      get_admin_business_unit_ids: {
        Args: { _user_id: string }
        Returns: {
          business_unit_id: string
        }[]
      }
      get_admin_company_ids: {
        Args: { _user_id: string }
        Returns: {
          company_id: string
        }[]
      }
      get_assignable_user_types: {
        Args: { _admin_user_id: string }
        Returns: string[]
      }
      get_attribute_price_with_context: {
        Args: {
          p_attribute_id: string
          p_context_code?: string
          p_organization_id: string
          p_product_id?: string
          p_value_option: string
        }
        Returns: number
      }
      get_bundle_available_stock: {
        Args: { p_bundle_id: string }
        Returns: number
      }
      get_category_attribute_options: {
        Args: { p_attribute_id: string; p_category_id: string }
        Returns: {
          display_name: string
          hex_color: string
          source: string
          value_text: string
        }[]
      }
      get_channel_dashboard: {
        Args: {
          p_bucket?: string
          p_channel_id: string
          p_date_from?: string
          p_date_to?: string
          p_window_days?: number
        }
        Returns: Json
      }
      get_commercial_info: { Args: { p_user_id: string }; Returns: Json }
      get_company_admin_company_id: {
        Args: { _user_id: string }
        Returns: string
      }
      get_company_tenant: {
        Args: { _company_id: string }
        Returns: {
          id: string
          nome: string
        }[]
      }
      get_contact_alert_counts: { Args: { p_org_ids: string[] }; Returns: Json }
      get_effective_price: {
        Args: {
          p_price_type?: Database["public"]["Enums"]["price_type"]
          p_product_id: string
          p_variant_id?: string
        }
        Returns: {
          currency: Database["public"]["Enums"]["currency_code"]
          is_promotional: boolean
          price: number
        }[]
      }
      get_effective_stock: {
        Args: {
          p_location_id?: string
          p_product_id: string
          p_variant_id?: string
        }
        Returns: {
          available_quantity: number
          reserved_quantity: number
        }[]
      }
      get_flow_user_org_ids: { Args: { _auth_uid: string }; Returns: string[] }
      get_invite_link_by_code: { Args: { p_code: string }; Returns: Json }
      get_lead_dashboard_stats: {
        Args: { p_date_from?: string; p_date_to?: string; p_org_id: string }
        Returns: Json
      }
      get_lead_status_counts: {
        Args: {
          p_anew_user_id?: string
          p_assigned_to?: string
          p_assigned_unassigned?: boolean
          p_auth_user_id?: string
          p_campaign_id?: string
          p_contact_result?: string
          p_contact_result_none?: boolean
          p_date_from?: string
          p_date_to?: string
          p_is_root?: boolean
          p_org_id: string
          p_scope?: string
          p_search?: string
        }
        Returns: {
          count: number
          status: string
        }[]
      }
      get_month_availability: {
        Args: {
          p_board_id: string
          p_duration_minutes?: number
          p_end_date: string
          p_postal_code?: string
          p_start_date: string
        }
        Returns: {
          available_date: string
          has_slots: boolean
        }[]
      }
      get_org_group_ids: { Args: { p_org_id: string }; Returns: string[] }
      get_resource_available_slots: {
        Args: {
          p_date: string
          p_duration_minutes?: number
          p_organization_id?: string
          p_resource_id: string
        }
        Returns: {
          slot_end: string
          slot_start: string
        }[]
      }
      get_service_category_org_id: { Args: { cat_id: string }; Returns: string }
      get_tenant_admin_company_ids: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      get_user_admin_tenant_ids: {
        Args: { _user_id: string }
        Returns: {
          tenant_id: string
        }[]
      }
      get_user_company_id: { Args: { user_id: string }; Returns: string }
      get_user_company_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_context: { Args: { _auth_user_id?: string }; Returns: Json }
      get_user_superior: { Args: { target_user_id: string }; Returns: string }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      get_user_tenant_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_tipo: { Args: { _user_id: string }; Returns: string }
      get_user_visible_org_ids: {
        Args: { _auth_uid: string }
        Returns: string[]
      }
      has_anew_permission: {
        Args: { _auth_uid: string; _permission_code: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _permission_code: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_name: {
        Args: { _role_name: string; _user_id: string }
        Returns: boolean
      }
      has_scheduling_permission: {
        Args: { permission_code: string; user_id: string }
        Returns: boolean
      }
      increment_channel_metric_leads: {
        Args: { p_channel_id: string; p_delta?: number; p_metric_date: string }
        Returns: undefined
      }
      is_admin_user: { Args: { _user_id: string }; Returns: boolean }
      is_business_area_admin_user: {
        Args: { _user_id: string }
        Returns: boolean
      }
      is_business_unit_admin_user: {
        Args: { _user_id: string }
        Returns: boolean
      }
      is_company_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_company_admin_of: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_company_admin_user: { Args: { _user_id: string }; Returns: boolean }
      is_department_admin_user: { Args: { _user_id: string }; Returns: boolean }
      is_entity_in_user_scope: {
        Args: { _auth_uid: string; _entity_id: string }
        Returns: boolean
      }
      is_system_admin: { Args: { _user_id: string }; Returns: boolean }
      is_system_admin_check: { Args: { _user_id: string }; Returns: boolean }
      is_system_admin_user: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_admin: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_tenant_admin_for_company: {
        Args: { _company_tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_tenant_admin_of: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_tenant_admin_of_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_tenant_admin_user: { Args: { _user_id: string }; Returns: boolean }
      link_entity_to_org: {
        Args: { p_entity_id: string; p_target_org_id: string }
        Returns: undefined
      }
      move_organization_node: {
        Args: {
          p_child_org_id: string
          p_created_by?: string
          p_new_parent_org_id: string
        }
        Returns: undefined
      }
      portal_user_can_see_doc: {
        Args: { _entity_id: string; _entity_type: string }
        Returns: boolean
      }
      portal_user_can_see_document: {
        Args: {
          _doc_id: string
          _doc_type: Database["public"]["Enums"]["portal_document_type"]
        }
        Returns: boolean
      }
      purge_business_entity: {
        Args: { p_id: string; p_kind: string }
        Returns: boolean
      }
      purge_entity_facet: {
        Args: { p_id: string; p_kind: string }
        Returns: boolean
      }
      request_account_deletion: {
        Args: { reason_text?: string }
        Returns: string
      }
      resolve_business_user_id: {
        Args: { p_auth_uid: string }
        Returns: string
      }
      resolve_product_attribute_options: {
        Args: { p_attribute_id: string; p_product_id: string }
        Returns: {
          display_name: string
          hex_color: string
          is_available: boolean
          price_addon: number
          source: string
          value_text: string
        }[]
      }
      resolve_product_configuration:
        | {
            Args: {
              p_organization_id: string
              p_price_context?: string
              p_product_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_organization_id: string
              p_price_context?: string
              p_product_id: string
              p_template_id?: string
            }
            Returns: Json
          }
      resolve_proposal_commercial: {
        Args: {
          p_created_by: string
          p_deal_id: string
          p_entity_id: string
          p_org_id: string
        }
        Returns: string
      }
      restore_business_entity: {
        Args: { p_id: string; p_kind: string }
        Returns: boolean
      }
      restore_entity_facet: {
        Args: { p_id: string; p_kind: string }
        Returns: boolean
      }
      revert_contact_to_client: {
        Args: { p_client_id: string }
        Returns: boolean
      }
      revert_contact_to_client_conversion: {
        Args: { p_client_id: string }
        Returns: boolean
      }
      revert_lead_to_contact: {
        Args: { p_contact_id: string }
        Returns: boolean
      }
      revert_lead_to_contact_conversion: {
        Args: { p_contact_id: string }
        Returns: boolean
      }
      search_proposal_entities:
        | {
            Args: { p_limit?: number; p_search: string }
            Returns: {
              email: string
              entity_id: string
              id: string
              name: string
              phone: string
              status: string
              type: string
            }[]
          }
        | {
            Args: {
              p_limit?: number
              p_organization_id?: string
              p_search: string
            }
            Returns: {
              email: string
              entity_id: string
              id: string
              name: string
              phone: string
              status: string
              type: string
            }[]
          }
      search_visible_entity_ids: {
        Args: { p_limit?: number; p_search: string }
        Returns: {
          entity_id: string
        }[]
      }
      set_audit_context: {
        Args: { p_user_id: string; p_source?: string }
        Returns: void
      }
      clear_audit_context: { Args: Record<PropertyKey, never>; Returns: void }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_business_entity: {
        Args: { p_id: string; p_kind: string }
        Returns: boolean
      }
      soft_delete_entity_facet: {
        Args: { p_id: string; p_kind: string }
        Returns: boolean
      }
      sync_client_contact_roles: {
        Args: {
          _client_id?: string
          _entity_id: string
          _organization_id: string
        }
        Returns: undefined
      }
      unlink_organization_node: {
        Args: { p_child_org_id: string; p_created_by?: string }
        Returns: undefined
      }
      upsert_entity_identity: {
        Args: {
          p_addresses?: Json
          p_created_by?: string
          p_emails?: Json
          p_entity_id: string
          p_phones?: Json
        }
        Returns: Json
      }
      user_belongs_to_company_admin_company: {
        Args: { _admin_user_id: string; _target_user_id: string }
        Returns: boolean
      }
      user_can_access_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_active_membership: {
        Args: { _auth_uid: string }
        Returns: boolean
      }
      user_has_company_access: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_tenant_scope: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      user_in_business_area_admin_scope: {
        Args: { _admin_user_id: string; _target_user_id: string }
        Returns: boolean
      }
      user_in_business_unit_admin_scope: {
        Args: { _admin_user_id: string; _target_user_id: string }
        Returns: boolean
      }
      user_in_company_admin_scope: {
        Args: { _admin_user_id: string; _target_user_id: string }
        Returns: boolean
      }
      user_in_company_scope: {
        Args: { _admin_id: string; _target_user_id: string }
        Returns: boolean
      }
      user_in_tenant_admin_scope: {
        Args: { _admin_user_id: string; _target_user_id: string }
        Returns: boolean
      }
      user_in_tenant_scope: {
        Args: { _admin_id: string; _target_user_id: string }
        Returns: boolean
      }
      validate_product_configuration:
        | {
            Args: {
              p_mode?: string
              p_organization_id: string
              p_price_context?: string
              p_product_id: string
              p_selection?: Json
            }
            Returns: Json
          }
        | {
            Args: {
              p_mode?: string
              p_organization_id: string
              p_price_context?: string
              p_product_id: string
              p_selection?: Json
              p_template_id?: string
            }
            Returns: Json
          }
      validate_scoped_api_token: {
        Args: { _token_key: string }
        Returns: {
          business_area_id: string
          organization_id: string
          scopes: string[]
          token_id: string
        }[]
      }
    }
    Enums: {
      anew_scope_level: "NONE" | "OWNED" | "TEAM" | "ORG"
      app_role: "admin" | "manager" | "sales_rep" | "viewer"
      asset_status:
        | "active"
        | "maintenance"
        | "inactive"
        | "decommissioned"
        | "planned_disposal"
      attribute_type:
        | "text"
        | "number"
        | "boolean"
        | "select"
        | "multiselect"
        | "date"
      bundle_pricing_type:
        | "fixed_price"
        | "percentage_discount"
        | "fixed_discount"
        | "custom"
      call_center_status:
        | "not_attempted"
        | "attempted_no_answer"
        | "attempted_busy"
        | "attempted_answered"
        | "callback_scheduled"
        | "not_interested"
        | "wrong_number"
        | "successful_contact"
        | "do_not_call"
      client_type: "person" | "company"
      component_pricing_mode:
        | "original"
        | "custom_price"
        | "custom_discount_percent"
        | "custom_discount_fixed"
      currency_code: "EUR" | "USD" | "GBP" | "BRL" | "JPY" | "CNY"
      incident_type:
        | "accident"
        | "breakdown"
        | "fine"
        | "damage"
        | "complaint"
        | "other"
      maintenance_type: "preventive" | "corrective" | "inspection"
      portal_document_type: "proposal" | "quote" | "contract"
      price_type:
        | "purchase"
        | "retail"
        | "wholesale"
        | "distributor"
        | "promotional"
      priority_level: "low" | "medium" | "high" | "critical" | "emergency"
      product_status: "active" | "discontinued" | "draft"
      request_status:
        | "submitted"
        | "pending_approval"
        | "approved"
        | "assigned"
        | "in_progress"
        | "resolved"
        | "closed"
        | "rejected"
      schedule_event_type:
        | "created"
        | "updated"
        | "rescheduled"
        | "assigned"
        | "unassigned"
        | "status_changed"
        | "confirmed"
        | "cancelled"
        | "completed"
        | "comment"
      schedule_field_type:
        | "text"
        | "number"
        | "date"
        | "datetime"
        | "select"
        | "multiselect"
        | "checkbox"
        | "user"
        | "link"
        | "email"
        | "phone"
        | "currency"
        | "rating"
      schedule_item_origin: "manual" | "auto" | "import" | "api"
      schedule_item_status:
        | "draft"
        | "scheduled"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "rescheduled"
      stock_movement_type:
        | "purchase"
        | "usage"
        | "return"
        | "adjustment"
        | "transfer"
        | "disposal"
      vehicle_status: "active" | "inactive" | "maintenance" | "sold"
      vehicle_type:
        | "light"
        | "heavy"
        | "electric"
        | "hybrid"
        | "van"
        | "truck"
        | "bus"
        | "motorcycle"
      work_order_status:
        | "draft"
        | "open"
        | "assigned"
        | "in_progress"
        | "on_hold"
        | "completed"
        | "closed"
        | "cancelled"
      work_order_type:
        | "preventive"
        | "corrective"
        | "predictive"
        | "inspection"
        | "installation"
        | "decommission"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      anew_scope_level: ["NONE", "OWNED", "TEAM", "ORG"],
      app_role: ["admin", "manager", "sales_rep", "viewer"],
      asset_status: [
        "active",
        "maintenance",
        "inactive",
        "decommissioned",
        "planned_disposal",
      ],
      attribute_type: [
        "text",
        "number",
        "boolean",
        "select",
        "multiselect",
        "date",
      ],
      bundle_pricing_type: [
        "fixed_price",
        "percentage_discount",
        "fixed_discount",
        "custom",
      ],
      call_center_status: [
        "not_attempted",
        "attempted_no_answer",
        "attempted_busy",
        "attempted_answered",
        "callback_scheduled",
        "not_interested",
        "wrong_number",
        "successful_contact",
        "do_not_call",
      ],
      client_type: ["person", "company"],
      component_pricing_mode: [
        "original",
        "custom_price",
        "custom_discount_percent",
        "custom_discount_fixed",
      ],
      currency_code: ["EUR", "USD", "GBP", "BRL", "JPY", "CNY"],
      incident_type: [
        "accident",
        "breakdown",
        "fine",
        "damage",
        "complaint",
        "other",
      ],
      maintenance_type: ["preventive", "corrective", "inspection"],
      portal_document_type: ["proposal", "quote", "contract"],
      price_type: [
        "purchase",
        "retail",
        "wholesale",
        "distributor",
        "promotional",
      ],
      priority_level: ["low", "medium", "high", "critical", "emergency"],
      product_status: ["active", "discontinued", "draft"],
      request_status: [
        "submitted",
        "pending_approval",
        "approved",
        "assigned",
        "in_progress",
        "resolved",
        "closed",
        "rejected",
      ],
      schedule_event_type: [
        "created",
        "updated",
        "rescheduled",
        "assigned",
        "unassigned",
        "status_changed",
        "confirmed",
        "cancelled",
        "completed",
        "comment",
      ],
      schedule_field_type: [
        "text",
        "number",
        "date",
        "datetime",
        "select",
        "multiselect",
        "checkbox",
        "user",
        "link",
        "email",
        "phone",
        "currency",
        "rating",
      ],
      schedule_item_origin: ["manual", "auto", "import", "api"],
      schedule_item_status: [
        "draft",
        "scheduled",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "rescheduled",
      ],
      stock_movement_type: [
        "purchase",
        "usage",
        "return",
        "adjustment",
        "transfer",
        "disposal",
      ],
      vehicle_status: ["active", "inactive", "maintenance", "sold"],
      vehicle_type: [
        "light",
        "heavy",
        "electric",
        "hybrid",
        "van",
        "truck",
        "bus",
        "motorcycle",
      ],
      work_order_status: [
        "draft",
        "open",
        "assigned",
        "in_progress",
        "on_hold",
        "completed",
        "closed",
        "cancelled",
      ],
      work_order_type: [
        "preventive",
        "corrective",
        "predictive",
        "inspection",
        "installation",
        "decommission",
      ],
    },
  },
} as const
