import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Tables keyed by user_id that don't cascade from auth.users, children before parents.
const USER_TABLES = [
  "capsule_perfumes",
  "capsules",
  "perfume_shelves",
  "shelves",
  "discover_history",
  "scent_personas",
  "diary_entries",
  "perfumes",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !auth.user) return json({ error: "Not signed in" }, 401);

    const { confirm } = await req.json().catch(() => ({}));
    if (confirm !== "delete") return json({ error: "Confirmation missing" }, 400);

    const uid = auth.user.id;

    const { data: files } = await admin.storage.from("perfume-cutouts").list(uid, { limit: 1000 });
    if (files?.length) {
      await admin.storage.from("perfume-cutouts").remove(files.map((f) => `${uid}/${f.name}`));
    }

    for (const table of USER_TABLES) {
      const { error } = await admin.from(table).delete().eq("user_id", uid);
      if (error) {
        console.error("delete failed", table, error);
        return json({ error: `Could not remove your ${table}. Nothing else was deleted.` }, 500);
      }
    }

    // follows, blocks, reports and the profile row cascade from auth.users.
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
      console.error("deleteUser failed", delErr);
      return json({ error: "Could not delete the account." }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("delete-account error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
