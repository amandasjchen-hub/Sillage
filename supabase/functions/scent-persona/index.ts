import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: perfumes } = await sb
      .from("perfumes")
      .select("name,house,olfactory_family,top_notes,middle_notes,base_notes,rating,status,community_accords")
      .limit(80);

    if (!perfumes || perfumes.length < 3) {
      return new Response(
        JSON.stringify({ error: "need at least 3 perfumes on your shelf to read your persona" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const lines = perfumes
      .map((p: any) => {
        const notes = [
          ...(p.top_notes || []),
          ...(p.middle_notes || []),
          ...(p.base_notes || []),
        ]
          .slice(0, 6)
          .join(", ");
        const accords = (p.community_accords || []).slice(0, 4).join(", ");
        return `- ${p.name} by ${p.house || "?"} [${p.status}${
          p.rating ? `, ${p.rating}/5` : ""
        }]${p.olfactory_family?.length ? ` · ${p.olfactory_family.join("/")}` : ""}${
          notes ? ` · notes: ${notes}` : ""
        }${accords ? ` · accords: ${accords}` : ""}`;
      })
      .join("\n");

    const sys =
      "You are a perfume oracle reading someone's shelf to assign them an olfactive identity. Tone: warm, witty, observational, slightly tarot-card. Lowercase. The persona should feel personal — not a generic category. Pay extra attention to highly-rated bottles and recurring families/notes. Avoid clichés like 'mysterious' alone — be specific. Return your answer as a JSON object with: title (short evocative olfactive identity in 2-4 words, lowercase), tagline (one short witty line under 90 chars, lowercase), description (ONE punchy sentence, maximum 20 words, sharp and specific, lowercase), signature_notes (array of 3-6 single-word notes that recur, lowercase).";
    const user = `here is the user's collection (owned + wishlist):\n${lines}\n\nread them. give them their persona.`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: sys,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "rate limited — try again in a moment" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      console.error("ai error", r.status, await r.text());
      throw new Error("ai_error");
    }
    const data = await r.json();
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no_json_response");
    const persona = JSON.parse(jsonMatch[0]);

    // Cache to DB
    const { data: u } = await sb.auth.getUser();
    if (u.user) {
      await sb.from("scent_personas").upsert({
        user_id: u.user.id,
        title: persona.title,
        tagline: persona.tagline,
        description: persona.description,
        signature_notes: persona.signature_notes ?? [],
        updated_at: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify(persona), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("scent-persona error", e);
    return new Response(JSON.stringify({ error: "something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
