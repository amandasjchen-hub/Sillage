import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

    const { trip_notes, count } = (await req.json()) as {
      trip_notes: string;
      count?: number;
    };
    const target = Math.min(Math.max(count ?? 5, 3), 6);

    if (!trip_notes || !trip_notes.trim()) {
      return new Response(JSON.stringify({ error: "describe the trip first" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: owned } = await sb
      .from("perfumes")
      .select("id,name,house,olfactory_family,top_notes,middle_notes,base_notes,rating,community_accords")
      .eq("status", "owned")
      .limit(200);

    if (!owned || owned.length < 3) {
      return new Response(
        JSON.stringify({ error: "you need at least 3 owned bottles to pack from" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const lines = owned
      .map((p: any) => {
        const notes = [
          ...(p.top_notes || []),
          ...(p.middle_notes || []),
          ...(p.base_notes || []),
        ]
          .slice(0, 6)
          .join(", ");
        const accords = (p.community_accords || []).slice(0, 4).join(", ");
        return `- id:${p.id} | ${p.name} by ${p.house || "?"}${
          p.rating ? ` (${p.rating}/5)` : ""
        }${p.olfactory_family?.length ? ` · ${p.olfactory_family.join("/")}` : ""}${
          notes ? ` · notes: ${notes}` : ""
        }${accords ? ` · ${accords}` : ""}`;
      })
      .join("\n");

    const sys =
      "You are a perfume packing oracle. The user describes a trip. Pick a small, intentional capsule of bottles from THEIR OWNED COLLECTION ONLY (no inventions). Aim for variety across day/night and warm/fresh registers as the trip suggests. Tone: lowercase, warm, sharp. Each `reason` must be one tight line — when on the trip to wear it. Always return real ids from the provided list, never make ids up. Return your answer as a JSON object with an \"intro\" string and a \"picks\" array. Each pick has \"perfume_id\" (the id from the provided owned list) and \"reason\" (one short lowercase line).";
    const userMsg = `the trip:\n"${trip_notes.trim()}"\n\ntarget: ${target} bottles.\n\nthe user's owned shelf:\n${lines}\n\npack the capsule.`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: sys,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "rate limited — try again in a moment" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      console.error("ai error", r.status, await r.text());
      throw new Error("ai_error");
    }
    const data = await r.json();
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no_json_response");
    const out = JSON.parse(jsonMatch[0]);

    // Filter to valid ids only
    const validIds = new Set(owned.map((p: any) => p.id));
    out.picks = (out.picks || []).filter((p: any) => validIds.has(p.perfume_id));

    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("capsule-recommend error", e);
    return new Response(JSON.stringify({ error: "something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
