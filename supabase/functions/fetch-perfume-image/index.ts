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

// Ask Claude to find the product photo itself, using its built-in web search
// tool (runs server-side on Anthropic's infra — no scraping, nothing to get
// blocked by site bot-protection).
async function webSearchImage(
  name: string,
  house: string,
): Promise<{ url: string; source: string } | null> {
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
      signal: AbortSignal.timeout(50_000),
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        thinking: { type: "disabled" },
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        system:
          "Use web search to find the Fragrantica page for the given perfume (URL looks like https://www.fragrantica.com/perfume/<House>/<Name>-<numeric id>.html). Make sure it is the exact perfume and concentration requested, not a flanker. Respond with ONLY a JSON object: {\"fragrantica_url\": \"<the page url>\"} — or {\"fragrantica_url\": null} if you cannot find it. No other text.",
        messages: [
          {
            role: "user",
            content: `Perfume: "${name}"${house ? ` by ${house}` : ""}`,
          },
        ],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.warn("webSearchImage non-ok", r.status, t);
      return null;
    }
    const d = await r.json();
    const text = (d.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const idMatch = String(parsed.fragrantica_url ?? "").match(/-(\d+)\.html/);
    if (!idMatch) return null;
    const url = `https://fimgs.net/mdimg/perfume/375x500.${idMatch[1]}.jpg`;
    console.log("webSearchImage found:", parsed.fragrantica_url, url);
    return { url, source: "fragrantica" };
  } catch (e) {
    console.warn("webSearchImage error", e);
    return null;
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

    const found = await webSearchImage(name, h);
    if (!found) {
      console.log("webSearchImage returned nothing, giving up");
      return respond(null);
    }

    const img = await fetchImageBytes(found.url);
    if (!img) {
      console.warn("could not download candidate image:", found.url);
      return respond(null);
    }

    const b64 = toBase64(img.bytes);
    const verdict = await verifyBottle(b64, img.contentType, name, h);
    if (!verdict.ok) {
      console.warn("candidate image failed verification:", found.url, verdict.reason);
      return respond(null);
    }

    console.log("SUCCESS", found.source, found.url);
    return respond(found.url, found.source);
  } catch (e) {
    console.error("fetch-perfume-image error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
