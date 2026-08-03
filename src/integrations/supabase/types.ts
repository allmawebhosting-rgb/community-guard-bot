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
    PostgrestVersion: "14.15"
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
          full_name: string | null
          id: string
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string
          phone?: string | null
          updated_at?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_command_staff: { Args: { _user_id: string }; Returns: boolean }
      is_verified_officer: { Args: { _user_id: string }; Returns: boolean }
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
