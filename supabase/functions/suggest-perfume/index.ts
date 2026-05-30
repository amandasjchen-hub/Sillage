import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, field, house } = await req.json();
    if (!query || typeof query !== "string" || query.length > 120) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (field !== "name" && field !== "house") {
      return new Response(JSON.stringify({ error: "Invalid field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sys =
      field === "name"
        ? `You are a perfume autocomplete. Suggest REAL, existing perfume releases that match the user's typed query. Cast the WIDEST possible net — your knowledge MUST cover every house carried on Fragrantica, Parfumo, Basenotes, Ministry of Scent, Stèle (stele.com), Luckyscent, Scent Split, Twisted Lily, MiN New York, Osswald, Indigo Perfumery, The Perfumed Court, Olfactif, AND every fragrance brand sold at Bloomingdale's, Liberty London, Harrods, and Selfridges. This includes niche, indie, artisan, micro-batch, vintage, discontinued, designer, celebrity, and mainstream releases. Match by partial name, fuzzy spelling, or substring anywhere in the name. Return up to 10 matches, ordered by relevance (most popular / closest match first). Never invent — only real perfumes.${house ? ` STRICT: only return perfumes by the house "${house}". Do not include releases from any other house. If the typed query is empty or generic, return that house's most iconic / popular releases.` : ""}`
        : "You are a perfume house autocomplete. Suggest REAL perfume houses (brands) matching the typed query. You MUST know every house carried on Fragrantica, Parfumo, Basenotes, Ministry of Scent, Stèle (stele.com), Luckyscent, Scent Split, Twisted Lily, MiN New York, Osswald, Indigo Perfumery, plus every fragrance brand sold at Bloomingdale's, Liberty London, Harrods, and Selfridges — niche, indie, artisan, designer, mainstream, vintage, discontinued. Match partial / fuzzy / substring. Return up to 10 matches, most relevant / popular first. Never invent.";

    const userMsg =
      field === "name"
        ? `Typed: "${query}"${house ? ` — restrict results to house: ${house} ONLY.` : ""} Return up to 10 matching perfumes as { name, house }, most relevant first.`
        : `Typed: "${query}". Return up to 10 matching perfume houses as { house }, most relevant first.`;

    const params =
      field === "name"
        ? {
            type: "object",
            properties: {
              suggestions: {
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
              },
            },
            required: ["suggestions"],
            additionalProperties: false,
          }
        : {
            type: "object",
            properties: {
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: { house: { type: "string" } },
                  required: ["house"],
                  additionalProperties: false,
                },
              },
            },
            required: ["suggestions"],
            additionalProperties: false,
          };

    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 14000);
    let r: Response;
    try {
      r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: userMsg },
          ],
          tools: [
            {
              type: "function",
              function: { name: "suggest", parameters: params },
            },
          ],
          tool_choice: { type: "function", function: { name: "suggest" } },
        }),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.error("suggest fetch aborted/failed", e);
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    clearTimeout(timeoutId);

    if (r.status === 429 || r.status === 402) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      console.error("suggest gateway error", r.status, await r.text());
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { suggestions: [] };
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-perfume error", e);
    return new Response(JSON.stringify({ suggestions: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
