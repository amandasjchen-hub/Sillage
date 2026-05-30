import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SCHEMA = {
  type: "object",
  properties: {
    identified: {
      type: "boolean",
      description: "true if a perfume bottle is clearly visible and identifiable",
    },
    name: {
      type: "string",
      description: "exact perfume name as printed on the bottle, lowercase if uncertain about casing",
    },
    house: {
      type: "string",
      description: "the perfume house / brand (e.g. 'creed', 'le labo', 'maison francis kurkdjian')",
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description:
        "high = label clearly readable and you are sure; medium = readable but a guess; low = mostly inferred from bottle shape/color",
    },
    reasoning: {
      type: "string",
      description: "1 short sentence explaining what you read or saw on the bottle",
    },
    alternatives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          house: { type: "string" },
        },
        required: ["name", "house"],
        additionalProperties: false,
      },
      description: "up to 2 plausible alternates if not confident",
    },
  },
  required: ["identified", "name", "house", "confidence", "reasoning"],
  additionalProperties: false,
} as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image } = (await req.json()) as { image?: string };
    if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
      return new Response(
        JSON.stringify({ error: "missing or invalid image (expected data: URL)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const sys =
      "You are an expert perfumer who identifies fragrance bottles from photographs. Look at the front label of the bottle and identify the EXACT perfume — its full marketing name and the house/brand. Read carefully: many bottles say things like 'eau de parfum', 'natural spray', sizes (50ml/100ml), or batch numbers — those are NOT the name. The name is usually the most prominent line, often a poetic word or short phrase. The house is usually the brand mark at the top or bottom. Return real, verifiable perfumes only. If the photo is too blurry, dark, or doesn't clearly show a perfume bottle, set identified=false.";

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
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Identify this perfume from the photo of its bottle.",
              },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: { name: "identify", parameters: SCHEMA },
          },
        ],
        tool_choice: { type: "function", function: { name: "identify" } },
      }),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "rate limited — try again in a moment" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (r.status === 402) {
      return new Response(
        JSON.stringify({ error: "ai credits exhausted — top up in workspace settings" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!r.ok) {
      const t = await r.text();
      console.error("ai gateway error", r.status, t);
      return new Response(JSON.stringify({ error: "ai_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("no_tool_call");
    const parsed = JSON.parse(args);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("identify-perfume error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
