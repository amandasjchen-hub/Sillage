import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml,*/*" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text;
  } catch {
    return null;
  }
}

async function callClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 1024
): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!resp.ok) throw new Error(`Claude API error: ${resp.status}`);
  const data = await resp.json();
  return data.content?.[0]?.text ?? "";
}

interface Notes {
  top_notes: string[];
  middle_notes: string[];
  base_notes: string[];
}

function extractRelevantHtmlSection(html: string): string {
  // Try to find a notes-relevant section to avoid sending irrelevant boilerplate
  const noteKeywords = ["note", "ingredient", "accord", "bergamot", "vetiver", "musk", "jasmine", "cedar", "sandalwood", "rose", "oud"];
  const lowerHtml = html.toLowerCase();

  // Find the earliest occurrence of note-related content
  let earliest = -1;
  for (const kw of noteKeywords) {
    const idx = lowerHtml.indexOf(kw);
    if (idx !== -1 && (earliest === -1 || idx < earliest)) {
      earliest = idx;
    }
  }

  if (earliest > 0) {
    // Start 500 chars before the first note keyword, send 20000 chars from there
    const start = Math.max(0, earliest - 500);
    return html.slice(start, start + 20000);
  }

  // Fallback: first 20000 chars
  return html.slice(0, 20000);
}

async function extractNotesFromHtml(
  apiKey: string,
  html: string,
  perfumeName: string,
  house: string
): Promise<Notes | null> {
  const truncated = extractRelevantHtmlSection(html);
  const text = await callClaude(
    apiKey,
    "claude-sonnet-4-5",
    "You are an expert at parsing HTML from fragrance websites. Extract perfume note information precisely.",
    `Extract the perfume notes for "${perfumeName}" by ${house} from this HTML.
Some brands (like Perfumer H) list all notes as a single flat list without top/middle/base pyramid. In that case, put all notes in top_notes and leave middle_notes and base_notes empty.
Return ONLY a JSON object with these fields: top_notes, middle_notes, base_notes (each an array of strings).
If you cannot find notes, return {"top_notes":[],"middle_notes":[],"base_notes":[]}.
Do not include any other text.

HTML:
${truncated}`,
    512
  );
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Notes;
    const hasNotes =
      parsed.top_notes?.length || parsed.middle_notes?.length || parsed.base_notes?.length;
    return hasNotes ? parsed : null;
  } catch {
    return null;
  }
}

// Source 1: Official brand website — ask Haiku for likely URL, then scrape
async function tryBrandWebsite(
  apiKey: string,
  name: string,
  house: string
): Promise<Notes | null> {
  const urlGuess = await callClaude(
    apiKey,
    "claude-haiku-4-5",
    "You are a helpful assistant that knows perfume brand websites.",
    `What is the most likely direct product page URL for the perfume "${name}" by "${house}"?
Consider common URL patterns like:
- perfumerh.com/products/rain-cloud
- byredo.com/en-us/products/gypsy-water-eau-de-parfum
- diptyqueparis.com/en_us/p/...
Return ONLY the full URL, nothing else. If you are not confident, return "unknown".`,
    128
  );
  const url = urlGuess.trim();
  if (!url || url === "unknown" || !url.startsWith("http")) return null;

  const html = await fetchHtml(url);
  if (!html) return null;
  return await extractNotesFromHtml(apiKey, html, name, house);
}

// Source 2: Fragrantica
async function tryFragrantica(
  apiKey: string,
  name: string,
  house: string
): Promise<Notes | null> {
  const query = encodeURIComponent(`${name} ${house}`);
  const searchUrl = `https://www.fragrantica.com/search/?query=${query}`;
  const searchHtml = await fetchHtml(searchUrl);
  if (!searchHtml) return null;

  // Find first perfume result link
  const linkMatch = searchHtml.match(
    /href="(https:\/\/www\.fragrantica\.com\/perfume\/[^"]+\.html)"/
  );
  if (!linkMatch) return null;
  const perfumeUrl = linkMatch[1];

  const perfumeHtml = await fetchHtml(perfumeUrl);
  if (!perfumeHtml) return null;
  return await extractNotesFromHtml(apiKey, perfumeHtml, name, house);
}

// Source 3: Stele
async function tryStele(
  apiKey: string,
  name: string,
  house: string
): Promise<Notes | null> {
  const query = encodeURIComponent(name);
  const searchUrl = `https://stele.com/search?q=${query}`;
  const searchHtml = await fetchHtml(searchUrl);
  if (!searchHtml) return null;

  // Find first product link
  const linkMatch = searchHtml.match(/href="(\/products\/[^"]+)"/);
  if (!linkMatch) return null;
  const productUrl = `https://stele.com${linkMatch[1]}`;

  const productHtml = await fetchHtml(productUrl);
  if (!productHtml) return null;
  return await extractNotesFromHtml(apiKey, productHtml, name, house);
}

// Source 4: Ministry of Scent
async function tryMinistryOfScent(
  apiKey: string,
  name: string,
  house: string
): Promise<Notes | null> {
  const query = encodeURIComponent(name);
  const searchUrl = `https://www.ministryofscent.com/search?q=${query}`;
  const searchHtml = await fetchHtml(searchUrl);
  if (!searchHtml) return null;

  const linkMatch = searchHtml.match(/href="(\/products\/[^"]+)"/);
  if (!linkMatch) return null;
  const productUrl = `https://www.ministryofscent.com${linkMatch[1]}`;

  const productHtml = await fetchHtml(productUrl);
  if (!productHtml) return null;
  return await extractNotesFromHtml(apiKey, productHtml, name, house);
}

// Claude fallback — asks for notes with explicit sourcing to improve consistency
async function claudeKnowledgeFallback(
  apiKey: string,
  name: string,
  house: string
): Promise<Notes> {
  const text = await callClaude(
    apiKey,
    "claude-sonnet-4-5",
    `You are a fragrance database. Your job is to return the EXACT official notes as published by the brand or Fragrantica — not your interpretation, not community accords.
Be maximally consistent: if asked the same question twice, return the same answer.
Return only notes you are very confident are the officially published pyramid.`,
    `What are the officially published perfume notes for "${name}" by "${house}"?

Think step by step:
1. What does the brand's official website say are the notes?
2. What does Fragrantica list as the official notes pyramid?
3. Are they consistent? Use the most authoritative source.

Return ONLY a JSON object: {"top_notes": [...], "middle_notes": [...], "base_notes": [...]}
- If the brand lists notes as a flat list (no pyramid), put all in top_notes.
- Only include notes you are highly confident about.
- Do not include any other text.`,
    768
  );
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as Notes;
  } catch {
    // ignore
  }
  return { top_notes: [], middle_notes: [], base_notes: [] };
}

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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const houseName = house ?? "";

    // --- Scrape notes in priority order ---
    let scrapedNotes: Notes | null = null;
    let notesSource = "unknown";

    if (!scrapedNotes && houseName) {
      console.log("Trying brand website...");
      scrapedNotes = await tryBrandWebsite(ANTHROPIC_API_KEY, name, houseName).catch(() => null);
      if (scrapedNotes) notesSource = "brand_website";
    }

    if (!scrapedNotes) {
      console.log("Trying Fragrantica...");
      scrapedNotes = await tryFragrantica(ANTHROPIC_API_KEY, name, houseName).catch(() => null);
      if (scrapedNotes) notesSource = "fragrantica";
    }

    if (!scrapedNotes) {
      console.log("Trying Stele...");
      scrapedNotes = await tryStele(ANTHROPIC_API_KEY, name, houseName).catch(() => null);
      if (scrapedNotes) notesSource = "stele";
    }

    if (!scrapedNotes) {
      console.log("Trying Ministry of Scent...");
      scrapedNotes = await tryMinistryOfScent(ANTHROPIC_API_KEY, name, houseName).catch(
        () => null
      );
      if (scrapedNotes) notesSource = "ministry_of_scent";
    }

    if (!scrapedNotes) {
      console.log("Using Claude knowledge fallback...");
      scrapedNotes = await claudeKnowledgeFallback(ANTHROPIC_API_KEY, name, houseName);
      notesSource = "claude_knowledge";
    }

    console.log(`Notes sourced from: ${notesSource}`);

    // --- Ask Claude for everything else (description, community, classification) ---
    const enrichPrompt = `Provide structured fragrance information for: "${name}"${
      houseName ? ` by ${houseName}` : ""
    }.

The notes have already been sourced from ${notesSource}:
Top notes: ${JSON.stringify(scrapedNotes.top_notes)}
Middle notes: ${JSON.stringify(scrapedNotes.middle_notes)}
Base notes: ${JSON.stringify(scrapedNotes.base_notes)}

Using these notes and your knowledge, provide:
1) COMMUNITY PERCEPTION — how Fragrantica/Basenotes reviewers describe wearing this scent: 1-2 sentence summary, top voted accords (up to 8), common descriptive words (up to 10), and a single short evocative epithet ("others_epithet") capturing the dominant vibe in 4-10 words (e.g. "expensive woman at a gala", "first warm afternoon in march").

2) CLASSIFICATION — one or two olfactory families from this strict set ONLY: floral, woody, aquatic, oriental, fresh, musk. Never return more than two.

3) OTHER DETAILS — house, year (integer), perfumer, description (1-3 sentence poetic), similar_perfumes (3-6 items formatted as "Name — House"), house_origin, price_usd (number, only if widely published).

Return as a JSON object with fields: house, house_origin, year, perfumer, description, similar_perfumes, community_summary, community_accords, community_descriptors, others_epithet, olfactory_family, price_usd.
Do NOT include top_notes/middle_notes/base_notes — those are already sourced.
Omit fields you are not confident about rather than guessing.`;

    const enrichText = await callClaude(
      ANTHROPIC_API_KEY,
      "claude-sonnet-4-5",
      "You are a world-class fragrance expert. Return your answer as a JSON object. Be concise and accurate.",
      enrichPrompt,
      2048
    );

    let enriched: Record<string, unknown> = {};
    try {
      const match = enrichText.match(/\{[\s\S]*\}/);
      if (match) enriched = JSON.parse(match[0]);
    } catch {
      console.error("Failed to parse enrichment JSON");
    }

    // Merge: scraped notes override any notes from Claude
    const result = {
      ...enriched,
      top_notes: scrapedNotes.top_notes,
      middle_notes: scrapedNotes.middle_notes,
      base_notes: scrapedNotes.base_notes,
      notes_source: notesSource,
    };

    return new Response(JSON.stringify(result), {
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
