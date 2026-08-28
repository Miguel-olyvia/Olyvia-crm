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
      _migration_contacts_to_leads_map: {
        Row: {
          contact_id: string
          entity_id: string
          lead_id: string
          migrated_at: string
          organization_id: string
          was_new_lead: boolean
        }
        Insert: {
          contact_id: string
          entity_id: string
          lead_id: string
          migrated_at?: string
          organization_id: string
          was_new_lead: boolean
        }
        Update: {
          contact_id?: string
          entity_id?: string
          lead_id?: string
          migrated_at?: string
          organization_id?: string
          was_new_lead?: boolean
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
            foreignKeyName: "activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
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
      ai_credit_packages: {
        Row: {
          active: boolean
          cost_real: number
          created_at: string
          credits: number
          id: string
          is_popular: boolean
          name: string
          price_sale: number
          stripe_price_id: string | null
        }
        Insert: {
          active?: boolean
          cost_real: number
          created_at?: string
          credits: number
          id?: string
          is_popular?: boolean
          name: string
          price_sale: number
          stripe_price_id?: string | null
        }
        Update: {
          active?: boolean
          cost_real?: number
          created_at?: string
          credits?: number
          id?: string
          is_popular?: boolean
          name?: string
          price_sale?: number
          stripe_price_id?: string | null
        }
        Relationships: []
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
      anew_client_duc_attachments: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          duc_id: string
          file_name: string | null
          file_path: string
          id: string
          mime_type: string | null
          organization_id: string
          size_bytes: number | null
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          duc_id: string
          file_name?: string | null
          file_path: string
          id?: string
          mime_type?: string | null
          organization_id: string
          size_bytes?: number | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          duc_id?: string
          file_name?: string | null
          file_path?: string
          id?: string
          mime_type?: string | null
          organization_id?: string
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anew_client_duc_attachments_duc_id_fkey"
            columns: ["duc_id"]
            isOneToOne: false
            referencedRelation: "anew_client_ducs"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_client_duc_collaborators: {
        Row: {
          accepted_at: string | null
          auth_user_id: string | null
          duc_id: string
          email: string
          id: string
          invited_at: string
          invited_by: string | null
          organization_id: string
          revoked_at: string | null
          role: string
        }
        Insert: {
          accepted_at?: string | null
          auth_user_id?: string | null
          duc_id: string
          email: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          organization_id: string
          revoked_at?: string | null
          role?: string
        }
        Update: {
          accepted_at?: string | null
          auth_user_id?: string | null
          duc_id?: string
          email?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          organization_id?: string
          revoked_at?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "anew_client_duc_collaborators_duc_id_fkey"
            columns: ["duc_id"]
            isOneToOne: false
            referencedRelation: "anew_client_ducs"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_client_duc_configs: {
        Row: {
          config: Json
          created_at: string
          id: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      anew_client_duc_dismissed: {
        Row: {
          client_id: string
          created_at: string
          dismissed_by: string | null
          id: string
          organization_id: string
          reason: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          dismissed_by?: string | null
          id?: string
          organization_id: string
          reason?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          dismissed_by?: string | null
          id?: string
          organization_id?: string
          reason?: string | null
        }
        Relationships: []
      }
      anew_client_duc_events: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          created_at: string
          detail: string | null
          duc_id: string
          event_type: string
          field_key: string | null
          id: string
          organization_id: string
          stage_no: number | null
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          detail?: string | null
          duc_id: string
          event_type: string
          field_key?: string | null
          id?: string
          organization_id: string
          stage_no?: number | null
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          detail?: string | null
          duc_id?: string
          event_type?: string
          field_key?: string | null
          id?: string
          organization_id?: string
          stage_no?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anew_client_duc_events_duc_id_fkey"
            columns: ["duc_id"]
            isOneToOne: false
            referencedRelation: "anew_client_ducs"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_client_duc_items: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          duc_id: string
          id: string
          included: boolean | null
          label: string | null
          meta: Json
          organization_id: string
          position: number
          qty: number | null
          section: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duc_id: string
          id?: string
          included?: boolean | null
          label?: string | null
          meta?: Json
          organization_id: string
          position?: number
          qty?: number | null
          section: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duc_id?: string
          id?: string
          included?: boolean | null
          label?: string | null
          meta?: Json
          organization_id?: string
          position?: number
          qty?: number | null
          section?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anew_client_duc_items_duc_id_fkey"
            columns: ["duc_id"]
            isOneToOne: false
            referencedRelation: "anew_client_ducs"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_client_duc_messages: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          duc_id: string
          id: string
          mentions: Json
          organization_id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          duc_id: string
          id?: string
          mentions?: Json
          organization_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          duc_id?: string
          id?: string
          mentions?: Json
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anew_client_duc_messages_duc_id_fkey"
            columns: ["duc_id"]
            isOneToOne: false
            referencedRelation: "anew_client_ducs"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_client_duc_public_shares: {
        Row: {
          created_at: string
          created_by: string | null
          duc_id: string
          expires_at: string | null
          id: string
          organization_id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duc_id: string
          expires_at?: string | null
          id?: string
          organization_id: string
          revoked_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duc_id?: string
          expires_at?: string | null
          id?: string
          organization_id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "anew_client_duc_public_shares_duc_id_fkey"
            columns: ["duc_id"]
            isOneToOne: false
            referencedRelation: "anew_client_ducs"
            referencedColumns: ["id"]
          },
        ]
      }
      anew_client_ducs: {
        Row: {
          assigned_to: string | null
          blocks: Json
          client_id: string | null
          created_at: string
          created_by: string
          current_stage: number
          deleted_at: string | null
          deleted_by: string | null
          duc_number: string | null
          id: string
          organization_id: string
          root_organization_id: string | null
          status: string
          title: string | null
          tracking: Json
          updated_at: string
          variant: string
        }
        Insert: {
          assigned_to?: string | null
          blocks?: Json
          client_id?: string | null
          created_at?: string
          created_by: string
          current_stage?: number
          deleted_at?: string | null
          deleted_by?: string | null
          duc_number?: string | null
          id?: string
          organization_id: string
          root_organization_id?: string | null
          status?: string
          title?: string | null
          tracking?: Json
          updated_at?: string
          variant?: string
        }
        Update: {
          assigned_to?: string | null
          blocks?: Json
          client_id?: string | null
          created_at?: string
          created_by?: string
          current_stage?: number
          deleted_at?: string | null
          deleted_by?: string | null
          duc_number?: string | null
          id?: string
          organization_id?: string
          root_organization_id?: string | null
          status?: string
          title?: string | null
          tracking?: Json
          updated_at?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "anew_client_ducs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_client_ducs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "anew_clients"
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
          origin_campaign_id: string | null
          origin_source: string | null
          origin_source_id: string | null
          root_organization_id: string
          search_text: string | null
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
          origin_campaign_id?: string | null
          origin_source?: string | null
          origin_source_id?: string | null
          root_organization_id: string
          search_text?: string | null
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
          origin_campaign_id?: string | null
          origin_source?: string | null
          origin_source_id?: string | null
          root_organization_id?: string
          search_text?: string | null
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
          {
            foreignKeyName: "anew_clients_origin_campaign_id_fkey"
            columns: ["origin_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_clients_origin_source_id_fkey"
            columns: ["origin_source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
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
          {
            foreignKeyName: "anew_contacts_source_lead_id_fkey"
            columns: ["source_lead_id"]
            isOneToOne: false
            referencedRelation: "anew_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_contacts_source_lead_id_fkey"
            columns: ["source_lead_id"]
            isOneToOne: false
            referencedRelation: "leads_pending_retention_review"
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
          search_text: string | null
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
          search_text?: string | null
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
          search_text?: string | null
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
          became_contact_at: string | null
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
          entity_is_client: boolean | null
          field_values: Json
          id: string
          last_contact_at: string | null
          last_contact_by: string | null
          last_contact_result: string | null
          lead_district_id: string | null
          locale: string | null
          lost_reason: string | null
          needs_manual_scheduling: boolean
          notes: string | null
          organization_id: string
          origin: string | null
          origin_lead_id: string | null
          pipeline_dirty_at: string | null
          previous_status: string | null
          qualification_set_by: string | null
          qualification_type: string | null
          qualified_at: string | null
          raw_status: string | null
          root_organization_id: string
          scheduled_visit_id: string | null
          search_text: string | null
          source: string | null
          source_id: string | null
          source_note: string | null
          status: string | null
          tags: string[] | null
          updated_at: string
          workflow_stage_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          became_contact_at?: string | null
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
          entity_is_client?: boolean | null
          field_values?: Json
          id?: string
          last_contact_at?: string | null
          last_contact_by?: string | null
          last_contact_result?: string | null
          lead_district_id?: string | null
          locale?: string | null
          lost_reason?: string | null
          needs_manual_scheduling?: boolean
          notes?: string | null
          organization_id: string
          origin?: string | null
          origin_lead_id?: string | null
          pipeline_dirty_at?: string | null
          previous_status?: string | null
          qualification_set_by?: string | null
          qualification_type?: string | null
          qualified_at?: string | null
          raw_status?: string | null
          root_organization_id: string
          scheduled_visit_id?: string | null
          search_text?: string | null
          source?: string | null
          source_id?: string | null
          source_note?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string
          workflow_stage_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          became_contact_at?: string | null
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
          entity_is_client?: boolean | null
          field_values?: Json
          id?: string
          last_contact_at?: string | null
          last_contact_by?: string | null
          last_contact_result?: string | null
          lead_district_id?: string | null
          locale?: string | null
          lost_reason?: string | null
          needs_manual_scheduling?: boolean
          notes?: string | null
          organization_id?: string
          origin?: string | null
          origin_lead_id?: string | null
          pipeline_dirty_at?: string | null
          previous_status?: string | null
          qualification_set_by?: string | null
          qualification_type?: string | null
          qualified_at?: string | null
          raw_status?: string | null
          root_organization_id?: string
          scheduled_visit_id?: string | null
          search_text?: string | null
          source?: string | null
          source_id?: string | null
          source_note?: string | null
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
            foreignKeyName: "anew_leads_lead_district_id_fkey"
            columns: ["lead_district_id"]
            isOneToOne: false
            referencedRelation: "administrative_divisions"
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
            foreignKeyName: "anew_leads_qualification_set_by_fkey"
            columns: ["qualification_set_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
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
          deleted_at: string | null
          description: string | null
          entity_id: string | null
          id: string
          is_fiscal: boolean | null
          is_work_org: boolean
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
          deleted_at?: string | null
          description?: string | null
          entity_id?: string | null
          id?: string
          is_fiscal?: boolean | null
          is_work_org?: boolean
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
          deleted_at?: string | null
          description?: string | null
          entity_id?: string | null
          id?: string
          is_fiscal?: boolean | null
          is_work_org?: boolean
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
        Relationships: [
          {
            foreignKeyName: "anew_relations_source_org_id_fkey"
            columns: ["source_org_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_relations_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
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
          deleted_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          is_system: boolean | null
          name: string
          organization_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          can_sign_contracts?: boolean
          code: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_system?: boolean | null
          name: string
          organization_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          can_sign_contracts?: boolean
          code?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_system?: boolean | null
          name?: string
          organization_id?: string | null
          status?: string
          updated_at?: string | null
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
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
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
      auth_account_changes: {
        Row: {
          auth_user_id: string | null
          change_type: string
          created_at: string
          id: string
          old_email: string | null
        }
        Insert: {
          auth_user_id?: string | null
          change_type: string
          created_at?: string
          id?: string
          old_email?: string | null
        }
        Update: {
          auth_user_id?: string | null
          change_type?: string
          created_at?: string
          id?: string
          old_email?: string | null
        }
        Relationships: []
      }
      auth_login_attempts: {
        Row: {
          auth_user_id: string | null
          created_at: string
          id: string
          identifier: string
          ip_address: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          id?: string
          identifier: string
          ip_address?: string | null
          success: boolean
          user_agent?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          id?: string
          identifier?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
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
      billing_account_work_orgs: {
        Row: {
          added_at: string
          billing_account_id: string
          organization_id: string
        }
        Insert: {
          added_at?: string
          billing_account_id: string
          organization_id: string
        }
        Update: {
          added_at?: string
          billing_account_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_account_work_orgs_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_account_work_orgs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_accounts: {
        Row: {
          created_at: string
          id: string
          max_work_orgs: number | null
          owner_user_id: string
          plan_tier: string | null
          stripe_customer_id: string | null
          subscription_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_work_orgs?: number | null
          owner_user_id: string
          plan_tier?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_work_orgs?: number | null
          owner_user_id?: string
          plan_tier?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_accounts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "anew_users"
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
          deleted_at: string | null
          deleted_by: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
            foreignKeyName: "campaign_leads_anew_lead_id_fkey"
            columns: ["anew_lead_id"]
            isOneToOne: false
            referencedRelation: "leads_pending_retention_review"
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
      client_contract_templates: {
        Row: {
          background_color: string | null
          body_html: string
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
      client_contracts: {
        Row: {
          accepted_at: string | null
          assigned_to: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
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
          replaced_by_contract_id: string | null
          replaces_contract_id: string | null
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
          total_value_sem_iva: number | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_to?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
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
          replaced_by_contract_id?: string | null
          replaces_contract_id?: string | null
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
          total_value_sem_iva?: number | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assigned_to?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
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
          replaced_by_contract_id?: string | null
          replaces_contract_id?: string | null
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
          total_value_sem_iva?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contracts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "client_contracts_replaced_by_contract_id_fkey"
            columns: ["replaced_by_contract_id"]
            isOneToOne: false
            referencedRelation: "client_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_replaces_contract_id_fkey"
            columns: ["replaces_contract_id"]
            isOneToOne: false
            referencedRelation: "client_contracts"
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
          lead_id: string | null
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
          lead_id?: string | null
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
          lead_id?: string | null
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
            foreignKeyName: "client_portal_users_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "anew_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_pending_retention_review"
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
      data_erasure_requests: {
        Row: {
          decision_mode: string | null
          entity_id: string | null
          entity_snapshot: Json
          error_message: string | null
          executed_at: string | null
          id: string
          organization_id: string
          reason: string
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          result: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          decision_mode?: string | null
          entity_id?: string | null
          entity_snapshot?: Json
          error_message?: string | null
          executed_at?: string | null
          id?: string
          organization_id: string
          reason: string
          rejection_reason?: string | null
          requested_at?: string
          requested_by: string
          result?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          decision_mode?: string | null
          entity_id?: string | null
          entity_snapshot?: Json
          error_message?: string | null
          executed_at?: string | null
          id?: string
          organization_id?: string
          reason?: string
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string
          result?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_erasure_requests_entity_fk"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "anew_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_erasure_requests_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_erasure_requests_requested_by_fk"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_erasure_requests_reviewed_by_fk"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      data_export_audit: {
        Row: {
          auth_user_id: string
          business_user_id: string | null
          completed_at: string | null
          created_at: string
          effective_columns: string[]
          error_code: string | null
          filters: Json
          format: string
          id: string
          module: string
          organization_id: string
          requested_columns: string[]
          row_count: number | null
          scope: string
          sensitive_columns: string[]
          status: string
        }
        Insert: {
          auth_user_id: string
          business_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          effective_columns?: string[]
          error_code?: string | null
          filters?: Json
          format?: string
          id?: string
          module: string
          organization_id: string
          requested_columns?: string[]
          row_count?: number | null
          scope: string
          sensitive_columns?: string[]
          status: string
        }
        Update: {
          auth_user_id?: string
          business_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          effective_columns?: string[]
          error_code?: string | null
          filters?: Json
          format?: string
          id?: string
          module?: string
          organization_id?: string
          requested_columns?: string[]
          row_count?: number | null
          scope?: string
          sensitive_columns?: string[]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_export_audit_business_user_id_fkey"
            columns: ["business_user_id"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_export_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
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
          value_max: number | null
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
          value_max?: number | null
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
          value_max?: number | null
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
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_pending_retention_review"
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
          validation_status: string
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
          validation_status?: string
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
          validation_status?: string
        }
        Relationships: []
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
        Relationships: []
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
      entity_audit_log: {
        Row: {
          changed_by: string | null
          changed_fields: Json | null
          created_at: string
          entity_id: string | null
          full_record: Json | null
          id: string
          operation: string
          organization_id: string
          record_id: string | null
          source: string | null
          table_name: string
        }
        Insert: {
          changed_by?: string | null
          changed_fields?: Json | null
          created_at?: string
          entity_id?: string | null
          full_record?: Json | null
          id?: string
          operation: string
          organization_id: string
          record_id?: string | null
          source?: string | null
          table_name: string
        }
        Update: {
          changed_by?: string | null
          changed_fields?: Json | null
          created_at?: string
          entity_id?: string | null
          full_record?: Json | null
          id?: string
          operation?: string
          organization_id?: string
          record_id?: string | null
          source?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
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
        Relationships: []
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
          proposal_id: string | null
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
          proposal_id?: string | null
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
          proposal_id?: string | null
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
            foreignKeyName: "entity_interactions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
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
          nif_encrypted: string | null
          nif_hash: string | null
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
          nif_encrypted?: string | null
          nif_hash?: string | null
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
          nif_encrypted?: string | null
          nif_hash?: string | null
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
      fiscal_entity_nif_tokens: {
        Row: {
          fiscal_entity_id: string
          token_hash: string
        }
        Insert: {
          fiscal_entity_id: string
          token_hash: string
        }
        Update: {
          fiscal_entity_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_entity_nif_tokens_fiscal_entity_id_fkey"
            columns: ["fiscal_entity_id"]
            isOneToOne: false
            referencedRelation: "fiscal_entities"
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
          booking_manage_url_template: string | null
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
          confirmation_email_enabled: boolean
          confirmation_email_template_id: string | null
          contact_soon_text: string | null
          container_padding_x: string | null
          container_padding_y: string | null
          continue_button_text: string | null
          created_at: string
          created_by: string | null
          custom_css: string | null
          date_placeholder: string | null
          email_locale_templates: Json
          email_smtp_id: string | null
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
          meeting_notify_commercial: boolean
          meeting_notify_emails: string | null
          meeting_notify_template_id: string | null
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
          public_form_url_template: string | null
          radio_border_radius: string | null
          radio_border_width: string | null
          radio_button_color: string | null
          radio_circle_size: string | null
          radio_inner_size: string | null
          radio_padding: string | null
          redirecting_text: string | null
          reminder_enabled: boolean
          reminder_hours_before: number
          reminder_template_id: string | null
          required_field_label: string | null
          scheduling_invite_delays_hours: number[]
          scheduling_invite_enabled: boolean
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
          booking_manage_url_template?: string | null
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
          confirmation_email_enabled?: boolean
          confirmation_email_template_id?: string | null
          contact_soon_text?: string | null
          container_padding_x?: string | null
          container_padding_y?: string | null
          continue_button_text?: string | null
          created_at?: string
          created_by?: string | null
          custom_css?: string | null
          date_placeholder?: string | null
          email_locale_templates?: Json
          email_smtp_id?: string | null
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
          meeting_notify_commercial?: boolean
          meeting_notify_emails?: string | null
          meeting_notify_template_id?: string | null
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
          public_form_url_template?: string | null
          radio_border_radius?: string | null
          radio_border_width?: string | null
          radio_button_color?: string | null
          radio_circle_size?: string | null
          radio_inner_size?: string | null
          radio_padding?: string | null
          redirecting_text?: string | null
          reminder_enabled?: boolean
          reminder_hours_before?: number
          reminder_template_id?: string | null
          required_field_label?: string | null
          scheduling_invite_delays_hours?: number[]
          scheduling_invite_enabled?: boolean
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
          booking_manage_url_template?: string | null
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
          confirmation_email_enabled?: boolean
          confirmation_email_template_id?: string | null
          contact_soon_text?: string | null
          container_padding_x?: string | null
          container_padding_y?: string | null
          continue_button_text?: string | null
          created_at?: string
          created_by?: string | null
          custom_css?: string | null
          date_placeholder?: string | null
          email_locale_templates?: Json
          email_smtp_id?: string | null
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
          meeting_notify_commercial?: boolean
          meeting_notify_emails?: string | null
          meeting_notify_template_id?: string | null
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
          public_form_url_template?: string | null
          radio_border_radius?: string | null
          radio_border_width?: string | null
          radio_button_color?: string | null
          radio_circle_size?: string | null
          radio_inner_size?: string | null
          radio_padding?: string | null
          redirecting_text?: string | null
          reminder_enabled?: boolean
          reminder_hours_before?: number
          reminder_template_id?: string | null
          required_field_label?: string | null
          scheduling_invite_delays_hours?: number[]
          scheduling_invite_enabled?: boolean
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
            foreignKeyName: "form_branding_confirmation_email_template_id_fkey"
            columns: ["confirmation_email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_branding_email_smtp_id_fkey"
            columns: ["email_smtp_id"]
            isOneToOne: false
            referencedRelation: "organization_smtp_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_branding_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: true
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_branding_meeting_notify_template_id_fkey"
            columns: ["meeting_notify_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_branding_reminder_template_id_fkey"
            columns: ["reminder_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
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
          scheduling_district_field_key: string | null
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
          scheduling_district_field_key?: string | null
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
          scheduling_district_field_key?: string | null
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
      form_submissions: {
        Row: {
          campaign_id: string | null
          created_at: string
          created_by: string | null
          current_step: number | null
          deleted_at: string | null
          deleted_by: string | null
          entity_id: string
          field_values: Json
          form_id: string | null
          id: string
          is_complete: boolean
          organization_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          root_organization_id: string
          status: string
          target_id: string
          target_type: string
          total_steps: number | null
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id: string
          field_values?: Json
          form_id?: string | null
          id?: string
          is_complete?: boolean
          organization_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          root_organization_id: string
          status?: string
          target_id: string
          target_type: string
          total_steps?: number | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id?: string
          field_values?: Json
          form_id?: string | null
          id?: string
          is_complete?: boolean
          organization_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          root_organization_id?: string
          status?: string
          target_id?: string
          target_type?: string
          total_steps?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "anew_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_root_organization_id_fkey"
            columns: ["root_organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
      invoices: {
        Row: {
          amount: number
          created_at: string
          credits_amount: number | null
          description: string | null
          id: string
          organization_id: string
          package_id: string | null
          paid_at: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          credits_amount?: number | null
          description?: string | null
          id?: string
          organization_id: string
          package_id?: string | null
          paid_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          credits_amount?: number | null
          description?: string | null
          id?: string
          organization_id?: string
          package_id?: string | null
          paid_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "ai_credit_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      item_supplier_price_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          item_supplier_id: string
          new_lead_time_days: number | null
          new_price: number | null
          old_lead_time_days: number | null
          old_price: number | null
          organization_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          item_supplier_id: string
          new_lead_time_days?: number | null
          new_price?: number | null
          old_lead_time_days?: number | null
          old_price?: number | null
          organization_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          item_supplier_id?: string
          new_lead_time_days?: number | null
          new_price?: number | null
          old_lead_time_days?: number | null
          old_price?: number | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_supplier_price_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_supplier_price_history_item_supplier_id_fkey"
            columns: ["item_supplier_id"]
            isOneToOne: false
            referencedRelation: "item_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_supplier_price_history_item_supplier_id_fkey"
            columns: ["item_supplier_id"]
            isOneToOne: false
            referencedRelation: "item_suppliers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_supplier_price_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      item_suppliers: {
        Row: {
          business_unit_id: string | null
          created_at: string
          created_by: string
          currency: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_active: boolean
          is_preferred: boolean
          item_type: string
          lead_time_days: number | null
          moq: number | null
          notes: string | null
          organization_id: string
          product_id: string | null
          purchase_price: number | null
          service_id: string | null
          supplier_id: string
          supplier_sku: string | null
          uom_id: string | null
          updated_at: string
        }
        Insert: {
          business_unit_id?: string | null
          created_at?: string
          created_by: string
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          is_preferred?: boolean
          item_type: string
          lead_time_days?: number | null
          moq?: number | null
          notes?: string | null
          organization_id: string
          product_id?: string | null
          purchase_price?: number | null
          service_id?: string | null
          supplier_id: string
          supplier_sku?: string | null
          uom_id?: string | null
          updated_at?: string
        }
        Update: {
          business_unit_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          is_preferred?: boolean
          item_type?: string
          lead_time_days?: number | null
          moq?: number | null
          notes?: string | null
          organization_id?: string
          product_id?: string | null
          purchase_price?: number | null
          service_id?: string | null
          supplier_id?: string
          supplier_sku?: string | null
          uom_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_suppliers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_suppliers_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_suppliers_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "uom"
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
      lead_contact_history_deprecated: {
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
            foreignKeyName: "lead_contact_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_pending_retention_review"
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
            foreignKeyName: "lead_field_definitions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "campaign_form_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_qualification_rules: {
        Row: {
          created_at: string
          created_by: string | null
          mql_when: Json | null
          organization_id: string
          sql_when: Json | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          mql_when?: Json | null
          organization_id: string
          sql_when?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          mql_when?: Json | null
          organization_id?: string
          sql_when?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_qualification_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_qualification_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_qualification_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
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
          auto_advance: boolean
          color: string | null
          counts_as_converted: boolean
          counts_as_lost: boolean
          counts_as_negotiation: boolean
          counts_as_qualified: boolean
          created_at: string
          created_by: string
          default_status: string | null
          id: string
          is_active: boolean | null
          is_conversion: boolean | null
          is_final: boolean | null
          is_rejection: boolean | null
          label: string
          matching_statuses: string[] | null
          name: string
          organization_id: string | null
          qualification_hint: string | null
          reached_when: Json | null
          stage_order: number
          updated_at: string
        }
        Insert: {
          auto_advance?: boolean
          color?: string | null
          counts_as_converted?: boolean
          counts_as_lost?: boolean
          counts_as_negotiation?: boolean
          counts_as_qualified?: boolean
          created_at?: string
          created_by: string
          default_status?: string | null
          id?: string
          is_active?: boolean | null
          is_conversion?: boolean | null
          is_final?: boolean | null
          is_rejection?: boolean | null
          label: string
          matching_statuses?: string[] | null
          name: string
          organization_id?: string | null
          qualification_hint?: string | null
          reached_when?: Json | null
          stage_order?: number
          updated_at?: string
        }
        Update: {
          auto_advance?: boolean
          color?: string | null
          counts_as_converted?: boolean
          counts_as_lost?: boolean
          counts_as_negotiation?: boolean
          counts_as_qualified?: boolean
          created_at?: string
          created_by?: string
          default_status?: string | null
          id?: string
          is_active?: boolean | null
          is_conversion?: boolean | null
          is_final?: boolean | null
          is_rejection?: boolean | null
          label?: string
          matching_statuses?: string[] | null
          name?: string
          organization_id?: string | null
          qualification_hint?: string | null
          reached_when?: Json | null
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
        Relationships: []
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
            foreignKeyName: "locations_parent_location_id_fkey"
            columns: ["parent_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
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
          validation_status: string
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
          validation_status?: string
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
          validation_status?: string
        }
        Relationships: []
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
      organization_ai_credits: {
        Row: {
          balance_credits: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          balance_credits?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          balance_credits?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_ai_credits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
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
      organization_inventory_settings: {
        Row: {
          created_at: string
          created_by: string
          default_warehouse_id: string | null
          organization_id: string
          stock_deduction_trigger: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          default_warehouse_id?: string | null
          organization_id: string
          stock_deduction_trigger?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          default_warehouse_id?: string | null
          organization_id?: string
          stock_deduction_trigger?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_inventory_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_inventory_settings_default_warehouse_id_fkey"
            columns: ["default_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_inventory_settings_organization_id_fkey"
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
          smtp_password_secret_id: string
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
          smtp_password_secret_id: string
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
          smtp_password_secret_id?: string
          smtp_port?: number
          smtp_secure?: boolean
          smtp_username?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_smtp_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          created_at: string
          created_by: string | null
          current_period_end: string | null
          id: string
          organization_id: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          id?: string
          organization_id: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          id?: string
          organization_id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "anew_organizations"
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
      organization_usage_counters: {
        Row: {
          id: string
          limit_type: string
          organization_id: string
          period_start: string
          updated_at: string
          used_value: number
        }
        Insert: {
          id?: string
          limit_type: string
          organization_id: string
          period_start: string
          updated_at?: string
          used_value?: number
        }
        Update: {
          id?: string
          limit_type?: string
          organization_id?: string
          period_start?: string
          updated_at?: string
          used_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_usage_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
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
      plan_limits: {
        Row: {
          created_at: string
          id: string
          limit_type: string
          limit_value: number | null
          plan: string
          reset_cadence: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          limit_type: string
          limit_value?: number | null
          plan: string
          reset_cadence?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          limit_type?: string
          limit_value?: number | null
          plan?: string
          reset_cadence?: string
          updated_at?: string
        }
        Relationships: []
      }
      plan_pricing: {
        Row: {
          created_at: string
          plan: string
          price_eur: number | null
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          plan: string
          price_eur?: number | null
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          plan?: string
          price_eur?: number | null
          stripe_price_id?: string | null
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
          deleted_at: string | null
          deleted_by: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          deleted_at: string | null
          deleted_by: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          manages_stock: boolean
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
          manages_stock?: boolean
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
          manages_stock?: boolean
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
        Relationships: []
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
          decided_published_at: string | null
          decided_snapshot: Json | null
          decided_snapshot_hash: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivered_at: string | null
          delivery_time_hours: number | null
          description: string | null
          document_url: string | null
          entity_id: string | null
          has_unpublished_changes: boolean
          id: string
          is_deleted: boolean | null
          last_viewed_at: string | null
          notes: string | null
          organization_id: string | null
          probability: number | null
          proposal_number: string | null
          public_link_enabled: boolean | null
          public_token: string | null
          published_at: string | null
          published_snapshot: Json | null
          published_snapshot_hash: string | null
          rejected_at: string | null
          rejection_notes: string | null
          rejection_reason: string | null
          rejection_reason_code: string | null
          rejection_reason_id: string | null
          request_date: string | null
          root_organization_id: string | null
          search_text: string | null
          sent_at: string | null
          signature_image: string | null
          stage_id: string | null
          status: string | null
          template_id: string | null
          template_snapshot: Json | null
          title: string
          tracking_token: string | null
          updated_at: string
          valid_until: string | null
          value: number
          value_sem_iva: number | null
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
          decided_published_at?: string | null
          decided_snapshot?: Json | null
          decided_snapshot_hash?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivered_at?: string | null
          delivery_time_hours?: number | null
          description?: string | null
          document_url?: string | null
          entity_id?: string | null
          has_unpublished_changes?: boolean
          id?: string
          is_deleted?: boolean | null
          last_viewed_at?: string | null
          notes?: string | null
          organization_id?: string | null
          probability?: number | null
          proposal_number?: string | null
          public_link_enabled?: boolean | null
          public_token?: string | null
          published_at?: string | null
          published_snapshot?: Json | null
          published_snapshot_hash?: string | null
          rejected_at?: string | null
          rejection_notes?: string | null
          rejection_reason?: string | null
          rejection_reason_code?: string | null
          rejection_reason_id?: string | null
          request_date?: string | null
          root_organization_id?: string | null
          search_text?: string | null
          sent_at?: string | null
          signature_image?: string | null
          stage_id?: string | null
          status?: string | null
          template_id?: string | null
          template_snapshot?: Json | null
          title: string
          tracking_token?: string | null
          updated_at?: string
          valid_until?: string | null
          value: number
          value_sem_iva?: number | null
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
          decided_published_at?: string | null
          decided_snapshot?: Json | null
          decided_snapshot_hash?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivered_at?: string | null
          delivery_time_hours?: number | null
          description?: string | null
          document_url?: string | null
          entity_id?: string | null
          has_unpublished_changes?: boolean
          id?: string
          is_deleted?: boolean | null
          last_viewed_at?: string | null
          notes?: string | null
          organization_id?: string | null
          probability?: number | null
          proposal_number?: string | null
          public_link_enabled?: boolean | null
          public_token?: string | null
          published_at?: string | null
          published_snapshot?: Json | null
          published_snapshot_hash?: string | null
          rejected_at?: string | null
          rejection_notes?: string | null
          rejection_reason?: string | null
          rejection_reason_code?: string | null
          rejection_reason_id?: string | null
          request_date?: string | null
          root_organization_id?: string | null
          search_text?: string | null
          sent_at?: string | null
          signature_image?: string | null
          stage_id?: string | null
          status?: string | null
          template_id?: string | null
          template_snapshot?: Json | null
          title?: string
          tracking_token?: string | null
          updated_at?: string
          valid_until?: string | null
          value?: number
          value_sem_iva?: number | null
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
          received_quantity: number
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
          received_quantity?: number
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
          received_quantity?: number
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
          deleted_at: string | null
          deleted_by: string | null
          expected_delivery: string | null
          id: string
          notes: string | null
          order_date: string
          order_number: string
          organization_id: string
          source_id: string | null
          source_type: string | null
          status: string
          supplier_id: string | null
          total_value: number
          updated_at: string
        }
        Insert: {
          business_unit_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date: string
          order_number: string
          organization_id: string
          source_id?: string | null
          source_type?: string | null
          status?: string
          supplier_id?: string | null
          total_value?: number
          updated_at?: string
        }
        Update: {
          business_unit_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_number?: string
          organization_id?: string
          source_id?: string | null
          source_type?: string | null
          status?: string
          supplier_id?: string | null
          total_value?: number
          updated_at?: string
        }
        Relationships: [
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
          item_supplier_id: string | null
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
          item_supplier_id?: string | null
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
          item_supplier_id?: string | null
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
            foreignKeyName: "quote_lines_item_supplier_id_fkey"
            columns: ["item_supplier_id"]
            isOneToOne: false
            referencedRelation: "item_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_lines_item_supplier_id_fkey"
            columns: ["item_supplier_id"]
            isOneToOne: false
            referencedRelation: "item_suppliers_public"
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
          lost_reason: string | null
          modelo_base: string
          moeda: string | null
          obra_endereco: string | null
          obra_notas: string | null
          organization_id: string | null
          proposal_id: string | null
          quote_number: string | null
          request_date: string | null
          root_organization_id: string | null
          search_text: string | null
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
          lost_reason?: string | null
          modelo_base?: string
          moeda?: string | null
          obra_endereco?: string | null
          obra_notas?: string | null
          organization_id?: string | null
          proposal_id?: string | null
          quote_number?: string | null
          request_date?: string | null
          root_organization_id?: string | null
          search_text?: string | null
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
          lost_reason?: string | null
          modelo_base?: string
          moeda?: string | null
          obra_endereco?: string | null
          obra_notas?: string | null
          organization_id?: string | null
          proposal_id?: string | null
          quote_number?: string | null
          request_date?: string | null
          root_organization_id?: string | null
          search_text?: string | null
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
        ]
      }
      rate_limit_attempts: {
        Row: {
          bucket: string
          created_at: string
          id: string
          identifier: string
          success: boolean
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: string
          identifier: string
          success?: boolean
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: string
          identifier?: string
          success?: boolean
        }
        Relationships: []
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
      resource_districts: {
        Row: {
          created_at: string
          created_by: string | null
          district_id: string
          id: string
          is_active: boolean
          priority: number
          resource_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          district_id: string
          id?: string
          is_active?: boolean
          priority?: number
          resource_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          district_id?: string
          id?: string
          is_active?: boolean
          priority?: number
          resource_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_districts_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "administrative_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_districts_resource_id_fkey"
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
        Relationships: []
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
        Relationships: []
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
          smtp_id: string | null
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
          smtp_id?: string | null
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
          smtp_id?: string | null
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
            foreignKeyName: "scheduled_emails_smtp_id_fkey"
            columns: ["smtp_id"]
            isOneToOne: false
            referencedRelation: "organization_smtp_settings"
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
      scheduling_invites: {
        Row: {
          created_at: string
          expires_at: string
          form_id: string
          id: string
          lead_id: string
          organization_id: string | null
          step_number: number
          token: string
          unsubscribed_at: string | null
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          form_id: string
          id?: string
          lead_id: string
          organization_id?: string | null
          step_number: number
          token?: string
          unsubscribed_at?: string | null
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          form_id?: string
          id?: string
          lead_id?: string
          organization_id?: string | null
          step_number?: number
          token?: string
          unsubscribed_at?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_invites_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "anew_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_invites_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_pending_retention_review"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "scoped_api_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string | null
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_deleted: boolean
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
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean
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
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean
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
      service_fee_types: {
        Row: {
          application_mode: string
          apply_vat: boolean
          calculation_type: string
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          fixed_amount: number | null
          id: string
          is_active: boolean
          is_deleted: boolean
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
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          fixed_amount?: number | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
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
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          fixed_amount?: number | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
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
          {
            foreignKeyName: "service_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_organizations_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
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
      signup_profile: {
        Row: {
          company_name: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          employee_count_range: string | null
          id: string
          industry: string | null
          job_title: string | null
          signup_source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          employee_count_range?: string | null
          id?: string
          industry?: string | null
          job_title?: string | null
          signup_source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          employee_count_range?: string | null
          id?: string
          industry?: string | null
          job_title?: string | null
          signup_source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signup_profile_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signup_profile_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "anew_users"
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
      stock_movements: {
        Row: {
          balance_after: number
          counterparty: string | null
          created_at: string
          created_by: string
          document_number: string
          document_type: string
          id: string
          item_supplier_id: string | null
          lot_id: string | null
          movement_type: string
          notes: string | null
          organization_id: string
          product_id: string
          quantity: number
          reference_id: string | null
          reversal_of_movement_id: string | null
          sale_source_id: string | null
          sale_source_type: string | null
          supplier_sku_at_time: string | null
          transfer_group_id: string | null
          unit_cost_at_time: number | null
          warehouse_id: string
        }
        Insert: {
          balance_after: number
          counterparty?: string | null
          created_at?: string
          created_by: string
          document_number: string
          document_type: string
          id?: string
          item_supplier_id?: string | null
          lot_id?: string | null
          movement_type: string
          notes?: string | null
          organization_id: string
          product_id: string
          quantity: number
          reference_id?: string | null
          reversal_of_movement_id?: string | null
          sale_source_id?: string | null
          sale_source_type?: string | null
          supplier_sku_at_time?: string | null
          transfer_group_id?: string | null
          unit_cost_at_time?: number | null
          warehouse_id: string
        }
        Update: {
          balance_after?: number
          counterparty?: string | null
          created_at?: string
          created_by?: string
          document_number?: string
          document_type?: string
          id?: string
          item_supplier_id?: string | null
          lot_id?: string | null
          movement_type?: string
          notes?: string | null
          organization_id?: string
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reversal_of_movement_id?: string | null
          sale_source_id?: string | null
          sale_source_type?: string | null
          supplier_sku_at_time?: string | null
          transfer_group_id?: string | null
          unit_cost_at_time?: number | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_item_supplier_id_fkey"
            columns: ["item_supplier_id"]
            isOneToOne: false
            referencedRelation: "item_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_item_supplier_id_fkey"
            columns: ["item_supplier_id"]
            isOneToOne: false
            referencedRelation: "item_suppliers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_reversal_of_movement_id_fkey"
            columns: ["reversal_of_movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stocks: {
        Row: {
          average_cost: number | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
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
          average_cost?: number | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
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
          average_cost?: number | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
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
          deleted_at: string | null
          deleted_by: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
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
      support_access_log: {
        Row: {
          admin_user_id: string
          duration_hours: number
          expires_at: string | null
          id: string
          reason: string
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_org_id: string
        }
        Insert: {
          admin_user_id: string
          duration_hours: number
          expires_at?: string | null
          id?: string
          reason: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_org_id: string
        }
        Update: {
          admin_user_id?: string
          duration_hours?: number
          expires_at?: string | null
          id?: string
          reason?: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_access_log_admin_user_fk"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_access_log_reviewed_by_fk"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "anew_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_access_log_target_org_fk"
            columns: ["target_org_id"]
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
          smtp_password_secret_id: string
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
          smtp_password_secret_id: string
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
          smtp_password_secret_id?: string
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
          deleted_at: string | null
          deleted_by: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
            foreignKeyName: "warehouses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
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
          execution_id: string | null
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
          execution_id?: string | null
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
          execution_id?: string | null
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
      item_suppliers_public: {
        Row: {
          id: string | null
          is_active: boolean | null
          is_preferred: boolean | null
          item_type: string | null
          lead_time_days: number | null
          moq: number | null
          organization_id: string | null
          product_id: string | null
          service_id: string | null
          supplier_id: string | null
        }
        Insert: {
          id?: string | null
          is_active?: boolean | null
          is_preferred?: boolean | null
          item_type?: string | null
          lead_time_days?: number | null
          moq?: number | null
          organization_id?: string | null
          product_id?: string | null
          service_id?: string | null
          supplier_id?: string | null
        }
        Update: {
          id?: string | null
          is_active?: boolean | null
          is_preferred?: boolean | null
          item_type?: string | null
          lead_time_days?: number | null
          moq?: number | null
          organization_id?: string | null
          product_id?: string | null
          service_id?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_suppliers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_suppliers_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_pending_retention_review: {
        Row: {
          assigned_to: string | null
          converted_at: string | null
          created_at: string | null
          entity_id: string | null
          id: string | null
          last_activity_at: string | null
          last_contact_at: string | null
          organization_id: string | null
          source: string | null
          status: string | null
        }
        Insert: {
          assigned_to?: string | null
          converted_at?: string | null
          created_at?: string | null
          entity_id?: string | null
          id?: string | null
          last_activity_at?: never
          last_contact_at?: string | null
          organization_id?: string | null
          source?: string | null
          status?: string | null
        }
        Update: {
          assigned_to?: string | null
          converted_at?: string | null
          created_at?: string | null
          entity_id?: string | null
          id?: string | null
          last_activity_at?: never
          last_contact_at?: string | null
          organization_id?: string | null
          source?: string | null
          status?: string | null
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
            foreignKeyName: "anew_leads_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "anew_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anew_leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "anew_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
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
            foreignKeyName: "campaign_leads_anew_lead_id_fkey"
            columns: ["anew_lead_id"]
            isOneToOne: false
            referencedRelation: "leads_pending_retention_review"
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
      _bundle_children_authorize: {
        Args: { p_bundle_id: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "bundles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _configurator_can_access_product: {
        Args: { p_organization_id: string; p_product_id: string }
        Returns: boolean
      }
      _fn_leads_creation_critical_writes: {
        Args: {
          p_actor: string
          p_assigned_to: string
          p_campaign_id: string
          p_email: string
          p_entity_created_here: boolean
          p_entity_id: string
          p_field_values: Json
          p_organization_id: string
          p_phone: string
          p_root_organization_id: string
          p_source: string
          p_source_id: string
          p_status: string
        }
        Returns: Record<string, unknown>
      }
      _soft_delete_business_entity_impl: {
        Args: {
          p_actor: string
          p_auth_uid: string
          p_id: string
          p_kind: string
        }
        Returns: boolean
      }
      accept_proposal_atomic: {
        Args: {
          p_acceptance_ip: string
          p_acceptance_user_agent: string
          p_proposal_id: string
          p_public_token: string
        }
        Returns: Json
      }
      anew_clients_compute_search_text: {
        Args: { p_custom_fields: Json; p_entity_id: string }
        Returns: string
      }
      anew_entities_compute_search_text: {
        Args: {
          p_display_name: string
          p_entity_id: string
          p_first_name: string
          p_last_name: string
        }
        Returns: string
      }
      archive_activity: { Args: { _activity_id: string }; Returns: boolean }
      archive_campaign: { Args: { _campaign_id: string }; Returns: boolean }
      archive_deal: { Args: { _deal_id: string }; Returns: boolean }
      archive_proposal: { Args: { _proposal_id: string }; Returns: boolean }
      archive_quote: { Args: { _quote_id: string }; Returns: boolean }
      assert_lead_dynamic_uniqueness: {
        Args: {
          p_exclude_lead_id?: string
          p_field_key: string
          p_field_value: string
          p_org_id: string
          p_root_org_id: string
        }
        Returns: Json
      }
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
      bulk_update_deal_stage: {
        Args: {
          p_deal_ids: string[]
          p_lost_reason?: string
          p_stage_id: string
        }
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
      calculate_proposal_value_from_quotes: {
        Args: { p_proposal_id: string }
        Returns: number
      }
      calculate_proposal_value_sem_iva_from_quotes: {
        Args: { p_proposal_id: string }
        Returns: number
      }
      can_access_contact_row: {
        Args: {
          p_assigned_to: string
          p_created_by: string
          p_org_id: string
          p_permission_code?: string
        }
        Returns: boolean
      }
      can_assign_user_type: {
        Args: { _admin_user_id: string; _target_tipo: string }
        Returns: boolean
      }
      can_see_entity: {
        Args: { p_auth_uid: string; p_entity_id: string }
        Returns: boolean
      }
      can_write_proposal_row: {
        Args: { p_created_by: string; p_org_id: string }
        Returns: boolean
      }
      cancel_and_replace_contract: {
        Args: {
          p_contract_id: string
          p_create_replacement?: boolean
          p_reason: string
        }
        Returns: Json
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
      cleanup_duplicate_notifications: { Args: never; Returns: number }
      cleanup_orphan_notifications: { Args: never; Returns: number }
      clear_audit_context: { Args: never; Returns: undefined }
      client_contracts_list_metrics: {
        Args: {
          _allowed_user_ids: string[]
          _comercial: string
          _comercial_none: boolean
          _date_from: string
          _date_to: string
          _now: string
          _only_mine: string
          _organization_ids: string[]
          _search: string
          _status_filter: string
        }
        Returns: {
          active_value: number
          avg_sign_days: number
          avg_value: number
          draft_count: number
          draft_value: number
          expired_count: number
          expired_value: number
          expiring90_count: number
          sent_count: number
          sent_value: number
          sign_rate: number
          signed_count: number
          signed_value: number
          total_count: number
          total_value: number
        }[]
      }
      compute_lead_furthest_progress_stage_v2: {
        Args: { p_lead_id: string }
        Returns: string
      }
      compute_lead_stage_v2: { Args: { p_lead_id: string }; Returns: string }
      compute_proposal_business_hash: {
        Args: { p_proposal_id: string }
        Returns: string
      }
      convert_contact_to_client: {
        Args: { p_contact_id: string }
        Returns: Json
      }
      create_company_base_roles: {
        Args: { _company_id: string; _created_by: string }
        Returns: undefined
      }
      create_contact_with_role: {
        Args: {
          p_nif_encrypted?: string
          p_nif_hash?: string
          p_nif_tokens?: string[]
          p_payload: Json
        }
        Returns: Json
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
      create_initial_organization: {
        Args: {
          p_description?: string
          p_is_fiscal?: boolean
          p_name: string
          p_phone?: string
          p_sector?: string
          p_status?: string
          p_type: string
        }
        Returns: Json
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
      current_business_user_id: { Args: never; Returns: string }
      delete_organization_subtree: {
        Args: { p_root_org_id: string }
        Returns: string[]
      }
      difference_in_days_local: {
        Args: { _left: string; _right: string; _tz: string }
        Returns: number
      }
      duplicate_proposal: {
        Args: { new_title?: string; source_proposal_id: string }
        Returns: string
      }
      duplicate_quote: { Args: { source_quote_id: string }; Returns: string }
      duplicate_quote_template: {
        Args: {
          p_new_codigo: string
          p_new_name: string
          p_org_id: string
          p_template_id: string
          p_user_id: string
        }
        Returns: string
      }
      ensure_entity_org_link: {
        Args: {
          p_entity_id: string
          p_is_primary?: boolean
          p_organization_id: string
        }
        Returns: undefined
      }
      evaluate_condition: {
        Args: { p_condition: Json; p_lead_status: string; p_signals: Json }
        Returns: boolean
      }
      evaluate_lead_signals_v2: { Args: { p_lead_id: string }; Returns: Json }
      execute_entity_erasure: { Args: { p_request_id: string }; Returns: Json }
      filter_visible_entity_ids: {
        Args: { p_auth_uid: string; p_entity_ids: string[] }
        Returns: {
          entity_id: string
        }[]
      }
      find_entity_matches:
        | {
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
        | {
            Args: {
              p_country_code?: string
              p_email?: string
              p_nif?: string
              p_nif_hash?: string
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
          p_district_id?: string
          p_duration_minutes?: number
          p_limit?: number
          p_target_date?: string
          p_target_postal_code?: string
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
      fn_apply_deal_need: {
        Args: {
          p_created_by: string
          p_deal_id: string
          p_items: Json
          p_need_data: Json
          p_need_id: string
          p_update_need_columns?: boolean
        }
        Returns: Record<string, unknown>
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
      fn_check_and_consume_ai_credits: {
        Args: { _amount: number; _organization_id: string }
        Returns: Json
      }
      fn_check_email_unique_within_org: {
        Args: { p_email: string; p_entity_id: string }
        Returns: undefined
      }
      fn_deal_org_in_scope: { Args: { p_org_id: string }; Returns: boolean }
      fn_lead_org_in_scope: {
        Args: { p_org_id: string; p_root_org_id: string }
        Returns: boolean
      }
      fn_manual_audit_log: {
        Args: {
          p_changed_fields: Json
          p_entity_id: string
          p_operation: string
          p_organization_id: string
          p_record_id?: string
          p_source?: string
          p_table_name: string
        }
        Returns: undefined
      }
      fn_next_stock_document_number: {
        Args: { p_document_type: string; p_organization_id: string }
        Returns: string
      }
      fn_proposals_persist_relations: {
        Args: {
          p_actor: string
          p_deal_id: string
          p_entity_id: string
          p_inline_quotes: Json
          p_organization_id: string
          p_proposal_id: string
          p_proposal_items: Json
          p_quote_entity_id: string
          p_root_organization_id: string
          p_selected_quote_ids: string[]
        }
        Returns: string[]
      }
      fn_refund_ai_credits: {
        Args: { _amount: number; _organization_id: string }
        Returns: Json
      }
      fn_resolve_client_marketing_origin: {
        Args: { p_entity_id: string; p_organization_id?: string }
        Returns: {
          origin_campaign_id: string
          origin_source: string
          origin_source_id: string
        }[]
      }
      fn_write_entity_history: {
        Args: {
          p_change_type: string
          p_entity_id: string
          p_field_name: string
          p_metadata: Json
        }
        Returns: undefined
      }
      generate_api_key: { Args: never; Returns: string }
      generate_client_contract_number: { Args: never; Returns: string }
      generate_po_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_proposal_number: { Args: never; Returns: string }
      generate_quote_number: { Args: never; Returns: string }
      get_account_changes_audit_log: {
        Args: { p_auth_user_id?: string; p_limit?: number; p_offset?: number }
        Returns: {
          auth_user_id: string
          change_type: string
          created_at: string
          id: string
          old_email: string
          user_display_name: string
        }[]
      }
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
      get_auth_audit_log: {
        Args: {
          _actor_id?: string
          _event_type?: string
          _limit?: number
          _offset?: number
        }
        Returns: {
          actor_id: string
          actor_username: string
          actor_via_sso: boolean
          created_at: string
          event_type: string
          id: string
          ip_address: string
          log_type: string
          payload: Json
        }[]
      }
      get_auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
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
      get_client_enriched_data: {
        Args: {
          _entity_ids: string[]
          _now: string
          _organization_id: string
          _since: string
          _tz?: string
        }
        Returns: {
          active_contract_count: number
          contract_total_value: number
          contract_total_value_sem_iva: number
          entity_id: string
          expiring_contracts: Json
          interaction_count_30d: number
          last_interaction_at: string
          last_sentiment: string
          tags: Json
        }[]
      }
      get_commercial_info: { Args: { p_user_id: string }; Returns: Json }
      get_contact_alert_counts: { Args: { p_org_ids: string[] }; Returns: Json }
      get_contact_dashboard_kpis: {
        Args: { p_org_ids: string[] }
        Returns: Json
      }
      get_deals_kpi_stats: {
        Args: {
          p_filters?: Json
          p_org_ids: string[]
          p_scope?: string
          p_scope_user_ids?: string[]
        }
        Returns: Json
      }
      get_duc_public: { Args: { p_token: string }; Returns: Json }
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
      get_entity_contact_summary: {
        Args: { _entity_ids: string[] }
        Returns: {
          display_name: string
          email: string
          entity_id: string
          last_interaction_at: string
          phone_number: string
        }[]
      }
      get_flow_user_org_ids: { Args: { _auth_uid: string }; Returns: string[] }
      get_lead_dashboard_stats: {
        Args: { p_date_from?: string; p_date_to?: string; p_org_id: string }
        Returns: Json
      }
      get_lead_dashboard_stats_scoped: {
        Args: {
          p_anew_user_id?: string
          p_assigned_to?: string
          p_assigned_unassigned?: boolean
          p_auth_user_id?: string
          p_campaign_id?: string
          p_compare_previous?: boolean
          p_contact_result?: string
          p_contact_result_none?: boolean
          p_date_from?: string
          p_date_to?: string
          p_is_root?: boolean
          p_org_id: string
          p_scope?: string
          p_search?: string
          p_source?: string
          p_source_is_null?: boolean
          p_status?: string
        }
        Returns: Json
      }
      get_lead_journey_stage: { Args: { p_lead_id: string }; Returns: Json }
      get_lead_last_stage_before_terminal: {
        Args: { p_lead_id: string }
        Returns: string
      }
      get_lead_page_health: {
        Args: {
          p_entity_ids: string[]
          p_is_root?: boolean
          p_org_id: string
          p_scope?: string
          p_since?: string
        }
        Returns: {
          entity_id: string
          has_open_deal: boolean
          interaction_count: number
        }[]
      }
      get_lead_page_pipeline: {
        Args: {
          p_entity_ids: string[]
          p_is_root?: boolean
          p_org_id: string
          p_scope?: string
        }
        Returns: {
          deal_count: number
          deal_value: number
          entity_id: string
          proposal_count: number
          proposal_value: number
          proposal_value_with_iva: number
          quote_count: number
          quote_value: number
          quote_value_with_iva: number
        }[]
      }
      get_lead_resolved_stage: { Args: { p_lead_id: string }; Returns: Json }
      get_lead_source_options: {
        Args: { p_is_root?: boolean; p_org_id: string; p_scope?: string }
        Returns: {
          source: string
        }[]
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
          p_source?: string
          p_source_is_null?: boolean
        }
        Returns: {
          count: number
          status: string
        }[]
      }
      get_leads_v2_ids_by_pipeline_status: {
        Args: {
          p_filter: string
          p_is_root?: boolean
          p_org_id: string
          p_scope?: string
        }
        Returns: {
          lead_id: string
        }[]
      }
      get_login_attempts_audit_log: {
        Args: {
          p_identifier?: string
          p_limit?: number
          p_offset?: number
          p_success?: boolean
        }
        Returns: {
          auth_user_id: string
          created_at: string
          id: string
          identifier: string
          ip_address: string
          success: boolean
          user_agent: string
          user_display_name: string
        }[]
      }
      get_month_availability: {
        Args: {
          p_board_id: string
          p_district_id?: string
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
      get_org_subtree_ids: { Args: { _root_org_id: string }; Returns: string[] }
      get_permission_scope_context: {
        Args: { _organization_id: string }
        Returns: Json
      }
      get_product_category_org_id: {
        Args: { cat_id: string; depth?: number }
        Returns: string
      }
      get_proposal_edit_scope: {
        Args: { _auth_uid: string; _org_id: string }
        Returns: string
      }
      get_proposals_alert_feed: {
        Args: {
          _created_by_fallback_only: boolean
          _limit?: number
          _organization_id: string
          _scope_created_by_ids: string[]
          _scope_deal_ids: string[]
          _scope_mode: string
          _workflow_stage_ids: string[]
        }
        Returns: {
          contract_id: string
          created_at: string
          id: string
          sent_at: string
          stage_name: string
          status: string
          title: string
          updated_at: string
          valid_until: string
          value: number
        }[]
      }
      get_proposals_list_metrics: {
        Args: {
          _comercial: string
          _comercial_none: boolean
          _created_by_fallback_only: boolean
          _date_from: string
          _date_to: string
          _expired: boolean
          _follow_up_days: number
          _no_response: boolean
          _no_validity: boolean
          _now: string
          _only_mine: string
          _organization_id: string
          _scope_created_by_ids: string[]
          _scope_deal_ids: string[]
          _scope_mode: string
          _search: string
          _search_entity_ids: string[]
          _stage_filter: string
          _tz: string
          _workflow_stage_ids: string[]
        }
        Returns: {
          accepted_count: number
          avg_close_time: number
          conversion_rate: number
          expired_count: number
          no_response_count: number
          no_response_value: number
          no_response_value_ex_vat: number
          no_validity_count: number
          sent_or_later_count: number
          stage_counts: Json
          stage_values: Json
          stage_values_ex_vat: Json
          total: number
          total_value: number
          total_value_ex_vat: number
          won_value: number
          won_value_ex_vat: number
        }[]
      }
      get_proposals_list_page: {
        Args: {
          _comercial: string
          _comercial_none: boolean
          _created_by_fallback_only: boolean
          _date_from: string
          _date_to: string
          _expired: boolean
          _follow_up_days: number
          _limit: number
          _no_response: boolean
          _no_validity: boolean
          _now: string
          _offset: number
          _only_mine: string
          _organization_id: string
          _scope_created_by_ids: string[]
          _scope_deal_ids: string[]
          _scope_mode: string
          _search: string
          _search_entity_ids: string[]
          _sort_column: string
          _sort_direction: string
          _stage_filter: string
          _tz: string
          _workflow_stage_ids: string[]
        }
        Returns: {
          proposal_id: string
        }[]
      }
      get_quotes_kpi_stats: {
        Args: {
          p_filters?: Json
          p_is_parent_org?: boolean
          p_org_id: string
          p_root_org_id?: string
        }
        Returns: Json
      }
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
      get_schedule_item_scope_context: {
        Args: { p_org_id: string; p_permission_code: string }
        Returns: {
          applied_scope: string
          owner_ids: string[]
        }[]
      }
      get_scoped_leads_base: {
        Args: {
          p_assigned_to?: string
          p_assigned_unassigned?: boolean
          p_campaign_id?: string
          p_contact_result?: string
          p_contact_result_none?: boolean
          p_date_from?: string
          p_date_to?: string
          p_is_root?: boolean
          p_org_id: string
          p_scope?: string
          p_search?: string
          p_source?: string
          p_source_is_null?: boolean
          p_status?: string
        }
        Returns: {
          assigned_to: string
          campaign_id: string
          contact_attempts: number
          converted_at: string
          converted_to_client_id: string
          converted_to_contact_id: string
          created_at: string
          created_by: string
          effective_status: string
          entity_id: string
          last_contact_result: string
          lead_id: string
          organization_id: string
          root_organization_id: string
          scheduled_visit_id: string
          search_text: string
          source: string
          status: string
        }[]
      }
      get_service_category_org_id: {
        Args: { cat_id: string; depth?: number }
        Returns: string
      }
      get_system_admin_dashboard_stats: { Args: never; Returns: Json }
      get_user_context: { Args: { _auth_user_id?: string }; Returns: Json }
      get_user_crm_org_ids: { Args: { _auth_uid: string }; Returns: string[] }
      get_user_visible_org_ids: {
        Args: { _auth_uid: string }
        Returns: string[]
      }
      get_user_work_orgs: {
        Args: never
        Returns: {
          id: string
          membership_type: string
          name: string
          roles: string[]
          via_org_id: string
          via_org_name: string
        }[]
      }
      has_active_support_access: {
        Args: { p_org_id: string }
        Returns: boolean
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
      is_duc_collaborator: { Args: { p_duc_id: string }; Returns: boolean }
      is_duc_editor_collaborator: {
        Args: { p_duc_id: string }
        Returns: boolean
      }
      is_entity_in_user_scope: {
        Args: { _auth_uid: string; _entity_id: string }
        Returns: boolean
      }
      is_system_admin: { Args: { _user_id: string }; Returns: boolean }
      is_system_admin_check: { Args: { _user_id: string }; Returns: boolean }
      is_system_admin_user: { Args: { _user_id: string }; Returns: boolean }
      journey_bucket_for_stage: {
        Args: {
          p_counts_as_converted: boolean
          p_counts_as_negotiation: boolean
          p_counts_as_qualified: boolean
          p_is_initial_stage: boolean
        }
        Returns: string
      }
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
      org_has_active_access: { Args: { _org_id: string }; Returns: boolean }
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
      preview_entity_erasure: { Args: { p_entity_id: string }; Returns: Json }
      proposals_compute_search_text: {
        Args: { p_deal_id: string; p_entity_id: string; p_title: string }
        Returns: string
      }
      proposals_in_scope: {
        Args: {
          _created_by_fallback_only: boolean
          _organization_id: string
          _scope_created_by_ids: string[]
          _scope_deal_ids: string[]
          _scope_mode: string
        }
        Returns: {
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
          decided_published_at: string | null
          decided_snapshot: Json | null
          decided_snapshot_hash: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivered_at: string | null
          delivery_time_hours: number | null
          description: string | null
          document_url: string | null
          entity_id: string | null
          has_unpublished_changes: boolean
          id: string
          is_deleted: boolean | null
          last_viewed_at: string | null
          notes: string | null
          organization_id: string | null
          probability: number | null
          proposal_number: string | null
          public_link_enabled: boolean | null
          public_token: string | null
          published_at: string | null
          published_snapshot: Json | null
          published_snapshot_hash: string | null
          rejected_at: string | null
          rejection_notes: string | null
          rejection_reason: string | null
          rejection_reason_code: string | null
          rejection_reason_id: string | null
          request_date: string | null
          root_organization_id: string | null
          search_text: string | null
          sent_at: string | null
          signature_image: string | null
          stage_id: string | null
          status: string | null
          template_id: string | null
          template_snapshot: Json | null
          title: string
          tracking_token: string | null
          updated_at: string
          valid_until: string | null
          value: number
          value_sem_iva: number | null
          view_count: number | null
          viewed_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "proposals"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      proposals_list_filtered: {
        Args: {
          _comercial: string
          _comercial_none: boolean
          _created_by_fallback_only: boolean
          _date_from: string
          _date_to: string
          _expired: boolean
          _follow_up_days: number
          _no_response: boolean
          _no_validity: boolean
          _now: string
          _only_mine: string
          _organization_id: string
          _scope_created_by_ids: string[]
          _scope_deal_ids: string[]
          _scope_mode: string
          _search: string
          _search_entity_ids: string[]
          _stage_filter: string
          _tz: string
          _workflow_stage_ids: string[]
        }
        Returns: {
          accepted_at: string
          created_at: string
          has_no_validity: boolean
          id: string
          is_lost: boolean
          is_no_response: boolean
          is_past_validity: boolean
          is_won: boolean
          stage_id: string
          stage_name: string
          stage_order: number
          title: string
          valid_until: string
          value: number
          value_sem_iva: number
        }[]
      }
      purge_business_entity: {
        Args: { p_id: string; p_kind: string }
        Returns: boolean
      }
      purge_entity_facet: {
        Args: { p_id: string; p_kind: string }
        Returns: boolean
      }
      purge_old_account_changes: { Args: never; Returns: undefined }
      purge_old_login_attempts: { Args: never; Returns: undefined }
      purge_old_otp_codes: { Args: never; Returns: undefined }
      purge_old_rate_limit_attempts: { Args: never; Returns: undefined }
      purge_old_usage_counters: { Args: never; Returns: undefined }
      quotes_compute_search_text: {
        Args: {
          p_deal_id: string
          p_entity_id: string
          p_quote_number: string
          p_title: string
        }
        Returns: string
      }
      recalculate_proposal_value: {
        Args: { p_proposal_id: string }
        Returns: number
      }
      recompute_leads_v2_buckets: {
        Args: { p_org: string }
        Returns: {
          unresolved_count: number
          unresolved_lead_ids: string[]
          updated_count: number
        }[]
      }
      record_proposal_decision: {
        Args: { p_proposal_id: string }
        Returns: undefined
      }
      reject_proposal_atomic: {
        Args: {
          p_proposal_id: string
          p_public_token: string
          p_rejection_notes: string
          p_rejection_reason: string
          p_rejection_reason_code: string
        }
        Returns: Json
      }
      republish_proposal_snapshot: {
        Args: { p_proposal_id: string; p_published_by?: string }
        Returns: {
          has_unpublished_changes: boolean
          proposal_id: string
          published_at: string
          published_snapshot_hash: string
        }[]
      }
      resolve_business_user_id: {
        Args: { p_auth_uid: string }
        Returns: string
      }
      resolve_contact_access_context: {
        Args: {
          p_org_id: string
          p_permission_code?: string
          p_requested_scope?: string
        }
        Returns: {
          anew_user_id: string
          applied_scope: string
          auth_user_id: string
          permitted_scope: string
          requested_scope: string
          team_user_ids: string[]
          visible_org_ids: string[]
        }[]
      }
      resolve_effective_work_org: {
        Args: { org_id: string }
        Returns: {
          original_org_id: string
          resolved_from: string
          work_org_id: string
          work_org_name: string
        }[]
      }
      resolve_fiscal_entity: {
        Args: {
          p_commercial_name?: string
          p_country_code: string
          p_created_by?: string
          p_entity_type?: string
          p_nif: string
          p_nif_encrypted: string
          p_nif_hash: string
        }
        Returns: {
          existed: boolean
          fiscal_entity_id: string
        }[]
      }
      resolve_lead_access_context: {
        Args: {
          p_org_id: string
          p_permission_code?: string
          p_requested_scope?: string
        }
        Returns: {
          anew_user_id: string
          applied_scope: string
          auth_user_id: string
          permitted_scope: string
          requested_scope: string
          team_user_ids: string[]
          visible_org_ids: string[]
        }[]
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
      resolve_root_organization_id: {
        Args: { p_org_id: string }
        Returns: string
      }
      resolve_stage_bucket: { Args: { p_stage_id: string }; Returns: string }
      restore_business_entity: {
        Args: { p_id: string; p_kind: string }
        Returns: boolean
      }
      restore_entity_facet: {
        Args: { p_id: string; p_kind: string }
        Returns: boolean
      }
      restore_organization_subtree: {
        Args: { p_root_org_id: string }
        Returns: string[]
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
      rpc_add_bundle_components: {
        Args: { p_bundle_id: string; p_items: Json }
        Returns: {
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
        }[]
        SetofOptions: {
          from: "*"
          to: "bundle_components"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_adjust_stock: {
        Args: {
          p_direction: string
          p_notes?: string
          p_product_id: string
          p_qty: number
          p_reason: string
          p_warehouse_id: string
        }
        Returns: number
      }
      rpc_bulk_delete_brand: {
        Args: { p_ids: string[]; p_organization_id: string }
        Returns: number
      }
      rpc_bulk_delete_bundle: {
        Args: { p_ids: string[]; p_organization_id: string }
        Returns: number
      }
      rpc_bulk_delete_deal: {
        Args: { p_ids: string[]; p_organization_id: string }
        Returns: number
      }
      rpc_bulk_delete_product: {
        Args: { p_ids: string[]; p_organization_id: string }
        Returns: number
      }
      rpc_bulk_delete_product_attribute: {
        Args: { p_ids: string[]; p_organization_id: string }
        Returns: number
      }
      rpc_bulk_delete_product_category: {
        Args: { p_ids: string[]; p_organization_id: string }
        Returns: number
      }
      rpc_bulk_delete_quote: {
        Args: { p_ids: string[]; p_organization_id: string }
        Returns: number
      }
      rpc_bulk_delete_service: {
        Args: { p_ids: string[]; p_organization_id: string }
        Returns: number
      }
      rpc_bulk_delete_supplier: { Args: { p_ids: string[] }; Returns: number }
      rpc_bulk_import_bundles: {
        Args: { p_bundles: Json; p_org_id: string }
        Returns: Json
      }
      rpc_bulk_import_products: {
        Args: { p_org_id: string; p_products: Json }
        Returns: Json
      }
      rpc_bulk_org_brand: {
        Args: {
          p_ids: string[]
          p_new_org_id: string
          p_organization_id: string
        }
        Returns: number
      }
      rpc_bulk_org_product: {
        Args: {
          p_ids: string[]
          p_new_organization_id: string
          p_organization_id: string
        }
        Returns: number
      }
      rpc_bulk_org_product_attribute: {
        Args: {
          p_ids: string[]
          p_new_organization_id: string
          p_organization_id: string
        }
        Returns: number
      }
      rpc_bulk_org_product_category: {
        Args: {
          p_ids: string[]
          p_new_organization_id: string
          p_organization_id: string
        }
        Returns: number
      }
      rpc_bulk_org_service: {
        Args: {
          p_ids: string[]
          p_new_org_id: string
          p_organization_id: string
        }
        Returns: number
      }
      rpc_bulk_restore_brand: {
        Args: { p_ids: string[]; p_organization_id: string }
        Returns: number
      }
      rpc_bulk_restore_bundle: {
        Args: { p_ids: string[]; p_organization_id: string }
        Returns: number
      }
      rpc_bulk_restore_product: {
        Args: { p_ids: string[]; p_organization_id: string }
        Returns: number
      }
      rpc_bulk_restore_product_attribute: {
        Args: { p_ids: string[]; p_organization_id: string }
        Returns: number
      }
      rpc_bulk_restore_product_category: {
        Args: { p_ids: string[]; p_organization_id: string }
        Returns: number
      }
      rpc_bulk_status_brand: {
        Args: {
          p_ids: string[]
          p_is_active: boolean
          p_organization_id: string
        }
        Returns: number
      }
      rpc_bulk_status_bundle: {
        Args: {
          p_ids: string[]
          p_is_active: boolean
          p_organization_id: string
          p_status: string
        }
        Returns: number
      }
      rpc_bulk_status_product: {
        Args: {
          p_ids: string[]
          p_is_active: boolean
          p_organization_id: string
        }
        Returns: number
      }
      rpc_bulk_status_product_category: {
        Args: {
          p_ids: string[]
          p_is_active: boolean
          p_organization_id: string
        }
        Returns: number
      }
      rpc_bulk_status_quote:
        | {
            Args: {
              p_estado: string
              p_ids: string[]
              p_organization_id: string
            }
            Returns: number
          }
        | {
            Args: {
              p_estado: string
              p_ids: string[]
              p_lost_reason?: string
              p_organization_id: string
            }
            Returns: number
          }
      rpc_bulk_status_service: {
        Args: {
          p_ids: string[]
          p_is_active: boolean
          p_organization_id: string
        }
        Returns: number
      }
      rpc_client_contract_stats: {
        Args: {
          p_creator_ids?: string[]
          p_entity_ids?: string[]
          p_organization_id: string
          p_scope_org_ids?: string[]
          p_statuses?: string[]
        }
        Returns: Json
      }
      rpc_client_origin_distribution: {
        Args: {
          p_entity_ids?: string[]
          p_organization_id: string
          p_scope_org_ids?: string[]
        }
        Returns: Json
      }
      rpc_convert_lead_to_client: {
        Args: {
          p_campaign_id: string
          p_client_data: Json
          p_lead_id: string
          p_root_organization_id: string
          p_source_contact_id: string
        }
        Returns: {
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
          origin_campaign_id: string | null
          origin_source: string | null
          origin_source_id: string | null
          root_organization_id: string
          search_text: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
          tags: string[] | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "anew_clients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_convert_lead_to_contact: {
        Args: {
          p_campaign_id: string
          p_contact_data: Json
          p_lead_id: string
          p_root_organization_id: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "anew_contacts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_brand: {
        Args: {
          p_description: string
          p_logo_url: string
          p_name: string
          p_org_ids: string[]
          p_organization_id: string
          p_slug: string
          p_website: string
        }
        Returns: {
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
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
        SetofOptions: {
          from: "*"
          to: "brands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_bundle: {
        Args: {
          p_choice_groups?: Json
          p_components?: Json
          p_description: string
          p_discount_fixed: number
          p_discount_percent: number
          p_fixed_price: number
          p_name: string
          p_organization_id: string
          p_pricing_type: string
          p_sku: string
          p_status: string
          p_valid_from: string
          p_valid_to: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "bundles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_bundle_choice_group: {
        Args: { p_bundle_id: string; p_group: Json }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "bundle_choice_groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_client_contract: {
        Args: {
          p_client_id: string
          p_contract_body_html: string
          p_contract_template_id: string
          p_currency: string
          p_end_date: string
          p_entity_id: string
          p_final_body_html: string
          p_notes: string
          p_organization_id: string
          p_payment_terms: string
          p_prompt_values: Json
          p_proposal_id: string
          p_root_organization_id: string
          p_start_date: string
          p_total_value: number
        }
        Returns: string
      }
      rpc_create_client_manual: {
        Args: {
          p_address_city: string
          p_address_district: string
          p_address_floor: string
          p_address_number: string
          p_address_postal_code: string
          p_address_street: string
          p_client_type: string
          p_display_name?: string
          p_email?: string
          p_entity_id: string
          p_first_name?: string
          p_last_name?: string
          p_nif_encrypted?: string
          p_nif_hash?: string
          p_nif_tokens?: string[]
          p_organization_id: string
          p_phone?: string
          p_phone_country_code?: string
          p_root_organization_id: string
          p_status: string
          p_vat?: string
        }
        Returns: {
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
          origin_campaign_id: string | null
          origin_source: string | null
          origin_source_id: string | null
          root_organization_id: string
          search_text: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
          tags: string[] | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "anew_clients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_deal: {
        Args: {
          p_deal_data: Json
          p_items: Json
          p_lead_workflow_stage_id: string
          p_organization_id: string
          p_root_organization_id: string
        }
        Returns: {
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
          value_max: number | null
        }
        SetofOptions: {
          from: "*"
          to: "deals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_lead_duplicate_override: {
        Args: {
          p_assigned_to: string
          p_campaign_id: string
          p_email: string
          p_entity_created_here: boolean
          p_entity_id: string
          p_field_values: Json
          p_organization_id: string
          p_phone: string
          p_root_organization_id: string
          p_source: string
          p_source_id: string
        }
        Returns: {
          assigned_to: string | null
          became_contact_at: string | null
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
          entity_is_client: boolean | null
          field_values: Json
          id: string
          last_contact_at: string | null
          last_contact_by: string | null
          last_contact_result: string | null
          lead_district_id: string | null
          locale: string | null
          lost_reason: string | null
          needs_manual_scheduling: boolean
          notes: string | null
          organization_id: string
          origin: string | null
          origin_lead_id: string | null
          pipeline_dirty_at: string | null
          previous_status: string | null
          qualification_set_by: string | null
          qualification_type: string | null
          qualified_at: string | null
          raw_status: string | null
          root_organization_id: string
          scheduled_visit_id: string | null
          search_text: string | null
          source: string | null
          source_id: string | null
          source_note: string | null
          status: string | null
          tags: string[] | null
          updated_at: string
          workflow_stage_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "anew_leads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_lead_manual: {
        Args: {
          p_assigned_to: string
          p_campaign_id: string
          p_email: string
          p_entity_created_here: boolean
          p_entity_id: string
          p_field_values: Json
          p_organization_id: string
          p_phone: string
          p_root_organization_id: string
          p_source: string
          p_source_id: string
        }
        Returns: {
          assigned_to: string | null
          became_contact_at: string | null
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
          entity_is_client: boolean | null
          field_values: Json
          id: string
          last_contact_at: string | null
          last_contact_by: string | null
          last_contact_result: string | null
          lead_district_id: string | null
          locale: string | null
          lost_reason: string | null
          needs_manual_scheduling: boolean
          notes: string | null
          organization_id: string
          origin: string | null
          origin_lead_id: string | null
          pipeline_dirty_at: string | null
          previous_status: string | null
          qualification_set_by: string | null
          qualification_type: string | null
          qualified_at: string | null
          raw_status: string | null
          root_organization_id: string
          scheduled_visit_id: string | null
          search_text: string | null
          source: string | null
          source_id: string | null
          source_note: string | null
          status: string | null
          tags: string[] | null
          updated_at: string
          workflow_stage_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "anew_leads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_organization: {
        Args: {
          p_addresses: Json
          p_commercial_name: string
          p_country_code: string
          p_description: string
          p_is_fiscal: boolean
          p_name: string
          p_nif: string
          p_nif_encrypted?: string
          p_nif_hash?: string
          p_nif_tokens?: string[]
          p_parent_id: string
          p_phone: string
          p_sector: string
          p_status: string
          p_type: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          entity_id: string | null
          id: string
          is_fiscal: boolean | null
          is_work_org: boolean
          logo_url: string | null
          metadata: Json | null
          name: string
          phone: string | null
          sector: string | null
          status: string
          type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "anew_organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_organization_with_hierarchy: {
        Args: {
          p_addresses: Json
          p_commercial_name: string
          p_country_code: string
          p_current_org_id: string
          p_description: string
          p_hierarchy_type: string
          p_is_fiscal: boolean
          p_name: string
          p_nif: string
          p_nif_encrypted?: string
          p_nif_hash?: string
          p_nif_tokens?: string[]
          p_sector: string
          p_status: string
          p_type: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          entity_id: string | null
          id: string
          is_fiscal: boolean | null
          is_work_org: boolean
          logo_url: string | null
          metadata: Json | null
          name: string
          phone: string | null
          sector: string | null
          status: string
          type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "anew_organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_product: {
        Args: {
          p_all_org_ids: string[]
          p_attribute_values: Json
          p_barcode: string
          p_brand_id: string
          p_category_id: string
          p_description: string
          p_is_purchasable: boolean
          p_is_sellable: boolean
          p_manages_stock?: boolean
          p_name: string
          p_prices: Json
          p_primary_org_id: string
          p_sku: string
          p_status: string
          p_subcategory_id: string
          p_supplier_id: string
          p_uom_id: string
        }
        Returns: string
      }
      rpc_create_product_attribute: {
        Args: {
          p_code: string
          p_has_hex_color: boolean
          p_is_filterable: boolean
          p_is_measurement: boolean
          p_is_required: boolean
          p_is_variant_option: boolean
          p_label: string
          p_measurement_type: string
          p_organization_id: string
          p_price_per_unit: number
          p_pricing_dimension: string
          p_pricing_type: string
          p_pricing_unit: string
          p_sort_order: number
          p_unit: string
          p_value_type: string
        }
        Returns: {
          allowed_values: Json | null
          code: string
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
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
        SetofOptions: {
          from: "*"
          to: "product_attributes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_product_category: {
        Args: {
          p_description: string
          p_name: string
          p_org_ids: string[]
          p_parent_id: string
          p_path: string
          p_slug: string
          p_sort_order: number
        }
        Returns: {
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
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
        SetofOptions: {
          from: "*"
          to: "product_categories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_product_subcategory: {
        Args: {
          p_description: string
          p_name: string
          p_organization_id: string
          p_parent_id: string
          p_path: string
          p_slug: string
          p_sort_order: number
        }
        Returns: {
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
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
        SetofOptions: {
          from: "*"
          to: "product_categories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_proposal: {
        Args: {
          p_inline_quotes?: Json
          p_proposal_data: Json
          p_proposal_items?: Json
          p_quote_entity_id?: string
          p_selected_quote_ids?: string[]
        }
        Returns: {
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
          decided_published_at: string | null
          decided_snapshot: Json | null
          decided_snapshot_hash: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivered_at: string | null
          delivery_time_hours: number | null
          description: string | null
          document_url: string | null
          entity_id: string | null
          has_unpublished_changes: boolean
          id: string
          is_deleted: boolean | null
          last_viewed_at: string | null
          notes: string | null
          organization_id: string | null
          probability: number | null
          proposal_number: string | null
          public_link_enabled: boolean | null
          public_token: string | null
          published_at: string | null
          published_snapshot: Json | null
          published_snapshot_hash: string | null
          rejected_at: string | null
          rejection_notes: string | null
          rejection_reason: string | null
          rejection_reason_code: string | null
          rejection_reason_id: string | null
          request_date: string | null
          root_organization_id: string | null
          search_text: string | null
          sent_at: string | null
          signature_image: string | null
          stage_id: string | null
          status: string | null
          template_id: string | null
          template_snapshot: Json | null
          title: string
          tracking_token: string | null
          updated_at: string
          valid_until: string | null
          value: number
          value_sem_iva: number | null
          view_count: number | null
          viewed_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "proposals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_purchase_order: {
        Args: { p_items: Json; p_order: Json; p_organization_id: string }
        Returns: {
          business_unit_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          expected_delivery: string | null
          id: string
          notes: string | null
          order_date: string
          order_number: string
          organization_id: string
          source_id: string | null
          source_type: string | null
          status: string
          supplier_id: string | null
          total_value: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "purchase_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_role: {
        Args: {
          p_can_sign_contracts: boolean
          p_code: string
          p_description: string
          p_name: string
          p_organization_id: string
          p_permissions: string[]
        }
        Returns: {
          can_sign_contracts: boolean
          code: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          is_system: boolean | null
          name: string
          organization_id: string | null
          status: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "anew_roles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_schedule_item: {
        Args: {
          p_all_day?: boolean
          p_approval_status?: string
          p_assignee_resource_ids?: string[]
          p_board_id: string
          p_client_id?: string
          p_color?: string
          p_contact_id?: string
          p_deal_id?: string
          p_description?: string
          p_employee_id?: string
          p_end_datetime?: string
          p_location?: string
          p_location_lat?: number
          p_location_lng?: number
          p_metadata?: Json
          p_notes?: string
          p_organization_id: string
          p_origin?: Database["public"]["Enums"]["schedule_item_origin"]
          p_priority?: number
          p_start_datetime?: string
          p_status?: Database["public"]["Enums"]["schedule_item_status"]
          p_tags?: string[]
          p_time_off_type?: string
          p_title?: string
          p_user_id?: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "schedule_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_service: {
        Args: {
          p_category_id: string
          p_currency: string
          p_is_active: boolean
          p_long_desc: string
          p_name: string
          p_org_ids: string[]
          p_organization_id: string
          p_purchase: number
          p_retail: number
          p_service_type: string
          p_sku: string
          p_slug: string
          p_subcategory_id: string
          p_vat_rate: number
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "services"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_service_category: {
        Args: {
          p_description: string
          p_name: string
          p_organization_id: string
          p_slug: string
          p_sort_order: number
        }
        Returns: {
          created_at: string | null
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_deleted: boolean
          name: string
          organization_id: string | null
          parent_id: string | null
          path: string | null
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "service_categories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_create_service_subcategory: {
        Args: {
          p_description: string
          p_name: string
          p_parent_id: string
          p_path: string
          p_slug: string
          p_sort_order: number
        }
        Returns: {
          created_at: string | null
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_deleted: boolean
          name: string
          organization_id: string | null
          parent_id: string | null
          path: string | null
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "service_categories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_decrement_stock: {
        Args: {
          p_counterparty?: string
          p_document_number: string
          p_document_type: string
          p_notes?: string
          p_product_id: string
          p_qty: number
          p_warehouse_id: string
        }
        Returns: number
      }
      rpc_decrypt_vault_secret: {
        Args: { p_secret_id: string }
        Returns: string
      }
      rpc_delete_brand: {
        Args: { p_id: string; p_organization_id: string }
        Returns: undefined
      }
      rpc_delete_bundle: {
        Args: { p_id: string; p_organization_id: string }
        Returns: undefined
      }
      rpc_delete_bundle_choice_group: {
        Args: { p_bundle_id: string; p_group_id: string }
        Returns: undefined
      }
      rpc_delete_bundle_component: {
        Args: { p_bundle_id: string; p_id: string }
        Returns: undefined
      }
      rpc_delete_bundle_components: {
        Args: { p_bundle_id: string; p_ids: string[] }
        Returns: number
      }
      rpc_delete_item_supplier: { Args: { p_id: string }; Returns: undefined }
      rpc_delete_lead_workflow_automation: {
        Args: { p_id: string }
        Returns: undefined
      }
      rpc_delete_organization: {
        Args: { p_root_org_id: string }
        Returns: string[]
      }
      rpc_delete_product: {
        Args: { p_id: string; p_organization_id: string }
        Returns: undefined
      }
      rpc_delete_product_attribute: {
        Args: { p_id: string; p_organization_id: string }
        Returns: undefined
      }
      rpc_delete_product_category: {
        Args: { p_id: string; p_organization_id: string }
        Returns: undefined
      }
      rpc_delete_product_subcategory: {
        Args: { p_id: string; p_organization_id: string }
        Returns: undefined
      }
      rpc_delete_purchase_order: { Args: { p_id: string }; Returns: undefined }
      rpc_delete_role: { Args: { p_id: string }; Returns: undefined }
      rpc_delete_schedule_item: { Args: { p_id: string }; Returns: undefined }
      rpc_delete_service: { Args: { p_id: string }; Returns: undefined }
      rpc_delete_service_category: {
        Args: { p_id: string }
        Returns: undefined
      }
      rpc_delete_service_fee_type: {
        Args: { p_id: string }
        Returns: undefined
      }
      rpc_delete_stock: { Args: { p_id: string }; Returns: undefined }
      rpc_delete_supplier: { Args: { p_id: string }; Returns: undefined }
      rpc_delete_user: { Args: { p_user_id: string }; Returns: undefined }
      rpc_delete_warehouse: { Args: { p_id: string }; Returns: undefined }
      rpc_duplicate_deal: {
        Args: {
          p_organization_id: string
          p_source_deal_id: string
          p_target_stage_id: string
        }
        Returns: {
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
          value_max: number | null
        }
        SetofOptions: {
          from: "*"
          to: "deals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_duplicate_product_attribute: {
        Args: { p_id: string; p_organization_id: string }
        Returns: {
          allowed_values: Json | null
          code: string
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
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
        SetofOptions: {
          from: "*"
          to: "product_attributes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_duplicate_quote_insert: {
        Args: {
          p_actor_id: string
          p_fees: Json
          p_lines: Json
          p_quote: Json
          p_source: string
        }
        Returns: {
          accepted_at: string | null
          assigned_to: string | null
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
          lost_reason: string | null
          modelo_base: string
          moeda: string | null
          obra_endereco: string | null
          obra_notas: string | null
          organization_id: string | null
          proposal_id: string | null
          quote_number: string | null
          request_date: string | null
          root_organization_id: string | null
          search_text: string | null
          site_address_id: string | null
          subtotal: number | null
          template_id: string | null
          title: string | null
          total: number | null
          total_fees: number | null
          updated_at: string
          validade_dias: number | null
        }
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_finalize_user_profile: {
        Args: {
          p_actor_id: string
          p_auth_user_id: string
          p_custom_attributes: Json
          p_description: string
          p_email: string
          p_location: string
          p_name: string
          p_phone: string
          p_position: string
          p_status: string
          p_template_id: string
        }
        Returns: {
          auth_user_id: string | null
          avatar_url: string | null
          created_at: string
          created_by: string | null
          custom_attributes: Json | null
          deleted_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "anew_users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_finalize_user_profile_full: {
        Args: {
          p_actor_id: string
          p_additional_emails?: Json
          p_additional_phones?: Json
          p_addresses?: Json
          p_auth_user_id: string
          p_custom_attributes: Json
          p_description: string
          p_email: string
          p_fiscal?: Json
          p_location: string
          p_memberships?: Json
          p_name: string
          p_nif_encrypted?: string
          p_nif_hash?: string
          p_nif_tokens?: string[]
          p_phone: string
          p_position: string
          p_status: string
          p_template_id: string
        }
        Returns: {
          auth_user_id: string | null
          avatar_url: string | null
          created_at: string
          created_by: string | null
          custom_attributes: Json | null
          deleted_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "anew_users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_import_purchase_orders_csv: {
        Args: { p_orders: Json }
        Returns: number
      }
      rpc_import_service_csv: {
        Args: {
          p_category_id: string
          p_currency: string
          p_is_active: boolean
          p_long_desc: string
          p_name: string
          p_organization_id: string
          p_purchase: number
          p_retail: number
          p_service_type: string
          p_sku: string
          p_slug: string
          p_subcategory_id: string
          p_vat_rate: number
        }
        Returns: string
      }
      rpc_manage_attribute_option_group: {
        Args: {
          p_action: string
          p_attribute_id?: string
          p_description?: string
          p_display_name?: string
          p_group_id?: string
          p_hex_color?: string
          p_name?: string
          p_organization_id?: string
          p_sort_order?: number
          p_value_id?: string
          p_value_text?: string
          p_values?: Json
        }
        Returns: string
      }
      rpc_manage_attribute_organizations: {
        Args: { p_attribute_id: string; p_org_ids: string[] }
        Returns: number
      }
      rpc_manage_category_attribute_palette: {
        Args: {
          p_attribute_id: string
          p_base_group_id: string
          p_category_id: string
        }
        Returns: string
      }
      rpc_manage_contact_tag: {
        Args: {
          p_action: string
          p_color: string
          p_entity_id: string
          p_organization_id: string
          p_tag: string
          p_tag_id: string
        }
        Returns: Json
      }
      rpc_reassign_client_contract: {
        Args: { p_id: string; p_new_owner_id: string }
        Returns: string
      }
      rpc_receive_purchase_order: {
        Args: { p_purchase_order_id: string; p_warehouse_id: string }
        Returns: Json
      }
      rpc_receive_purchase_order_lines: {
        Args: {
          p_lines: Json
          p_purchase_order_id: string
          p_warehouse_id: string
        }
        Returns: Json
      }
      rpc_register_sale_stock_movement: {
        Args: {
          p_document_number: string
          p_organization_id?: string
          p_product_id: string
          p_quantity: number
          p_quote_line_id: string
          p_sale_source_id: string
          p_sale_source_type: string
          p_unit_cost_at_time?: number
          p_warehouse_id: string
        }
        Returns: Json
      }
      rpc_register_stock_entry: {
        Args: {
          p_counterparty?: string
          p_item_supplier_id: string
          p_notes?: string
          p_product_id: string
          p_qty: number
          p_unit_cost?: number
          p_warehouse_id: string
        }
        Returns: number
      }
      rpc_register_stock_loss: {
        Args: {
          p_notes?: string
          p_product_id: string
          p_qty: number
          p_reason: string
          p_warehouse_id: string
        }
        Returns: number
      }
      rpc_register_stock_transfer: {
        Args: {
          p_from_warehouse_id: string
          p_notes?: string
          p_product_id: string
          p_qty: number
          p_to_warehouse_id: string
        }
        Returns: Json
      }
      rpc_register_supplier_return: {
        Args: {
          p_item_supplier_id: string
          p_notes?: string
          p_product_id: string
          p_qty: number
          p_warehouse_id: string
        }
        Returns: number
      }
      rpc_resolve_form_submission: {
        Args: {
          p_action: string
          p_field_overrides?: Json
          p_submission_id: string
        }
        Returns: Json
      }
      rpc_restore_brand: {
        Args: { p_id: string; p_organization_id: string }
        Returns: undefined
      }
      rpc_restore_bundle: {
        Args: { p_id: string; p_organization_id: string }
        Returns: undefined
      }
      rpc_restore_item_supplier: { Args: { p_id: string }; Returns: undefined }
      rpc_restore_organization: {
        Args: { p_root_org_id: string }
        Returns: string[]
      }
      rpc_restore_product: {
        Args: { p_id: string; p_organization_id: string }
        Returns: undefined
      }
      rpc_restore_product_attribute: {
        Args: { p_id: string; p_organization_id: string }
        Returns: undefined
      }
      rpc_restore_product_category: {
        Args: { p_id: string; p_organization_id: string }
        Returns: undefined
      }
      rpc_restore_product_subcategory: {
        Args: { p_id: string; p_organization_id: string }
        Returns: undefined
      }
      rpc_restore_purchase_order: { Args: { p_id: string }; Returns: undefined }
      rpc_restore_role: { Args: { p_id: string }; Returns: undefined }
      rpc_restore_service: { Args: { p_id: string }; Returns: undefined }
      rpc_restore_service_category: {
        Args: { p_id: string }
        Returns: undefined
      }
      rpc_restore_service_fee_type: {
        Args: { p_id: string }
        Returns: undefined
      }
      rpc_restore_stock: { Args: { p_id: string }; Returns: undefined }
      rpc_restore_supplier: { Args: { p_id: string }; Returns: undefined }
      rpc_restore_user: { Args: { p_user_id: string }; Returns: undefined }
      rpc_restore_warehouse: { Args: { p_id: string }; Returns: undefined }
      rpc_save_lead_workflow_automation: {
        Args: {
          p_action_stage_id: string
          p_action_type: string
          p_description: string
          p_execution_order: number
          p_id: string
          p_is_active: boolean
          p_name: string
          p_organization_id: string
          p_relationship_field: string
          p_source_entity: string
          p_target_entity: string
          p_trigger_stage_id: string
          p_trigger_type: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "workflow_automation_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_save_lead_workflow_stages: {
        Args: { p_organization_id: string; p_stages: Json }
        Returns: {
          auto_advance: boolean
          color: string | null
          counts_as_converted: boolean
          counts_as_lost: boolean
          counts_as_negotiation: boolean
          counts_as_qualified: boolean
          created_at: string
          created_by: string
          default_status: string | null
          id: string
          is_active: boolean | null
          is_conversion: boolean | null
          is_final: boolean | null
          is_rejection: boolean | null
          label: string
          matching_statuses: string[] | null
          name: string
          organization_id: string | null
          qualification_hint: string | null
          reached_when: Json | null
          stage_order: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "lead_workflow_stages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_save_quote: {
        Args: {
          p_fees: Json
          p_inline_quotes?: Json
          p_lines: Json
          p_quote_data: Json
          p_quote_id: string
          p_totals: Json
        }
        Returns: {
          accepted_at: string | null
          assigned_to: string | null
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
          lost_reason: string | null
          modelo_base: string
          moeda: string | null
          obra_endereco: string | null
          obra_notas: string | null
          organization_id: string | null
          proposal_id: string | null
          quote_number: string | null
          request_date: string | null
          root_organization_id: string | null
          search_text: string | null
          site_address_id: string | null
          subtotal: number | null
          template_id: string | null
          title: string | null
          total: number | null
          total_fees: number | null
          updated_at: string
          validade_dias: number | null
        }
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_schedule_client_meeting: {
        Args: {
          p_channel: string
          p_entity_id: string
          p_notes: string
          p_organization_id: string
          p_root_organization_id: string
          p_scheduled_at: string
          p_subject: string
        }
        Returns: {
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
          proposal_id: string | null
          result: string | null
          root_organization_id: string | null
          sentiment: string | null
          subject: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "entity_interactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_toggle_client_vip: {
        Args: {
          p_client_id: string
          p_is_vip: boolean
          p_organization_id: string
        }
        Returns: {
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
          origin_campaign_id: string | null
          origin_source: string | null
          origin_source_id: string | null
          root_organization_id: string
          search_text: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
          tags: string[] | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "anew_clients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_brand: {
        Args: {
          p_description: string
          p_id: string
          p_logo_url: string
          p_name: string
          p_org_ids: string[]
          p_organization_id: string
          p_slug: string
          p_website: string
        }
        Returns: {
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
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
        SetofOptions: {
          from: "*"
          to: "brands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_bundle: {
        Args: {
          p_description: string
          p_discount_fixed: number
          p_discount_percent: number
          p_fixed_price: number
          p_id: string
          p_name: string
          p_organization_id: string
          p_pricing_type: string
          p_sku: string
          p_status: string
          p_valid_from: string
          p_valid_to: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "bundles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_bundle_component: {
        Args: { p_bundle_id: string; p_id: string; p_updates: Json }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "bundle_components"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_client: {
        Args: {
          p_address_city?: string
          p_address_number?: string
          p_address_postal_code?: string
          p_address_street?: string
          p_assigned_to: string
          p_clear_nif?: boolean
          p_client_id: string
          p_display_name: string
          p_email: string
          p_entity_id: string
          p_nif_encrypted?: string
          p_nif_hash?: string
          p_nif_tokens?: string[]
          p_norm_first: string
          p_norm_last: string
          p_notes: string
          p_phone: string
          p_phone_country: string
          p_status: string
          p_vat: string
        }
        Returns: {
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
          origin_campaign_id: string | null
          origin_source: string | null
          origin_source_id: string | null
          root_organization_id: string
          search_text: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
          tags: string[] | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "anew_clients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_client_contract: {
        Args: {
          p_contract_template_id: string
          p_end_date: string
          p_id: string
          p_notes: string
          p_payment_terms: string
          p_prompt_values: Json
          p_start_date: string
        }
        Returns: string
      }
      rpc_update_client_contract_status: {
        Args: { p_id: string; p_status: string }
        Returns: string
      }
      rpc_update_contact: {
        Args: {
          p_address: string
          p_assigned_to: string
          p_city: string
          p_contact_id: string
          p_display_name: string
          p_email: string
          p_entity_id: string
          p_entity_type: string
          p_nif_encrypted?: string
          p_nif_hash?: string
          p_nif_tokens?: string[]
          p_norm_first: string
          p_norm_last: string
          p_notes: string
          p_organization_id: string
          p_phone: string
          p_phone_country: string
          p_position: string
          p_postal_code: string
          p_status: string
          p_vat: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "anew_contacts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_deal: {
        Args: {
          p_deal_data: Json
          p_deal_id: string
          p_items: Json
          p_organization_id: string
        }
        Returns: {
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
          value_max: number | null
        }
        SetofOptions: {
          from: "*"
          to: "deals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_deal_needs: {
        Args: {
          p_deal_id: string
          p_items: Json
          p_need_data: Json
          p_need_id: string
          p_update_need_columns?: boolean
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "deal_needs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_deal_stage: {
        Args: {
          p_deal_id: string
          p_lost_reason?: string
          p_new_stage_id: string
          p_organization_id: string
        }
        Returns: {
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
          value_max: number | null
        }
        SetofOptions: {
          from: "*"
          to: "deals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_lead: {
        Args: {
          p_assigned_to: string
          p_display_name: string
          p_field_values: Json
          p_first_name: string
          p_last_name: string
          p_lead_id: string
          p_lost_reason?: string
          p_notes: string
          p_qualification_changed?: boolean
          p_qualification_type?: string
          p_source: string
          p_status: string
          p_status_changed: boolean
          p_workflow_stage_id: string
        }
        Returns: {
          assigned_to: string | null
          became_contact_at: string | null
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
          entity_is_client: boolean | null
          field_values: Json
          id: string
          last_contact_at: string | null
          last_contact_by: string | null
          last_contact_result: string | null
          lead_district_id: string | null
          locale: string | null
          lost_reason: string | null
          needs_manual_scheduling: boolean
          notes: string | null
          organization_id: string
          origin: string | null
          origin_lead_id: string | null
          pipeline_dirty_at: string | null
          previous_status: string | null
          qualification_set_by: string | null
          qualification_type: string | null
          qualified_at: string | null
          raw_status: string | null
          root_organization_id: string
          scheduled_visit_id: string | null
          search_text: string | null
          source: string | null
          source_id: string | null
          source_note: string | null
          status: string | null
          tags: string[] | null
          updated_at: string
          workflow_stage_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "anew_leads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_organization: {
        Args: {
          p_addresses: Json
          p_commercial_name: string
          p_country_code: string
          p_description: string
          p_id: string
          p_is_fiscal: boolean
          p_name: string
          p_nif: string
          p_nif_encrypted?: string
          p_nif_hash?: string
          p_nif_tokens?: string[]
          p_parent_id: string
          p_phone: string
          p_sector: string
          p_status: string
          p_type: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          entity_id: string | null
          id: string
          is_fiscal: boolean | null
          is_work_org: boolean
          logo_url: string | null
          metadata: Json | null
          name: string
          phone: string | null
          sector: string | null
          status: string
          type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "anew_organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_product: {
        Args: {
          p_active_org_id: string
          p_all_org_ids: string[]
          p_attribute_ids: string[]
          p_attribute_values: Json
          p_barcode: string
          p_brand_id: string
          p_category_id: string
          p_description: string
          p_id: string
          p_is_purchasable: boolean
          p_is_sellable: boolean
          p_manages_stock?: boolean
          p_name: string
          p_prices: Json
          p_primary_org_id: string
          p_sku: string
          p_status: string
          p_subcategory_id: string
          p_supplier_id: string
          p_uom_id: string
        }
        Returns: string
      }
      rpc_update_product_attribute: {
        Args: {
          p_active_org_id: string
          p_has_hex_color: boolean
          p_id: string
          p_is_filterable: boolean
          p_is_measurement: boolean
          p_is_required: boolean
          p_is_variant_option: boolean
          p_label: string
          p_measurement_type: string
          p_organization_id: string
          p_price_per_unit: number
          p_pricing_dimension: string
          p_pricing_type: string
          p_pricing_unit: string
          p_sort_order: number
          p_unit: string
          p_value_type: string
        }
        Returns: {
          allowed_values: Json | null
          code: string
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
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
        SetofOptions: {
          from: "*"
          to: "product_attributes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_product_category: {
        Args: {
          p_description: string
          p_id: string
          p_name: string
          p_org_ids: string[]
          p_sort_order: number
        }
        Returns: {
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
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
        SetofOptions: {
          from: "*"
          to: "product_categories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_product_subcategory: {
        Args: {
          p_description: string
          p_id: string
          p_name: string
          p_organization_id: string
          p_parent_id: string
          p_sort_order: number
        }
        Returns: {
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
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
        SetofOptions: {
          from: "*"
          to: "product_categories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_proposal: {
        Args: {
          p_id: string
          p_inline_quotes?: Json
          p_proposal_data: Json
          p_proposal_items?: Json
          p_quote_entity_id?: string
          p_selected_quote_ids?: string[]
        }
        Returns: {
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
          decided_published_at: string | null
          decided_snapshot: Json | null
          decided_snapshot_hash: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivered_at: string | null
          delivery_time_hours: number | null
          description: string | null
          document_url: string | null
          entity_id: string | null
          has_unpublished_changes: boolean
          id: string
          is_deleted: boolean | null
          last_viewed_at: string | null
          notes: string | null
          organization_id: string | null
          probability: number | null
          proposal_number: string | null
          public_link_enabled: boolean | null
          public_token: string | null
          published_at: string | null
          published_snapshot: Json | null
          published_snapshot_hash: string | null
          rejected_at: string | null
          rejection_notes: string | null
          rejection_reason: string | null
          rejection_reason_code: string | null
          rejection_reason_id: string | null
          request_date: string | null
          root_organization_id: string | null
          search_text: string | null
          sent_at: string | null
          signature_image: string | null
          stage_id: string | null
          status: string | null
          template_id: string | null
          template_snapshot: Json | null
          title: string
          tracking_token: string | null
          updated_at: string
          valid_until: string | null
          value: number
          value_sem_iva: number | null
          view_count: number | null
          viewed_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "proposals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_purchase_order: {
        Args: { p_items: Json; p_order: Json; p_purchase_order_id: string }
        Returns: {
          business_unit_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          expected_delivery: string | null
          id: string
          notes: string | null
          order_date: string
          order_number: string
          organization_id: string
          source_id: string | null
          source_type: string | null
          status: string
          supplier_id: string | null
          total_value: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "purchase_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_role: {
        Args: {
          p_can_sign_contracts: boolean
          p_code: string
          p_description: string
          p_id: string
          p_name: string
          p_permissions: string[]
        }
        Returns: {
          can_sign_contracts: boolean
          code: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          is_system: boolean | null
          name: string
          organization_id: string | null
          status: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "anew_roles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_schedule_item: {
        Args: {
          p_approval_status?: string
          p_approved_at?: string
          p_approved_by?: string
          p_board_id?: string
          p_client_id?: string
          p_contact_id?: string
          p_description?: string
          p_employee_id?: string
          p_end_datetime?: string
          p_id: string
          p_location?: string
          p_metadata?: Json
          p_notes?: string
          p_organization_id?: string
          p_origin?: Database["public"]["Enums"]["schedule_item_origin"]
          p_set_approval_status?: boolean
          p_set_approved_at?: boolean
          p_set_approved_by?: boolean
          p_set_board_id?: boolean
          p_set_client_id?: boolean
          p_set_contact_id?: boolean
          p_set_description?: boolean
          p_set_employee_id?: boolean
          p_set_end_datetime?: boolean
          p_set_location?: boolean
          p_set_metadata?: boolean
          p_set_notes?: boolean
          p_set_organization_id?: boolean
          p_set_origin?: boolean
          p_set_start_datetime?: boolean
          p_set_status?: boolean
          p_set_time_off_type?: boolean
          p_set_title?: boolean
          p_set_user_id?: boolean
          p_start_datetime?: string
          p_status?: Database["public"]["Enums"]["schedule_item_status"]
          p_time_off_type?: string
          p_title?: string
          p_user_id?: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "schedule_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_schedule_item_assignees: {
        Args: { p_item_id: string; p_resource_ids?: string[] }
        Returns: undefined
      }
      rpc_update_service: {
        Args: {
          p_category_id: string
          p_currency: string
          p_id: string
          p_is_active: boolean
          p_long_desc: string
          p_name: string
          p_org_ids: string[]
          p_organization_id: string
          p_purchase: number
          p_retail: number
          p_service_type: string
          p_sku: string
          p_slug: string
          p_subcategory_id: string
          p_touch_orgs: boolean
          p_touch_prices: boolean
          p_vat_rate: number
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "services"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_service_category: {
        Args: {
          p_description: string
          p_id: string
          p_name: string
          p_organization_id: string
          p_sort_order: number
        }
        Returns: {
          created_at: string | null
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_deleted: boolean
          name: string
          organization_id: string | null
          parent_id: string | null
          path: string | null
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "service_categories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_service_subcategory: {
        Args: {
          p_description: string
          p_id: string
          p_name: string
          p_parent_id: string
          p_path: string
          p_slug: string
          p_sort_order: number
        }
        Returns: {
          created_at: string | null
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_deleted: boolean
          name: string
          organization_id: string | null
          parent_id: string | null
          path: string | null
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "service_categories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_update_user: {
        Args: {
          p_addresses: Json
          p_custom_attributes: Json
          p_description: string
          p_email: string
          p_emails: Json
          p_entity_id: string
          p_existing_membership_ids: string[]
          p_fiscal: Json
          p_location: string
          p_memberships: Json
          p_name: string
          p_nif_encrypted?: string
          p_nif_hash?: string
          p_nif_tokens?: string[]
          p_pending_scopes: Json
          p_phone: string
          p_phones: Json
          p_position: string
          p_status: string
          p_template_id: string
          p_user_id: string
        }
        Returns: {
          auth_user_id: string | null
          avatar_url: string | null
          created_at: string
          created_by: string | null
          custom_attributes: Json | null
          deleted_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "anew_users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_upsert_inventory_settings: {
        Args: {
          p_default_warehouse_id: string
          p_organization_id: string
          p_stock_deduction_trigger: string
        }
        Returns: {
          created_at: string
          created_by: string
          default_warehouse_id: string | null
          organization_id: string
          stock_deduction_trigger: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_inventory_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_upsert_org_smtp_settings: {
        Args: {
          p_daily_limit: number
          p_encryption: string
          p_from_email: string
          p_from_name: string
          p_id: string
          p_is_default: boolean
          p_name: string
          p_organization_id: string
          p_smtp_host: string
          p_smtp_password: string
          p_smtp_port: number
          p_smtp_secure: boolean
          p_smtp_username: string
        }
        Returns: {
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
          smtp_password_secret_id: string
          smtp_port: number
          smtp_secure: boolean
          smtp_username: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_smtp_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_upsert_signup_profile: {
        Args: {
          p_company_name?: string
          p_employee_count_range?: string
          p_industry?: string
          p_job_title?: string
          p_signup_source?: string
        }
        Returns: {
          company_name: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          employee_count_range: string | null
          id: string
          industry: string | null
          job_title: string | null
          signup_source: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "signup_profile"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_upsert_user_smtp_settings: {
        Args: {
          p_daily_limit: number
          p_encryption: string
          p_from_email: string
          p_from_name: string
          p_id: string
          p_is_default: boolean
          p_name: string
          p_organization_id: string
          p_reply_to: string
          p_smtp_host: string
          p_smtp_password: string
          p_smtp_port: number
          p_smtp_secure: boolean
          p_smtp_username: string
        }
        Returns: {
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
          smtp_password_secret_id: string
          smtp_port: number
          smtp_secure: boolean | null
          smtp_username: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_smtp_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      schedule_item_assigned_to_owners: {
        Args: { p_item_id: string; p_owner_ids: string[] }
        Returns: boolean
      }
      schedule_resource_is_current_user: {
        Args: { p_resource_user_id: string }
        Returns: boolean
      }
      search_entity_ids_by_word: {
        Args: { p_word: string }
        Returns: {
          entity_id: string
        }[]
      }
      search_lead_entities: {
        Args: { p_limit?: number; p_org_ids: string[]; p_search: string }
        Returns: {
          entity_id: string
        }[]
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
        Args: { p_source: string; p_user_id: string }
        Returns: undefined
      }
      set_organization_work_scope: {
        Args: { is_work_org: boolean; organization_id: string }
        Returns: Json
      }
      simulate_lead_v2_bucket_changes: {
        Args: { p_org: string; p_qual?: Json; p_stages: Json }
        Returns: Json
      }
      simulate_lead_workflow_stage_rules: {
        Args: {
          p_auto_advance: boolean
          p_counts_as_converted: boolean
          p_counts_as_lost: boolean
          p_counts_as_negotiation: boolean
          p_counts_as_qualified: boolean
          p_matching_statuses: string[]
          p_org_id: string
          p_qualification_hint: string
          p_reached_when: Json
          p_stage_id: string
        }
        Returns: Json
      }
      soft_delete_business_entity: {
        Args: { p_actor_id?: string; p_id: string; p_kind: string }
        Returns: boolean
      }
      soft_delete_entity_facet: {
        Args: { p_id: string; p_kind: string }
        Returns: boolean
      }
      stage_reached: {
        Args: {
          p_lead_status: string
          p_matching: string[]
          p_rule: Json
          p_signals: Json
        }
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
      sync_entity_primary_address: {
        Args: {
          p_city?: string
          p_created_by?: string
          p_district?: string
          p_entity_id: string
          p_organization_id: string
          p_postal_code: string
          p_street: string
        }
        Returns: {
          address_id: string
          decision: string
        }[]
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
      upsert_form_submission: {
        Args: {
          p_campaign_id: string
          p_current_step: number
          p_entity_id: string
          p_field_values: Json
          p_form_id: string
          p_is_complete: boolean
          p_organization_id: string
          p_root_organization_id: string
          p_status: string
          p_target_id: string
          p_target_type: string
          p_total_steps: number
        }
        Returns: string
      }
      user_has_active_membership: {
        Args: { _auth_uid: string }
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
  graphql_public: {
    Enums: {},
  },
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
