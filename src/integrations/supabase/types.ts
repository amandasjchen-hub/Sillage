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
      capsule_perfumes: {
        Row: {
          capsule_id: string
          created_at: string
          perfume_id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          capsule_id: string
          created_at?: string
          perfume_id: string
          reason?: string | null
          user_id: string
        }
        Update: {
          capsule_id?: string
          created_at?: string
          perfume_id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capsule_perfumes_capsule_id_fkey"
            columns: ["capsule_id"]
            isOneToOne: false
            referencedRelation: "capsules"
            referencedColumns: ["id"]
          },
        ]
      }
      capsules: {
        Row: {
          created_at: string
          id: string
          name: string
          trip_notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          trip_notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          trip_notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      diary_entries: {
        Row: {
          created_at: string
          id: string
          location: string | null
          memory: string | null
          occasion: string | null
          perfume_id: string
          user_id: string
          worn_on: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          memory?: string | null
          occasion?: string | null
          perfume_id: string
          user_id: string
          worn_on?: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          memory?: string | null
          occasion?: string | null
          perfume_id?: string
          user_id?: string
          worn_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "diary_entries_perfume_id_fkey"
            columns: ["perfume_id"]
            isOneToOne: false
            referencedRelation: "perfumes"
            referencedColumns: ["id"]
          },
        ]
      }
      discover_history: {
        Row: {
          created_at: string
          id: string
          mode: string
          payload: Json
          prompt: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode: string
          payload: Json
          prompt?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          payload?: Json
          prompt?: string | null
          user_id?: string
        }
        Relationships: []
      }
      perfume_image_cache: {
        Row: {
          created_at: string
          house: string | null
          image_source: string | null
          image_url: string
          key: string
          name: string
        }
        Insert: {
          created_at?: string
          house?: string | null
          image_source?: string | null
          image_url: string
          key: string
          name: string
        }
        Update: {
          created_at?: string
          house?: string | null
          image_source?: string | null
          image_url?: string
          key?: string
          name?: string
        }
        Relationships: []
      }
      perfume_shelves: {
        Row: {
          created_at: string
          perfume_id: string
          shelf_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          perfume_id: string
          shelf_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          perfume_id?: string
          shelf_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfume_shelves_perfume_id_fkey"
            columns: ["perfume_id"]
            isOneToOne: false
            referencedRelation: "perfumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfume_shelves_shelf_id_fkey"
            columns: ["shelf_id"]
            isOneToOne: false
            referencedRelation: "shelves"
            referencedColumns: ["id"]
          },
        ]
      }
      perfumes: {
        Row: {
          ai_enriched: boolean
          base_notes: string[] | null
          blind_buy: Database["public"]["Enums"]["blind_buy_score"] | null
          community_accords: string[]
          community_descriptors: string[]
          community_summary: string | null
          created_at: string
          description: string | null
          epithet: string | null
          house: string | null
          house_origin: string | null
          id: string
          image_source: string | null
          image_url: string | null
          image_url_nobg: string | null
          middle_notes: string[] | null
          name: string
          official_sources: Json
          olfactory_family: string[]
          others_epithet: string | null
          perfumer: string | null
          price_usd: number | null
          purchased_at: string | null
          purchased_country: string | null
          rating: number | null
          similar_perfumes: string[] | null
          status: Database["public"]["Enums"]["perfume_status"]
          top_notes: string[] | null
          updated_at: string
          user_id: string
          year: number | null
        }
        Insert: {
          ai_enriched?: boolean
          base_notes?: string[] | null
          blind_buy?: Database["public"]["Enums"]["blind_buy_score"] | null
          community_accords?: string[]
          community_descriptors?: string[]
          community_summary?: string | null
          created_at?: string
          description?: string | null
          epithet?: string | null
          house?: string | null
          house_origin?: string | null
          id?: string
          image_source?: string | null
          image_url?: string | null
          image_url_nobg?: string | null
          middle_notes?: string[] | null
          name: string
          official_sources?: Json
          olfactory_family?: string[]
          others_epithet?: string | null
          perfumer?: string | null
          price_usd?: number | null
          purchased_at?: string | null
          purchased_country?: string | null
          rating?: number | null
          similar_perfumes?: string[] | null
          status?: Database["public"]["Enums"]["perfume_status"]
          top_notes?: string[] | null
          updated_at?: string
          user_id: string
          year?: number | null
        }
        Update: {
          ai_enriched?: boolean
          base_notes?: string[] | null
          blind_buy?: Database["public"]["Enums"]["blind_buy_score"] | null
          community_accords?: string[]
          community_descriptors?: string[]
          community_summary?: string | null
          created_at?: string
          description?: string | null
          epithet?: string | null
          house?: string | null
          house_origin?: string | null
          id?: string
          image_source?: string | null
          image_url?: string | null
          image_url_nobg?: string | null
          middle_notes?: string[] | null
          name?: string
          official_sources?: Json
          olfactory_family?: string[]
          others_epithet?: string | null
          perfumer?: string | null
          price_usd?: number | null
          purchased_at?: string | null
          purchased_country?: string | null
          rating?: number | null
          similar_perfumes?: string[] | null
          status?: Database["public"]["Enums"]["perfume_status"]
          top_notes?: string[] | null
          updated_at?: string
          user_id?: string
          year?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          full_name: string | null
          id: string
          location: string | null
          niche_level: number
          theme: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          full_name?: string | null
          id: string
          location?: string | null
          niche_level?: number
          theme?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          full_name?: string | null
          id?: string
          location?: string | null
          niche_level?: number
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      scent_personas: {
        Row: {
          created_at: string
          description: string
          signature_notes: string[]
          tagline: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          signature_notes?: string[]
          tagline: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          signature_notes?: string[]
          tagline?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shelves: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      blind_buy_score: "safe" | "risky" | "polarizing"
      perfume_status: "owned" | "wishlist"
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
      blind_buy_score: ["safe", "risky", "polarizing"],
      perfume_status: ["owned", "wishlist"],
    },
  },
} as const
