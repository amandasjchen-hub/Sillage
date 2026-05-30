// Cast to `any` to preserve the loose typing the rest of the app expects
// (the generated Database types are stricter about Json columns).
import { supabase as typedSupabase } from "@/integrations/supabase/client";
export const supabase: any = typedSupabase;

export type Perfume = {
  id: string;
  user_id: string;
  name: string;
  house: string | null;
  house_origin: string | null;
  year: number | null;
  perfumer: string | null;
  description: string | null;
  top_notes: string[];
  middle_notes: string[];
  base_notes: string[];
  similar_perfumes: string[];
  rating: number | null;
  blind_buy: BlindBuy | null;
  status: "owned" | "wishlist";
  image_url: string | null;
  image_url_nobg: string | null;
  ai_enriched: boolean;
  official_sources: OfficialSource[];
  community_summary: string | null;
  community_accords: string[];
  community_descriptors: string[];
  olfactory_family: string[];
  price_usd: number | null;
  epithet: string | null;
  others_epithet: string | null;
  image_source: string | null;
  created_at: string;
  updated_at: string;
};

export type BlindBuy = "safe" | "risky" | "polarizing";

export const BLIND_BUY_LABELS: Record<BlindBuy, { label: string; tone: string }> = {
  safe: { label: "safe blind buy", tone: "hsl(140 30% 38%)" },
  risky: { label: "risky", tone: "hsl(28 60% 45%)" },
  polarizing: { label: "polarizing", tone: "hsl(340 50% 45%)" },
};

export type OfficialSourceKey = "brand" | "luckyscent" | "ministry_of_scent" | "stele";

export type OfficialSource = {
  source: OfficialSourceKey;
  top_notes?: string[];
  middle_notes?: string[];
  base_notes?: string[];
};

export const SOURCE_LABELS: Record<OfficialSourceKey, string> = {
  brand: "brand",
  luckyscent: "luckyscent",
  ministry_of_scent: "ministry of scent",
  stele: "stele",
};

export type Shelf = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type DiaryEntry = {
  id: string;
  user_id: string;
  perfume_id: string;
  worn_on: string;
  occasion: string | null;
  location: string | null;
  memory: string | null;
  created_at: string;
};
