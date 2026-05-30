import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Mode = "twins" | "vibe" | "wildcard";

type Suggestion = {
  name: string;
  house: string;
  why: string;
  notes?: string[];
  vibe?: string;
};

const SUGGESTION_SCHEMA = {
  type: "object",
  properties: {
    intro: { type: "string" },
    suggestions: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          house: { type: "string" },
          why: { type: "string" },
          notes: { type: "array", items: { type: "string" } },
          vibe: { type: "string" },
        },
        required: ["name", "house", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["intro", "suggestions"],
  additionalProperties: false,
} as const;

const WILDCARD_SCHEMA = {
  type: "object",
  properties: {
    scenario: {
      type: "string",
      description:
        "A tongue-in-cheek, hyper-specific occasion or vibe — e.g. 'a fragrance to wear on a deep-sea fishing date — romantic but pairs well with fish.'",
    },
    pick: {
      type: "object",
      properties: {
        name: { type: "string" },
        house: { type: "string" },
        why: { type: "string" },
        notes: { type: "array", items: { type: "string" } },
        vibe: { type: "string" },
      },
      required: ["name", "house", "why"],
      additionalProperties: false,
    },
  },
  required: ["scenario", "pick"],
  additionalProperties: false,
} as const;

async function callAI(system: string, user: string, schema: unknown, schemaName: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [
        {
          type: "function",
          function: { name: schemaName, parameters: schema },
        },
      ],
      tool_choice: { type: "function", function: { name: schemaName } },
    }),
  });

  if (r.status === 429) {
    const e: any = new Error("rate_limited");
    e.status = 429;
    throw e;
  }
  if (r.status === 402) {
    const e: any = new Error("payment_required");
    e.status = 402;
    throw e;
  }
  if (!r.ok) {
    console.error("ai gateway error", r.status, await r.text());
    throw new Error("ai_error");
  }
  const data = await r.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("no_tool_call");
  return JSON.parse(args);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, prompt } = (await req.json()) as { mode: Mode; prompt?: string };
    if (!mode) {
      return new Response(JSON.stringify({ error: "missing mode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth — pull user collection for personalization on twins mode
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    let collectionLines = "";
    if (mode === "twins" || mode === "vibe") {
      const { data: perfumes } = await sb
        .from("perfumes")
        .select("name,house,olfactory_family,top_notes,middle_notes,base_notes,rating,status")
        .limit(60);
      if (perfumes && perfumes.length) {
        collectionLines = perfumes
          .map((p: any) => {
            const notes = [
              ...(p.top_notes || []),
              ...(p.middle_notes || []),
              ...(p.base_notes || []),
            ]
              .slice(0, 6)
              .join(", ");
            return `- ${p.name} by ${p.house || "?"} [${p.status}${
              p.rating ? `, ${p.rating}/5` : ""
            }]${p.olfactory_family ? ` · ${p.olfactory_family}` : ""}${
              notes ? ` · ${notes}` : ""
            }`;
          })
          .join("\n");
      }
    }

    // Pull personalization profile (name, location, niche level)
    const { data: profile } = await sb
      .from("profiles")
      .select("full_name, display_name, location, niche_level")
      .maybeSingle();

    const nicheLabels: Record<number, string> = {
      1: "loves designer & mainstream mall scents — keep picks accessible, widely loved, easily sampled",
      2: "mostly mainstream with a curious streak — mix popular designer with one approachable niche",
      3: "open to everything — balance designer and niche freely",
      4: "leans niche — favor lesser-known houses, indie and boutique brands",
      5: "wants the most obscure scent known to humankind — go deep into rare indie, artisan, micro-batch, hard-to-find releases",
    };
    const niche = profile?.niche_level ?? 3;
    const personaLines = [
      profile?.full_name || profile?.display_name
        ? `name: ${profile.full_name || profile.display_name}`
        : null,
      profile?.location ? `location: ${profile.location}` : null,
      `niche taste level (1-5): ${niche} — ${nicheLabels[niche] || nicheLabels[3]}`,
    ]
      .filter(Boolean)
      .join("\n");
    const personaBlock = personaLines ? `\n\nabout the user:\n${personaLines}\n` : "";

    if (mode === "twins") {
      const sys =
        "You are a perfume tastemaker writing for a playful, Co-Star meets Spotify Discover audience. Recommend REAL, verifiable perfumes only — niche or designer, no fabrications. Tone: warm, witty, observational, a little tarot-card. Speak in lowercase. Each `why` should sound like you're describing the person who wears the user's collection — not technical accord-talk. Honor the user's niche taste level strictly when choosing how rare or mainstream picks should be. If a name is provided, you may address them by it once in the intro, casually.";
      const baseMsg = collectionLines
        ? `here is the user's shelf (owned + wishlist):\n${collectionLines}\n\nfind 5 perfumes loved by people with overlapping taste. lean adjacent, not identical. surprise them once.`
        : `the user hasn't added much yet. suggest 5 gateway perfumes across different vibes (floral, woody, gourmand, marine, smoky), calibrated to their niche taste level.`;
      const userMsg = `${personaBlock}\n${baseMsg}`;
      const out = await callAI(sys, userMsg, SUGGESTION_SCHEMA, "recommend");
      return new Response(JSON.stringify(out), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "vibe") {
      const p = (prompt || "").trim();
      if (!p) {
        return new Response(JSON.stringify({ error: "missing prompt" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const sys =
        "You are a perfume oracle. The user gives you a feeling, memory, character, place, song, color — anything. Translate it into REAL, verifiable perfumes (niche or designer). Pull from how perfume reviewers and wearers describe these scents online — not just notes. Tone: lowercase, warm, evocative, a little house-party-poetic. Each `why` should land the vibe in 1-2 short sentences. Honor the user's niche taste level when calibrating how obscure picks should be.";
      const userMsg = `vibe: "${p}"${personaBlock}\n${
        collectionLines
          ? `for context, the user's shelf already has:\n${collectionLines}\n\navoid recommending those.`
          : ""
      }\n\nreturn 4-5 perfumes that feel like that vibe.`;
      const out = await callAI(sys, userMsg, SUGGESTION_SCHEMA, "recommend");
      return new Response(JSON.stringify(out), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "wildcard") {
      // Daily seed so it's stable per user per day
      const today = new Date().toISOString().slice(0, 10);
      const sys =
        "You are the wildcard oracle of a perfume app. Every day you invent ONE absurdly specific, tongue-in-cheek occasion — the funnier and more oddly specific the better — then recommend ONE real, verifiable perfume that genuinely fits it. Examples of scenarios: 'a fragrance to wear on a deep-sea fishing date — romantic but pairs well with fish', 'for the third act of your villain era at a farmer's market', 'if you were a librarian who just inherited a vineyard'. Lowercase. Witty. Never repeat yourself. The pick must be a real perfume. Honor the user's niche taste level when choosing how obscure the perfume should be. If a location is provided, you may occasionally weave it into the scenario.";
      const userMsg = `today is ${today}.${personaBlock}\ninvent a fresh wildcard scenario and pick the perfume.`;
      const out = await callAI(sys, userMsg, WILDCARD_SCHEMA, "wildcard");
      return new Response(JSON.stringify(out), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown mode" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    const status = e?.status === 429 ? 429 : e?.status === 402 ? 402 : 500;
    const msg =
      status === 429
        ? "rate limited — try again in a moment"
        : status === 402
        ? "ai credits exhausted — top up in workspace settings"
        : "something went wrong";
    console.error("discover-perfumes error", e);
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
