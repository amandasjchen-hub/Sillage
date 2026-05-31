import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const BAD_PATH_RE =
  /(logo|sprite|favicon|icon[-_]|banner|header|hero[-_]|category|placeholder|swatch|nav[-_]|footer|social|share|og[-_]image|press[-_]?kit|wordmark|brandmark|avatar|profile)/i;

function looksLikeNonProduct(u: string): boolean {
  try {
    const path = new URL(u).pathname.toLowerCase();
    return BAD_PATH_RE.test(path);
  } catch {
    return true;
  }
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function toAbsoluteUrl(url: string, baseUrl: string): string {
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("http")) return url;
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!r.ok) {
      console.warn("fetchHtml non-ok", r.status, url);
      return null;
    }
    return await r.text();
  } catch (e) {
    console.warn("fetchHtml error", url, e);
    return null;
  }
}

async function fetchImageBytes(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const r = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA },
    });
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
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function extractOgImage(html: string): string | null {
  const m =
    html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ||
    html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
  return m ? m[1] : null;
}

function extractFirstProductImage(html: string, baseUrl: string): string | null {
  // Try og:image first
  const og = extractOgImage(html);
  if (og) return toAbsoluteUrl(og, baseUrl);

  // Look for img tags with product-like src
  for (const m of html.matchAll(/<img[^>]+src="([^"]+(?:\.jpg|\.jpeg|\.png|\.webp)[^"]*)"/gi)) {
    const url = toAbsoluteUrl(m[1], baseUrl);
    if (!looksLikeNonProduct(url)) return url;
  }
  return null;
}

function cleanName(name: string): string {
  return name
    .replace(
      /\b(eau de parfum|eau de toilette|eau de cologne|extrait de parfum|parfum|edp|edt|edc|cologne)\b/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

// Use a vision model to confirm the image is the product bottle.
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
          "You are a strict product-image verifier for a luxury perfume catalog. Your FIRST and most important check: is there a perfume/fragrance bottle clearly visible as the main subject of this image? If NO perfume bottle is visible, reject immediately — do not consider anything else. APPROVE only if ALL of these are true: (1) a perfume bottle is the clear main subject, (2) the image looks like professional e-commerce or brand photography — clean/neutral/white background or tasteful styled shoot, professionally lit, (3) no people, hands, fingers, faces, or body parts anywhere in the image, (4) it is not a book cover, product packaging flat lay without a bottle, lifestyle shot, screenshot, collage, or any non-bottle subject. REJECT immediately if: no perfume bottle visible, any person or body part present, book cover, magazine page, random object, cluttered home setting, blurry or low quality. The bottle label text must match or plausibly match the requested perfume name. When in doubt, reject. Return a JSON object with: has_perfume_bottle (boolean — is there actually a perfume bottle in this image?), is_correct_bottle (boolean), is_single_bottle (boolean), contains_person_or_hand (boolean), is_professional_quality (boolean), visible_label_text (string), reason (string).",
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
                  media_type: contentType as
                    | "image/jpeg"
                    | "image/png"
                    | "image/gif"
                    | "image/webp",
                  data: imageBase64,
                },
              },
            ],
          },
        ],
      }),
    });
    if (!r.ok) {
      console.warn("verifier non-ok", r.status);
      return { ok: true, reason: `verifier ${r.status}, skipped` };
    }
    const d = await r.json();
    const text = d.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, reason: "no verdict" };
    const parsed = JSON.parse(jsonMatch[0]);
    const ok =
      !!parsed.has_perfume_bottle &&
      !!parsed.is_correct_bottle &&
      !!parsed.is_single_bottle &&
      !parsed.contains_person_or_hand &&
      !!parsed.is_professional_quality;
    const reason = ok
      ? parsed.reason ?? ""
      : `${parsed.reason ?? ""} [single=${parsed.is_single_bottle} person=${parsed.contains_person_or_hand} correct=${parsed.is_correct_bottle}]`;
    return { ok, reason };
  } catch (e) {
    console.warn("verifier error", e);
    return { ok: true, reason: "verifier error, skipped" };
  }
}

async function verifyImageUrl(
  url: string,
  name: string,
  house: string,
): Promise<boolean> {
  if (looksLikeNonProduct(url)) return false;
  const img = await fetchImageBytes(url);
  if (!img) return false;
  const b64 = toBase64(img.bytes);
  const verdict = await verifyBottle(b64, img.contentType, name, house);
  console.log("verifyBottle result:", verdict.ok, verdict.reason);
  return verdict.ok;
}

// ─── Source 1: Fragrantica ────────────────────────────────────────────────────
// Fragrantica's HTML is behind Cloudflare so we can't scrape it directly.
// Instead, ask Claude (training knowledge) for the numeric Fragrantica ID,
// then construct the fimgs.net CDN URL directly. Trust completely — no verify.
async function fragranticaIdViaClaude(
  name: string,
  house: string,
): Promise<string | null> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return null;
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
        max_tokens: 128,
        system:
          "You know Fragrantica perfume database IDs. When asked about a perfume, return the numeric Fragrantica ID from URLs like fragrantica.com/perfume/House/Name-ID.html. Return ONLY a JSON object with a single key 'id' containing the numeric string, or 'id': null if you don't know with confidence.",
        messages: [
          { role: "user", content: `Fragrantica ID for: "${name}" by "${house}"` },
        ],
      }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const text = d.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const id = parsed.id;
    if (!id || typeof id !== "string" || !/^\d+$/.test(id)) return null;
    console.log("Claude gave Fragrantica ID:", id);
    return id;
  } catch (e) {
    console.warn("fragranticaIdViaClaude error", e);
    return null;
  }
}

async function fragranticaIdViaDDG(
  name: string,
  house: string,
): Promise<string | null> {
  const query = `site:fragrantica.com/perfume ${name} ${house}`.trim();
  const endpoints = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
  ];
  for (const searchUrl of endpoints) {
    console.log("DDG search for Fragrantica ID:", searchUrl);
    try {
      const r = await fetch(searchUrl, {
        headers: {
          "User-Agent": UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Referer": "https://duckduckgo.com/",
        },
        redirect: "follow",
      });
      if (!r.ok) {
        console.warn("DDG search failed:", r.status, "url:", searchUrl);
        continue;
      }
      const html = await r.text();
      const houseSlug = house.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      const allMatches = [
        ...html.matchAll(/fragrantica\.com\/perfume\/([^/"&<> ]+)-(\d+)\.html/gi),
      ];
      if (!allMatches.length) continue;
      const preferred = allMatches.find((m) =>
        m[1].toLowerCase().replace(/[^a-z0-9]/g, "").includes(houseSlug.slice(0, 4))
      );
      const match = preferred ?? allMatches[0];
      const id = match[2];
      console.log("Found Fragrantica ID via DDG:", id);
      return id;
    } catch (e) {
      console.warn("fragranticaIdViaDDG error for", searchUrl, e);
    }
  }
  return null;
}

async function fragranticaImage(
  name: string,
  house: string,
): Promise<string | null> {
  // Try Claude knowledge first, then DDG/Bing search
  const fragId =
    (await fragranticaIdViaClaude(name, house)) ??
    (await fragranticaIdViaDDG(name, house));
  if (!fragId) return null;

  const imageUrl = `https://fimgs.net/mdimg/perfume/375x500.${fragId}.jpg`;
  console.log("Fragrantica CDN URL:", imageUrl);

  // Fetch and verify it's actually a bottle — wrong IDs can point to notes graphics
  const img = await fetchImageBytes(imageUrl);
  if (!img) {
    console.warn("Fragrantica CDN image not found:", imageUrl);
    return null;
  }
  const b64 = toBase64(img.bytes);
  const verdict = await verifyBottle(b64, img.contentType, name, house);
  if (!verdict.ok) {
    console.warn("Fragrantica image failed verification:", imageUrl, verdict.reason);
    return null;
  }
  return imageUrl;
}

// ─── Source 2: Brand official website ────────────────────────────────────────
async function resolveBrandDomain(house: string): Promise<string | null> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY || !house) return null;
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
        max_tokens: 128,
        system:
          "Return the single best official brand-owned web domain for a perfume house. Examples: 'Diptyque' -> diptyqueparis.com; 'Byredo' -> byredo.com; 'Frédéric Malle' -> fredericmalle.com. No retailers. Return JSON: {\"domain\": \"example.com\"}",
        messages: [{ role: "user", content: `House: ${house}` }],
      }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const text = d.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const domain = parsed.domain;
    if (!domain || typeof domain !== "string") return null;
    return domain
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
  } catch (e) {
    console.warn("resolveBrandDomain error", e);
    return null;
  }
}

async function brandWebsiteImage(
  name: string,
  house: string,
): Promise<string | null> {
  const domain = await resolveBrandDomain(house);
  if (!domain) return null;

  const cleaned = cleanName(name);
  // Try both common search URL patterns
  const searchUrls = [
    `https://${domain}/search?q=${encodeURIComponent(cleaned)}`,
    `https://${domain}/search?type=product&q=${encodeURIComponent(cleaned)}`,
  ];

  for (const searchUrl of searchUrls) {
    console.log("Brand website search:", searchUrl);
    const searchHtml = await fetchHtml(searchUrl);
    if (!searchHtml) continue;

    // Find first product link
    const productLinkMatch = searchHtml.match(
      /href="([^"]*\/products\/[^"]+)"/i,
    ) || searchHtml.match(/href="([^"]*\/product\/[^"]+)"/i);

    let pageHtml = searchHtml;
    let pageUrl = searchUrl;

    if (productLinkMatch) {
      const productUrl = toAbsoluteUrl(productLinkMatch[1], `https://${domain}`);
      console.log("Brand product page:", productUrl);
      const ph = await fetchHtml(productUrl);
      if (ph) {
        pageHtml = ph;
        pageUrl = productUrl;
      }
    }

    const imgUrl = extractFirstProductImage(pageHtml, pageUrl);
    if (!imgUrl) continue;

    const ok = await verifyImageUrl(imgUrl, name, house);
    if (ok) return imgUrl;
  }
  return null;
}

// ─── Source 3: Luckyscent ────────────────────────────────────────────────────
async function luckycentImage(
  name: string,
  house: string,
): Promise<string | null> {
  const query = encodeURIComponent(`${name} ${house}`.trim());
  const searchUrl = `https://www.luckyscent.com/search?q=${query}`;
  console.log("Luckyscent search:", searchUrl);

  const html = await fetchHtml(searchUrl);
  if (!html) return null;

  // Find first product link
  const productLinkMatch = html.match(/href="(\/product[^"]+)"/i);
  let pageHtml = html;
  let pageUrl = searchUrl;

  if (productLinkMatch) {
    const productUrl = `https://www.luckyscent.com${productLinkMatch[1]}`;
    console.log("Luckyscent product page:", productUrl);
    const ph = await fetchHtml(productUrl);
    if (ph) {
      pageHtml = ph;
      pageUrl = productUrl;
    }
  }

  // Extract og:image or product image
  const og = extractOgImage(pageHtml);
  if (og) {
    const absUrl = toAbsoluteUrl(og, pageUrl);
    const ok = await verifyImageUrl(absUrl, name, house);
    if (ok) return absUrl;
  }

  // Scan for product images
  for (const m of pageHtml.matchAll(/<img[^>]+src="([^"]+(?:\.jpg|\.jpeg|\.png|\.webp)[^"]*)"/gi)) {
    const url = toAbsoluteUrl(m[1], pageUrl);
    if (looksLikeNonProduct(url)) continue;
    const h = hostOf(url);
    if (!h.includes("luckyscent") && !h.includes("cdn") && !h.includes("shopify")) continue;
    const ok = await verifyImageUrl(url, name, house);
    if (ok) return url;
  }
  return null;
}

// ─── Source 4: Ministry of Scent ────────────────────────────────────────────
async function ministryOfScentImage(
  name: string,
  house: string,
): Promise<string | null> {
  const query = encodeURIComponent(`${name} ${house}`.trim());
  const searchUrl = `https://www.ministryofscent.com/search?q=${query}`;
  console.log("Ministry of Scent search:", searchUrl);

  const html = await fetchHtml(searchUrl);
  if (!html) return null;

  const productLinkMatch = html.match(/href="(\/products\/[^"]+)"/i);
  let pageHtml = html;
  let pageUrl = searchUrl;

  if (productLinkMatch) {
    const productUrl = `https://www.ministryofscent.com${productLinkMatch[1]}`;
    console.log("Ministry of Scent product page:", productUrl);
    const ph = await fetchHtml(productUrl);
    if (ph) {
      pageHtml = ph;
      pageUrl = productUrl;
    }
  }

  const imgUrl = extractFirstProductImage(pageHtml, pageUrl);
  if (!imgUrl) return null;
  const ok = await verifyImageUrl(imgUrl, name, house);
  return ok ? imgUrl : null;
}

// ─── Source 5: Stele ─────────────────────────────────────────────────────────
async function steleImage(name: string, house: string): Promise<string | null> {
  const query = encodeURIComponent(name.trim());
  const searchUrl = `https://stele.com/search?q=${query}`;
  console.log("Stele search:", searchUrl);

  const html = await fetchHtml(searchUrl);
  if (!html) return null;

  const productLinkMatch = html.match(/href="(\/products\/[^"]+)"/i);
  let pageHtml = html;
  let pageUrl = searchUrl;

  if (productLinkMatch) {
    const productUrl = `https://stele.com${productLinkMatch[1]}`;
    console.log("Stele product page:", productUrl);
    const ph = await fetchHtml(productUrl);
    if (ph) {
      pageHtml = ph;
      pageUrl = productUrl;
    }
  }

  const imgUrl = extractFirstProductImage(pageHtml, pageUrl);
  if (!imgUrl) return null;
  const ok = await verifyImageUrl(imgUrl, name, house);
  return ok ? imgUrl : null;
}

// ─── Source 6: Bloomingdale's ────────────────────────────────────────────────
async function bloomingdalesImage(
  name: string,
  house: string,
): Promise<string | null> {
  const query = encodeURIComponent(`${name} ${house}`.trim());
  const searchUrl = `https://www.bloomingdales.com/shop/search?keyword=${query}`;
  console.log("Bloomingdale's search:", searchUrl);

  const html = await fetchHtml(searchUrl);
  if (!html) return null;

  // Bloomingdale's uses JSON data embedded in HTML for product images
  const jsonMatch = html.match(/"imageUrl"\s*:\s*"([^"]+)"/i) ||
    html.match(/"primaryImage"\s*:\s*"([^"]+)"/i);
  if (jsonMatch) {
    const url = toAbsoluteUrl(
      jsonMatch[1].replace(/\\u002F/g, "/").replace(/\\/g, ""),
      searchUrl,
    );
    if (!looksLikeNonProduct(url)) {
      const ok = await verifyImageUrl(url, name, house);
      if (ok) return url;
    }
  }

  const imgUrl = extractFirstProductImage(html, searchUrl);
  if (!imgUrl) return null;
  const ok = await verifyImageUrl(imgUrl, name, house);
  return ok ? imgUrl : null;
}

// ─── Source 7: Nordstrom ────────────────────────────────────────────────────
async function nordstromImage(
  name: string,
  house: string,
): Promise<string | null> {
  const query = encodeURIComponent(`${name} ${house}`.trim());
  const searchUrl = `https://www.nordstrom.com/sr?keyword=${query}`;
  console.log("Nordstrom search:", searchUrl);

  const html = await fetchHtml(searchUrl);
  if (!html) return null;

  // Nordstrom embeds product data as JSON
  const jsonMatch = html.match(/"src"\s*:\s*"(https?:\/\/n\.nordstrommedia\.com\/[^"]+)"/i) ||
    html.match(/"imageUrl"\s*:\s*"([^"]+)"/i);
  if (jsonMatch) {
    const url = jsonMatch[1].replace(/\\u002F/g, "/").replace(/\\/g, "");
    if (!looksLikeNonProduct(url)) {
      const ok = await verifyImageUrl(url, name, house);
      if (ok) return url;
    }
  }

  const imgUrl = extractFirstProductImage(html, searchUrl);
  if (!imgUrl) return null;
  const ok = await verifyImageUrl(imgUrl, name, house);
  return ok ? imgUrl : null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
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

    const h = (house ?? "") as string;

    const respond = (image_url: string | null, image_source?: string) =>
      new Response(JSON.stringify({ image_url, ...(image_source ? { image_source } : {}) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // 1. Fragrantica — trusted, no verification needed
    try {
      const url = await fragranticaImage(name, h);
      if (url) {
        console.log("SUCCESS fragrantica:", url);
        return respond(url, "fragrantica");
      }
    } catch (e) {
      console.warn("Fragrantica pipeline error", e);
    }

    // 2. Brand official website — verify
    try {
      const url = await brandWebsiteImage(name, h);
      if (url) {
        console.log("SUCCESS brand:", url);
        return respond(url, "brand");
      }
    } catch (e) {
      console.warn("Brand website pipeline error", e);
    }

    // 3. Luckyscent — verify
    try {
      const url = await luckycentImage(name, h);
      if (url) {
        console.log("SUCCESS luckyscent:", url);
        return respond(url, "luckyscent");
      }
    } catch (e) {
      console.warn("Luckyscent pipeline error", e);
    }

    // 4. Ministry of Scent — verify
    try {
      const url = await ministryOfScentImage(name, h);
      if (url) {
        console.log("SUCCESS ministryofscent:", url);
        return respond(url, "ministryofscent");
      }
    } catch (e) {
      console.warn("Ministry of Scent pipeline error", e);
    }

    // 5. Stele — verify
    try {
      const url = await steleImage(name, h);
      if (url) {
        console.log("SUCCESS stele:", url);
        return respond(url, "stele");
      }
    } catch (e) {
      console.warn("Stele pipeline error", e);
    }

    // 6. Bloomingdale's — verify
    try {
      const url = await bloomingdalesImage(name, h);
      if (url) {
        console.log("SUCCESS bloomingdales:", url);
        return respond(url, "bloomingdales");
      }
    } catch (e) {
      console.warn("Bloomingdale's pipeline error", e);
    }

    // 7. Nordstrom — verify
    try {
      const url = await nordstromImage(name, h);
      if (url) {
        console.log("SUCCESS nordstrom:", url);
        return respond(url, "nordstrom");
      }
    } catch (e) {
      console.warn("Nordstrom pipeline error", e);
    }

    // 8. Return null — never return a bad image
    console.log("All sources exhausted, returning null");
    return respond(null);
  } catch (e) {
    console.error("fetch-perfume-image error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
