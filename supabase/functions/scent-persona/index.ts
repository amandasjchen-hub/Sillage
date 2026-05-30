import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description:
        "A short, evocative olfactive identity in 2-4 words, e.g. 'the dark romantic', 'the quiet hedonist', 'the museum ghost'. lowercase.",
    },
    tagline: {
      type: "string",
      description: "One short witty line that captures the persona. lowercase. under 90 chars.",
    },
    description: {
      type: "string",
      description:
        "A 2-3 sentence reading of the user's scent identity. warm, observational, lowercase. like a horoscope, not a review.",
    },
    signature_notes: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 6,
      description: "3-6 single-word notes that recur across their shelf (lowercase).",
    },
  },
  required: ["title", "tagline", "description", "signature_notes"],
  additionalProperties: false,
} as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

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
      "You are a perfume oracle reading someone's shelf to assign them an olfactive identity. Tone: warm, witty, observational, slightly tarot-card. Lowercase. The persona should feel personal — not a generic category. Pay extra attention to highly-rated bottles and recurring families/notes. Avoid clichés like 'mysterious' alone — be specific.";
    const user = `here is the user's collection (owned + wishlist):\n${lines}\n\nread them. give them their persona.`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        tools: [{ type: "function", function: { name: "persona", parameters: SCHEMA } }],
        tool_choice: { type: "function", function: { name: "persona" } },
      }),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "rate limited — try again in a moment" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (r.status === 402) {
      return new Response(JSON.stringify({ error: "ai credits exhausted" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      console.error("ai error", r.status, await r.text());
      throw new Error("ai_error");
    }
    const data = await r.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("no_tool_call");
    const persona = JSON.parse(args);

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
