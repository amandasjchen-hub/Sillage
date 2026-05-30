import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2, Plus, Tag, Check, ImageIcon, Loader2, Upload, RefreshCw } from "lucide-react";
import AppShell from "@/components/AppShell";
import { supabase, Perfume, DiaryEntry, Shelf, SOURCE_LABELS, OfficialSource, BlindBuy, BLIND_BUY_LABELS } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

function NoteRow({ label, notes }: { label: string; notes?: string[] | null }) {
  if (!notes?.length) return null;
  return (
    <div className="flex gap-4 py-3 border-b border-rule/40 last:border-0">
      <div className="text-[11px] text-ink-soft lowercase w-14 shrink-0 pt-1">{label}</div>
      <div className="text-[14px] text-ink lowercase leading-relaxed">
        {notes.join(" · ").toLowerCase()}
      </div>
    </div>
  );
}

export default function PerfumeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [perfume, setPerfume] = useState<Perfume | null>(null);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [memberShelfIds, setMemberShelfIds] = useState<string[]>([]);
  const [shelfPickerOpen, setShelfPickerOpen] = useState(false);
  const [newShelfName, setNewShelfName] = useState("");
  const [creatingShelf, setCreatingShelf] = useState(false);

  const [adding, setAdding] = useState(false);
  const [occasion, setOccasion] = useState("");
  const [location, setLocation] = useState("");
  const [memory, setMemory] = useState("");

  const [editingEpithet, setEditingEpithet] = useState(false);
  const [epithetDraft, setEpithetDraft] = useState("");
  const [fetchingImage, setFetchingImage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [enriching, setEnriching] = useState(false);

  const fetchNotes = async () => {
    if (!perfume || enriching) return;
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-perfume", {
        body: { name: perfume.name, house: perfume.house ?? undefined },
      });
      if (error) throw error;
      const d = (data ?? {}) as any;
      if (d?.error) throw new Error(d.error);
      const patch: Record<string, any> = { ai_enriched: true };
      const setIf = (k: string, v: any) => {
        if (v === undefined || v === null) return;
        if (Array.isArray(v) && v.length === 0) return;
        if (typeof v === "string" && !v.trim()) return;
        patch[k] = v;
      };
      setIf("house", d.house);
      setIf("house_origin", d.house_origin);
      setIf("year", d.year);
      setIf("perfumer", d.perfumer);
      setIf("description", d.description);
      setIf("top_notes", d.top_notes);
      setIf("middle_notes", d.middle_notes);
      setIf("base_notes", d.base_notes);
      setIf("similar_perfumes", d.similar_perfumes);
      setIf("official_sources", d.official_sources);
      setIf("community_summary", d.community_summary);
      setIf("community_accords", d.community_accords);
      setIf("community_descriptors", d.community_descriptors);
      setIf("others_epithet", d.others_epithet);
      setIf("olfactory_family", d.olfactory_family);
      setIf("price_usd", d.price_usd);
      const { error: upErr } = await supabase
        .from("perfumes")
        .update(patch)
        .eq("id", perfume.id);
      if (upErr) throw upErr;
      setPerfume({ ...perfume, ...patch } as Perfume);
      toast.success("notes refreshed.");
    } catch (e: any) {
      toast.error(e.message ?? "could not fetch notes");
    } finally {
      setEnriching(false);
    }
  };

  const uploadImage = async (file: File) => {
    if (!perfume) return;
    if (!file.type.startsWith("image/")) return toast.error("must be an image");
    if (file.size > 8 * 1024 * 1024) return toast.error("max 8mb");
    setUploadingImage(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("not signed in");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${u.user.id}/${perfume.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("perfume-cutouts")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("perfume-cutouts").getPublicUrl(path);
      const image_url = pub.publicUrl;
      const { error: dbErr } = await supabase
        .from("perfumes")
        .update({ image_url, image_source: "user_upload", image_url_nobg: null })
        .eq("id", perfume.id);
      if (dbErr) throw dbErr;
      setPerfume({ ...perfume, image_url, image_source: "user_upload", image_url_nobg: null } as Perfume);
      toast.success("photo uploaded.");
    } catch (e: any) {
      toast.error(e.message ?? "could not upload");
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = async () => {
    if (!perfume) return;
    if (!confirm("remove this photo?")) return;
    try {
      const { error } = await supabase
        .from("perfumes")
        .update({ image_url: null, image_source: null, image_url_nobg: null })
        .eq("id", perfume.id);
      if (error) throw error;
      setPerfume({ ...perfume, image_url: null, image_source: null, image_url_nobg: null } as Perfume);
      toast.success("photo removed.");
    } catch (e: any) {
      toast.error(e.message ?? "could not remove");
    }
  };

  const fetchImage = async () => {
    if (!perfume) return;
    setFetchingImage(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-perfume-image", {
        body: { name: perfume.name, house: perfume.house ?? undefined },
      });
      if (error) throw error;
      const image_url = (data as any)?.image_url;
      const image_source = (data as any)?.image_source;
      if (!image_url) throw new Error("no image found");
      const { error: upErr } = await supabase
        .from("perfumes")
        .update({ image_url, image_source })
        .eq("id", perfume.id);
      if (upErr) throw upErr;
      setPerfume({ ...perfume, image_url, image_source });
      toast.success("photo pulled.");
    } catch (e: any) {
      toast.error(e.message ?? "could not fetch");
    } finally {
      setFetchingImage(false);
    }
  };

  // similar in your collection
  const [yours, setYours] = useState<Perfume[]>([]);

  const load = async () => {
    if (!id) return;
    const [{ data: p }, { data: d }, { data: sh }, { data: ps }, { data: yoursAll }] =
      await Promise.all([
        supabase.from("perfumes").select("*").eq("id", id).maybeSingle(),
        supabase.from("diary_entries").select("*").eq("perfume_id", id).order("worn_on", { ascending: false }),
        supabase.from("shelves").select("*").order("name"),
        supabase.from("perfume_shelves").select("shelf_id").eq("perfume_id", id),
        supabase.from("perfumes").select("*"),
      ]);
    setPerfume(p as Perfume);
    setEntries((d as DiaryEntry[]) ?? []);
    setShelves((sh as Shelf[]) ?? []);
    setMemberShelfIds(((ps as { shelf_id: string }[]) ?? []).map((r) => r.shelf_id));
    setYours((yoursAll as Perfume[]) ?? []);
    setEpithetDraft((p as Perfume | null)?.epithet ?? "");
  };
  useEffect(() => { load(); }, [id]);

  const addEntry = async () => {
    if (!perfume) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("diary_entries").insert({
      user_id: u.user.id,
      perfume_id: perfume.id,
      occasion: occasion.trim() || null,
      location: location.trim() || null,
      memory: memory.trim() || null,
    });
    if (error) return toast.error(error.message);
    setOccasion(""); setLocation(""); setMemory(""); setAdding(false);
    load(); toast.success("memory pressed.");
  };

  const toggleShelf = async (shelfId: string) => {
    if (!perfume) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    if (memberShelfIds.includes(shelfId)) {
      await supabase.from("perfume_shelves").delete()
        .eq("perfume_id", perfume.id).eq("shelf_id", shelfId);
      setMemberShelfIds((ids) => ids.filter((x) => x !== shelfId));
    } else {
      await supabase.from("perfume_shelves").insert({
        perfume_id: perfume.id, shelf_id: shelfId, user_id: u.user.id,
      });
      setMemberShelfIds((ids) => [...ids, shelfId]);
    }
  };

  const createShelfAndAdd = async () => {
    if (!perfume || !newShelfName.trim() || creatingShelf) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    setCreatingShelf(true);
    try {
      const { data: created, error } = await supabase
        .from("shelves")
        .insert({ user_id: u.user.id, name: newShelfName.trim() })
        .select()
        .single();
      if (error) throw error;
      const sh = created as Shelf;
      const { error: linkErr } = await supabase
        .from("perfume_shelves")
        .insert({ perfume_id: perfume.id, shelf_id: sh.id, user_id: u.user.id });
      if (linkErr) throw linkErr;
      setShelves((prev) => [...prev, sh].sort((a, b) => a.name.localeCompare(b.name)));
      setMemberShelfIds((ids) => [...ids, sh.id]);
      setNewShelfName("");
      toast.success("shelf made.");
    } catch (e: any) {
      toast.error(e.message ?? "could not create shelf");
    } finally {
      setCreatingShelf(false);
    }
  };

  const saveEpithet = async () => {
    if (!perfume) return;
    const v = epithetDraft.trim() || null;
    const { error } = await supabase.from("perfumes").update({ epithet: v }).eq("id", perfume.id);
    if (error) return toast.error(error.message);
    setPerfume({ ...perfume, epithet: v });
    setEditingEpithet(false);
  };

  // similar from your own collection (overlap of community accords + family)
  const similarYours = useMemo(() => {
    if (!perfume) return [] as Perfume[];
    const myAccords = new Set((perfume.community_accords ?? []).map((s) => s.toLowerCase()));
    return yours
      .filter((y) => y.id !== perfume.id)
      .map((y) => {
        const overlap = (y.community_accords ?? []).filter((a) => myAccords.has(a.toLowerCase())).length;
        const myFams = new Set((perfume.olfactory_family ?? []).map((s) => s.toLowerCase()));
        const familyMatch = (y.olfactory_family ?? []).some((f) => myFams.has(f.toLowerCase())) ? 2 : 0;
        return { y, score: overlap + familyMatch };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.y);
  }, [perfume, yours]);


  const remove = async () => {
    if (!perfume) return;
    if (!confirm("remove this perfume from your ledger?")) return;
    await supabase.from("perfumes").delete().eq("id", perfume.id);
    navigate(perfume.status === "wishlist" ? "/wishlist" : "/");
  };

  if (!perfume) {
    return <AppShell><div className="px-5 pt-20 text-[11px] text-ink-soft lowercase">loading…</div></AppShell>;
  }

  // tinted hero panel
  const heroTint = "linear-gradient(180deg, hsl(28 14% 84%) 0%, hsl(28 14% 76%) 100%)";

  return (
    <AppShell>
      <header className="px-5 pt-6">
        <div className="flex items-center justify-between">
          <Link to={perfume.status === "wishlist" ? "/wishlist" : "/"}
                className="text-[12px] inline-flex items-center gap-1.5 text-ink-soft hover:text-ink lowercase">
            <ArrowLeft className="w-3.5 h-3.5" /> back
          </Link>
          <button onClick={remove} className="text-ink-mute hover:text-destructive">
            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {/* hero tile */}
      <div className="px-5 mt-4">
        <div
          className="relative aspect-[4/5] w-full rounded-[16px] overflow-hidden shadow-[var(--shadow-tile)]"
          style={{ background: heroTint }}
        >
          {perfume.image_url ? (
            <img
              src={perfume.image_url}
              alt={perfume.name}
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="font-display italic text-ink/20 text-[140px] leading-none select-none">
                {perfume.name.charAt(0).toLowerCase()}
              </div>
            </div>
          )}
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
            {perfume.image_url && (
              <button
                onClick={removeImage}
                className="inline-flex items-center gap-1.5 bg-paper/90 backdrop-blur-sm text-ink text-[11px] lowercase px-3 py-1.5 rounded-full border border-rule/40 hover:bg-paper"
              >
                <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                remove
              </button>
            )}
            <label
              className={`inline-flex items-center gap-1.5 bg-paper/90 backdrop-blur-sm text-ink text-[11px] lowercase px-3 py-1.5 rounded-full border border-rule/40 hover:bg-paper cursor-pointer ${uploadingImage ? "opacity-50 pointer-events-none" : ""}`}
            >
              {uploadingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" strokeWidth={1.5} />}
              {uploadingImage ? "uploading…" : "upload"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <button
              onClick={fetchImage}
              disabled={fetchingImage}
              className="inline-flex items-center gap-1.5 bg-paper/90 backdrop-blur-sm text-ink text-[11px] lowercase px-3 py-1.5 rounded-full border border-rule/40 hover:bg-paper disabled:opacity-50"
            >
              {fetchingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
              {fetchingImage ? "pulling…" : perfume.image_url ? "re-pull photo" : "pull photo"}
            </button>
          </div>
        </div>
      </div>

      <section className="px-5 pt-6">
        <div className="text-[11px] text-ink-soft lowercase mb-1.5">
          {perfume.status === "owned" ? "from the shelf" : "on the wishlist"}
          {perfume.year && <> · {perfume.year}</>}
        </div>
        <h1 className="font-display font-light text-[34px] leading-[1.05] text-ink lowercase tracking-[-0.02em]">
          {perfume.name.toLowerCase()}
        </h1>
        {perfume.house && (
          <div className="mt-2 text-[14px] text-ink-soft lowercase">
            by <span className="text-ink">{perfume.house.toLowerCase()}</span>
            {perfume.house_origin && <span className="text-ink-mute"> · {perfume.house_origin.toLowerCase()}</span>}
          </div>
        )}

        {perfume.description && (
          <p className="mt-5 font-display italic text-[18px] leading-snug text-ink lowercase">
            "{perfume.description.toLowerCase()}"
          </p>
        )}

        {/* EPITHET — yours + others */}
        <div className="mt-6 bg-card rounded-2xl border border-rule/40 p-4 space-y-3">
          <div className="text-[10px] text-ink-mute lowercase tracking-[0.08em]">in a single line</div>

          {/* yours */}
          {editingEpithet ? (
            <div className="space-y-2">
              <Input
                placeholder='"expensive woman at a gala in a museum"'
                value={epithetDraft}
                onChange={(e) => setEpithetDraft(e.target.value)}
                maxLength={140}
                className="bg-paper border-rule/40 rounded-xl"
              />
              <div className="flex gap-2">
                <Button onClick={saveEpithet} className="rounded-full bg-ink text-paper text-[12px] lowercase h-9 px-4">save</Button>
                <button
                  onClick={() => { setEditingEpithet(false); setEpithetDraft(perfume.epithet ?? ""); }}
                  className="text-[12px] text-ink-soft lowercase"
                >
                  cancel
                </button>
              </div>
            </div>
          ) : perfume.epithet ? (
            <button
              onClick={() => setEditingEpithet(true)}
              className="block text-left font-display italic text-[17px] text-ink lowercase leading-snug"
            >
              "{perfume.epithet.toLowerCase()}"
              <span className="text-[10px] text-ink-mute non-italic ml-2 not-italic">— yours · edit</span>
            </button>
          ) : (
            <button
              onClick={() => setEditingEpithet(true)}
              className="text-[12px] text-ink-soft lowercase italic hover:text-ink"
            >
              + add your one-line vibe
            </button>
          )}

          {/* others */}
          {perfume.others_epithet && (
            <div className="pt-2 border-t border-rule/30">
              <div className="font-display italic text-[15px] text-ink-soft lowercase leading-snug">
                "{perfume.others_epithet.toLowerCase()}"
              </div>
              <div className="text-[10px] text-ink-mute lowercase tracking-[0.08em] mt-1">
                — how others tend to describe it
              </div>
            </div>
          )}
        </div>

        {/* SHELVES */}
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="w-3 h-3 text-ink-mute" />
            {memberShelfIds.length === 0 && !shelfPickerOpen && (
              <span className="text-[11px] text-ink-mute lowercase italic">not on any shelf</span>
            )}
            {shelves
              .filter((s) => memberShelfIds.includes(s.id))
              .map((s) => (
                <Link
                  key={s.id}
                  to={`/?shelf=${s.id}`}
                  className="text-[11px] lowercase px-2.5 py-1 rounded-full bg-ink text-paper"
                >
                  {s.name.toLowerCase()}
                </Link>
              ))}
            <button
              onClick={() => setShelfPickerOpen((v) => !v)}
              className="text-[11px] lowercase px-2.5 py-1 rounded-full border border-rule/50 text-ink-soft hover:text-ink"
            >
              {shelfPickerOpen ? "done" : "+ shelf"}
            </button>
          </div>
          {shelfPickerOpen && (
            <div className="mt-2 bg-card border border-rule/40 rounded-xl p-3 space-y-1">
              {shelves.length === 0 ? (
                <div className="text-[11px] text-ink-mute lowercase italic px-1 pb-1">
                  no shelves yet — make one below.
                </div>
              ) : (
                shelves.map((s) => {
                  const on = memberShelfIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleShelf(s.id)}
                      className="w-full flex items-center justify-between text-left px-2 py-1.5 rounded-lg hover:bg-muted/40"
                    >
                      <span className="text-[13px] text-ink lowercase">{s.name.toLowerCase()}</span>
                      {on && <Check className="w-3.5 h-3.5 text-ink" />}
                    </button>
                  );
                })
              )}

              <div className="pt-2 mt-1 border-t border-rule/30 flex items-center gap-2">
                <Input
                  value={newShelfName}
                  onChange={(e) => setNewShelfName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createShelfAndAdd();
                    }
                  }}
                  placeholder="new shelf name…"
                  maxLength={60}
                  className="bg-paper border-rule/40 rounded-lg h-8 text-[12px]"
                />
                <button
                  onClick={createShelfAndAdd}
                  disabled={!newShelfName.trim() || creatingShelf}
                  className="shrink-0 text-[11px] lowercase px-3 py-1.5 rounded-full bg-ink text-paper disabled:opacity-40"
                >
                  {creatingShelf ? "…" : "+ add"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          {perfume.rating != null && (
            <div className="bg-card rounded-2xl p-4 border border-rule/40">
              <div className="text-[11px] text-ink-soft lowercase mb-1">rating</div>
              <div className="font-display font-light text-2xl text-ink tabular-nums">
                {perfume.rating.toFixed(1)}<span className="text-ink-mute text-base"> / 5</span>
              </div>
            </div>
          )}
          {perfume.olfactory_family?.length > 0 && (
            <div className="bg-card rounded-2xl p-4 border border-rule/40">
              <div className="text-[11px] text-ink-soft lowercase mb-1">family</div>
              <div className="text-[14px] text-ink lowercase truncate">
                {perfume.olfactory_family.map((f) => f.toLowerCase()).join(" · ")}
              </div>
            </div>
          )}
          {perfume.perfumer && (
            <div className="bg-card rounded-2xl p-4 border border-rule/40">
              <div className="text-[11px] text-ink-soft lowercase mb-1">nose</div>
              <div className="text-[14px] text-ink lowercase truncate">{perfume.perfumer.toLowerCase()}</div>
            </div>
          )}
          {perfume.price_usd != null && (
            <div className="bg-card rounded-2xl p-4 border border-rule/40">
              <div className="text-[11px] text-ink-soft lowercase mb-1">approx. price</div>
              <div className="text-[14px] text-ink lowercase">${Math.round(perfume.price_usd)}</div>
            </div>
          )}
        </div>

        {/* BLIND BUY */}
        <div className="mt-4 bg-card rounded-2xl p-4 border border-rule/40">
          <div className="text-[11px] text-ink-soft lowercase mb-2">blind buy verdict</div>
          <div className="flex gap-2">
            {(["safe", "risky", "polarizing"] as const).map((v) => {
              const active = perfume.blind_buy === v;
              const tone = BLIND_BUY_LABELS[v].tone;
              return (
                <button
                  key={v}
                  onClick={async () => {
                    const next: BlindBuy | null = active ? null : v;
                    const { error } = await supabase
                      .from("perfumes")
                      .update({ blind_buy: next })
                      .eq("id", perfume.id);
                    if (error) return toast.error(error.message);
                    setPerfume({ ...perfume, blind_buy: next });
                  }}
                  className={`flex-1 text-[11px] lowercase rounded-full border px-2.5 py-1.5 transition-colors`}
                  style={
                    active
                      ? { background: tone, color: "hsl(var(--paper))", borderColor: tone }
                      : undefined
                  }
                >
                  {active ? `✓ ${v}` : v}
                </button>
              );
            })}
          </div>
        </div>

        {/* DO YOU OWN SOMETHING SIMILAR? — only useful if currently on wishlist */}
        {perfume.status === "wishlist" && similarYours.length > 0 && (
          <div className="mt-6 bg-paper border border-ink/15 rounded-2xl p-4">
            <div className="text-[11px] text-ink lowercase mb-2 tracking-[0.06em]">
              before you buy — you already own something close
            </div>
            <ul className="space-y-1.5">
              {similarYours.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/perfume/${s.id}`}
                    className="text-[14px] text-ink lowercase hover:text-espresso"
                  >
                    — {s.name.toLowerCase()}
                    {s.house && <span className="text-ink-mute"> · {s.house.toLowerCase()}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}


        {/* OFFICIAL NOTES — pyramid + per-source breakdown */}
        <div className="mt-8">
          <div className="flex items-baseline justify-between mb-3 gap-3">
            <h2 className="font-display font-light text-[20px] text-ink lowercase">official notes</h2>
            <button
              onClick={fetchNotes}
              disabled={enriching}
              className="inline-flex items-center gap-1.5 text-[10px] text-ink-soft hover:text-ink lowercase tracking-[0.08em] disabled:opacity-50"
            >
              {enriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" strokeWidth={1.5} />}
              {enriching ? "fetching…" : (perfume.top_notes?.length || perfume.middle_notes?.length || perfume.base_notes?.length) ? "refresh" : "fetch notes"}
            </button>
          </div>
          <div className="bg-card rounded-2xl px-4 border border-rule/40">
            <NoteRow label="top" notes={perfume.top_notes} />
            <NoteRow label="heart" notes={perfume.middle_notes} />
            <NoteRow label="base" notes={perfume.base_notes} />
            {!(perfume.top_notes?.length || perfume.middle_notes?.length || perfume.base_notes?.length) && (
              <div className="py-6 text-center text-[12px] text-ink-mute lowercase italic">
                no notes yet — tap "fetch notes" above to pull them.
              </div>
            )}
          </div>

          {perfume.official_sources?.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-[10px] text-ink-mute lowercase tracking-[0.08em] px-1">
                as listed by
              </div>
              {perfume.official_sources.map((s: OfficialSource, i) => {
                const all = [
                  ...(s.top_notes ?? []),
                  ...(s.middle_notes ?? []),
                  ...(s.base_notes ?? []),
                ];
                if (all.length === 0) return null;
                return (
                  <div key={i} className="bg-card/60 border border-rule/30 rounded-xl px-4 py-3">
                    <div className="text-[11px] text-ink lowercase mb-1.5">
                      {SOURCE_LABELS[s.source] ?? s.source}
                    </div>
                    <div className="text-[13px] text-ink-soft lowercase leading-relaxed">
                      {all.join(" · ").toLowerCase()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* COMMUNITY PERCEPTION — what other people think */}
        {(perfume.community_summary ||
          perfume.community_accords?.length > 0 ||
          perfume.community_descriptors?.length > 0) && (
          <div className="mt-8">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-display font-light text-[20px] text-ink lowercase">
                what other people think
              </h2>
              <span className="text-[10px] text-ink-mute lowercase tracking-[0.08em]">
                fragrantica · community
              </span>
            </div>
            <div className="bg-card rounded-2xl border border-rule/40 p-5 space-y-4">
              {perfume.community_summary && (
                <p className="font-display italic text-[16px] leading-snug text-ink lowercase">
                  "{perfume.community_summary.toLowerCase()}"
                </p>
              )}
              {perfume.community_accords?.length > 0 && (
                <div>
                  <div className="text-[11px] text-ink-soft lowercase mb-2">top accords</div>
                  <div className="flex flex-wrap gap-1.5">
                    {perfume.community_accords.map((a, i) => (
                      <span
                        key={i}
                        className="text-[11px] lowercase px-2.5 py-1 rounded-full bg-paper border border-rule/40 text-ink"
                      >
                        {a.toLowerCase()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {perfume.community_descriptors?.length > 0 && (
                <div>
                  <div className="text-[11px] text-ink-soft lowercase mb-2">often described as</div>
                  <div className="flex flex-wrap gap-1.5">
                    {perfume.community_descriptors.map((d, i) => (
                      <span
                        key={i}
                        className="text-[11px] lowercase px-2.5 py-1 rounded-full bg-muted/60 text-ink-soft"
                      >
                        {d.toLowerCase()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* placeholder: future sillage user reviews */}
            <div className="mt-3 bg-card/40 border border-dashed border-rule/50 rounded-xl px-4 py-4 text-center">
              <div className="text-[11px] text-ink-soft lowercase">notes from sillage wearers</div>
              <div className="text-[12px] text-ink-mute italic lowercase mt-1">
                coming soon — when others on sillage wear this, their impressions will gather here.
              </div>
            </div>
          </div>
        )}

        {perfume.similar_perfumes?.length > 0 && (
          <div className="mt-8">
            <div className="text-[11px] text-ink-soft lowercase mb-3">you might also love</div>
            <ul className="space-y-2">
              {perfume.similar_perfumes.map((s, i) => (
                <li key={i} className="text-[14px] text-ink lowercase">— {s.toLowerCase()}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="px-5 pt-10 pb-12">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display font-light text-[22px] text-ink lowercase">scent memory diary</h2>
          <button
            onClick={() => setAdding((v) => !v)}
            className="text-[12px] inline-flex items-center gap-1 text-ink-soft hover:text-ink lowercase"
          >
            <Plus className="w-3.5 h-3.5" /> entry
          </button>
        </div>

        {adding && (
          <div className="bg-card border border-rule/40 rounded-2xl p-4 mb-6 space-y-3">
            <Input
              placeholder="occasion — a wedding in lisbon"
              value={occasion} onChange={(e) => setOccasion(e.target.value)} maxLength={120}
              className="bg-paper border-rule/40 rounded-xl"
            />
            <Input
              placeholder="location — a rainy afternoon in soho"
              value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120}
              className="bg-paper border-rule/40 rounded-xl"
            />
            <Textarea
              placeholder="where i wore it, who i was with, what it became…"
              value={memory} onChange={(e) => setMemory(e.target.value)} maxLength={1000} rows={4}
              className="bg-paper border-rule/40 rounded-xl font-display italic text-[15px]"
            />
            <Button onClick={addEntry} className="w-full rounded-full bg-ink text-paper text-[12px] lowercase h-10">
              press the memory
            </Button>
          </div>
        )}

        {entries.length === 0 ? (
          <p className="text-[13px] text-ink-soft italic lowercase">no entries yet — the page is unmarked.</p>
        ) : (
          <ul className="space-y-4">
            {entries.map((e) => (
              <li key={e.id} className="bg-card border border-rule/40 rounded-2xl p-4">
                <div className="text-[11px] text-ink-soft lowercase mb-1">
                  {new Date(e.worn_on).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }).toLowerCase()}
                  {e.occasion && <> · {e.occasion.toLowerCase()}</>}
                  {e.location && <> · {e.location.toLowerCase()}</>}
                </div>
                {e.memory && <p className="font-display italic text-[16px] text-ink leading-snug lowercase">{e.memory.toLowerCase()}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
