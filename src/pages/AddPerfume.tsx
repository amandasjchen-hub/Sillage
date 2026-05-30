import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Sparkles, Loader2, ChevronUp, ChevronDown, Camera } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type NameSuggestion = { name: string; house: string };
type HouseSuggestion = { house: string };

function useDebounced<T>(value: T, ms = 280): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function AddPerfume() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const initialStatus = (params.get("status") as "owned" | "wishlist") ?? "owned";
  const initialName = params.get("name") ?? "";
  const initialHouse = params.get("house") ?? "";
  const navigate = useNavigate();

  const [name, setName] = useState(initialName);
  const [house, setHouse] = useState(initialHouse);
  const [status, setStatus] = useState<"owned" | "wishlist">(initialStatus);
  const [enriching, setEnriching] = useState(false);
  const [enriched, setEnriched] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [blindBuy, setBlindBuy] = useState<"safe" | "risky" | "polarizing" | null>(null);
  const [purchasedAt, setPurchasedAt] = useState("");
  const [purchasedCountry, setPurchasedCountry] = useState("");

  // autocomplete state
  const [nameFocus, setNameFocus] = useState(false);
  const [houseFocus, setHouseFocus] = useState(false);
  const [nameSugs, setNameSugs] = useState<NameSuggestion[]>([]);
  const [houseSugs, setHouseSugs] = useState<HouseSuggestion[]>([]);
  const [loadingNameSugs, setLoadingNameSugs] = useState(false);
  const [loadingHouseSugs, setLoadingHouseSugs] = useState(false);
  const lastPickedName = useRef("");
  const lastPickedHouse = useRef("");

  const dName = useDebounced(name);
  const dHouse = useDebounced(house);

  // name autocomplete
  useEffect(() => {
    if (!nameFocus || !dName.trim() || dName === lastPickedName.current) {
      setNameSugs([]);
      return;
    }
    let active = true;
    setLoadingNameSugs(true);
    supabase.functions
      .invoke("suggest-perfume", {
        body: { query: dName.trim(), field: "name", house: house.trim() || undefined },
      })
      .then(({ data }) => {
        if (!active) return;
        setNameSugs(((data as any)?.suggestions ?? []).slice(0, 10));
      })
      .finally(() => active && setLoadingNameSugs(false));
    return () => {
      active = false;
    };
  }, [dName, nameFocus, house]);

  // house autocomplete
  useEffect(() => {
    if (!houseFocus || !dHouse.trim() || dHouse === lastPickedHouse.current) {
      setHouseSugs([]);
      return;
    }
    let active = true;
    setLoadingHouseSugs(true);
    supabase.functions
      .invoke("suggest-perfume", { body: { query: dHouse.trim(), field: "house" } })
      .then(({ data }) => {
        if (!active) return;
        setHouseSugs(((data as any)?.suggestions ?? []).slice(0, 10));
      })
      .finally(() => active && setLoadingHouseSugs(false));
    return () => {
      active = false;
    };
  }, [dHouse, houseFocus]);

  const enrich = async () => {
    if (!name.trim()) return toast.error("add a name first");
    if (!house.trim()) return toast.error("add a house first");
    setEnriching(true);
    try {
      const [enrichRes, imgRes] = await Promise.all([
        supabase.functions.invoke("enrich-perfume", {
          body: { name: name.trim(), house: house.trim() },
        }),
        supabase.functions.invoke("fetch-perfume-image", {
          body: { name: name.trim(), house: house.trim() },
        }),
      ]);
      if (enrichRes.error) throw enrichRes.error;
      if ((enrichRes.data as any)?.error) throw new Error((enrichRes.data as any).error);
      const merged: any = { ...enrichRes.data };
      if (!imgRes.error && (imgRes.data as any)?.image_url) {
        merged.image_url = (imgRes.data as any).image_url;
        merged.image_source = (imgRes.data as any).image_source;
      }
      setEnriched(merged);
      if (merged?.house && !house) setHouse(merged.house);
      toast.success("notes pulled.");
    } catch (e: any) {
      toast.error(e.message ?? "could not enrich");
    } finally {
      setEnriching(false);
    }
  };

  const save = async () => {
    if (!user || !name.trim() || !house.trim()) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        name: name.trim(),
        house: (enriched?.house ?? house).trim(),
        house_origin: enriched?.house_origin ?? null,
        year: enriched?.year ?? null,
        perfumer: enriched?.perfumer ?? null,
        description: enriched?.description ?? null,
        top_notes: enriched?.top_notes ?? [],
        middle_notes: enriched?.middle_notes ?? [],
        base_notes: enriched?.base_notes ?? [],
        similar_perfumes: enriched?.similar_perfumes ?? [],
        official_sources: enriched?.official_sources ?? [],
        community_summary: enriched?.community_summary ?? null,
        community_accords: enriched?.community_accords ?? [],
        community_descriptors: enriched?.community_descriptors ?? [],
        others_epithet: enriched?.others_epithet ?? null,
        olfactory_family: Array.isArray(enriched?.olfactory_family)
          ? enriched.olfactory_family.slice(0, 2)
          : enriched?.olfactory_family
            ? [enriched.olfactory_family]
            : [],
        price_usd: enriched?.price_usd ?? null,
        image_url: enriched?.image_url ?? null,
        image_source: enriched?.image_source ?? null,
        rating: rating > 0 ? rating : null,
        blind_buy: blindBuy,
        purchased_at: purchasedAt.trim() || null,
        purchased_country: purchasedCountry.trim() || null,
        status,
        ai_enriched: !!enriched,
      };
      const { data, error } = await supabase.from("perfumes").insert(payload).select().single();
      if (error) throw error;
      toast.success("added.");
      navigate(`/perfume/${data.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "could not save");
    } finally {
      setSaving(false);
    }
  };

  const pickName = (s: NameSuggestion) => {
    lastPickedName.current = s.name;
    lastPickedHouse.current = s.house;
    setName(s.name);
    if (s.house) setHouse(s.house);
    setNameSugs([]);
    setNameFocus(false);
  };
  const pickHouse = (s: HouseSuggestion) => {
    lastPickedHouse.current = s.house;
    setHouse(s.house);
    setHouseSugs([]);
    setHouseFocus(false);
  };

  const bump = (delta: number) => {
    setRating((r) => Math.max(0, Math.min(5, r + delta)));
  };

  return (
    <AppShell hideNav>
      <header className="px-5 pt-8 pb-6">
        <Link to="/" className="text-[12px] inline-flex items-center gap-1.5 text-ink-soft hover:text-ink lowercase">
          <ArrowLeft className="w-3.5 h-3.5" /> back
        </Link>
        <div className="mt-5 flex items-baseline justify-between gap-3">
          <h1 className="font-display font-light text-[36px] text-ink lowercase tracking-[-0.02em]">
            new entry
          </h1>
          <Link
            to="/scan"
            className="inline-flex items-center gap-1.5 text-[11px] lowercase text-ink-soft hover:text-ink border border-rule/60 rounded-full px-3 py-1.5 transition-colors"
          >
            <Camera className="w-3 h-3" /> scan a bottle
          </Link>
        </div>
      </header>

      <div className="px-5 space-y-5">
        <div className="grid grid-cols-2 gap-2 p-1 bg-muted/60 rounded-full">
          {(["owned", "wishlist"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`text-[12px] py-2 rounded-full lowercase transition-colors ${
                status === s ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* HOUSE first — scopes the name search */}
        <div className="relative">
          <label className="text-[11px] text-ink-soft lowercase block mb-1.5">house</label>
          <Input
            value={house}
            onChange={(e) => {
              setHouse(e.target.value);
              lastPickedHouse.current = "";
            }}
            onFocus={() => setHouseFocus(true)}
            onBlur={() => setTimeout(() => setHouseFocus(false), 150)}
            maxLength={100}
            placeholder="Frédéric Malle"
            className="bg-card border-rule/60 rounded-xl h-12"
          />
          {houseFocus && (loadingHouseSugs || houseSugs.length > 0) && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-card border border-rule/60 rounded-xl shadow-lg overflow-hidden">
              {loadingHouseSugs && houseSugs.length === 0 ? (
                <div className="px-4 py-3 text-[12px] text-ink-soft lowercase flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> searching…
                </div>
              ) : (
                houseSugs.map((s, i) => (
                  <button
                    key={`${s.house}-${i}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickHouse(s)}
                    className="w-full text-left px-4 py-2.5 hover:bg-muted/60 border-b border-rule/30 last:border-0 text-[13px] text-ink lowercase"
                  >
                    {s.house.toLowerCase()}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* NAME — scoped to house when set */}
        <div className="relative">
          <label className="text-[11px] text-ink-soft lowercase block mb-1.5">
            name {!house.trim() && <span className="text-ink-mute">(pick a house first for best results)</span>}
          </label>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              lastPickedName.current = "";
            }}
            onFocus={() => setNameFocus(true)}
            onBlur={() => setTimeout(() => setNameFocus(false), 150)}
            maxLength={150}
            placeholder={house.trim() ? "start typing…" : "Portrait of a Lady"}
            className="bg-card border-rule/60 rounded-xl h-12"
          />
          {nameFocus && (loadingNameSugs || nameSugs.length > 0) && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-card border border-rule/60 rounded-xl shadow-lg overflow-hidden">
              {loadingNameSugs && nameSugs.length === 0 ? (
                <div className="px-4 py-3 text-[12px] text-ink-soft lowercase flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> searching…
                </div>
              ) : (
                nameSugs.map((s, i) => (
                  <button
                    key={`${s.name}-${i}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickName(s)}
                    className="w-full text-left px-4 py-2.5 hover:bg-muted/60 border-b border-rule/30 last:border-0"
                  >
                    <div className="text-[13px] text-ink lowercase">{s.name.toLowerCase()}</div>
                    <div className="text-[11px] text-ink-soft lowercase">{s.house.toLowerCase()}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <button
          onClick={enrich}
          disabled={enriching || !name.trim() || !house.trim()}
          className="w-full bg-card border border-rule/60 text-ink rounded-full text-[12px] py-3 flex items-center justify-center gap-2 hover:bg-muted/60 transition-colors disabled:opacity-40 lowercase"
        >
          {enriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {enriching ? "pulling notes…" : enriched ? "re-pull notes" : "pull notes with ai"}
        </button>

        {enriched && (
          <div className="bg-card border border-rule/50 rounded-2xl p-5 space-y-4">
            {enriched.description && (
              <p className="font-display italic text-[17px] leading-snug text-ink lowercase">
                "{enriched.description.toLowerCase()}"
              </p>
            )}
            {enriched.perfumer && (
              <div>
                <div className="text-[11px] text-ink-soft lowercase mb-1">nose</div>
                <div className="text-[14px] text-ink">{enriched.perfumer}</div>
              </div>
            )}
            {[
              ["top", enriched.top_notes],
              ["heart", enriched.middle_notes],
              ["base", enriched.base_notes],
            ].map(([label, arr]: any) =>
              arr?.length ? (
                <div key={label}>
                  <div className="text-[11px] text-ink-soft lowercase mb-1">{label}</div>
                  <div className="text-[14px] text-ink lowercase">{arr.join(" · ").toLowerCase()}</div>
                </div>
              ) : null
            )}
          </div>
        )}

        {/* RATING — click toggle 1–5 */}
        <div>
          <label className="text-[11px] text-ink-soft lowercase block mb-2">rating</label>
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => bump(1)}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted/60 text-ink-soft hover:text-ink"
                aria-label="increase rating"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => bump(-1)}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted/60 text-ink-soft hover:text-ink"
                aria-label="decrease rating"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-display text-[42px] leading-none text-ink tabular-nums">
                {rating}
              </span>
              <span className="text-[12px] text-ink-soft lowercase">/ 5</span>
            </div>
            <div className="flex gap-1 ml-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(rating === n ? 0 : n)}
                  className={`w-6 h-6 rounded-full border transition-colors ${
                    n <= rating
                      ? "bg-ink border-ink"
                      : "bg-transparent border-rule/60 hover:border-ink-soft"
                  }`}
                  aria-label={`set rating ${n}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* BLIND BUY */}
        <div>
          <label className="text-[11px] text-ink-soft lowercase block mb-2">
            blind buy verdict <span className="text-ink-mute">(optional)</span>
          </label>
          <div className="flex gap-2">
            {(["safe", "risky", "polarizing"] as const).map((v) => {
              const active = blindBuy === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setBlindBuy(active ? null : v)}
                  className={`flex-1 text-[12px] lowercase rounded-full border px-3 py-2 transition-colors ${
                    active
                      ? "bg-ink text-paper border-ink"
                      : "bg-transparent border-rule/60 text-ink-soft hover:text-ink hover:border-ink-soft"
                  }`}
                >
                  {v}
                </button>
              );
            })}
          </div>
          <div className="text-[10px] text-ink-mute lowercase mt-1.5 italic">
            help future-you (and others) gauge the risk of buying unsniffed.
          </div>
        </div>

        {/* PURCHASED AT (store) + COUNTRY — both optional */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-ink-soft lowercase block mb-1.5">
              bought at <span className="text-ink-mute">(optional)</span>
            </label>
            <Input
              value={purchasedAt}
              onChange={(e) => setPurchasedAt(e.target.value)}
              maxLength={120}
              placeholder="Lucky Scent"
              className="bg-card border-rule/60 rounded-xl h-12"
            />
          </div>
          <div>
            <label className="text-[11px] text-ink-soft lowercase block mb-1.5">
              country <span className="text-ink-mute">(optional)</span>
            </label>
            <Input
              value={purchasedCountry}
              onChange={(e) => setPurchasedCountry(e.target.value)}
              maxLength={80}
              placeholder="France"
              className="bg-card border-rule/60 rounded-xl h-12"
            />
          </div>
        </div>

        <Button
          onClick={save}
          disabled={saving || !name.trim() || !house.trim()}
          className="w-full h-12 rounded-full bg-ink text-paper hover:opacity-90 text-[13px] lowercase"
        >
          {saving ? "saving…" : "add to ledger"}
        </Button>
      </div>
    </AppShell>
  );
}
