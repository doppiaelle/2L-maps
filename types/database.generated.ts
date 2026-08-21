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
      coordinate_purge_runs: {
        Row: {
          error: string | null
          id: number
          purged_rows: number
          ran_at: string
          succeeded: boolean
        }
        Insert: {
          error?: string | null
          id?: number
          purged_rows: number
          ran_at?: string
          succeeded: boolean
        }
        Update: {
          error?: string | null
          id?: number
          purged_rows?: number
          ran_at?: string
          succeeded?: boolean
        }
        Relationships: []
      }
      favourites: {
        Row: {
          created_at: string
          id: string
          label: string | null
          last_used_at: string | null
          place_id: string | null
          saved_place_id: string | null
          use_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          place_id?: string | null
          saved_place_id?: string | null
          use_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          place_id?: string | null
          saved_place_id?: string | null
          use_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favourites_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places_cache"
            referencedColumns: ["place_id"]
          },
          {
            foreignKeyName: "favourites_saved_place_owner_fkey"
            columns: ["saved_place_id", "user_id"]
            isOneToOne: false
            referencedRelation: "saved_places"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      optimization_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          result: Json
          tier: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          result: Json
          tier: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          result?: Json
          tier?: string
        }
        Relationships: []
      }
      optimization_jobs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          result: Json | null
          route_id: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          result?: Json | null
          route_id: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          result?: Json | null
          route_id?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "optimization_jobs_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      places_cache: {
        Row: {
          coords_refreshed_at: string | null
          created_at: string
          formatted_address: string | null
          lat: number | null
          lng: number | null
          place_id: string
        }
        Insert: {
          coords_refreshed_at?: string | null
          created_at?: string
          formatted_address?: string | null
          lat?: number | null
          lng?: number | null
          place_id: string
        }
        Update: {
          coords_refreshed_at?: string | null
          created_at?: string
          formatted_address?: string | null
          lat?: number | null
          lng?: number | null
          place_id?: string
        }
        Relationships: []
      }
      routes: {
        Row: {
          baseline_duration_s: number | null
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          eta: string | null
          id: string
          is_degraded: boolean
          is_round_trip: boolean
          name: string | null
          optimization_tier: string | null
          optimized_at: string | null
          origin_is_current_location: boolean
          origin_place_id: string | null
          origin_saved_place_id: string | null
          polyline: string | null
          status: Database["public"]["Enums"]["route_status"]
          total_distance_m: number | null
          total_duration_s: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          baseline_duration_s?: number | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          eta?: string | null
          id?: string
          is_degraded?: boolean
          is_round_trip?: boolean
          name?: string | null
          optimization_tier?: string | null
          optimized_at?: string | null
          origin_is_current_location?: boolean
          origin_place_id?: string | null
          origin_saved_place_id?: string | null
          polyline?: string | null
          status?: Database["public"]["Enums"]["route_status"]
          total_distance_m?: number | null
          total_duration_s?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          baseline_duration_s?: number | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          eta?: string | null
          id?: string
          is_degraded?: boolean
          is_round_trip?: boolean
          name?: string | null
          optimization_tier?: string | null
          optimized_at?: string | null
          origin_is_current_location?: boolean
          origin_place_id?: string | null
          origin_saved_place_id?: string | null
          polyline?: string | null
          status?: Database["public"]["Enums"]["route_status"]
          total_distance_m?: number | null
          total_duration_s?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_origin_place_id_fkey"
            columns: ["origin_place_id"]
            isOneToOne: false
            referencedRelation: "places_cache"
            referencedColumns: ["place_id"]
          },
          {
            foreignKeyName: "routes_origin_saved_place_owner_fkey"
            columns: ["origin_saved_place_id", "user_id"]
            isOneToOne: false
            referencedRelation: "saved_places"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      saved_place_coordinates: {
        Row: {
          created_at: string
          lat: number | null
          lng: number | null
          provider: string
          provider_expires_at: string | null
          provider_fetched_at: string | null
          provider_formatted_address: string | null
          provider_place_id: string | null
          provider_raw_payload: Json | null
          saved_place_id: string
        }
        Insert: {
          created_at?: string
          lat?: number | null
          lng?: number | null
          provider: string
          provider_expires_at?: string | null
          provider_fetched_at?: string | null
          provider_formatted_address?: string | null
          provider_place_id?: string | null
          provider_raw_payload?: Json | null
          saved_place_id: string
        }
        Update: {
          created_at?: string
          lat?: number | null
          lng?: number | null
          provider?: string
          provider_expires_at?: string | null
          provider_fetched_at?: string | null
          provider_formatted_address?: string | null
          provider_place_id?: string | null
          provider_raw_payload?: Json | null
          saved_place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_place_coordinates_saved_place_id_fkey"
            columns: ["saved_place_id"]
            isOneToOne: true
            referencedRelation: "saved_places"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_places: {
        Row: {
          address_text: string
          created_at: string
          id: string
          label: string | null
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_text: string
          created_at?: string
          id?: string
          label?: string | null
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_text?: string
          created_at?: string
          id?: string
          label?: string | null
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stops: {
        Row: {
          completed_at: string | null
          created_at: string
          entry_order: number
          id: string
          is_pinned: boolean
          label: string | null
          leg_distance_m: number | null
          leg_duration_s: number | null
          note: string | null
          optimized_order: number | null
          place_id: string | null
          route_id: string
          saved_place_id: string | null
          state: Database["public"]["Enums"]["stop_state"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          entry_order: number
          id?: string
          is_pinned?: boolean
          label?: string | null
          leg_distance_m?: number | null
          leg_duration_s?: number | null
          note?: string | null
          optimized_order?: number | null
          place_id?: string | null
          route_id: string
          saved_place_id?: string | null
          state?: Database["public"]["Enums"]["stop_state"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          entry_order?: number
          id?: string
          is_pinned?: boolean
          label?: string | null
          leg_distance_m?: number | null
          leg_duration_s?: number | null
          note?: string | null
          optimized_order?: number | null
          place_id?: string | null
          route_id?: string
          saved_place_id?: string | null
          state?: Database["public"]["Enums"]["stop_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stops_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places_cache"
            referencedColumns: ["place_id"]
          },
          {
            foreignKeyName: "stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stops_saved_place_id_fkey"
            columns: ["saved_place_id"]
            isOneToOne: false
            referencedRelation: "saved_places"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          cache_hit: boolean
          endpoint: string
          estimated_cost_usd: number | null
          id: number
          occurred_at: string
          tier: string | null
          units: number
          user_id: string
        }
        Insert: {
          cache_hit?: boolean
          endpoint: string
          estimated_cost_usd?: number | null
          id?: number
          occurred_at?: string
          tier?: string | null
          units?: number
          user_id: string
        }
        Update: {
          cache_hit?: boolean
          endpoint?: string
          estimated_cost_usd?: number | null
          id?: number
          occurred_at?: string
          tier?: string | null
          units?: number
          user_id?: string
        }
        Relationships: []
      }
      user_entitlements: {
        Row: {
          day_pass_expires_at: string | null
          expires_at: string | null
          last_event_id: string | null
          occurred_at: string
          plan: string | null
          product_id: string | null
          renews_at: string | null
          revenuecat_customer_id: string | null
          status: Database["public"]["Enums"]["entitlement_status"]
          trial_ends_at: string | null
          updated_at: string
          updated_by: string
          user_id: string
        }
        Insert: {
          day_pass_expires_at?: string | null
          expires_at?: string | null
          last_event_id?: string | null
          occurred_at?: string
          plan?: string | null
          product_id?: string | null
          renews_at?: string | null
          revenuecat_customer_id?: string | null
          status?: Database["public"]["Enums"]["entitlement_status"]
          trial_ends_at?: string | null
          updated_at?: string
          updated_by?: string
          user_id: string
        }
        Update: {
          day_pass_expires_at?: string | null
          expires_at?: string | null
          last_event_id?: string | null
          occurred_at?: string
          plan?: string | null
          product_id?: string | null
          renews_at?: string | null
          revenuecat_customer_id?: string | null
          status?: Database["public"]["Enums"]["entitlement_status"]
          trial_ends_at?: string | null
          updated_at?: string
          updated_by?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      coordinate_max_age: { Args: never; Returns: string }
      coordinate_purge_healthy: { Args: never; Returns: boolean }
      purge_expired_coordinates: { Args: never; Returns: number }
      record_place_use: { Args: { p_place_id: string }; Returns: undefined }
    }
    Enums: {
      entitlement_status:
        | "none"
        | "trial"
        | "active"
        | "grace"
        | "expired"
        | "lapsed"
        | "day-pass"
      job_status: "queued" | "running" | "succeeded" | "failed"
      route_status:
        | "draft"
        | "optimized"
        | "in_progress"
        | "completed"
        | "archived"
      stop_state: "pending" | "completed" | "skipped" | "unreachable"
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
      entitlement_status: [
        "none",
        "trial",
        "active",
        "grace",
        "expired",
        "lapsed",
        "day-pass",
      ],
      job_status: ["queued", "running", "succeeded", "failed"],
      route_status: [
        "draft",
        "optimized",
        "in_progress",
        "completed",
        "archived",
      ],
      stop_state: ["pending", "completed", "skipped", "unreachable"],
    },
  },
} as const
