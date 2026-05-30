import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Mode = "twins" | "vibe" | "wildcard";

async function callAI(system: string, user: string): Promise<unknown> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (r.status === 429) {
    const e: any = new Error("rate_limited");
    e.status = 429;
    throw e;
  }
  if (!r.ok) {
    console.error("anthropic api error", r.status, await r.text());
    throw new Error("ai_error");
  }
  const data = await r.json();
  const text = data.content?.[0]?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("no_json_response");
  return JSON.parse(jsonMatch[0]);
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

    const suggestionResponseFormat = `Return your answer as a JSON object with:
- "intro": a short string framing the recommendations
- "suggestions": array of objects with "name", "house", "why" (required), and optional "notes" (array of strings) and "vibe" (string)`;

    if (mode === "twins") {
      const sys =
        "You are a perfume tastemaker writing for a playful, Co-Star meets Spotify Discover audience. Recommend REAL, verifiable perfumes only — niche or designer, no fabrications. Tone: warm, witty, observational, a little tarot-card. Speak in lowercase. Each `why` should sound like you're describing the person who wears the user's collection — not technical accord-talk. Honor the user's niche taste level strictly when choosing how rare or mainstream picks should be. If a name is provided, you may address them by it once in the intro, casually. " + suggestionResponseFormat;
      const baseMsg = collectionLines
        ? `here is the user's shelf (owned + wishlist):\n${collectionLines}\n\nfind 5 perfumes loved by people with overlapping taste. lean adjacent, not identical. surprise them once.`
        : `the user hasn't added much yet. suggest 5 gateway perfumes across different vibes (floral, woody, gourmand, marine, smoky), calibrated to their niche taste level.`;
      const userMsg = `${personaBlock}\n${baseMsg}`;
      const out = await callAI(sys, userMsg);
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
        "You are a perfume oracle. The user gives you a feeling, memory, character, place, song, color — anything. Translate it into REAL, verifiable perfumes (niche or designer). Pull from how perfume reviewers and wearers describe these scents online — not just notes. Tone: lowercase, warm, evocative, a little house-party-poetic. Each `why` should land the vibe in 1-2 short sentences. Honor the user's niche taste level when calibrating how obscure picks should be. " + suggestionResponseFormat;
      const userMsg = `vibe: "${p}"${personaBlock}\n${
        collectionLines
          ? `for context, the user's shelf already has:\n${collectionLines}\n\navoid recommending those.`
          : ""
      }\n\nreturn 4-5 perfumes that feel like that vibe.`;
      const out = await callAI(sys, userMsg);
      return new Response(JSON.stringify(out), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "wildcard") {
      // Daily seed so it's stable per user per day
      const today = new Date().toISOString().slice(0, 10);
      const sys =
        "You are the wildcard oracle of a perfume app. Every day you invent ONE absurdly specific, tongue-in-cheek situation — the funnier and more oddly specific the better — then recommend ONE real, verifiable perfume that genuinely fits it. The scenario must be written as a SITUATION or SETTING, never starting with a verb or gerund. Good examples: 'the second viewing of a brutalist apartment you can't afford', 'a sunday farmers market where you definitely don't belong', 'the hotel lobby of a country you've never visited'. Bad examples (do NOT do this): 'wearing this to your second viewing', 'attending a farmers market', 'walking through a hotel lobby'. Always a noun phrase describing a place, moment, or situation. Lowercase. Witty. Never repeat yourself. The pick must be a real perfume. Honor the user's niche taste level when choosing how obscure the perfume should be. Return your answer as a JSON object with: \"scenario\" (a hyper-specific situation as a noun phrase) and \"pick\" (object with \"name\", \"house\", \"why\" (one short clever sentence, max 12 words, e.g. 'perfect for someone who irons their linen on principle'), \"smells_like\" (array of exactly 5 short punchy funny bullets, each 3-7 words, co-star horoscope energy — dry, specific, a little absurd. e.g. ['a library that catches fire', 'expensive leather and regret', 'the morning after a good decision', 'someone who reads the menu twice', 'old money with new problems']), \"notes\" (array of note strings), and \"vibe\" string).";
      const userMsg = `today is ${today}.${personaBlock}\ninvent a fresh wildcard scenario and pick the perfume.`;
      const out = await callAI(sys, userMsg);
      return new Response(JSON.stringify(out), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown mode" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    const status = e?.status === 429 ? 429 : 500;
    const msg =
      status === 429
        ? "rate limited — try again in a moment"
        : "something went wrong";
    console.error("discover-perfumes error", e);
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
