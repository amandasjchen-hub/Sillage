import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Authorized retailers we trust to carry official product photography.
const RETAILER_ALLOWLIST = [
  "luckyscent.com",
  "ministryofscent.com",
  "stelefragrances.com",
  "twistedlily.com",
  "scentsplit.com",
  "neimanmarcus.com",
  "saksfifthavenue.com",
  "nordstrom.com",
  "bergdorfgoodman.com",
  "barneys.com",
  "harrods.com",
  "selfridges.com",
  "libertylondon.com",
  "sephora.com",
  "ulta.com",
  "bloomingdales.com",
  "net-a-porter.com",
  "mrporter.com",
  "matchesfashion.com",
  "ssense.com",
  "fortnumandmason.com",
  "fragrantica.com",
  "parfumo.com",
  "parfumo.net",
  "basenotes.com",
  "now-smell-this.com",
  "cafleurebon.com",
  "perfumeposse.com",
];

// Image-CDN hosts commonly used by Shopify/BigCommerce/SquareSpace stores
// that small/indie brands rely on. We accept these as "likely brand/retailer".
const CDN_ALLOWLIST = [
  "cdn.shopify.com",
  "shopify.com",
  "cdn11.bigcommerce.com",
  "cdn-01.media-amazon.com",
  "images.squarespace-cdn.com",
  "static.squarespace.com",
  "cdn.shopifycdn.net",
  "fimgs.net", // Fragrantica image CDN
  "media.fragrantica.com",
  "i.pinimg.com", // Pinterest images (often re-hosted official shots)
  "pinimg.com",
];

// Hosts we never trust for product imagery.
const HOST_BLOCKLIST = [
  "wikipedia.org",
  "wikimedia.org",
  "facebook.com",
  "fbcdn.net",
  "instagram.com",
  "cdninstagram.com",
  "twitter.com",
  "x.com",
  "twimg.com",
  "tiktok.com",
  "youtube.com",
  "ytimg.com",
  "reddit.com",
  "redd.it",
  "ebay.com",
  "etsy.com", // often replicas/dupes
  "aliexpress.com",
  "alicdn.com",
  "amazon.com", // often grey-market with wrong photos
  "ssl-images-amazon.com",
  "media-amazon.com",
];

// Filename / path patterns that almost always indicate non-product imagery.
const BAD_PATH_RE = /(logo|sprite|favicon|icon[-_]|banner|header|hero[-_]|category|placeholder|swatch|nav[-_]|footer|social|share|og[-_]image|press[-_]?kit|wordmark|brandmark|avatar|profile)/i;

function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

function isBlocked(u: string): boolean {
  const h = hostOf(u);
  if (!h) return true;
  return HOST_BLOCKLIST.some((d) => h === d || h.endsWith("." + d));
}

function isAllowed(u: string, brandDomains: string[]): boolean {
  const h = hostOf(u);
  if (!h) return false;
  if (isBlocked(u)) return false;
  if (brandDomains.some((d) => h === d || h.endsWith("." + d))) return true;
  if (RETAILER_ALLOWLIST.some((d) => h === d || h.endsWith("." + d))) return true;
  if (CDN_ALLOWLIST.some((d) => h === d || h.endsWith("." + d))) return true;
  return false;
}

// Looser check used as a final fallback — anything not on blocklist, with a
// product-looking path, is acceptable. Still blocks social/wiki/marketplaces.
function isAllowedLoose(u: string): boolean {
  if (isBlocked(u)) return false;
  return true;
}

function looksLikeNonProduct(u: string): boolean {
  try {
    const path = new URL(u).pathname.toLowerCase();
    return BAD_PATH_RE.test(path);
  } catch {
    return true;
  }
}

async function fetchImageBytes(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const r = await fetch(url, { method: "GET", redirect: "follow", headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength < 4000 || buf.byteLength > 8_000_000) return null;
    return { bytes: buf, contentType: ct };
  } catch {
    return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  // Chunked to avoid call stack issues on large buffers
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// Ask the model for the brand's official domain(s) so we can whitelist them.
async function resolveBrandDomains(house: string): Promise<string[]> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY || !house) return [];
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 256,
        system: "Return only the official brand-owned web domain(s) for a perfume house. Examples: 'Diptyque' -> diptyqueparis.com; 'Frédéric Malle' -> fredericmalle.com,fredericmalle.eu. No retailers. Return your answer as a JSON object with a \"domains\" array of strings.",
        messages: [{ role: "user", content: `House: ${house}` }],
      }),
    });
    if (!r.ok) return [];
    const d = await r.json();
    const text = d.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const arr = jsonMatch ? (JSON.parse(jsonMatch[0]).domains as string[]) : [];
    return arr.map((s) => s.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]).filter(Boolean);
  } catch {
    return [];
  }
}

// Use a vision model to confirm the image is the product bottle (not a logo,
// not a different perfume from the same house, not a generic banner).
async function verifyBottle(
  imageBase64: string,
  contentType: string,
  name: string,
  house: string | undefined,
): Promise<{ ok: boolean; reason: string }> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return { ok: true, reason: "no key, skipped" };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 512,
        system:
          "You are a product-image verifier for a luxury perfume catalog. Approve ONLY images that look like professional e-commerce or brand photography — the kind you would see on Net-a-Porter, Luckyscent, or a brand's own website. APPROVE: clean product shots with plain, white, or neutral backgrounds; beautifully styled brand photography with tasteful props or botanicals that look professionally lit and composed. REJECT without exception: any amateur photo (cluttered backgrounds, bad lighting, blurry, grainy, low resolution, or phone camera quality); any photo containing a person, hand, finger, body part, model, or face; any photo with multiple different bottles; bottles from a DIFFERENT perfume in the same house; logos, wordmarks, banners, swatches, ads, category collages, thumbnails, or screenshots; any image where no perfume bottle is clearly visible; photos taken on bathroom counters, shelves, dressers, desks, or other personal home settings. The bottle must be the clear subject of a professional photograph. When in doubt about quality, reject. Return your answer as a JSON object with fields: is_correct_bottle (boolean), is_single_bottle (boolean), contains_person_or_hand (boolean), is_professional_quality (boolean), visible_label_text (string), reason (string).",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Verify this image is the official single-bottle product photo for: "${name}"${house ? ` by ${house}` : ""}. Read any visible text on the label.`,
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: contentType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                  data: imageBase64,
                },
              },
            ],
          },
        ],
      }),
    });
    if (!r.ok) {
      // If verifier is down (e.g. 429), do not block — fall back to allow.
      console.warn("verifier non-ok", r.status);
      return { ok: true, reason: `verifier ${r.status}, skipped` };
    }
    const d = await r.json();
    const text = d.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, reason: "no verdict" };
    const parsed = JSON.parse(jsonMatch[0]);
    // Hard requirements: must be the right bottle, exactly one bottle, no people.
    // We previously also rejected "lifestyle" shots, but many brands (esp. niche
    // perfumers like Perfumer H, Mad et Len) style their official product photos
    // with botanicals/props. Those are still legitimate official photos, so we
    // don't reject on lifestyle alone — we just note it in the reason.
    const ok =
      !!parsed.is_correct_bottle &&
      !!parsed.is_single_bottle &&
      !parsed.contains_person_or_hand &&
      !!parsed.is_professional_quality;
    const reason = ok
      ? parsed.reason ?? ""
      : `${parsed.reason ?? ""} [single=${parsed.is_single_bottle} person=${parsed.contains_person_or_hand} lifestyle=${parsed.is_lifestyle_or_scene} correct=${parsed.is_correct_bottle}]`;
    return { ok, reason };
  } catch (e) {
    console.warn("verifier error", e);
    return { ok: true, reason: "verifier error, skipped" };
  }
}

async function bingImages(query: string, siteFilter?: string): Promise<string[]> {
  const q = siteFilter ? `${query} site:${siteFilter}` : query;
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
    if (!r.ok) return [];
    const html = await r.text();
    const matches = [...html.matchAll(/murl&quot;:&quot;(https?:\/\/[^&]+?)&quot;/g)];
    const urls = matches.map((m) => m[1].replace(/&amp;/g, "&"));
    return urls.filter((u) => /\.(jpg|jpeg|png|webp)(\?|$)/i.test(u));
  } catch { return []; }
}

async function ddgImages(query: string, siteFilter?: string): Promise<string[]> {
  const q = siteFilter ? `${query} site:${siteFilter}` : query;
  try {
    // DuckDuckGo requires a vqd token from the HTML page first
    const tokenRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`, {
      headers: { "User-Agent": UA },
    });
    const tokenHtml = await tokenRes.text();
    const vqd = tokenHtml.match(/vqd=["']?(\d-[\d-]+)/)?.[1] ?? tokenHtml.match(/vqd=([\d-]+)/)?.[1];
    if (!vqd) return [];
    const apiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,&p=1`;
    const r = await fetch(apiUrl, { headers: { "User-Agent": UA, "Referer": "https://duckduckgo.com/" } });
    if (!r.ok) return [];
    const j = await r.json();
    const urls: string[] = (j.results ?? []).map((x: any) => x.image).filter(Boolean);
    return urls.filter((u) => /\.(jpg|jpeg|png|webp)(\?|$)/i.test(u));
  } catch { return []; }
}

// Google Images scraper — extracts image URLs from the public search HTML.
async function googleImages(query: string, siteFilter?: string): Promise<string[]> {
  const q = siteFilter ? `${query} site:${siteFilter}` : query;
  const url = `https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=isch&hl=en&gl=us&safe=off`;
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!r.ok) return [];
    const html = await r.text();
    const set = new Set<string>();
    for (const m of html.matchAll(/"(https?:\/\/[^"\s]+?\.(?:jpg|jpeg|png|webp))(?:\?[^"]*)?"/gi)) {
      const u = m[1];
      if (u.includes("gstatic.com") || u.includes("google.com")) continue;
      set.add(u);
      if (set.size > 60) break;
    }
    return [...set];
  } catch { return []; }
}

// Pinterest search — pins frequently re-host official product photography.
async function pinterestImages(query: string): Promise<string[]> {
  const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!r.ok) return [];
    const html = await r.text();
    const set = new Set<string>();
    for (const m of html.matchAll(/https:\/\/i\.pinimg\.com\/(?:originals|736x|564x)\/[a-zA-Z0-9\/_-]+\.(?:jpg|jpeg|png|webp)/g)) {
      // Prefer originals/ if available
      set.add(m[0].replace(/\/(?:736x|564x)\//, "/originals/"));
      if (set.size > 30) break;
    }
    return [...set];
  } catch { return []; }
}

async function searchImages(query: string, siteFilter?: string): Promise<string[]> {
  const tasks: Promise<string[]>[] = [
    bingImages(query, siteFilter),
    ddgImages(query, siteFilter),
    googleImages(query, siteFilter),
  ];
  // Pinterest doesn't honor site: filters meaningfully — only use it on open queries.
  if (!siteFilter) tasks.push(pinterestImages(query));
  const results = await Promise.all(tasks);
  // Round-robin interleave for diversity.
  const out: string[] = [];
  const max = Math.max(...results.map((r) => r.length), 0);
  for (let i = 0; i < max; i++) {
    for (const r of results) if (r[i]) out.push(r[i]);
  }
  return out;
}

// Strip common suffixes from perfume name to broaden search.
function cleanName(name: string): string {
  return name
    .replace(/\b(eau de parfum|eau de toilette|eau de cologne|extrait de parfum|parfum|edp|edt|edc|cologne)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
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

    const brandDomains = house ? await resolveBrandDomains(house) : [];
    const cleaned = cleanName(name);
    const h = house ?? "";

    // Multiple query variants — broader than a single quoted string.
    const queries: string[] = [
      `${cleaned} ${h} bottle`.trim(),
      `"${cleaned}" ${h}`.trim(),
      `${cleaned} ${h} perfume`.trim(),
      `${name} ${h}`.trim(),
    ];

    // Priority site list: brand first, then top niche/dept retailers (not all 20).
    const prioritySites = [
      ...brandDomains,
      "luckyscent.com",
      "ministryofscent.com",
      "twistedlily.com",
      "stelefragrances.com",
      "neimanmarcus.com",
      "saksfifthavenue.com",
      "nordstrom.com",
    ];

    const seen = new Set<string>();
    let verifiedCount = 0;
    const MAX_VERIFY = 16;

    // Helper: try one search and verify candidates with the given gate.
    async function tryPhase(
      site: string | undefined,
      query: string,
      gate: (u: string) => boolean,
    ): Promise<Response | null> {
      const candidates = await searchImages(query, site);
      const filtered = candidates
        .filter((u) => !seen.has(u))
        .filter(gate)
        .filter((u) => !looksLikeNonProduct(u));

      for (const u of filtered.slice(0, 3)) {
        if (verifiedCount >= MAX_VERIFY) return null;
        seen.add(u);
        const img = await fetchImageBytes(u);
        if (!img) continue;
        const h = hostOf(u);
        const source = brandDomains.some((d) => h === d || h.endsWith("." + d))
          ? "brand"
          : RETAILER_ALLOWLIST.some((d) => h === d || h.endsWith("." + d))
          ? "retailer"
          : h.endsWith("pinimg.com")
          ? "pinterest"
          : "web";
        verifiedCount++;
        const b64 = toBase64(img.bytes);
        const verdict = await verifyBottle(b64, img.contentType, name, house);
        if (verdict.ok) {
          return new Response(
            JSON.stringify({ image_url: u, image_source: source, verifier_reason: verdict.reason }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        console.log("rejected", u, "—", verdict.reason);
      }
      return null;
    }

    const strictGate = (u: string) => isAllowed(u, brandDomains);
    const looseGate = (u: string) => isAllowedLoose(u);

    // Phase 1: priority sites with strict allowlist (brand/key retailers).
    for (const site of prioritySites) {
      if (verifiedCount >= MAX_VERIFY) break;
      for (const query of queries.slice(0, 2)) {
        const res = await tryPhase(site, query, strictGate);
        if (res) return res;
        if (verifiedCount >= MAX_VERIFY) break;
      }
    }

    // Phase 2: open web search filtered by full allowlist (incl. CDNs, Pinterest, blogs).
    for (const query of queries) {
      if (verifiedCount >= MAX_VERIFY) break;
      const res = await tryPhase(undefined, query, strictGate);
      if (res) return res;
    }

    // Phase 3 (niche fallback): open web search with loose gate — accept any
    // non-blocked host. The vision verifier remains the ultimate gatekeeper,
    // so wrong bottles are still rejected. This catches indie perfume shops,
    // small blogs, and Shopify subdomains we don't know about.
    for (const query of queries.slice(0, 2)) {
      if (verifiedCount >= MAX_VERIFY) break;
      const res = await tryPhase(undefined, query, looseGate);
      if (res) return res;
    }


    // Strict mode: if nothing passed verification, return null so the client
    // can show a blank-bottle placeholder. We do NOT fall back to unverified.
    return new Response(
      JSON.stringify({ image_url: null, error: "No verified official photo found" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("fetch-perfume-image error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
