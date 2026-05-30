import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    // Parse the data URL: data:<mediaType>;base64,<data>
    const commaIndex = image.indexOf(",");
    const header = image.slice(5, commaIndex); // e.g. "image/jpeg;base64"
    const mediaType = header.split(";")[0] as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    const imageData = image.slice(commaIndex + 1);

    const sys =
      "You are an expert perfumer who identifies fragrance bottles from photographs. Look at the front label of the bottle and identify the EXACT perfume — its full marketing name and the house/brand. Read carefully: many bottles say things like 'eau de parfum', 'natural spray', sizes (50ml/100ml), or batch numbers — those are NOT the name. The name is usually the most prominent line, often a poetic word or short phrase. The house is usually the brand mark at the top or bottom. Return real, verifiable perfumes only. If the photo is too blurry, dark, or doesn't clearly show a perfume bottle, set identified to false. Return your answer as a JSON object with: identified (boolean), name (string), house (string), confidence (\"high\"|\"medium\"|\"low\"), reasoning (string, 1 short sentence), and optionally alternatives (array of {name, house} objects, up to 2).";

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
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Identify this perfume from the photo of its bottle.",
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: imageData,
                },
              },
            ],
          },
        ],
      }),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "rate limited — try again in a moment" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      const t = await r.text();
      console.error("anthropic api error", r.status, t);
      return new Response(JSON.stringify({ error: "ai_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no_json_response");
    const parsed = JSON.parse(jsonMatch[0]);
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
