/* eslint-disable */
// AUTO-GENERATED — DO NOT EDIT
// Run migrations to regenerate.

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
      answered_prayers: {
        Row: {
          answer: string
          created_at: string | null
          id: string
          request: string
          shared: boolean | null
          user_id: string
        }
        Insert: {
          answer: string
          created_at?: string | null
          id?: string
          request: string
          shared?: boolean | null
          user_id: string
        }
        Update: {
          answer?: string
          created_at?: string | null
          id?: string
          request?: string
          shared?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answered_prayers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_amens: {
        Row: {
          created_at: string | null
          echo_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          echo_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          echo_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_amens_echo_id_fkey"
            columns: ["echo_id"]
            isOneToOne: false
            referencedRelation: "community_echoes"
            referencedColumns: ["id"]
          },
        ]
      }
      community_echoes: {
        Row: {
          amens: number | null
          created_at: string | null
          id: string
          text: string
          user_id: string | null
        }
        Insert: {
          amens?: number | null
          created_at?: string | null
          id?: string
          text: string
          user_id?: string | null
        }
        Update: {
          amens?: number | null
          created_at?: string | null
          id?: string
          text?: string
          user_id?: string | null
        }
        Relationships: []
      }
      day_progress: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          day: number
          duration: number | null
          id: string
          journey_pass: number | null
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          day: number
          duration?: number | null
          id?: string
          journey_pass?: number | null
          user_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          day?: number
          duration?: number | null
          id?: string
          journey_pass?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_stats: {
        Row: {
          created_at: string | null
          current_day: number | null
          id: string
          is_subscriber: boolean | null
          journey_complete: boolean | null
          journey_pass: number | null
          last_completed_date: string | null
          last_opened_date: string | null
          open_streak_count: number | null
          streak_count: number | null
          tier_level: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_day?: number | null
          id?: string
          is_subscriber?: boolean | null
          journey_complete?: boolean | null
          journey_pass?: number | null
          last_completed_date?: string | null
          last_opened_date?: string | null
          open_streak_count?: number | null
          streak_count?: number | null
          tier_level?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_day?: number | null
          id?: string
          is_subscriber?: boolean | null
          journey_complete?: boolean | null
          journey_pass?: number | null
          last_completed_date?: string | null
          last_opened_date?: string | null
          open_streak_count?: number | null
          streak_count?: number | null
          tier_level?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      phase_timings: {
        Row: {
          id: string
          phase_name: string
          total_seconds: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          phase_name: string
          total_seconds?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          phase_name?: string
          total_seconds?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_timings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prayer_requests: {
        Row: {
          answer: string | null
          answered_at: string | null
          created_at: string | null
          id: string
          is_answered: boolean | null
          text: string
          user_id: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          created_at?: string | null
          id?: string
          is_answered?: boolean | null
          text: string
          user_id: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          created_at?: string | null
          id?: string
          is_answered?: boolean | null
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prayer_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ambient_muted: boolean | null
          blocker: number | null
          created_at: string | null
          dark_mode: boolean | null
          first_name: string
          font_size: string | null
          id: string
          onboarding_complete: boolean | null
          prayer_life: string
          reminder_time: string | null
          soundscape: string | null
          updated_at: string | null
        }
        Insert: {
          ambient_muted?: boolean | null
          blocker?: number | null
          created_at?: string | null
          dark_mode?: boolean | null
          first_name: string
          font_size?: string | null
          id: string
          onboarding_complete?: boolean | null
          prayer_life?: string
          reminder_time?: string | null
          soundscape?: string | null
          updated_at?: string | null
        }
        Update: {
          ambient_muted?: boolean | null
          blocker?: number | null
          created_at?: string | null
          dark_mode?: boolean | null
          first_name?: string
          font_size?: string | null
          id?: string
          onboarding_complete?: boolean | null
          prayer_life?: string
          reminder_time?: string | null
          soundscape?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      weekly_reflections: {
        Row: {
          created_at: string | null
          id: string
          journey_pass: number | null
          question_1: string | null
          question_2: string | null
          question_3: string | null
          user_id: string
          week: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          journey_pass?: number | null
          question_1?: string | null
          question_2?: string | null
          question_3?: string | null
          user_id: string
          week: number
        }
        Update: {
          created_at?: string | null
          id?: string
          journey_pass?: number | null
          question_1?: string | null
          question_2?: string | null
          question_3?: string | null
          user_id?: string
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reflections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      amen_community_echo: {
        Args: { p_echo_id: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
