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
  public: {
    Tables: {
      ai_user_memory: {
        Row: {
          created_at: string
          id: string
          key: string
          kind: string
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          kind?: string
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          kind?: string
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
        }
        Relationships: []
      }
      authority_directory: {
        Row: {
          api_endpoint: string | null
          authority_type: string
          availability: string
          contact_method: string | null
          county: string | null
          created_at: string
          created_by: string | null
          dispatch_contact: string | null
          district: string | null
          email: string | null
          emergency_number: string | null
          id: string
          is_demo: boolean
          operating_hours: string | null
          organization: string
          parish: string | null
          region: string | null
          station: string | null
          sub_county: string | null
          town: string | null
          updated_at: string
          updated_by: string | null
          verification_status: string
          village: string | null
        }
        Insert: {
          api_endpoint?: string | null
          authority_type: string
          availability?: string
          contact_method?: string | null
          county?: string | null
          created_at?: string
          created_by?: string | null
          dispatch_contact?: string | null
          district?: string | null
          email?: string | null
          emergency_number?: string | null
          id?: string
          is_demo?: boolean
          operating_hours?: string | null
          organization: string
          parish?: string | null
          region?: string | null
          station?: string | null
          sub_county?: string | null
          town?: string | null
          updated_at?: string
          updated_by?: string | null
          verification_status?: string
          village?: string | null
        }
        Update: {
          api_endpoint?: string | null
          authority_type?: string
          availability?: string
          contact_method?: string | null
          county?: string | null
          created_at?: string
          created_by?: string | null
          dispatch_contact?: string | null
          district?: string | null
          email?: string | null
          emergency_number?: string | null
          id?: string
          is_demo?: boolean
          operating_hours?: string | null
          organization?: string
          parish?: string | null
          region?: string | null
          station?: string | null
          sub_county?: string | null
          town?: string | null
          updated_at?: string
          updated_by?: string | null
          verification_status?: string
          village?: string | null
        }
        Relationships: []
      }
      authority_escalations: {
        Row: {
          created_at: string
          created_by: string | null
          from_level: string | null
          id: string
          is_demo: boolean
          reason: string
          report_id: string
          status: string
          to_level: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_level?: string | null
          id?: string
          is_demo?: boolean
          reason: string
          report_id: string
          status?: string
          to_level: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_level?: string | null
          id?: string
          is_demo?: boolean
          reason?: string
          report_id?: string
          status?: string
          to_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "authority_escalations_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      authority_notifications: {
        Row: {
          acknowledged_at: string | null
          authority_id: string | null
          authority_type: string
          created_at: string
          created_by: string | null
          id: string
          is_demo: boolean
          method: string
          provider_reference: string | null
          reason: string | null
          report_id: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          authority_id?: string | null
          authority_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          method: string
          provider_reference?: string | null
          reason?: string | null
          report_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          authority_id?: string | null
          authority_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          method?: string
          provider_reference?: string | null
          reason?: string | null
          report_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "authority_notifications_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "authority_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authority_notifications_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      call_sessions: {
        Row: {
          created_at: string
          emergency_call_id: string
          id: string
          last_provider_event_at: string
          provider_confirmed: boolean
          provider_expires_at: string | null
          status: string
          updated_at: string
          webrtc_session_id: string | null
        }
        Insert: {
          created_at?: string
          emergency_call_id: string
          id?: string
          last_provider_event_at?: string
          provider_confirmed?: boolean
          provider_expires_at?: string | null
          status?: string
          updated_at?: string
          webrtc_session_id?: string | null
        }
        Update: {
          created_at?: string
          emergency_call_id?: string
          id?: string
          last_provider_event_at?: string
          provider_confirmed?: boolean
          provider_expires_at?: string | null
          status?: string
          updated_at?: string
          webrtc_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_emergency_call_id_fkey"
            columns: ["emergency_call_id"]
            isOneToOne: false
            referencedRelation: "emergency_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      call_signals: {
        Row: {
          call_id: string
          created_at: string
          id: string
          kind: string
          payload: Json
          sender_id: string
        }
        Insert: {
          call_id: string
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          sender_id: string
        }
        Update: {
          call_id?: string
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_signals_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "emergency_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      case_notes: {
        Row: {
          author_kind: string
          body: string
          created_at: string
          id: string
          is_internal: boolean
          officer_id: string | null
          report_id: string
        }
        Insert: {
          author_kind?: string
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          officer_id?: string | null
          report_id: string
        }
        Update: {
          author_kind?: string
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          officer_id?: string | null
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_notes_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "officer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_notes_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      community_alerts: {
        Row: {
          alert_type: string
          area: string | null
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_published: boolean
          latitude: number | null
          longitude: number | null
          severity: string
          starts_at: string
          title: string
        }
        Insert: {
          alert_type: string
          area?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_published?: boolean
          latitude?: number | null
          longitude?: number | null
          severity?: string
          starts_at?: string
          title: string
        }
        Update: {
          alert_type?: string
          area?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_published?: boolean
          latitude?: number | null
          longitude?: number | null
          severity?: string
          starts_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_alerts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "officer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_responders: {
        Row: {
          active_response_count: number
          area_of_operation: string | null
          availability_status: string
          availability_until: string | null
          country: string
          county: string | null
          created_at: string
          district: string | null
          emergency_permissions: boolean
          full_name: string
          id: string
          location_permission_granted: boolean
          opted_in: boolean
          parish: string | null
          phone: string | null
          phone_verification_status: string
          photo_url: string | null
          preferred_language: string
          region: string | null
          responder_level: string
          responder_type: string
          safety_acknowledged: boolean
          service_radius_m: number
          sub_county: string | null
          town: string | null
          updated_at: string
          user_id: string
          verification_status: string
          village: string | null
        }
        Insert: {
          active_response_count?: number
          area_of_operation?: string | null
          availability_status?: string
          availability_until?: string | null
          country?: string
          county?: string | null
          created_at?: string
          district?: string | null
          emergency_permissions?: boolean
          full_name: string
          id?: string
          location_permission_granted?: boolean
          opted_in?: boolean
          parish?: string | null
          phone?: string | null
          phone_verification_status?: string
          photo_url?: string | null
          preferred_language?: string
          region?: string | null
          responder_level?: string
          responder_type?: string
          safety_acknowledged?: boolean
          service_radius_m?: number
          sub_county?: string | null
          town?: string | null
          updated_at?: string
          user_id: string
          verification_status?: string
          village?: string | null
        }
        Update: {
          active_response_count?: number
          area_of_operation?: string | null
          availability_status?: string
          availability_until?: string | null
          country?: string
          county?: string | null
          created_at?: string
          district?: string | null
          emergency_permissions?: boolean
          full_name?: string
          id?: string
          location_permission_granted?: boolean
          opted_in?: boolean
          parish?: string | null
          phone?: string | null
          phone_verification_status?: string
          photo_url?: string | null
          preferred_language?: string
          region?: string | null
          responder_level?: string
          responder_type?: string
          safety_acknowledged?: boolean
          service_radius_m?: number
          sub_county?: string | null
          town?: string | null
          updated_at?: string
          user_id?: string
          verification_status?: string
          village?: string | null
        }
        Relationships: []
      }
      dispatches: {
        Row: {
          assigned_by: string | null
          completed_at: string | null
          created_at: string
          distance_km: number | null
          en_route_at: string | null
          eta_minutes: number | null
          id: string
          note: string | null
          notified_at: string | null
          officer_id: string
          on_scene_at: string | null
          report_id: string
          status: Database["public"]["Enums"]["dispatch_status"]
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          completed_at?: string | null
          created_at?: string
          distance_km?: number | null
          en_route_at?: string | null
          eta_minutes?: number | null
          id?: string
          note?: string | null
          notified_at?: string | null
          officer_id: string
          on_scene_at?: string | null
          report_id: string
          status?: Database["public"]["Enums"]["dispatch_status"]
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          completed_at?: string | null
          created_at?: string
          distance_km?: number | null
          en_route_at?: string | null
          eta_minutes?: number | null
          id?: string
          note?: string | null
          notified_at?: string | null
          officer_id?: string
          on_scene_at?: string | null
          report_id?: string
          status?: Database["public"]["Enums"]["dispatch_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatches_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "officer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "officer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          sos_session_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          sos_session_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          sos_session_id?: string | null
        }
        Relationships: []
      }
      emergency_call_invitations: {
        Row: {
          accepted_at: string | null
          call_session_id: string
          cancelled_at: string | null
          created_at: string
          declined_at: string | null
          delivered_at: string | null
          emergency_id: string
          id: string
          recipient_user_id: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          call_session_id: string
          cancelled_at?: string | null
          created_at?: string
          declined_at?: string | null
          delivered_at?: string | null
          emergency_id: string
          id?: string
          recipient_user_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          call_session_id?: string
          cancelled_at?: string | null
          created_at?: string
          declined_at?: string | null
          delivered_at?: string | null
          emergency_id?: string
          id?: string
          recipient_user_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_call_invitations_call_session_id_fkey"
            columns: ["call_session_id"]
            isOneToOne: false
            referencedRelation: "emergency_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_call_invitations_emergency_id_fkey"
            columns: ["emergency_id"]
            isOneToOne: false
            referencedRelation: "safety_activity"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_calls: {
        Row: {
          accepted_at: string | null
          call_type: string
          caller_id: string
          connected_at: string | null
          created_at: string
          duration: number | null
          ended_at: string | null
          failure_reason: string | null
          id: string
          provider_confirmed: boolean
          provider_mode: string
          recipient_id: string
          ringing_at: string | null
          sos_session_id: string | null
          started_at: string | null
          status: string
          updated_at: string
          zego_room_id: string | null
          zego_session_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          call_type?: string
          caller_id: string
          connected_at?: string | null
          created_at?: string
          duration?: number | null
          ended_at?: string | null
          failure_reason?: string | null
          id?: string
          provider_confirmed?: boolean
          provider_mode?: string
          recipient_id: string
          ringing_at?: string | null
          sos_session_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          zego_room_id?: string | null
          zego_session_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          call_type?: string
          caller_id?: string
          connected_at?: string | null
          created_at?: string
          duration?: number | null
          ended_at?: string | null
          failure_reason?: string | null
          id?: string
          provider_confirmed?: boolean
          provider_mode?: string
          recipient_id?: string
          ringing_at?: string | null
          sos_session_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          zego_room_id?: string | null
          zego_session_id?: string | null
        }
        Relationships: []
      }
      emergency_chat_events: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          event_type: string
          id: string
          sos_session_id: string | null
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          event_type: string
          id?: string
          sos_session_id?: string | null
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          event_type?: string
          id?: string
          sos_session_id?: string | null
        }
        Relationships: []
      }
      emergency_contacts: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string
          relationship: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phone: string
          relationship?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string
          relationship?: string | null
          user_id?: string
        }
        Relationships: []
      }
      emergency_escalations: {
        Row: {
          created_at: string
          from_state: string | null
          id: string
          reason: string | null
          sos_session_id: string | null
          to_state: string
        }
        Insert: {
          created_at?: string
          from_state?: string | null
          id?: string
          reason?: string | null
          sos_session_id?: string | null
          to_state: string
        }
        Update: {
          created_at?: string
          from_state?: string | null
          id?: string
          reason?: string | null
          sos_session_id?: string | null
          to_state?: string
        }
        Relationships: []
      }
      facilities: {
        Row: {
          address: string | null
          created_at: string
          district: string | null
          facility_type: string
          id: string
          is_24_7: boolean
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          district?: string | null
          facility_type: string
          id?: string
          is_24_7?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          district?: string | null
          facility_type?: string
          id?: string
          is_24_7?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      health_reminder_settings: {
        Row: {
          call_window_end: string
          call_window_start: string
          calls_enabled: boolean
          created_at: string
          do_not_disturb: boolean
          notifications_enabled: boolean
          opted_in: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          call_window_end?: string
          call_window_start?: string
          calls_enabled?: boolean
          created_at?: string
          do_not_disturb?: boolean
          notifications_enabled?: boolean
          opted_in?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          call_window_end?: string
          call_window_start?: string
          calls_enabled?: boolean
          created_at?: string
          do_not_disturb?: boolean
          notifications_enabled?: boolean
          opted_in?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      health_reminders: {
        Row: {
          appointment_date: string
          appointment_time: string
          call_enabled: boolean
          call_time: string | null
          created_at: string
          facility_optional: string | null
          health_context_optional: string | null
          id: string
          last_delivered_at: string | null
          next_delivery_at: string | null
          notes_optional: string | null
          notification_enabled: boolean
          recurrence: Json
          reminder_schedule: Json
          reminder_type: string
          status: string
          timezone: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_date: string
          appointment_time: string
          call_enabled?: boolean
          call_time?: string | null
          created_at?: string
          facility_optional?: string | null
          health_context_optional?: string | null
          id?: string
          last_delivered_at?: string | null
          next_delivery_at?: string | null
          notes_optional?: string | null
          notification_enabled?: boolean
          recurrence?: Json
          reminder_schedule?: Json
          reminder_type: string
          status?: string
          timezone?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string
          call_enabled?: boolean
          call_time?: string | null
          created_at?: string
          facility_optional?: string | null
          health_context_optional?: string | null
          id?: string
          last_delivered_at?: string | null
          next_delivery_at?: string | null
          notes_optional?: string | null
          notification_enabled?: boolean
          recurrence?: Json
          reminder_schedule?: Json
          reminder_type?: string
          status?: string
          timezone?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      institutional_handover_acceptance: {
        Row: {
          acceptance_date: string | null
          acceptance_status: string
          authorized_representative: string | null
          created_at: string
          created_by: string | null
          digital_signature_supported: boolean
          id: string
          institution: string
          operational_representative: string | null
          outstanding_issues: string | null
          scope: string | null
          system_version: string | null
          technical_representative: string | null
          updated_at: string
        }
        Insert: {
          acceptance_date?: string | null
          acceptance_status?: string
          authorized_representative?: string | null
          created_at?: string
          created_by?: string | null
          digital_signature_supported?: boolean
          id?: string
          institution: string
          operational_representative?: string | null
          outstanding_issues?: string | null
          scope?: string | null
          system_version?: string | null
          technical_representative?: string | null
          updated_at?: string
        }
        Update: {
          acceptance_date?: string | null
          acceptance_status?: string
          authorized_representative?: string | null
          created_at?: string
          created_by?: string | null
          digital_signature_supported?: boolean
          id?: string
          institution?: string
          operational_representative?: string | null
          outstanding_issues?: string | null
          scope?: string | null
          system_version?: string | null
          technical_representative?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      institutional_hierarchy_nodes: {
        Row: {
          code: string | null
          community: string | null
          country: string | null
          county: string | null
          created_at: string
          created_by: string | null
          district: string | null
          id: string
          is_active: boolean
          metadata: Json
          name: string
          node_type: string
          parent_id: string | null
          parish: string | null
          region: string | null
          sub_county: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          community?: string | null
          country?: string | null
          county?: string | null
          created_at?: string
          created_by?: string | null
          district?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          node_type: string
          parent_id?: string | null
          parish?: string | null
          region?: string | null
          sub_county?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          community?: string | null
          country?: string | null
          county?: string | null
          created_at?: string
          created_by?: string | null
          district?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          node_type?: string
          parent_id?: string | null
          parish?: string | null
          region?: string | null
          sub_county?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "institutional_hierarchy_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "institutional_hierarchy_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      institutional_organization_members: {
        Row: {
          created_at: string
          id: string
          last_activity_at: string | null
          organization_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
          verification_status: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_activity_at?: string | null
          organization_id: string
          role: string
          status?: string
          updated_at?: string
          user_id: string
          verification_status?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_activity_at?: string | null
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "institutional_organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "institutional_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      institutional_organizations: {
        Row: {
          contact_email: string | null
          created_at: string
          created_by: string | null
          id: string
          jurisdiction_node_id: string | null
          metadata: Json
          name: string
          organization_type: string
          status: string
          updated_at: string
          verification_status: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          jurisdiction_node_id?: string | null
          metadata?: Json
          name: string
          organization_type: string
          status?: string
          updated_at?: string
          verification_status?: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          jurisdiction_node_id?: string | null
          metadata?: Json
          name?: string
          organization_type?: string
          status?: string
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "institutional_organizations_jurisdiction_node_id_fkey"
            columns: ["jurisdiction_node_id"]
            isOneToOne: false
            referencedRelation: "institutional_hierarchy_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      institutional_system_status: {
        Row: {
          checked_at: string | null
          created_at: string
          detail: string | null
          display_name: string
          environment: string
          id: string
          service_key: string
          status: string
          updated_at: string
        }
        Insert: {
          checked_at?: string | null
          created_at?: string
          detail?: string | null
          display_name: string
          environment?: string
          id?: string
          service_key: string
          status?: string
          updated_at?: string
        }
        Update: {
          checked_at?: string | null
          created_at?: string
          detail?: string | null
          display_name?: string
          environment?: string
          id?: string
          service_key?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      lost_found_claims: {
        Row: {
          claimant_name: string
          claimant_phone: string
          created_at: string
          id: string
          item_id: string
          proof_text: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          claimant_name: string
          claimant_phone: string
          created_at?: string
          id?: string
          item_id: string
          proof_text: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          claimant_name?: string
          claimant_phone?: string
          created_at?: string
          id?: string
          item_id?: string
          proof_text?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lost_found_claims_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "lost_found_items"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_found_items: {
        Row: {
          claimed_by: string | null
          created_at: string
          description: string | null
          district: string | null
          id: string
          identifier: string | null
          item_type: string
          kind: string
          location_text: string | null
          matched_item_id: string | null
          photo_url: string | null
          released_at: string | null
          report_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          claimed_by?: string | null
          created_at?: string
          description?: string | null
          district?: string | null
          id?: string
          identifier?: string | null
          item_type: string
          kind?: string
          location_text?: string | null
          matched_item_id?: string | null
          photo_url?: string | null
          released_at?: string | null
          report_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          claimed_by?: string | null
          created_at?: string
          description?: string | null
          district?: string | null
          id?: string
          identifier?: string | null
          item_type?: string
          kind?: string
          location_text?: string | null
          matched_item_id?: string | null
          photo_url?: string | null
          released_at?: string | null
          report_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lost_found_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_found_public_reports: {
        Row: {
          contact_name: string
          contact_phone: string
          created_at: string
          description: string | null
          district: string | null
          id: string
          item_type: string
          kind: string
          location_text: string | null
          matched_item_id: string | null
          occurred_on: string | null
          photo_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          contact_name: string
          contact_phone: string
          created_at?: string
          description?: string | null
          district?: string | null
          id?: string
          item_type: string
          kind?: string
          location_text?: string | null
          matched_item_id?: string | null
          occurred_on?: string | null
          photo_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          contact_name?: string
          contact_phone?: string
          created_at?: string
          description?: string | null
          district?: string | null
          id?: string
          item_type?: string
          kind?: string
          location_text?: string | null
          matched_item_id?: string | null
          occurred_on?: string | null
          photo_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lost_found_public_reports_matched_item_id_fkey"
            columns: ["matched_item_id"]
            isOneToOne: false
            referencedRelation: "lost_found_items"
            referencedColumns: ["id"]
          },
        ]
      }
      major_incidents: {
        Row: {
          affected_locations: number | null
          affected_people: number | null
          created_at: string
          created_by: string | null
          id: string
          incident_commander_id: string | null
          is_demo: boolean
          priority: string
          reference: string
          resolved_at: string | null
          scope_level: string
          situation_summary: string | null
          started_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          affected_locations?: number | null
          affected_people?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          incident_commander_id?: string | null
          is_demo?: boolean
          priority?: string
          reference: string
          resolved_at?: string | null
          scope_level?: string
          situation_summary?: string | null
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          affected_locations?: number | null
          affected_people?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          incident_commander_id?: string | null
          is_demo?: boolean
          priority?: string
          reference?: string
          resolved_at?: string | null
          scope_level?: string
          situation_summary?: string | null
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          created_at: string
          id: string
          parts: Json
          role: string
          sdk_message_id: string | null
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parts?: Json
          role: string
          sdk_message_id?: string | null
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          sdk_message_id?: string | null
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      missing_persons: {
        Row: {
          age: number | null
          created_at: string
          description: string | null
          district: string | null
          full_name: string
          gender: string | null
          id: string
          last_seen_at: string | null
          last_seen_location: string | null
          latitude: number | null
          longitude: number | null
          photo_url: string | null
          report_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          age?: number | null
          created_at?: string
          description?: string | null
          district?: string | null
          full_name: string
          gender?: string | null
          id?: string
          last_seen_at?: string | null
          last_seen_location?: string | null
          latitude?: number | null
          longitude?: number | null
          photo_url?: string | null
          report_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          age?: number | null
          created_at?: string
          description?: string | null
          district?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          last_seen_at?: string | null
          last_seen_location?: string | null
          latitude?: number | null
          longitude?: number | null
          photo_url?: string | null
          report_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "missing_persons_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          kind: string
          link: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          link?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          link?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      officer_messages: {
        Row: {
          body: string
          channel: string
          created_at: string
          id: string
          report_id: string | null
          sender_id: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          id?: string
          report_id?: string | null
          sender_id: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          id?: string
          report_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "officer_messages_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officer_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "officer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      officer_profiles: {
        Row: {
          badge_number: string | null
          created_at: string
          duty_status: Database["public"]["Enums"]["duty_status"]
          force_id: string | null
          full_name: string
          id: string
          jurisdiction_area: string | null
          jurisdiction_level: string | null
          last_seen_at: string | null
          notification_prefs: Json
          official_email: string | null
          onboarding_completed: boolean
          onboarding_step: number
          phone: string | null
          photo_url: string | null
          rank: Database["public"]["Enums"]["officer_rank"] | null
          station_id: string | null
          status: Database["public"]["Enums"]["officer_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          badge_number?: string | null
          created_at?: string
          duty_status?: Database["public"]["Enums"]["duty_status"]
          force_id?: string | null
          full_name?: string
          id?: string
          jurisdiction_area?: string | null
          jurisdiction_level?: string | null
          last_seen_at?: string | null
          notification_prefs?: Json
          official_email?: string | null
          onboarding_completed?: boolean
          onboarding_step?: number
          phone?: string | null
          photo_url?: string | null
          rank?: Database["public"]["Enums"]["officer_rank"] | null
          station_id?: string | null
          status?: Database["public"]["Enums"]["officer_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          badge_number?: string | null
          created_at?: string
          duty_status?: Database["public"]["Enums"]["duty_status"]
          force_id?: string | null
          full_name?: string
          id?: string
          jurisdiction_area?: string | null
          jurisdiction_level?: string | null
          last_seen_at?: string | null
          notification_prefs?: Json
          official_email?: string | null
          onboarding_completed?: boolean
          onboarding_step?: number
          phone?: string | null
          photo_url?: string | null
          rank?: Database["public"]["Enums"]["officer_rank"] | null
          station_id?: string | null
          status?: Database["public"]["Enums"]["officer_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "officer_profiles_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "police_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_lookup_log: {
        Row: {
          created_at: string
          found: boolean
          id: string
          phone_hash: string
          searcher_id: string
        }
        Insert: {
          created_at?: string
          found?: boolean
          id?: string
          phone_hash: string
          searcher_id: string
        }
        Update: {
          created_at?: string
          found?: boolean
          id?: string
          phone_hash?: string
          searcher_id?: string
        }
        Relationships: []
      }
      police_stations: {
        Row: {
          code: string | null
          coverage_area: string | null
          created_at: string
          district: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          parish: string | null
          phone: string | null
          region: string
          sub_county: string | null
          updated_at: string
          village: string | null
        }
        Insert: {
          code?: string | null
          coverage_area?: string | null
          created_at?: string
          district: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          parish?: string | null
          phone?: string | null
          region: string
          sub_county?: string | null
          updated_at?: string
          village?: string | null
        }
        Update: {
          code?: string | null
          coverage_area?: string | null
          created_at?: string
          district?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          parish?: string | null
          phone?: string | null
          region?: string
          sub_county?: string | null
          updated_at?: string
          village?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          discoverable_by_phone: boolean
          full_name: string | null
          id: string
          locale: string
          location_mode: string
          onboarding_completed: boolean
          onboarding_step: number
          phone: string | null
          phone_e164: string | null
          phone_verified: boolean
          safety_plan: Json
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          discoverable_by_phone?: boolean
          full_name?: string | null
          id: string
          locale?: string
          location_mode?: string
          onboarding_completed?: boolean
          onboarding_step?: number
          phone?: string | null
          phone_e164?: string | null
          phone_verified?: boolean
          safety_plan?: Json
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          discoverable_by_phone?: boolean
          full_name?: string | null
          id?: string
          locale?: string
          location_mode?: string
          onboarding_completed?: boolean
          onboarding_step?: number
          phone?: string | null
          phone_e164?: string | null
          phone_verified?: boolean
          safety_plan?: Json
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      report_evidence: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          media_type: string | null
          report_id: string
          storage_path: string
          user_id: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          media_type?: string | null
          report_id: string
          storage_path: string
          user_id?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          media_type?: string | null
          report_id?: string
          storage_path?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_evidence_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_status_history: {
        Row: {
          created_at: string
          id: string
          note: string | null
          report_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          report_id: string
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          report_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_status_history_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          ai_recommended_actions: Json
          ai_suggested_category: string | null
          ai_summary: string | null
          assigned_officer_id: string | null
          category: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          details: Json
          district: string | null
          id: string
          is_anonymous: boolean
          is_possible_duplicate: boolean
          latitude: number | null
          location_text: string | null
          longitude: number | null
          narrative: string | null
          occurred_at: string | null
          priority: Database["public"]["Enums"]["incident_priority"]
          reference: string
          report_type: string
          resolved_at: string | null
          risk_level: string
          station_id: string | null
          status: string
          summary: string | null
          thread_id: string | null
          title: string
          updated_at: string
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          ai_recommended_actions?: Json
          ai_suggested_category?: string | null
          ai_summary?: string | null
          assigned_officer_id?: string | null
          category?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          details?: Json
          district?: string | null
          id?: string
          is_anonymous?: boolean
          is_possible_duplicate?: boolean
          latitude?: number | null
          location_text?: string | null
          longitude?: number | null
          narrative?: string | null
          occurred_at?: string | null
          priority?: Database["public"]["Enums"]["incident_priority"]
          reference?: string
          report_type: string
          resolved_at?: string | null
          risk_level?: string
          station_id?: string | null
          status?: string
          summary?: string | null
          thread_id?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          ai_recommended_actions?: Json
          ai_suggested_category?: string | null
          ai_summary?: string | null
          assigned_officer_id?: string | null
          category?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          details?: Json
          district?: string | null
          id?: string
          is_anonymous?: boolean
          is_possible_duplicate?: boolean
          latitude?: number | null
          location_text?: string | null
          longitude?: number | null
          narrative?: string | null
          occurred_at?: string | null
          priority?: Database["public"]["Enums"]["incident_priority"]
          reference?: string
          report_type?: string
          resolved_at?: string | null
          risk_level?: string
          station_id?: string | null
          status?: string
          summary?: string | null
          thread_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_assigned_officer_id_fkey"
            columns: ["assigned_officer_id"]
            isOneToOne: false
            referencedRelation: "officer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "police_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      responder_assignments: {
        Row: {
          accepted_at: string | null
          arrived_at: string | null
          assigned_at: string
          assignment_type: string
          completed_at: string | null
          distance: number | null
          en_route_at: string | null
          id: string
          match_score: number | null
          notes: string | null
          priority: number
          responder_id: string
          responder_profile_id: string | null
          response_outcome: string | null
          sos_session_id: string | null
          status: string
          unable_at: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          arrived_at?: string | null
          assigned_at?: string
          assignment_type?: string
          completed_at?: string | null
          distance?: number | null
          en_route_at?: string | null
          id?: string
          match_score?: number | null
          notes?: string | null
          priority?: number
          responder_id: string
          responder_profile_id?: string | null
          response_outcome?: string | null
          sos_session_id?: string | null
          status?: string
          unable_at?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          arrived_at?: string | null
          assigned_at?: string
          assignment_type?: string
          completed_at?: string | null
          distance?: number | null
          en_route_at?: string | null
          id?: string
          match_score?: number | null
          notes?: string | null
          priority?: number
          responder_id?: string
          responder_profile_id?: string | null
          response_outcome?: string | null
          sos_session_id?: string | null
          status?: string
          unable_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "responder_assignments_responder_profile_id_fkey"
            columns: ["responder_profile_id"]
            isOneToOne: false
            referencedRelation: "community_responders"
            referencedColumns: ["id"]
          },
        ]
      }
      responder_locations: {
        Row: {
          accuracy: number | null
          id: string
          is_current: boolean
          latitude: number
          longitude: number
          recorded_at: string
          responder_id: string
        }
        Insert: {
          accuracy?: number | null
          id?: string
          is_current?: boolean
          latitude: number
          longitude: number
          recorded_at?: string
          responder_id: string
        }
        Update: {
          accuracy?: number | null
          id?: string
          is_current?: boolean
          latitude?: number
          longitude?: number
          recorded_at?: string
          responder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "responder_locations_responder_id_fkey"
            columns: ["responder_id"]
            isOneToOne: false
            referencedRelation: "community_responders"
            referencedColumns: ["id"]
          },
        ]
      }
      responder_notifications: {
        Row: {
          approximate_distance_m: number | null
          area: string | null
          created_at: string
          decline_reason: string | null
          emergency_category: string
          id: string
          minimal_summary: string | null
          notification_status: string
          responded_at: string | null
          responder_id: string
          sent_at: string | null
          severity: string
          sos_session_id: string | null
          viewed_at: string | null
        }
        Insert: {
          approximate_distance_m?: number | null
          area?: string | null
          created_at?: string
          decline_reason?: string | null
          emergency_category?: string
          id?: string
          minimal_summary?: string | null
          notification_status?: string
          responded_at?: string | null
          responder_id: string
          sent_at?: string | null
          severity?: string
          sos_session_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          approximate_distance_m?: number | null
          area?: string | null
          created_at?: string
          decline_reason?: string | null
          emergency_category?: string
          id?: string
          minimal_summary?: string | null
          notification_status?: string
          responded_at?: string | null
          responder_id?: string
          sent_at?: string | null
          severity?: string
          sos_session_id?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "responder_notifications_responder_id_fkey"
            columns: ["responder_id"]
            isOneToOne: false
            referencedRelation: "community_responders"
            referencedColumns: ["id"]
          },
        ]
      }
      responder_reports: {
        Row: {
          created_at: string
          description: string | null
          id: string
          report_type: string
          responder_id: string
          sos_session_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          report_type: string
          responder_id: string
          sos_session_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          report_type?: string
          responder_id?: string
          sos_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "responder_reports_responder_id_fkey"
            columns: ["responder_id"]
            isOneToOne: false
            referencedRelation: "community_responders"
            referencedColumns: ["id"]
          },
        ]
      }
      responder_skills: {
        Row: {
          created_at: string
          id: string
          responder_id: string
          skill: string
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          responder_id: string
          skill: string
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          responder_id?: string
          skill?: string
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "responder_skills_responder_id_fkey"
            columns: ["responder_id"]
            isOneToOne: false
            referencedRelation: "community_responders"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_activity: {
        Row: {
          activity_type: string
          created_at: string
          details: Json
          id: string
          latitude: number | null
          location_text: string | null
          longitude: number | null
          report_id: string | null
          severity: string
          summary: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          details?: Json
          id?: string
          latitude?: number | null
          location_text?: string | null
          longitude?: number | null
          report_id?: string | null
          severity?: string
          summary?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          details?: Json
          id?: string
          latitude?: number | null
          location_text?: string | null
          longitude?: number | null
          report_id?: string | null
          severity?: string
          summary?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_activity_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      safety_connection_requests: {
        Row: {
          created_at: string
          id: string
          note: string | null
          recipient_id: string
          requester_id: string
          responded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          recipient_id: string
          requester_id: string
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          recipient_id?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      safety_connections: {
        Row: {
          allow_emergency_calls: boolean
          created_at: string
          id: string
          member_id: string
          notify_on_sos: boolean
          owner_id: string
          priority: number
          request_id: string | null
          safety_role: string
          share_location_on_sos: boolean
          updated_at: string
        }
        Insert: {
          allow_emergency_calls?: boolean
          created_at?: string
          id?: string
          member_id: string
          notify_on_sos?: boolean
          owner_id: string
          priority?: number
          request_id?: string | null
          safety_role?: string
          share_location_on_sos?: boolean
          updated_at?: string
        }
        Update: {
          allow_emergency_calls?: boolean
          created_at?: string
          id?: string
          member_id?: string
          notify_on_sos?: boolean
          owner_id?: string
          priority?: number
          request_id?: string | null
          safety_role?: string
          share_location_on_sos?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_connections_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "safety_connection_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_sos_check_events: {
        Row: {
          action: string
          check_id: string
          created_at: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          check_id: string
          created_at?: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          check_id?: string
          created_at?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "smart_sos_check_events_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "smart_sos_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_sos_checks: {
        Row: {
          confidence: string
          created_at: string
          id: string
          resolved_at: string | null
          signals: Json
          sos_activity_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          signals?: Json
          sos_activity_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          confidence?: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          signals?: Json
          sos_activity_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_sos_checks_sos_activity_id_fkey"
            columns: ["sos_activity_id"]
            isOneToOne: false
            referencedRelation: "safety_activity"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_sos_settings: {
        Row: {
          audio_detection: boolean
          auto_escalation: boolean
          created_at: string
          enabled: boolean
          grace_seconds: number
          inactivity_seconds: number
          motion_detection: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_detection?: boolean
          auto_escalation?: boolean
          created_at?: string
          enabled?: boolean
          grace_seconds?: number
          inactivity_seconds?: number
          motion_detection?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_detection?: boolean
          auto_escalation?: boolean
          created_at?: string
          enabled?: boolean
          grace_seconds?: number
          inactivity_seconds?: number
          motion_detection?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sos_responder_offers: {
        Row: {
          created_at: string
          distance_m: number
          id: string
          requester_id: string
          responded_at: string | null
          responder_id: string
          sos_activity_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          distance_m: number
          id?: string
          requester_id: string
          responded_at?: string | null
          responder_id: string
          sos_activity_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          distance_m?: number
          id?: string
          requester_id?: string
          responded_at?: string | null
          responder_id?: string
          sos_activity_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sos_responder_offers_sos_activity_id_fkey"
            columns: ["sos_activity_id"]
            isOneToOne: false
            referencedRelation: "safety_activity"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_welfare_checks: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          sos_activity_id: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          sos_activity_id: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          sos_activity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sos_welfare_checks_sos_activity_id_fkey"
            columns: ["sos_activity_id"]
            isOneToOne: true
            referencedRelation: "safety_activity"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          created_at: string
          draft_data: Json | null
          id: string
          intent: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          draft_data?: Json | null
          id?: string
          intent?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          draft_data?: Json | null
          id?: string
          intent?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      voice_configuration: {
        Row: {
          created_at: string
          id: boolean
          responder_timeout_seconds: number
          token_ttl_seconds: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: boolean
          responder_timeout_seconds?: number
          token_ttl_seconds?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: boolean
          responder_timeout_seconds?: number
          token_ttl_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_emergency_call_invitation: {
        Args: { p_invitation_id: string }
        Returns: {
          accepted: boolean
          call_session_id: string
        }[]
      }
      claim_due_health_reminders: {
        Args: { p_limit?: number }
        Returns: {
          appointment_date: string
          appointment_time: string
          call_enabled: boolean
          call_time: string | null
          created_at: string
          facility_optional: string | null
          health_context_optional: string | null
          id: string
          last_delivered_at: string | null
          next_delivery_at: string | null
          notes_optional: string | null
          notification_enabled: boolean
          recurrence: Json
          reminder_schedule: Json
          reminder_type: string
          status: string
          timezone: string
          title: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "health_reminders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      confirm_sos_welfare_check: {
        Args: { p_sos_activity_id: string }
        Returns: undefined
      }
      create_sos_responder_offers: {
        Args: { p_radius_meters?: number; p_sos_activity_id: string }
        Returns: {
          display_name: string
          distance_m: number
          offer_id: string
          responder_id: string
          status: string
        }[]
      }
      deliver_due_health_reminders: { Args: never; Returns: number }
      escalate_smart_sos_check: {
        Args: { _check_id: string; _confidence: string; _signals?: Json }
        Returns: Json
      }
      find_allma_member_by_phone: {
        Args: { _phone: string }
        Returns: {
          avatar_url: string
          full_name: string
          phone_verified: boolean
          relationship_state: string
          user_id: string
        }[]
      }
      get_emergency_call_context: {
        Args: { p_call_id: string }
        Returns: {
          accuracy_m: number
          area: string
          caller_avatar_url: string
          caller_name: string
          emergency_type: string
          is_emergency: boolean
          latitude: number
          location_shared: boolean
          longitude: number
          severity: string
        }[]
      }
      get_my_sos_offers: {
        Args: never
        Returns: {
          area: string
          created_at: string
          distance_m: number
          emergency_type: string
          offer_id: string
          sos_activity_id: string
          status: string
        }[]
      }
      get_sos_responder_contacts: {
        Args: { p_sos_activity_id: string }
        Returns: {
          offer_id: string
          phone: string
          responder_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_command_staff: { Args: { _user_id: string }; Returns: boolean }
      is_verified_officer: { Args: { _user_id: string }; Returns: boolean }
      list_my_calls: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string
          created_at: string
          direction: string
          duration: number
          full_name: string
          id: string
          other_user_id: string
          status: string
        }[]
      }
      list_safety_connection_requests: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          direction: string
          full_name: string
          id: string
          note: string
          other_user_id: string
          phone_verified: boolean
        }[]
      }
      list_safety_connections: {
        Args: never
        Returns: {
          allow_emergency_calls: boolean
          avatar_url: string
          created_at: string
          full_name: string
          id: string
          member_id: string
          notify_on_sos: boolean
          phone_verified: boolean
          priority: number
          safety_role: string
          share_location_on_sos: boolean
        }[]
      }
      list_sos_call_attempts: {
        Args: { p_sos_activity_id: string }
        Returns: {
          accepted_at: string
          avatar_url: string
          call_id: string
          connected_at: string
          created_at: string
          duration: number
          ended_at: string
          full_name: string
          recipient_id: string
          safety_role: string
          status: string
        }[]
      }
      list_sos_call_targets: {
        Args: never
        Returns: {
          avatar_url: string
          full_name: string
          member_id: string
          priority: number
          safety_role: string
          share_location_on_sos: boolean
        }[]
      }
      normalize_phone_ug: { Args: { _raw: string }; Returns: string }
      resolve_smart_sos_check: {
        Args: { _check_id: string; _metadata?: Json; _status: string }
        Returns: {
          confidence: string
          created_at: string
          id: string
          resolved_at: string | null
          signals: Json
          sos_activity_id: string | null
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "smart_sos_checks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_responder_notification: {
        Args: {
          p_accept: boolean
          p_notification_id: string
          p_reason?: string
        }
        Returns: string
      }
      respond_to_safety_connection_request: {
        Args: { _action: string; _request_id: string }
        Returns: string
      }
      respond_to_sos_offer: {
        Args: { p_offer_id: string; p_status: string }
        Returns: string
      }
      send_safety_connection_request: {
        Args: { _note?: string; _recipient_id: string }
        Returns: string
      }
      start_sos_emergency_call: {
        Args: { p_recipient_id: string; p_sos_activity_id: string }
        Returns: string
      }
      start_voice_call: { Args: { p_recipient_id: string }; Returns: string }
      update_responder_assignment: {
        Args: {
          p_assignment_id: string
          p_next_status: string
          p_reason?: string
        }
        Returns: {
          accepted_at: string | null
          arrived_at: string | null
          assigned_at: string
          assignment_type: string
          completed_at: string | null
          distance: number | null
          en_route_at: string | null
          id: string
          match_score: number | null
          notes: string | null
          priority: number
          responder_id: string
          responder_profile_id: string | null
          response_outcome: string | null
          sos_session_id: string | null
          status: string
          unable_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "responder_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_voice_call: {
        Args: { p_call_id: string; p_reason?: string; p_status: string }
        Returns: {
          accepted_at: string | null
          call_type: string
          caller_id: string
          connected_at: string | null
          created_at: string
          duration: number | null
          ended_at: string | null
          failure_reason: string | null
          id: string
          provider_confirmed: boolean
          provider_mode: string
          recipient_id: string
          ringing_at: string | null
          sos_session_id: string | null
          started_at: string | null
          status: string
          updated_at: string
          zego_room_id: string | null
          zego_session_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "emergency_calls"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "officer" | "user"
      dispatch_status:
        | "assigned"
        | "notified"
        | "en_route"
        | "on_scene"
        | "completed"
        | "reassigned"
        | "cancelled"
      duty_status:
        | "offline"
        | "available"
        | "on_duty"
        | "en_route"
        | "on_scene"
        | "unavailable"
      incident_priority: "critical" | "high" | "medium" | "low"
      officer_rank:
        | "inspector_general"
        | "deputy_inspector_general"
        | "director"
        | "regional_commander"
        | "district_commander"
        | "division_commander"
        | "station_commander"
        | "operations_officer"
        | "investigator"
        | "cid_officer"
        | "traffic_officer"
        | "patrol_officer"
        | "dispatch_officer"
        | "community_liaison_officer"
        | "call_centre_officer"
        | "evidence_officer"
        | "read_only"
        | "system_administrator"
      officer_status: "pending" | "verified" | "suspended" | "rejected"
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
      app_role: ["admin", "officer", "user"],
      dispatch_status: [
        "assigned",
        "notified",
        "en_route",
        "on_scene",
        "completed",
        "reassigned",
        "cancelled",
      ],
      duty_status: [
        "offline",
        "available",
        "on_duty",
        "en_route",
        "on_scene",
        "unavailable",
      ],
      incident_priority: ["critical", "high", "medium", "low"],
      officer_rank: [
        "inspector_general",
        "deputy_inspector_general",
        "director",
        "regional_commander",
        "district_commander",
        "division_commander",
        "station_commander",
        "operations_officer",
        "investigator",
        "cid_officer",
        "traffic_officer",
        "patrol_officer",
        "dispatch_officer",
        "community_liaison_officer",
        "call_centre_officer",
        "evidence_officer",
        "read_only",
        "system_administrator",
      ],
      officer_status: ["pending", "verified", "suspended", "rejected"],
    },
  },
} as const
