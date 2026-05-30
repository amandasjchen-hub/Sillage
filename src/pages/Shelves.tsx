import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, X, Briefcase, Sparkles, Loader2, Trash2, Check } from "lucide-react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { supabase, Shelf, Perfume } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type ShelfWithCount = Shelf & { count: number };

type Capsule = {
  id: string;
  name: string;
  trip_notes: string | null;
  created_at: string;
};

type CapsuleItem = {
  capsule_id: string;
  perfume_id: string;
  reason: string | null;
};

export default function Shelves() {
  const { user } = useAuth();
  const [shelves, setShelves] = useState<ShelfWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // capsules
  const [capsules, setCapsules] = useState<Capsule[]>([]);
  const [capsuleItems, setCapsuleItems] = useState<CapsuleItem[]>([]);
  const [ownedById, setOwnedById] = useState<Record<string, Perfume>>({});
  const [creatingCapsule, setCreatingCapsule] = useState(false);
  const [capsuleName, setCapsuleName] = useState("");
  const [capsuleNotes, setCapsuleNotes] = useState("");
  const [packingId, setPackingId] = useState<string | null>(null);
  const [pickerOpenId, setPickerOpenId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data: s } = await supabase
      .from("shelves")
      .select("*")
      .order("created_at", { ascending: false });
    const list = (s as Shelf[]) ?? [];
    const counts = await Promise.all(
      list.map((sh) =>
        supabase
          .from("perfume_shelves")
          .select("perfume_id", { count: "exact", head: true })
          .eq("shelf_id", sh.id)
          .then((r) => r.count ?? 0),
      ),
    );
    setShelves(list.map((sh, i) => ({ ...sh, count: counts[i] })));

    // capsules
    const [{ data: caps }, { data: items }, { data: owned }] = await Promise.all([
      supabase.from("capsules").select("*").order("created_at", { ascending: false }),
      supabase.from("capsule_perfumes").select("capsule_id,perfume_id,reason"),
      supabase.from("perfumes").select("*").eq("status", "owned"),
    ]);
    setCapsules((caps as Capsule[]) ?? []);
    setCapsuleItems((items as CapsuleItem[]) ?? []);
    const map: Record<string, Perfume> = {};
    ((owned as Perfume[]) ?? []).forEach((p) => (map[p.id] = p));
    setOwnedById(map);

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user]);

  const create = async () => {
    if (!user || !name.trim()) return;
    const { error } = await supabase.from("shelves").insert({
      user_id: user.id,
      name: name.trim(),
      description: description.trim() || null,
    });
    if (error) return toast.error(error.message);
    setName("");
    setDescription("");
    setCreating(false);
    load();
    toast.success("shelf made.");
  };

  const remove = async (id: string) => {
    if (!confirm("remove this shelf? perfumes stay in your collection.")) return;
    await supabase.from("shelves").delete().eq("id", id);
    load();
  };

  const createCapsule = async () => {
    if (!user || !capsuleName.trim()) return;
    const { error } = await supabase.from("capsules").insert({
      user_id: user.id,
      name: capsuleName.trim(),
      trip_notes: capsuleNotes.trim() || null,
    });
    if (error) return toast.error(error.message);
    setCapsuleName("");
    setCapsuleNotes("");
    setCreatingCapsule(false);
    load();
    toast.success("capsule started.");
  };

  const removeCapsule = async (id: string) => {
    if (!confirm("delete this capsule?")) return;
    await supabase.from("capsules").delete().eq("id", id);
    load();
  };

  const removeFromCapsule = async (capsuleId: string, perfumeId: string) => {
    await supabase
      .from("capsule_perfumes")
      .delete()
      .eq("capsule_id", capsuleId)
      .eq("perfume_id", perfumeId);
    setCapsuleItems((items) =>
      items.filter((i) => !(i.capsule_id === capsuleId && i.perfume_id === perfumeId)),
    );
  };

  const addToCapsule = async (capsuleId: string, perfumeId: string) => {
    if (!user) return;
    const exists = capsuleItems.some(
      (i) => i.capsule_id === capsuleId && i.perfume_id === perfumeId,
    );
    if (exists) return removeFromCapsule(capsuleId, perfumeId);
    const { error } = await supabase
      .from("capsule_perfumes")
      .insert({ capsule_id: capsuleId, perfume_id: perfumeId, user_id: user.id });
    if (error) return toast.error(error.message);
    setCapsuleItems((items) => [...items, { capsule_id: capsuleId, perfume_id: perfumeId, reason: null }]);
  };

  const aiPack = async (capsule: Capsule) => {
    if (!user) return;
    if (!capsule.trip_notes?.trim()) {
      toast.error("add a trip note first — describe the trip.");
      return;
    }
    setPackingId(capsule.id);
    try {
      const { data, error } = await supabase.functions.invoke("capsule-recommend", {
        body: { trip_notes: capsule.trip_notes, count: 5 },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const picks = (data as any).picks as { perfume_id: string; reason: string }[];
      // Replace items for this capsule
      await supabase.from("capsule_perfumes").delete().eq("capsule_id", capsule.id);
      if (picks.length) {
        const rows = picks.map((p) => ({
          capsule_id: capsule.id,
          perfume_id: p.perfume_id,
          user_id: user.id,
          reason: p.reason,
        }));
        const { error: insErr } = await supabase.from("capsule_perfumes").insert(rows);
        if (insErr) throw insErr;
      }
      setCapsuleItems((items) => [
        ...items.filter((i) => i.capsule_id !== capsule.id),
        ...picks.map((p) => ({
          capsule_id: capsule.id,
          perfume_id: p.perfume_id,
          reason: p.reason,
        })),
      ]);
      toast.success("packed.");
    } catch (e: any) {
      toast.error(e.message ?? "couldn't pack");
    } finally {
      setPackingId(null);
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="scent families"
        title="shelves"
        meta={`${shelves.length} ${shelves.length === 1 ? "shelf" : "shelves"}`}
        right={
          <button
            onClick={() => setCreating((v) => !v)}
            className="w-10 h-10 rounded-full bg-ink text-paper flex items-center justify-center hover:opacity-80 transition-opacity"
            aria-label="new shelf"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
          </button>
        }
      />

      <div className="px-5">
        {creating && (
          <div className="bg-card border border-rule/40 rounded-2xl p-4 mb-5 space-y-3">
            <Input
              placeholder="shelf name — summer afternoons"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="bg-paper border-rule/40 rounded-xl"
            />
            <Input
              placeholder="a quiet line about this group (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={140}
              className="bg-paper border-rule/40 rounded-xl"
            />
            <Button
              onClick={create}
              className="w-full rounded-full bg-ink text-paper text-[12px] lowercase h-10"
            >
              make shelf
            </Button>
          </div>
        )}

        {loading ? (
          <div className="text-[11px] text-ink-soft lowercase py-12 text-center">loading…</div>
        ) : shelves.length === 0 ? (
          <div className="py-16 text-center">
            <div className="font-display italic text-2xl text-ink mb-2 lowercase">no shelves yet.</div>
            <p className="text-[13px] text-ink-soft lowercase">group your bottles however you wish.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {shelves.map((s) => (
              <li
                key={s.id}
                className="bg-card border border-rule/40 rounded-2xl p-4 flex items-start justify-between gap-3"
              >
                <Link to={`/?shelf=${s.id}`} className="flex-1 min-w-0">
                  <div className="font-display text-[20px] text-ink lowercase leading-tight">
                    {s.name.toLowerCase()}
                  </div>
                  {s.description && (
                    <div className="text-[12px] text-ink-soft italic lowercase mt-0.5">
                      {s.description.toLowerCase()}
                    </div>
                  )}
                  <div className="text-[10px] text-ink-mute lowercase tracking-[0.08em] mt-1">
                    {s.count} {s.count === 1 ? "bottle" : "bottles"}
                  </div>
                </Link>
                <button
                  onClick={() => remove(s.id)}
                  className="text-ink-mute hover:text-destructive shrink-0"
                  aria-label="delete shelf"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* CAPSULES */}
      <section className="px-5 mt-10 pb-12">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[hsl(22,50%,45%)]" />
          <div className="text-[10px] tracking-[0.22em] uppercase text-ink-soft">
            packing capsules
          </div>
        </div>
        <div className="flex items-end justify-between gap-3 mb-2">
          <h2 className="font-display font-light text-[26px] text-ink lowercase leading-tight">
            scent capsule
          </h2>
          <button
            onClick={() => setCreatingCapsule((v) => !v)}
            className="w-9 h-9 rounded-full bg-ink text-paper flex items-center justify-center hover:opacity-80 shrink-0"
            aria-label="new capsule"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </div>
        <p className="text-[12px] text-ink-soft lowercase mb-4">
          a small wardrobe for a trip — pack by hand or let the oracle choose.
        </p>

        {creatingCapsule && (
          <div className="bg-card border border-rule/40 rounded-2xl p-4 mb-4 space-y-3">
            <Input
              placeholder="capsule name — five days in tokyo"
              value={capsuleName}
              onChange={(e) => setCapsuleName(e.target.value)}
              maxLength={60}
              className="bg-paper border-rule/40 rounded-xl"
            />
            <Textarea
              placeholder="describe the trip — weather, mood, occasions…"
              value={capsuleNotes}
              onChange={(e) => setCapsuleNotes(e.target.value)}
              maxLength={500}
              rows={3}
              className="bg-paper border-rule/40 rounded-xl text-[13px]"
            />
            <Button
              onClick={createCapsule}
              className="w-full rounded-full bg-ink text-paper text-[12px] lowercase h-10"
            >
              start packing
            </Button>
          </div>
        )}

        {capsules.length === 0 && !creatingCapsule ? (
          <div className="py-10 text-center bg-card/40 border border-dashed border-rule/50 rounded-2xl">
            <Briefcase className="w-5 h-5 text-ink-mute mx-auto mb-2" />
            <div className="font-display italic text-[18px] text-ink lowercase">
              no capsules yet.
            </div>
            <p className="text-[12px] text-ink-soft lowercase mt-1">
              tap + to pack for your next trip.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {capsules.map((c) => {
              const items = capsuleItems.filter((i) => i.capsule_id === c.id);
              const isPacking = packingId === c.id;
              const pickerOpen = pickerOpenId === c.id;
              const ownedList = Object.values(ownedById);
              return (
                <li
                  key={c.id}
                  className="bg-card border border-rule/40 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-[20px] text-ink lowercase leading-tight">
                        {c.name.toLowerCase()}
                      </div>
                      {c.trip_notes && (
                        <div className="text-[12px] text-ink-soft italic lowercase mt-0.5 line-clamp-2">
                          {c.trip_notes.toLowerCase()}
                        </div>
                      )}
                      <div className="text-[10px] text-ink-mute lowercase tracking-[0.08em] mt-1">
                        {items.length} {items.length === 1 ? "bottle" : "bottles"}
                      </div>
                    </div>
                    <button
                      onClick={() => removeCapsule(c.id)}
                      className="text-ink-mute hover:text-destructive shrink-0"
                      aria-label="delete capsule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {items.length > 0 && (
                    <ul className="space-y-1.5">
                      {items.map((it) => {
                        const p = ownedById[it.perfume_id];
                        if (!p) return null;
                        return (
                          <li
                            key={it.perfume_id}
                            className="flex items-start gap-2 group"
                          >
                            <div className="flex-1 min-w-0">
                              <Link
                                to={`/perfume/${p.id}`}
                                className="text-[13px] text-ink lowercase hover:text-espresso"
                              >
                                — {p.name.toLowerCase()}
                                {p.house && (
                                  <span className="text-ink-mute"> · {p.house.toLowerCase()}</span>
                                )}
                              </Link>
                              {it.reason && (
                                <div className="text-[11px] text-ink-soft italic lowercase pl-3 mt-0.5">
                                  {it.reason.toLowerCase()}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => removeFromCapsule(c.id, p.id)}
                              className="text-ink-mute hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100"
                              aria-label="remove from capsule"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => aiPack(c)}
                      disabled={isPacking}
                      className="inline-flex items-center gap-1.5 text-[11px] lowercase rounded-full bg-ink text-paper px-3 py-1.5 hover:opacity-90 disabled:opacity-60"
                    >
                      {isPacking ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      {isPacking ? "packing…" : items.length ? "re-pack with ai" : "pack for me"}
                    </button>
                    <button
                      onClick={() => setPickerOpenId(pickerOpen ? null : c.id)}
                      className="inline-flex items-center gap-1.5 text-[11px] lowercase rounded-full border border-rule/60 text-ink-soft hover:text-ink px-3 py-1.5"
                    >
                      <Plus className="w-3 h-3" /> {pickerOpen ? "done" : "add by hand"}
                    </button>
                  </div>

                  {pickerOpen && (
                    <div className="bg-paper border border-rule/40 rounded-xl p-2 max-h-64 overflow-y-auto">
                      {ownedList.length === 0 ? (
                        <div className="text-[11px] text-ink-mute lowercase italic px-2 py-2">
                          no owned bottles yet.
                        </div>
                      ) : (
                        ownedList.map((p) => {
                          const on = items.some((i) => i.perfume_id === p.id);
                          return (
                            <button
                              key={p.id}
                              onClick={() => addToCapsule(c.id, p.id)}
                              className="w-full flex items-center justify-between text-left px-2 py-1.5 rounded-lg hover:bg-muted/40"
                            >
                              <span className="text-[13px] text-ink lowercase truncate">
                                {p.name.toLowerCase()}
                                {p.house && (
                                  <span className="text-ink-mute"> · {p.house.toLowerCase()}</span>
                                )}
                              </span>
                              {on && <Check className="w-3.5 h-3.5 text-ink shrink-0 ml-2" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
