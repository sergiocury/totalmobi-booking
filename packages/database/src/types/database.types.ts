/**
 * Tipos do schema `booking`.
 *
 * ⚠️ FICHEIRO GERADO — não editar à mão.
 *
 *     npm run db:types:remote    (produção, precisa de SUPABASE_ACCESS_TOKEN)
 *     npm run db:types           (base local, quando existir)
 *
 * Os aliases de linha (`ServiceRow`, `StaffRow`…) vivem em `rows.ts`, FORA
 * deste ficheiro — senão desapareciam na geração seguinte.
 *
 * O gerador emite `type` e não `interface`: uma `interface` não é atribuível a
 * `Record<string, unknown>`, o cliente resolveria `Schema` para `never`, e
 * todos os `.select()` do projeto passariam a devolver `never` sem uma única
 * mensagem que apontasse para a causa.
 */

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
    PostgrestVersion: "14.1"
  }
  booking: {
    Tables: {
      access_tokens: {
        Row: {
          booking_id: string | null
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          max_uses: number
          purpose: string
          tenant_id: string
          token_hash: string
          used_at: string | null
          uses: number
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          customer_id: string
          expires_at: string
          id?: string
          max_uses?: number
          purpose: string
          tenant_id: string
          token_hash: string
          used_at?: string | null
          uses?: number
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          max_uses?: number
          purpose?: string
          tenant_id?: string
          token_hash?: string
          used_at?: string | null
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "access_tokens_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_tokens_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_label: string | null
          actor_type: Database["booking"]["Enums"]["actor_type"]
          actor_user_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          ip: unknown
          new_values: Json | null
          old_values: Json | null
          request_id: string | null
          source: string | null
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_label?: string | null
          actor_type: Database["booking"]["Enums"]["actor_type"]
          actor_user_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: never
          ip?: unknown
          new_values?: Json | null
          old_values?: Json | null
          request_id?: string | null
          source?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_label?: string | null
          actor_type?: Database["booking"]["Enums"]["actor_type"]
          actor_user_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: never
          ip?: unknown
          new_values?: Json | null
          old_values?: Json | null
          request_id?: string | null
          source?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_events: {
        Row: {
          actor_type: Database["booking"]["Enums"]["actor_type"]
          actor_user_id: string | null
          booking_id: string
          created_at: string
          from_status: Database["booking"]["Enums"]["booking_status"] | null
          id: string
          metadata: Json
          reason: string | null
          tenant_id: string
          to_status: Database["booking"]["Enums"]["booking_status"]
        }
        Insert: {
          actor_type: Database["booking"]["Enums"]["actor_type"]
          actor_user_id?: string | null
          booking_id: string
          created_at?: string
          from_status?: Database["booking"]["Enums"]["booking_status"] | null
          id?: string
          metadata?: Json
          reason?: string | null
          tenant_id: string
          to_status: Database["booking"]["Enums"]["booking_status"]
        }
        Update: {
          actor_type?: Database["booking"]["Enums"]["actor_type"]
          actor_user_id?: string | null
          booking_id?: string
          created_at?: string
          from_status?: Database["booking"]["Enums"]["booking_status"] | null
          id?: string
          metadata?: Json
          reason?: string | null
          tenant_id?: string
          to_status?: Database["booking"]["Enums"]["booking_status"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          blocked_range: unknown
          buffer_after_minutes: number
          buffer_before_minutes: number
          cancellation_reason: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_id: string
          end_at: string
          external_reference: string | null
          group_session_id: string | null
          id: string
          idempotency_key: string | null
          internal_notes: string | null
          location_id: string
          no_show_at: string | null
          notes: string | null
          occupies_slot: boolean | null
          price: number | null
          rescheduled_from_id: string | null
          service_id: string
          source: Database["booking"]["Enums"]["booking_source"]
          staff_id: string | null
          start_at: string
          status: Database["booking"]["Enums"]["booking_status"]
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          blocked_range: unknown
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          checked_in_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id: string
          end_at: string
          external_reference?: string | null
          group_session_id?: string | null
          id?: string
          idempotency_key?: string | null
          internal_notes?: string | null
          location_id: string
          no_show_at?: string | null
          notes?: string | null
          occupies_slot?: boolean | null
          price?: number | null
          rescheduled_from_id?: string | null
          service_id: string
          source: Database["booking"]["Enums"]["booking_source"]
          staff_id?: string | null
          start_at: string
          status?: Database["booking"]["Enums"]["booking_status"]
          tenant_id: string
          timezone: string
          updated_at?: string
        }
        Update: {
          blocked_range?: unknown
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          checked_in_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string
          end_at?: string
          external_reference?: string | null
          group_session_id?: string | null
          id?: string
          idempotency_key?: string | null
          internal_notes?: string | null
          location_id?: string
          no_show_at?: string | null
          notes?: string | null
          occupies_slot?: boolean | null
          price?: number | null
          rescheduled_from_id?: string | null
          service_id?: string
          source?: Database["booking"]["Enums"]["booking_source"]
          staff_id?: string | null
          start_at?: string
          status?: Database["booking"]["Enums"]["booking_status"]
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_group_session_id_fkey"
            columns: ["group_session_id"]
            isOneToOne: false
            referencedRelation: "group_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_rescheduled_from_id_fkey"
            columns: ["rescheduled_from_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          ai_intent: Json | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          direction: Database["booking"]["Enums"]["message_direction"]
          error: string | null
          failed_at: string | null
          id: string
          provider_message_id: string | null
          read_at: string | null
          sent_at: string | null
          status: string | null
          structured_payload: Json | null
          text: string | null
          type: string
        }
        Insert: {
          ai_intent?: Json | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          direction: Database["booking"]["Enums"]["message_direction"]
          error?: string | null
          failed_at?: string | null
          id?: string
          provider_message_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
          structured_payload?: Json | null
          text?: string | null
          type?: string
        }
        Update: {
          ai_intent?: Json | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: Database["booking"]["Enums"]["message_direction"]
          error?: string | null
          failed_at?: string | null
          id?: string
          provider_message_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
          structured_payload?: Json | null
          text?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_user_id: string | null
          bot_paused_until: string | null
          channel: Database["booking"]["Enums"]["conversation_channel"]
          context: Json
          created_at: string
          current_state: Database["booking"]["Enums"]["conversation_state"]
          customer_id: string | null
          external_id: string
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          bot_paused_until?: string | null
          channel: Database["booking"]["Enums"]["conversation_channel"]
          context?: Json
          created_at?: string
          current_state?: Database["booking"]["Enums"]["conversation_state"]
          customer_id?: string | null
          external_id: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          bot_paused_until?: string | null
          channel?: Database["booking"]["Enums"]["conversation_channel"]
          context?: Json
          created_at?: string
          current_state?: Database["booking"]["Enums"]["conversation_state"]
          customer_id?: string | null
          external_id?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_consents: {
        Row: {
          created_at: string
          customer_id: string
          evidence: Json
          granted: boolean
          granted_at: string
          id: string
          ip: unknown
          purpose: Database["booking"]["Enums"]["consent_purpose"]
          revoked_at: string | null
          source: Database["booking"]["Enums"]["booking_source"]
        }
        Insert: {
          created_at?: string
          customer_id: string
          evidence?: Json
          granted: boolean
          granted_at?: string
          id?: string
          ip?: unknown
          purpose: Database["booking"]["Enums"]["consent_purpose"]
          revoked_at?: string | null
          source: Database["booking"]["Enums"]["booking_source"]
        }
        Update: {
          created_at?: string
          customer_id?: string
          evidence?: Json
          granted?: boolean
          granted_at?: string
          id?: string
          ip?: unknown
          purpose?: Database["booking"]["Enums"]["consent_purpose"]
          revoked_at?: string | null
          source?: Database["booking"]["Enums"]["booking_source"]
        }
        Relationships: [
          {
            foreignKeyName: "customer_consents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          anonymized_at: string | null
          birth_date: string | null
          blocked_reason: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          is_blocked: boolean
          last_name: string | null
          locale: string | null
          notes: string | null
          phone_e164: string | null
          tags: string[]
          tenant_id: string
          timezone: string | null
          updated_at: string
          whatsapp_phone_e164: string | null
        }
        Insert: {
          anonymized_at?: string | null
          birth_date?: string | null
          blocked_reason?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          is_blocked?: boolean
          last_name?: string | null
          locale?: string | null
          notes?: string | null
          phone_e164?: string | null
          tags?: string[]
          tenant_id: string
          timezone?: string | null
          updated_at?: string
          whatsapp_phone_e164?: string | null
        }
        Update: {
          anonymized_at?: string | null
          birth_date?: string | null
          blocked_reason?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          is_blocked?: boolean
          last_name?: string | null
          locale?: string | null
          notes?: string | null
          phone_e164?: string | null
          tags?: string[]
          tenant_id?: string
          timezone?: string | null
          updated_at?: string
          whatsapp_phone_e164?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      features: {
        Row: {
          created_at: string
          description: string | null
          key: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          name?: string
        }
        Relationships: []
      }
      group_sessions: {
        Row: {
          blocked_range: unknown
          booked_count: number
          capacity: number
          created_at: string
          end_at: string
          id: string
          is_cancelled: boolean
          location_id: string
          service_id: string
          staff_id: string | null
          start_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          blocked_range: unknown
          booked_count?: number
          capacity: number
          created_at?: string
          end_at: string
          id?: string
          is_cancelled?: boolean
          location_id: string
          service_id: string
          staff_id?: string | null
          start_at: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          blocked_range?: unknown
          booked_count?: number
          capacity?: number
          created_at?: string
          end_at?: string
          id?: string
          is_cancelled?: boolean
          location_id?: string
          service_id?: string
          staff_id?: string | null
          start_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_sessions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_sessions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      location_business_hours: {
        Row: {
          closes_at: string
          created_at: string
          id: string
          location_id: string
          opens_at: string
          updated_at: string
          weekday: number
        }
        Insert: {
          closes_at: string
          created_at?: string
          id?: string
          location_id: string
          opens_at: string
          updated_at?: string
          weekday: number
        }
        Update: {
          closes_at?: string
          created_at?: string
          id?: string
          location_id?: string
          opens_at?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "location_business_hours_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          archived_at: string | null
          city: string | null
          country_code: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          is_default: boolean
          latitude: number | null
          longitude: number | null
          name: string
          phone_e164: string | null
          postal_code: string | null
          slug: string
          sort_order: number
          tenant_id: string
          timezone: string
          updated_at: string
          whatsapp_phone_e164: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          archived_at?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          phone_e164?: string | null
          postal_code?: string | null
          slug: string
          sort_order?: number
          tenant_id: string
          timezone: string
          updated_at?: string
          whatsapp_phone_e164?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          archived_at?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone_e164?: string | null
          postal_code?: string | null
          slug?: string
          sort_order?: number
          tenant_id?: string
          timezone?: string
          updated_at?: string
          whatsapp_phone_e164?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          accepted_at: string | null
          archived_at: string | null
          created_at: string
          id: string
          invited_at: string
          invited_by: string | null
          location_ids: string[]
          role: Database["booking"]["Enums"]["member_role"]
          staff_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          archived_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          location_ids?: string[]
          role: Database["booking"]["Enums"]["member_role"]
          staff_id?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          archived_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          location_ids?: string[]
          role?: Database["booking"]["Enums"]["member_role"]
          staff_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_staff_fk"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_jobs: {
        Row: {
          attempts: number
          booking_id: string | null
          channel: Database["booking"]["Enums"]["notification_channel"]
          created_at: string
          customer_id: string | null
          error: string | null
          id: string
          last_attempt_at: string | null
          locked_at: string | null
          locked_by: string | null
          payload: Json
          provider_message_id: string | null
          scheduled_for: string
          sent_at: string | null
          status: Database["booking"]["Enums"]["notification_status"]
          tenant_id: string
          type: Database["booking"]["Enums"]["notification_type"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          booking_id?: string | null
          channel: Database["booking"]["Enums"]["notification_channel"]
          created_at?: string
          customer_id?: string | null
          error?: string | null
          id?: string
          last_attempt_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload?: Json
          provider_message_id?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: Database["booking"]["Enums"]["notification_status"]
          tenant_id: string
          type: Database["booking"]["Enums"]["notification_type"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          booking_id?: string | null
          channel?: Database["booking"]["Enums"]["notification_channel"]
          created_at?: string
          customer_id?: string | null
          error?: string | null
          id?: string
          last_attempt_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload?: Json
          provider_message_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["booking"]["Enums"]["notification_status"]
          tenant_id?: string
          type?: Database["booking"]["Enums"]["notification_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_jobs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_rules: {
        Row: {
          channel: Database["booking"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          is_active: boolean
          offset_minutes: number
          target: Database["booking"]["Enums"]["notification_rule_target"]
          tenant_id: string
          type: Database["booking"]["Enums"]["notification_type"]
          updated_at: string
        }
        Insert: {
          channel: Database["booking"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          is_active?: boolean
          offset_minutes?: number
          target?: Database["booking"]["Enums"]["notification_rule_target"]
          tenant_id: string
          type: Database["booking"]["Enums"]["notification_type"]
          updated_at?: string
        }
        Update: {
          channel?: Database["booking"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          is_active?: boolean
          offset_minutes?: number
          target?: Database["booking"]["Enums"]["notification_rule_target"]
          tenant_id?: string
          type?: Database["booking"]["Enums"]["notification_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body: string
          channel: Database["booking"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          is_active: boolean
          locale: string
          provider_status: string | null
          provider_template_name: string | null
          subject: string | null
          tenant_id: string | null
          type: Database["booking"]["Enums"]["notification_type"]
          updated_at: string
        }
        Insert: {
          body: string
          channel: Database["booking"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          is_active?: boolean
          locale?: string
          provider_status?: string | null
          provider_template_name?: string | null
          subject?: string | null
          tenant_id?: string | null
          type: Database["booking"]["Enums"]["notification_type"]
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: Database["booking"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          is_active?: boolean
          locale?: string
          provider_status?: string | null
          provider_template_name?: string | null
          subject?: string | null
          tenant_id?: string | null
          type?: Database["booking"]["Enums"]["notification_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          feature_key: string
          plan_code: string
        }
        Insert: {
          feature_key: string
          plan_code: string
        }
        Update: {
          feature_key?: string
          plan_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "plan_features_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
        ]
      }
      plans: {
        Row: {
          annual_price: number | null
          code: string
          created_at: string
          currency: string
          description: string | null
          is_public: boolean
          monthly_price: number
          name: string
          sort_order: number
          stripe_annual_price_id: string | null
          stripe_monthly_price_id: string | null
          updated_at: string
        }
        Insert: {
          annual_price?: number | null
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          is_public?: boolean
          monthly_price?: number
          name: string
          sort_order?: number
          stripe_annual_price_id?: string | null
          stripe_monthly_price_id?: string | null
          updated_at?: string
        }
        Update: {
          annual_price?: number | null
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          is_public?: boolean
          monthly_price?: number
          name?: string
          sort_order?: number
          stripe_annual_price_id?: string | null
          stripe_monthly_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          can_impersonate: boolean
          created_at: string
          created_by: string | null
          email: string
          full_name: string | null
          user_id: string
        }
        Insert: {
          can_impersonate?: boolean
          created_at?: string
          created_by?: string | null
          email: string
          full_name?: string | null
          user_id: string
        }
        Update: {
          can_impersonate?: boolean
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reserved_slugs: {
        Row: {
          slug: string
        }
        Insert: {
          slug: string
        }
        Update: {
          slug?: string
        }
        Relationships: []
      }
      schedule_exceptions: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          ends_at: string | null
          id: string
          kind: Database["booking"]["Enums"]["exception_kind"]
          location_id: string | null
          reason: string | null
          scope_tenant: boolean
          staff_id: string | null
          starts_at: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          ends_at?: string | null
          id?: string
          kind: Database["booking"]["Enums"]["exception_kind"]
          location_id?: string | null
          reason?: string | null
          scope_tenant?: boolean
          staff_id?: string | null
          starts_at?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          ends_at?: string | null
          id?: string
          kind?: Database["booking"]["Enums"]["exception_kind"]
          location_id?: string | null
          reason?: string | null
          scope_tenant?: boolean
          staff_id?: string | null
          starts_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_exceptions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_exceptions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_exceptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          archived_at: string | null
          bookable_online: boolean
          buffer_after_minutes: number
          buffer_before_minutes: number
          cancellation_min_hours: number | null
          capacity: number
          category_id: string | null
          color: string | null
          created_at: string
          currency: string | null
          description: string | null
          duration_minutes: number
          id: string
          image_url: string | null
          is_active: boolean
          max_advance_days: number | null
          min_advance_minutes: number | null
          name: string
          price: number | null
          promo_price: number | null
          requires_confirmation: boolean
          reschedule_min_hours: number | null
          slug: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          bookable_online?: boolean
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          cancellation_min_hours?: number | null
          capacity?: number
          category_id?: string | null
          color?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          duration_minutes: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_advance_days?: number | null
          min_advance_minutes?: number | null
          name: string
          price?: number | null
          promo_price?: number | null
          requires_confirmation?: boolean
          reschedule_min_hours?: number | null
          slug: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          bookable_online?: boolean
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          cancellation_min_hours?: number | null
          capacity?: number
          category_id?: string | null
          color?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_advance_days?: number | null
          min_advance_minutes?: number | null
          name?: string
          price?: number | null
          promo_price?: number | null
          requires_confirmation?: boolean
          reschedule_min_hours?: number | null
          slug?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          accepts_online_booking: boolean
          archived_at: string | null
          bio: string | null
          calendar_color: string | null
          concurrent_capacity: number
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          job_title: string | null
          phone_e164: string | null
          photo_url: string | null
          priority: number
          sort_order: number
          tenant_id: string
          timezone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepts_online_booking?: boolean
          archived_at?: string | null
          bio?: string | null
          calendar_color?: string | null
          concurrent_capacity?: number
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          job_title?: string | null
          phone_e164?: string | null
          photo_url?: string | null
          priority?: number
          sort_order?: number
          tenant_id: string
          timezone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepts_online_booking?: boolean
          archived_at?: string | null
          bio?: string | null
          calendar_color?: string | null
          concurrent_capacity?: number
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          job_title?: string | null
          phone_e164?: string | null
          photo_url?: string | null
          priority?: number
          sort_order?: number
          tenant_id?: string
          timezone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_locations: {
        Row: {
          created_at: string
          is_primary: boolean
          location_id: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          is_primary?: boolean
          location_id: string
          staff_id: string
        }
        Update: {
          created_at?: string
          is_primary?: boolean
          location_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_locations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_services: {
        Row: {
          created_at: string
          duration_minutes_override: number | null
          is_active: boolean
          price_override: number | null
          service_id: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes_override?: number | null
          is_active?: boolean
          price_override?: number | null
          service_id: string
          staff_id: string
        }
        Update: {
          created_at?: string
          duration_minutes_override?: number | null
          is_active?: boolean
          price_override?: number | null
          service_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_time_off: {
        Row: {
          approved_by: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          is_all_day: boolean
          kind: Database["booking"]["Enums"]["time_off_kind"]
          period: unknown
          reason: string | null
          staff_id: string
          starts_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          is_all_day?: boolean
          kind?: Database["booking"]["Enums"]["time_off_kind"]
          period?: unknown
          reason?: string | null
          staff_id: string
          starts_at: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          is_all_day?: boolean
          kind?: Database["booking"]["Enums"]["time_off_kind"]
          period?: unknown
          reason?: string | null
          staff_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_time_off_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_working_hours: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          location_id: string
          staff_id: string
          starts_at: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          weekday: number
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          location_id: string
          staff_id: string
          starts_at: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          weekday: number
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          location_id?: string
          staff_id?: string
          starts_at?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_working_hours_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_working_hours_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          error: string | null
          id: string
          payload: Json | null
          processed_at: string | null
          received_at: string
          status: string
          type: string
        }
        Insert: {
          error?: string | null
          id: string
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
          status?: string
          type: string
        }
        Update: {
          error?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
          status?: string
          type?: string
        }
        Relationships: []
      }
      tenant_branding: {
        Row: {
          background_color: string
          border_radius: string
          created_at: string
          favicon_url: string | null
          font_family: string
          hero_image_url: string | null
          logo_url: string | null
          primary_color: string
          public_headline: string | null
          public_subheadline: string | null
          secondary_color: string
          tenant_id: string
          text_color: string
          updated_at: string
        }
        Insert: {
          background_color?: string
          border_radius?: string
          created_at?: string
          favicon_url?: string | null
          font_family?: string
          hero_image_url?: string | null
          logo_url?: string | null
          primary_color?: string
          public_headline?: string | null
          public_subheadline?: string | null
          secondary_color?: string
          tenant_id: string
          text_color?: string
          updated_at?: string
        }
        Update: {
          background_color?: string
          border_radius?: string
          created_at?: string
          favicon_url?: string | null
          font_family?: string
          hero_image_url?: string | null
          logo_url?: string | null
          primary_color?: string
          public_headline?: string | null
          public_subheadline?: string | null
          secondary_color?: string
          tenant_id?: string
          text_color?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_features: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          feature_key: string
          note: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled: boolean
          feature_key: string
          note?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          feature_key?: string
          note?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "tenant_features_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_policies: {
        Row: {
          allow_customer_cancel: boolean
          allow_customer_reschedule: boolean
          cancellation_min_hours: number
          created_at: string
          data_retention_months: number
          max_advance_days: number
          min_advance_minutes: number
          require_confirmation: boolean
          require_email: boolean
          require_notes: boolean
          reschedule_min_hours: number
          slot_granularity_minutes: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allow_customer_cancel?: boolean
          allow_customer_reschedule?: boolean
          cancellation_min_hours?: number
          created_at?: string
          data_retention_months?: number
          max_advance_days?: number
          min_advance_minutes?: number
          require_confirmation?: boolean
          require_email?: boolean
          require_notes?: boolean
          reschedule_min_hours?: number
          slot_granularity_minutes?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allow_customer_cancel?: boolean
          allow_customer_reschedule?: boolean
          cancellation_min_hours?: number
          created_at?: string
          data_retention_months?: number
          max_advance_days?: number
          min_advance_minutes?: number
          require_confirmation?: boolean
          require_email?: boolean
          require_notes?: boolean
          reschedule_min_hours?: number
          slot_granularity_minutes?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          interval: string | null
          plan_code: string
          status: string
          stripe_customer_id: string
          stripe_price_id: string
          stripe_subscription_id: string
          tenant_id: string
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          interval?: string | null
          plan_code: string
          status: string
          stripe_customer_id: string
          stripe_price_id: string
          stripe_subscription_id: string
          tenant_id: string
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          interval?: string | null
          plan_code?: string
          status?: string
          stripe_customer_id?: string
          stripe_price_id?: string
          stripe_subscription_id?: string
          tenant_id?: string
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_whatsapp_accounts: {
        Row: {
          access_token_encrypted: string | null
          business_id: string | null
          connected_at: string | null
          created_at: string
          display_phone_number: string | null
          last_error: string | null
          messaging_limit: string | null
          phone_number_id: string
          quality_rating: string | null
          status: string
          tenant_id: string
          token_key_id: string | null
          updated_at: string
          verified_name: string | null
          waba_id: string
          webhook_verified_at: string | null
        }
        Insert: {
          access_token_encrypted?: string | null
          business_id?: string | null
          connected_at?: string | null
          created_at?: string
          display_phone_number?: string | null
          last_error?: string | null
          messaging_limit?: string | null
          phone_number_id: string
          quality_rating?: string | null
          status?: string
          tenant_id: string
          token_key_id?: string | null
          updated_at?: string
          verified_name?: string | null
          waba_id: string
          webhook_verified_at?: string | null
        }
        Update: {
          access_token_encrypted?: string | null
          business_id?: string | null
          connected_at?: string | null
          created_at?: string
          display_phone_number?: string | null
          last_error?: string | null
          messaging_limit?: string | null
          phone_number_id?: string
          quality_rating?: string | null
          status?: string
          tenant_id?: string
          token_key_id?: string | null
          updated_at?: string
          verified_name?: string | null
          waba_id?: string
          webhook_verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_whatsapp_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          archived_at: string | null
          code: string
          country_code: string
          created_at: string
          created_by: string | null
          custom_domain: string | null
          default_currency: string
          default_locale: string
          default_timezone: string
          display_name: string
          email: string | null
          id: string
          legal_name: string | null
          phone_e164: string | null
          plan_code: string
          segment: string
          slug: string
          status: Database["booking"]["Enums"]["tenant_status"]
          suspended_at: string | null
          suspension_reason: string | null
          tax_id: string | null
          trial_ends_at: string | null
          updated_at: string
          website: string | null
          whatsapp_phone_e164: string | null
        }
        Insert: {
          archived_at?: string | null
          code?: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          custom_domain?: string | null
          default_currency?: string
          default_locale?: string
          default_timezone?: string
          display_name: string
          email?: string | null
          id?: string
          legal_name?: string | null
          phone_e164?: string | null
          plan_code?: string
          segment?: string
          slug: string
          status?: Database["booking"]["Enums"]["tenant_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          tax_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          website?: string | null
          whatsapp_phone_e164?: string | null
        }
        Update: {
          archived_at?: string | null
          code?: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          custom_domain?: string | null
          default_currency?: string
          default_locale?: string
          default_timezone?: string
          display_name?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          phone_e164?: string | null
          plan_code?: string
          segment?: string
          slug?: string
          status?: Database["booking"]["Enums"]["tenant_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          tax_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          website?: string | null
          whatsapp_phone_e164?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
        ]
      }
      webhook_events: {
        Row: {
          attempts: number
          error: string | null
          external_event_id: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
          signature_valid: boolean
          status: Database["booking"]["Enums"]["webhook_status"]
          tenant_id: string | null
        }
        Insert: {
          attempts?: number
          error?: string | null
          external_event_id: string
          id?: string
          payload: Json
          processed_at?: string | null
          provider: string
          received_at?: string
          signature_valid?: boolean
          status?: Database["booking"]["Enums"]["webhook_status"]
          tenant_id?: string | null
        }
        Update: {
          attempts?: number
          error?: string | null
          external_event_id?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          signature_valid?: boolean
          status?: Database["booking"]["Enums"]["webhook_status"]
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      whatsapp_connection_status: {
        Row: {
          connected_at: string | null
          display_phone_number: string | null
          last_error: string | null
          messaging_limit: string | null
          quality_rating: string | null
          status: string | null
          tem_token: boolean | null
          tenant_id: string | null
          verified_name: string | null
          webhook_verified_at: string | null
        }
        Insert: {
          connected_at?: string | null
          display_phone_number?: string | null
          last_error?: string | null
          messaging_limit?: string | null
          quality_rating?: string | null
          status?: string | null
          tem_token?: never
          tenant_id?: string | null
          verified_name?: string | null
          webhook_verified_at?: string | null
        }
        Update: {
          connected_at?: string | null
          display_phone_number?: string | null
          last_error?: string | null
          messaging_limit?: string | null
          quality_rating?: string | null
          status?: string | null
          tem_token?: never
          tenant_id?: string | null
          verified_name?: string | null
          webhook_verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_whatsapp_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_tenant_ids: { Args: never; Returns: string[] }
      agenda: {
        Args: { p_from: string; p_location_id: string; p_to: string }
        Returns: {
          customer_id: string
          customer_name: string
          customer_phone: string
          end_at: string
          id: string
          notes: string
          occupies_slot: boolean
          service_color: string
          service_id: string
          service_name: string
          source: Database["booking"]["Enums"]["booking_source"]
          staff_color: string
          staff_id: string
          staff_name: string
          start_at: string
          status: Database["booking"]["Enums"]["booking_status"]
        }[]
      }
      agendar_notificacoes: {
        Args: { p_cada?: string; p_secret: string; p_url: string }
        Returns: string
      }
      availability_dataset: {
        Args: {
          p_from: string
          p_location_id: string
          p_service_id: string
          p_staff_id?: string
          p_to: string
        }
        Returns: Json
      }
      booking_by_token: { Args: { p_token: string }; Returns: Json }
      can_read_availability: { Args: { p_tenant: string }; Returns: boolean }
      cancel_booking: {
        Args: {
          p_booking_id: string
          p_by_customer?: boolean
          p_reason?: string
        }
        Returns: Json
      }
      cancel_by_token: {
        Args: { p_reason?: string; p_token: string }
        Returns: Json
      }
      claim_notification_jobs: {
        Args: { p_limit?: number; p_worker: string }
        Returns: Json
      }
      complete_notification_job: {
        Args: { p_job_id: string; p_provider_message_id?: string }
        Returns: undefined
      }
      confirm_booking: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: Json
      }
      confirm_by_token: {
        Args: { p_origem?: string; p_token: string }
        Returns: Json
      }
      create_booking_atomic: {
        Args: {
          p_customer: Json
          p_idempotency_key?: string
          p_location_id: string
          p_notes?: string
          p_service_id: string
          p_source: Database["booking"]["Enums"]["booking_source"]
          p_staff_id?: string
          p_start_at: string
        }
        Returns: Json
      }
      current_role_in: {
        Args: { p_tenant: string }
        Returns: Database["booking"]["Enums"]["member_role"]
      }
      current_staff_ids: { Args: never; Returns: string[] }
      current_tenant_ids: { Args: never; Returns: string[] }
      desagendar_notificacoes: { Args: never; Returns: string }
      estado_do_agendador: { Args: never; Returns: Json }
      fail_notification_job: {
        Args: { p_error: string; p_job_id: string }
        Returns: undefined
      }
      has_tenant_role: {
        Args: {
          p_roles: Database["booking"]["Enums"]["member_role"][]
          p_tenant: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_tenant_public: { Args: { p_tenant: string }; Returns: boolean }
      is_valid_timezone: { Args: { p_timezone: string }; Returns: boolean }
      is_within_working_hours: {
        Args: {
          p_end_at: string
          p_location_id: string
          p_staff_id: string
          p_start_at: string
        }
        Returns: boolean
      }
      issue_access_token: {
        Args: {
          p_booking_id: string
          p_customer_id: string
          p_purpose?: string
          p_tenant_id: string
          p_valid_days?: number
        }
        Returns: string
      }
      join_group_session: {
        Args: {
          p_customer: Json
          p_idempotency_key?: string
          p_session_id: string
          p_source: Database["booking"]["Enums"]["booking_source"]
        }
        Returns: Json
      }
      location_tenant: { Args: { p_location: string }; Returns: string }
      manager_tenant_ids: { Args: never; Returns: string[] }
      move_booking: {
        Args: {
          p_booking_id: string
          p_new_staff?: string
          p_new_start: string
          p_reason?: string
        }
        Returns: Json
      }
      plan_no_show_followup: { Args: { p_booking_id: string }; Returns: number }
      plan_notifications: {
        Args: {
          p_booking_id: string
          p_types?: Database["booking"]["Enums"]["notification_type"][]
        }
        Returns: number
      }
      record_consent: {
        Args: {
          p_customer_id: string
          p_granted: boolean
          p_purpose: string
          p_source: Database["booking"]["Enums"]["booking_source"]
        }
        Returns: undefined
      }
      record_webhook_event: {
        Args: {
          p_event_id: string
          p_payload: Json
          p_provider: string
          p_signature_valid: boolean
          p_tenant?: string
        }
        Returns: boolean
      }
      report_period: {
        Args: { p_from: string; p_location_id: string; p_to: string }
        Returns: Json
      }
      report_today: {
        Args: { p_dia?: string; p_location_id: string }
        Returns: Json
      }
      reschedule_booking: {
        Args: {
          p_booking_id: string
          p_by_customer?: boolean
          p_new_staff?: string
          p_new_start: string
          p_reason?: string
        }
        Returns: Json
      }
      reschedule_by_token: {
        Args: { p_new_start: string; p_token: string }
        Returns: Json
      }
      resolve_token: {
        Args: { p_conta_uso?: boolean; p_token: string }
        Returns: string
      }
      seed_notification_rules: {
        Args: { p_tenant: string }
        Returns: undefined
      }
      staff_tenant: { Args: { p_staff: string }; Returns: string }
      tenant_by_phone_number_id: {
        Args: { p_phone_number_id: string }
        Returns: string
      }
      upsert_customer: {
        Args: {
          p_email: string
          p_first_name: string
          p_last_name: string
          p_locale?: string
          p_phone: string
          p_tenant_id: string
        }
        Returns: string
      }
      write_audit_log: {
        Args: {
          p_action: string
          p_actor_label?: string
          p_actor_type: Database["booking"]["Enums"]["actor_type"]
          p_entity: string
          p_entity_id?: string
          p_new_values?: Json
          p_old_values?: Json
          p_source?: string
          p_tenant_id: string
        }
        Returns: number
      }
    }
    Enums: {
      actor_type: "user" | "customer" | "system" | "bot" | "platform_admin"
      booking_source:
        | "public_web"
        | "widget"
        | "whatsapp"
        | "voice"
        | "admin"
        | "api"
        | "import"
      booking_status:
        | "pending"
        | "awaiting_confirmation"
        | "confirmed"
        | "checked_in"
        | "in_progress"
        | "completed"
        | "cancelled_customer"
        | "cancelled_business"
        | "no_show"
        | "rescheduled"
      consent_purpose: "reminders" | "marketing" | "terms" | "privacy_policy"
      conversation_channel:
        | "whatsapp"
        | "web_chat"
        | "instagram"
        | "messenger"
        | "voice"
      conversation_state:
        | "NEW"
        | "IDENTIFYING_INTENT"
        | "SELECTING_LOCATION"
        | "SELECTING_SERVICE"
        | "SELECTING_STAFF"
        | "SELECTING_DATE"
        | "SELECTING_SLOT"
        | "COLLECTING_CUSTOMER_DATA"
        | "CONFIRMING"
        | "BOOKED"
        | "MANAGING_BOOKING"
        | "WAITING_HUMAN"
        | "HUMAN"
        | "BOT_RESUMED"
        | "CLOSED"
      exception_kind: "closed" | "open"
      member_role: "tenant_admin" | "manager" | "staff"
      message_direction: "inbound" | "outbound"
      notification_channel: "whatsapp" | "email" | "sms" | "push"
      notification_rule_target: "customer" | "staff" | "tenant"
      notification_status:
        | "pending"
        | "processing"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "cancelled"
      notification_type:
        | "booking_created"
        | "booking_confirmed"
        | "reminder"
        | "cancelled"
        | "rescheduled"
        | "changed_by_business"
        | "follow_up"
        | "waitlist_offer"
        | "no_show_followup"
      resource_kind: "room" | "chair" | "equipment" | "vehicle" | "other"
      tenant_status: "trial" | "active" | "past_due" | "suspended" | "cancelled"
      time_off_kind:
        | "vacation"
        | "sick_leave"
        | "holiday"
        | "block"
        | "training"
        | "other"
      waitlist_status:
        | "active"
        | "offered"
        | "converted"
        | "expired"
        | "cancelled"
      webhook_status:
        | "received"
        | "processing"
        | "processed"
        | "failed"
        | "skipped"
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
  booking: {
    Enums: {
      actor_type: ["user", "customer", "system", "bot", "platform_admin"],
      booking_source: [
        "public_web",
        "widget",
        "whatsapp",
        "voice",
        "admin",
        "api",
        "import",
      ],
      booking_status: [
        "pending",
        "awaiting_confirmation",
        "confirmed",
        "checked_in",
        "in_progress",
        "completed",
        "cancelled_customer",
        "cancelled_business",
        "no_show",
        "rescheduled",
      ],
      consent_purpose: ["reminders", "marketing", "terms", "privacy_policy"],
      conversation_channel: [
        "whatsapp",
        "web_chat",
        "instagram",
        "messenger",
        "voice",
      ],
      conversation_state: [
        "NEW",
        "IDENTIFYING_INTENT",
        "SELECTING_LOCATION",
        "SELECTING_SERVICE",
        "SELECTING_STAFF",
        "SELECTING_DATE",
        "SELECTING_SLOT",
        "COLLECTING_CUSTOMER_DATA",
        "CONFIRMING",
        "BOOKED",
        "MANAGING_BOOKING",
        "WAITING_HUMAN",
        "HUMAN",
        "BOT_RESUMED",
        "CLOSED",
      ],
      exception_kind: ["closed", "open"],
      member_role: ["tenant_admin", "manager", "staff"],
      message_direction: ["inbound", "outbound"],
      notification_channel: ["whatsapp", "email", "sms", "push"],
      notification_rule_target: ["customer", "staff", "tenant"],
      notification_status: [
        "pending",
        "processing",
        "sent",
        "delivered",
        "read",
        "failed",
        "cancelled",
      ],
      notification_type: [
        "booking_created",
        "booking_confirmed",
        "reminder",
        "cancelled",
        "rescheduled",
        "changed_by_business",
        "follow_up",
        "waitlist_offer",
        "no_show_followup",
      ],
      resource_kind: ["room", "chair", "equipment", "vehicle", "other"],
      tenant_status: ["trial", "active", "past_due", "suspended", "cancelled"],
      time_off_kind: [
        "vacation",
        "sick_leave",
        "holiday",
        "block",
        "training",
        "other",
      ],
      waitlist_status: [
        "active",
        "offered",
        "converted",
        "expired",
        "cancelled",
      ],
      webhook_status: [
        "received",
        "processing",
        "processed",
        "failed",
        "skipped",
      ],
    },
  },
} as const
