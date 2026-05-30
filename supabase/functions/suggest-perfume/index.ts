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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY is not set");
      return new Response(JSON.stringify({ suggestions: [], debug: "no api key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sys =
      field === "name"
        ? `You are a perfume autocomplete with expert knowledge of the entire fragrance world. You MUST know every release from these key houses and retailers: Stèle, Fragrantica database, Ministry of Scent, Dover Street Parfums Market, Luckyscent, Twisted Lily, Diptyque, Le Labo, Byredo, Perfumer H, Maison Margiela REPLICA, Frederic Malle, Serge Lutens, Comme des Garçons Parfums, Juliette Has a Gun, Maison Francis Kurkdjian, Acqua di Parma, Creed, Tom Ford Private Blend, Penhaligon's, Amouage, Orto Parisi, Bogue Profumo, Nishane, Zoologist, Imaginary Authors, D.S. & Durga, Nomenclature, Vilhelm Parfumerie, Goldfield & Banks, Strangers Parfumerie, Régime des Fleurs, Nomenclature, Sweet Tea Apothecary, Salvia Officinalis, Ellis Brooklyn, Jorum Studio, Papillon Artisan Perfumes, Art de Parfum, Tauer Perfumes, Areej Le Doré, Ensar Oud, Hiram Green, Liquid Imaginary, Olympic Orchids, Possets, Blackbird, and ALL houses on Fragrantica and Basenotes. Include niche, indie, artisan, micro-batch, vintage, discontinued, mainstream, designer, and celebrity releases. Match by partial name, fuzzy spelling, or substring. Return up to 10 matches, most relevant first. Never invent perfumes.${house ? ` STRICT: only return perfumes by the house "${house}". Do not include releases from any other house.` : ""} Return your answer as a JSON object with a "suggestions" array. Each item should have "name" and "house" fields.`
        : `You are a perfume house autocomplete with expert knowledge of the entire fragrance world. You MUST know: Stèle, Ministry of Scent, Dover Street Parfums Market, Luckyscent, Twisted Lily, Diptyque, Le Labo, Byredo, Perfumer H, Maison Margiela, Frederic Malle, Serge Lutens, Comme des Garçons Parfums, Juliette Has a Gun, Maison Francis Kurkdjian, Acqua di Parma, Creed, Tom Ford, Penhaligon's, Amouage, Orto Parisi, Nishane, Zoologist, Imaginary Authors, D.S. & Durga, Vilhelm Parfumerie, Goldfield & Banks, Régime des Fleurs, Ellis Brooklyn, Jorum Studio, Papillon Artisan Perfumes, Tauer Perfumes, and ALL houses on Fragrantica and Basenotes — niche, indie, artisan, designer, mainstream, vintage, discontinued. Match partial / fuzzy / substring. Return up to 10 matches, most relevant first. Never invent. Return your answer as a JSON object with a "suggestions" array. Each item should have a "house" field.`;

    const userMsg =
      field === "name"
        ? `Typed: "${query}"${house ? ` — restrict results to house: ${house} ONLY.` : ""} Return up to 10 matching perfumes as { name, house }, most relevant first.`
        : `Typed: "${query}". Return up to 10 matching perfume houses as { house }, most relevant first.`;

    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 14000);
    let r: Response;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
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
          messages: [{ role: "user", content: userMsg }],
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

    if (r.status === 429) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      const errText = await r.text();
      console.error("suggest anthropic error", r.status, errText);
      return new Response(JSON.stringify({ suggestions: [], debug: `anthropic error ${r.status}: ${errText}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const text = data.content?.[0]?.text ?? "";
    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { suggestions: [] };
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
