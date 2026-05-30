import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { name, house } = await req.json();
    if (!name || typeof name !== "string" || name.length > 200) {
      return new Response(JSON.stringify({ error: "Invalid name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPrompt = `Provide structured fragrance information for: "${name}"${
      house ? ` by ${house}` : ""
    }.

CRITICAL ACCURACY RULES:
- Only return data you are highly confident is accurate based on OFFICIAL or RELIABLE sources: the brand's own product page, Luckyscent, Ministry of Scent, Stele, Twisted Lily, Bergdorf Goodman, Neiman Marcus, Saks, Nordstrom, Sephora, Net-a-Porter, MatchesFashion, Liberty London, Selfridges, Harrods, Fortnum & Mason.
- DO NOT INVENT notes, perfumers, years, or prices. If you do not know a field with high confidence, OMIT it entirely.
- If you cannot identify the perfume with confidence, return empty arrays for notes — do not guess.
- Cross-reference: a note should only appear in the aggregated pyramid if at least one official/retailer source lists it.

Return THREE kinds of data:

1) OFFICIAL NOTES — the note pyramid as published by authoritative sources. For each source where you have verified knowledge of the published pyramid, include a separate entry with that source's top/heart/base notes:
   - "brand" (the house's own site), "luckyscent", "ministry_of_scent", "stele"
   Only include sources whose listing you actually know. Aggregated top_notes / middle_notes / base_notes should represent consensus across these sources.

2) COMMUNITY PERCEPTION — how Fragrantica reviewers describe wearing this scent: 1–2 sentence summary, top voted accords, common descriptive words, and a single short evocative epithet ("others_epithet") capturing the dominant vibe in 4–10 words (e.g. "expensive woman at a gala", "first warm afternoon in march"). Omit if you do not know the actual community reception.

3) CLASSIFICATION — one or two olfactory families from this strict set ONLY: floral, woody, aquatic, oriental, fresh, musk. Pick one if there is a clear dominant family; pick two if the scent genuinely spans two (e.g. a floral-musk, a woody-oriental). Never return more than two. Also approximate retail price in USD only if widely published.

Better to return an empty/partial result than to guess.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-pro-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a fragrance reference librarian. You only return data verifiable against the brand's own product page or major reliable retailers (Luckyscent, Ministry of Scent, Stele, Twisted Lily, Bergdorf Goodman, Neiman Marcus, Saks, Nordstrom, Sephora, Net-a-Porter, MatchesFashion, Liberty London, Selfridges, Harrods). Never fabricate notes, perfumers, years, or prices. When uncertain, omit the field.",
          },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "fragrance_profile",
              description: "Structured fragrance metadata.",
              parameters: {
                type: "object",
                properties: {
                  house: { type: "string", description: "Perfume house / brand" },
                  house_origin: { type: "string", description: "City and country of the house, e.g. 'Paris, France'" },
                  year: { type: "integer", description: "Year of release" },
                  perfumer: { type: "string", description: "Nose / perfumer name(s)" },
                  description: { type: "string", description: "1-3 sentence poetic description of the scent" },
                  top_notes: { type: "array", items: { type: "string" } },
                  middle_notes: { type: "array", items: { type: "string" } },
                  base_notes: { type: "array", items: { type: "string" } },
                  similar_perfumes: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-6 similar perfumes formatted as 'Name — House'",
                  },
                  official_sources: {
                    type: "array",
                    description: "Per-source published note pyramids. Only include sources you actually know.",
                    items: {
                      type: "object",
                      properties: {
                        source: {
                          type: "string",
                          enum: ["brand", "luckyscent", "ministry_of_scent", "stele"],
                        },
                        top_notes: { type: "array", items: { type: "string" } },
                        middle_notes: { type: "array", items: { type: "string" } },
                        base_notes: { type: "array", items: { type: "string" } },
                      },
                      required: ["source"],
                      additionalProperties: false,
                    },
                  },
                  community_summary: {
                    type: "string",
                    description: "1-2 sentence summary of how Fragrantica reviewers describe wearing this scent.",
                  },
                  community_accords: {
                    type: "array",
                    items: { type: "string" },
                    description: "Top voted Fragrantica accords, e.g. 'woody', 'amber', 'powdery'. Up to 8.",
                  },
                  community_descriptors: {
                    type: "array",
                    items: { type: "string" },
                    description: "Common descriptive words used by reviewers, e.g. 'warm', 'office-safe', 'linear'. Up to 10.",
                  },
                  others_epithet: {
                    type: "string",
                    description: "Single short evocative epithet capturing the dominant vibe in 4-10 words.",
                  },
                  olfactory_family: {
                    type: "array",
                    description: "One or two olfactory families. Never more than two.",
                    minItems: 1,
                    maxItems: 2,
                    items: {
                      type: "string",
                      enum: ["floral","woody","aquatic","oriental","fresh","musk"],
                    },
                  },
                  price_usd: {
                    type: "number",
                    description: "Approximate retail price in USD for the standard size, if widely known.",
                  },
                },
                required: ["top_notes", "middle_notes", "base_notes", "similar_perfumes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "fragrance_profile" } },
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : {};

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("enrich-perfume error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
