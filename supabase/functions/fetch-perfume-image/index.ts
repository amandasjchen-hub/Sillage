import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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
        model: "claude-sonnet-5",
        max_tokens: 512,
        system:
          "You are a strict product-image verifier for a luxury perfume catalog. Your FIRST and most important check: is there a perfume/fragrance product (a bottle, or its retail container such as a solid-perfume tin/compact, roll-on, or vial) clearly visible as the main subject of this image? If NO such product is visible, reject immediately — do not consider anything else. APPROVE only if ALL of these are true: (1) a perfume bottle is the clear main subject, (2) the image looks like professional e-commerce or brand photography — clean/neutral/white background or tasteful styled shoot, professionally lit, (3) no people, hands, fingers, faces, or body parts anywhere in the image, (4) it is not a book cover, product packaging flat lay without a bottle, lifestyle shot, screenshot, collage, or any non-bottle subject. REJECT immediately if: no perfume bottle visible, any person or body part present, book cover, magazine page, random object, cluttered home setting, blurry or low quality. The bottle label text must match or plausibly match the requested perfume name. When in doubt, reject. Return a JSON object with: has_perfume_bottle (boolean — is there actually a perfume bottle in this image?), is_correct_bottle (boolean), is_single_bottle (boolean), contains_person_or_hand (boolean), is_professional_quality (boolean), visible_label_text (string), reason (string).",
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
    const text = d.content?.find((b: any) => b.type === "text")?.text ?? "";
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

function ogImage(html: string, baseUrl: string): string | null {
  const m =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (!m) return null;
  try {
    return new URL(m[1].replace(/&amp;/g, "&"), baseUrl).href;
  } catch {
    return null;
  }
}

// Ask Claude (with its server-side web search tool, so nothing to get blocked
// by bot protection) to locate the Fragrantica page and/or an official or
// retailer product page, then turn those into candidate image URLs.
async function findCandidates(
  name: string,
  house: string,
): Promise<{ url: string; source: string }[]> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return [];
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(50_000),
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        thinking: { type: "disabled" },
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        system:
          "Use web search to locate pages for the given perfume. Find (a) its Fragrantica page, if one exists (URL looks like https://www.fragrantica.com/perfume/<House>/<Name>-<numeric id>.html), and (b) one product page for it on the brand's own website or a reputable retailer (not a marketplace like eBay or Poshmark). Make sure it is the exact perfume requested, not a flanker or different format. Respond with ONLY a JSON object: {\"fragrantica_url\": <url or null>, \"product_url\": <url or null>}. No other text.",
        messages: [
          {
            role: "user",
            content: `Perfume: "${name}"${house ? ` by ${house}` : ""}`,
          },
        ],
      }),
    });
    if (!r.ok) {
      console.warn("findCandidates non-ok", r.status, await r.text());
      return [];
    }
    const d = await r.json();
    const text = (d.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    console.log("findCandidates:", parsed);

    const out: { url: string; source: string }[] = [];
    const idMatch = String(parsed.fragrantica_url ?? "").match(/-(\d+)\.html/);
    if (idMatch) {
      out.push({ url: `https://fimgs.net/mdimg/perfume/375x500.${idMatch[1]}.jpg`, source: "fragrantica" });
    }
    if (typeof parsed.product_url === "string" && /^https?:\/\//.test(parsed.product_url)) {
      try {
        const pr = await fetch(parsed.product_url, {
          headers: { "User-Agent": UA, "Accept": "text/html" },
          redirect: "follow",
          signal: AbortSignal.timeout(10_000),
        });
        if (pr.ok) {
          const og = ogImage(await pr.text(), parsed.product_url);
          if (og) out.push({ url: og, source: new URL(parsed.product_url).hostname.replace(/^www\./, "") });
        } else {
          console.warn("product page non-ok", pr.status, parsed.product_url);
        }
      } catch (e) {
        console.warn("product page error", e);
      }
    }
    return out;
  } catch (e) {
    console.warn("findCandidates error", e);
    return [];
  }
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

    const candidates = await findCandidates(name, h);
    for (const c of candidates) {
      const img = await fetchImageBytes(c.url);
      if (!img) {
        console.warn("could not download candidate image:", c.url);
        continue;
      }
      const verdict = await verifyBottle(toBase64(img.bytes), img.contentType, name, h);
      if (!verdict.ok) {
        console.warn("candidate failed verification:", c.url, verdict.reason);
        continue;
      }
      console.log("SUCCESS", c.source, c.url);
      return respond(c.url, c.source);
    }

    console.log("no usable image found");
    return respond(null);
  } catch (e) {
    console.error("fetch-perfume-image error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
