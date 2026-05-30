import { useEffect, useState } from "react";
// router link not needed here
import { Sparkles, Wand2, Dices, RefreshCw, Loader2, Heart, Check, History, Trash2, Stars } from "lucide-react";
import AppShell from "@/components/AppShell";
import WildcardShare from "@/components/WildcardShare";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { toast } from "@/hooks/use-toast";

type HistoryRow = {
  id: string;
  mode: "twins" | "vibe" | "wildcard";
  prompt: string | null;
  payload: any;
  created_at: string;
};

async function recordHistory(
  userId: string,
  mode: "twins" | "vibe" | "wildcard",
  payload: any,
  prompt?: string,
) {
  try {
    await supabase.from("discover_history").insert({
      user_id: userId,
      mode,
      prompt: prompt ?? null,
      payload,
    });
  } catch (e) {
    console.error("history save failed", e);
  }
}

type Suggestion = {
  name: string;
  house: string;
  why: string;
  notes?: string[];
  vibe?: string;
};

type SuggestPayload = { intro: string; suggestions: Suggestion[] };
type WildcardPayload = { scenario: string; pick: Suggestion & { smells_like?: string[] } };

const VIBE_PROMPTS = [
  "the smell of a library after rain",
  "if my ex were a saint",
  "monaco at 4am, alone, slightly winning",
  "a haunted greenhouse in october",
  "the soundtrack to a slow car chase",
];

async function call(mode: "twins" | "vibe" | "wildcard", prompt?: string) {
  const { data, error } = await supabase.functions.invoke("discover-perfumes", {
    body: { mode, prompt },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

type SaveState = "idle" | "saving" | "saved";

function SaveButton({
  state,
  onClick,
  variant = "light",
}: {
  state: SaveState;
  onClick: () => void;
  variant?: "light" | "dark";
}) {
  const dark = variant === "dark";
  const base = dark
    ? "border-ink/25 text-ink/80 hover:bg-ink/5"
    : "border-rule/60 text-ink-soft hover:text-ink hover:bg-muted/60";
  const savedCls = dark
    ? "border-ink/25 bg-ink/10 text-ink"
    : "border-ink/30 bg-ink/5 text-ink";
  return (
    <button
      onClick={onClick}
      disabled={state !== "idle"}
      className={`inline-flex items-center gap-1.5 text-[10px] lowercase tracking-wide rounded-full border px-2.5 py-1 transition-colors ${
        state === "saved" ? savedCls : base
      } disabled:opacity-80`}
    >
      {state === "saving" ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : state === "saved" ? (
        <Check className="w-3 h-3" />
      ) : (
        <Heart className="w-3 h-3" />
      )}
      {state === "saved" ? "in wishlist" : state === "saving" ? "saving" : "wishlist"}
    </button>
  );
}

function SuggestionCard({
  s,
  accent,
  saveState,
  onSave,
}: {
  s: Suggestion;
  accent: string;
  saveState: SaveState;
  onSave: () => void;
}) {
  return (
    <div className="bg-card border border-rule/40 rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-display text-[20px] text-ink lowercase leading-tight">
          {s.name.toLowerCase()}
        </div>
        {s.vibe && (
          <div
            className="text-[10px] lowercase tracking-wider px-2 py-0.5 rounded-full shrink-0"
            style={{ background: accent, color: "hsl(var(--paper))" }}
          >
            {s.vibe}
          </div>
        )}
      </div>
      <div className="text-[11px] text-ink-soft lowercase mt-0.5">
        {s.house.toLowerCase()}
      </div>
      <p className="text-[13px] text-ink/85 mt-3 leading-snug italic font-display font-light">
        “{s.why}”
      </p>
      {s.notes && s.notes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {s.notes.slice(0, 5).map((n) => (
            <span
              key={n}
              className="text-[10px] lowercase text-ink-soft border border-rule/50 rounded-full px-2 py-0.5"
            >
              {n.toLowerCase()}
            </span>
          ))}
        </div>
      )}
      <div className="flex justify-end mt-3">
        <SaveButton state={saveState} onClick={onSave} />
      </div>
    </div>
  );
}

function SectionShell({
  eyebrow,
  title,
  blurb,
  accent,
  children,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-5 py-6">
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: accent }}
        />
        <div className="text-[10px] tracking-[0.22em] uppercase text-ink-soft">
          {eyebrow}
        </div>
      </div>
      <h2 className="font-display font-light text-[26px] text-ink lowercase leading-tight">
        {title}
      </h2>
      <p className="text-[12px] text-ink-soft lowercase mt-1 mb-4">{blurb}</p>
      {children}
    </section>
  );
}

const TWINS_CACHE_KEY = "discover_twins_cache";
const WILD_CACHE_KEY = "discover_wild_cache";

function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export default function Discover() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isWarm = theme === "maison";
  const isAccord = theme === "accord";
  const personaGradient = isAccord
    ? "hsl(0 0% 100%)"
    : isWarm
    ? "linear-gradient(135deg, hsl(280 25% 90%) 0%, hsl(28 25% 88%) 60%, hsl(45 25% 88%) 100%)"
    : "linear-gradient(135deg, hsl(220 6% 88%) 0%, hsl(220 4% 80%) 60%, hsl(220 4% 72%) 100%)";
  const wildcardGradient = isAccord
    ? "hsl(0 0% 100%)"
    : isWarm
    ? "linear-gradient(135deg, hsl(340 30% 88%) 0%, hsl(28 25% 86%) 50%, hsl(45 30% 86%) 100%)"
    : "linear-gradient(135deg, hsl(220 4% 90%) 0%, hsl(220 4% 78%) 50%, hsl(220 6% 68%) 100%)";
  const accordCardClass = isAccord ? " accord-card-dark" : "";

  // section 1: twins (seeded from cache for instant first paint)
  const [twins, setTwins] = useState<SuggestPayload | null>(() =>
    readCache<SuggestPayload>(TWINS_CACHE_KEY),
  );
  const [twinsLoading, setTwinsLoading] = useState(false);

  // section 2: vibe
  const [vibe, setVibe] = useState("");
  const [vibeResult, setVibeResult] = useState<SuggestPayload | null>(null);
  const [vibeLoading, setVibeLoading] = useState(false);

  // section 3: wildcard (seeded from cache for instant first paint)
  const [wild, setWild] = useState<WildcardPayload | null>(() =>
    readCache<WildcardPayload>(WILD_CACHE_KEY),
  );
  const [wildLoading, setWildLoading] = useState(false);

  // section 0: persona
  type Persona = {
    title: string;
    tagline: string;
    description: string;
    signature_notes: string[];
  };
  const [persona, setPersona] = useState<Persona | null>(null);
  const [personaLoading, setPersonaLoading] = useState(false);
  const [personaLoaded, setPersonaLoaded] = useState(false);

  // history viewer
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function loadHistory() {
    if (!user) return;
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from("discover_history")
      .select("id, mode, prompt, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) setHistory(data as HistoryRow[]);
    setHistoryLoading(false);
  }

  async function deleteHistoryRow(id: string) {
    await supabase.from("discover_history").delete().eq("id", id);
    setHistory((rows) => rows.filter((r) => r.id !== id));
  }

  function restoreHistory(row: HistoryRow) {
    if (row.mode === "twins") setTwins(row.payload as SuggestPayload);
    else if (row.mode === "vibe") {
      setVibeResult(row.payload as SuggestPayload);
      if (row.prompt) setVibe(row.prompt);
    } else if (row.mode === "wildcard") setWild(row.payload as WildcardPayload);
    setHistoryOpen(false);
    toast({ title: "restored", description: `loaded a past ${row.mode} result` });
  }

  // wishlist save tracking — keyed by `${name}::${house}`
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const keyFor = (s: Suggestion) =>
    `${s.name.trim().toLowerCase()}::${s.house.trim().toLowerCase()}`;

  async function saveSuggestion(s: Suggestion) {
    if (!user) return;
    const key = keyFor(s);
    if (saveStates[key] && saveStates[key] !== "idle") return;
    setSaveStates((m) => ({ ...m, [key]: "saving" }));
    try {
      // Quick dedupe — already in collection?
      const { data: existing } = await supabase
        .from("perfumes")
        .select("id,status")
        .ilike("name", s.name.trim())
        .ilike("house", s.house.trim())
        .limit(1)
        .maybeSingle();

      if (existing) {
        setSaveStates((m) => ({ ...m, [key]: "saved" }));
        toast({
          title: "already on your shelf",
          description: `${s.name.toLowerCase()} — ${existing.status}`,
        });
        return;
      }

      // Insert minimal wishlist row immediately for snappy UX
      const { data: inserted, error } = await supabase
        .from("perfumes")
        .insert({
          user_id: user.id,
          name: s.name.trim(),
          house: s.house.trim(),
          status: "wishlist",
          top_notes: s.notes ?? [],
          ai_enriched: false,
        })
        .select()
        .single();
      if (error) throw error;

      setSaveStates((m) => ({ ...m, [key]: "saved" }));
      toast({
        title: "saved to wishlist",
        description: `${s.name.toLowerCase()} — enriching in the background`,
      });

      // Background enrich + image fetch
      (async () => {
        try {
          const [enrichRes, imgRes] = await Promise.all([
            supabase.functions.invoke("enrich-perfume", {
              body: { name: s.name.trim(), house: s.house.trim() },
            }),
            supabase.functions.invoke("fetch-perfume-image", {
              body: { name: s.name.trim(), house: s.house.trim() },
            }),
          ]);
          const enriched: any = enrichRes.error ? null : enrichRes.data;
          const img: any = imgRes.error ? null : imgRes.data;
          if (!enriched && !img?.image_url) return;
          await supabase
            .from("perfumes")
            .update({
              house_origin: enriched?.house_origin ?? null,
              year: enriched?.year ?? null,
              perfumer: enriched?.perfumer ?? null,
              description: enriched?.description ?? null,
              top_notes: enriched?.top_notes ?? s.notes ?? [],
              middle_notes: enriched?.middle_notes ?? [],
              base_notes: enriched?.base_notes ?? [],
              similar_perfumes: enriched?.similar_perfumes ?? [],
              official_sources: enriched?.official_sources ?? [],
              community_summary: enriched?.community_summary ?? null,
              community_accords: enriched?.community_accords ?? [],
              community_descriptors: enriched?.community_descriptors ?? [],
              olfactory_family: enriched?.olfactory_family ?? null,
              price_usd: enriched?.price_usd ?? null,
              image_url: img?.image_url ?? null,
              image_source: img?.image_source ?? null,
              ai_enriched: !!enriched,
            })
            .eq("id", inserted.id);
        } catch (err) {
          console.error("background enrich failed", err);
        }
      })();
    } catch (e: any) {
      setSaveStates((m) => ({ ...m, [key]: "idle" }));
      toast({
        title: "couldn't save",
        description: e.message ?? "try again",
        variant: "destructive",
      });
    }
  }


  async function loadTwins() {
    setTwinsLoading(true);
    try {
      const d = (await call("twins")) as SuggestPayload;
      setTwins(d);
      writeCache(TWINS_CACHE_KEY, d);
      if (user) recordHistory(user.id, "twins", d);
    } catch (e: any) {
      toast({ title: "couldn't load", description: e.message, variant: "destructive" });
    } finally {
      setTwinsLoading(false);
    }
  }

  async function loadWild() {
    setWildLoading(true);
    try {
      const d = (await call("wildcard")) as WildcardPayload;
      setWild(d);
      writeCache(WILD_CACHE_KEY, d);
      if (user) recordHistory(user.id, "wildcard", d);
    } catch (e: any) {
      toast({ title: "couldn't roll", description: e.message, variant: "destructive" });
    } finally {
      setWildLoading(false);
    }
  }

  async function submitVibe(text?: string) {
    const p = (text ?? vibe).trim();
    if (!p) return;
    setVibe(p);
    setVibeLoading(true);
    try {
      const d = (await call("vibe", p)) as SuggestPayload;
      setVibeResult(d);
      if (user) recordHistory(user.id, "vibe", d, p);
    } catch (e: any) {
      toast({ title: "couldn't translate vibe", description: e.message, variant: "destructive" });
    } finally {
      setVibeLoading(false);
    }
  }

  // Persona: load cached on mount, generate if none.
  async function generatePersona() {
    setPersonaLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("scent-persona", { body: {} });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setPersona(data as Persona);
    } catch (e: any) {
      toast({ title: "couldn't read your persona", description: e.message, variant: "destructive" });
    } finally {
      setPersonaLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("scent_personas")
        .select("title,tagline,description,signature_notes")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setPersona(data as Persona);
      setPersonaLoaded(true);
      // Auto-generate first time only
      if (!data) generatePersona();
    })();
  }, [user]);

  // Only auto-fetch when we don't already have cached results to show.
  useEffect(() => {
    if (!twins) loadTwins();
    if (!wild) loadWild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell>
      <PageHeader
        eyebrow="for you, today"
        title="discover"
        meta="vibes · nostalgia · the fragrances you don't know you want yet"
        right={
          <Sheet open={historyOpen} onOpenChange={(o) => { setHistoryOpen(o); if (o) loadHistory(); }}>
            <SheetTrigger asChild>
              <button
                aria-label="history"
                className="inline-flex items-center gap-1.5 text-[11px] lowercase text-ink-soft hover:text-ink border border-rule/60 rounded-full px-2.5 py-1 transition-colors"
              >
                <History className="w-3 h-3" />
                history
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[88vw] sm:w-[420px] overflow-y-auto">
              <SheetHeader>
                <SheetTitle className="font-display font-light text-[24px] lowercase">
                  past discoveries
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3">
                {historyLoading && (
                  <div className="text-[12px] text-ink-mute lowercase flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> loading…
                  </div>
                )}
                {!historyLoading && history.length === 0 && (
                  <div className="text-[12px] text-ink-mute lowercase">
                    nothing here yet — your discover results will land here.
                  </div>
                )}
                {history.map((row) => {
                  const date = new Date(row.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  let summary = "";
                  if (row.mode === "wildcard") {
                    summary = row.payload?.scenario ?? "";
                  } else if (row.mode === "vibe") {
                    summary = row.prompt ?? row.payload?.intro ?? "";
                  } else {
                    summary = row.payload?.intro ?? "";
                  }
                  return (
                    <div
                      key={row.id}
                      className="border border-rule/40 rounded-xl p-3 bg-card"
                    >
                      <div className="flex items-center justify-between text-[10px] tracking-[0.2em] uppercase text-ink-soft mb-1">
                        <span>{row.mode}</span>
                        <span className="tracking-normal normal-case text-ink-mute">{date}</span>
                      </div>
                      {summary && (
                        <p className="text-[12px] text-ink/80 italic font-display lowercase line-clamp-3">
                          “{summary}”
                        </p>
                      )}
                      <div className="flex items-center justify-end gap-2 mt-2">
                        <button
                          onClick={() => deleteHistoryRow(row.id)}
                          className="inline-flex items-center gap-1 text-[10px] lowercase text-ink-mute hover:text-ink"
                        >
                          <Trash2 className="w-3 h-3" /> delete
                        </button>
                        <button
                          onClick={() => restoreHistory(row)}
                          className="text-[10px] lowercase border border-ink/30 rounded-full px-2.5 py-1 hover:bg-ink hover:text-paper transition-colors"
                        >
                          restore
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        }
      />

      {/* Section 0 — Persona */}
      <SectionShell
        eyebrow="your scent persona"
        title="who your shelf says you are"
        blurb="an olfactive identity, read off your bottles."
        accent="hsl(280 35% 45%)"
      >
        <div
          className={"relative overflow-hidden rounded-2xl p-5 border bg-secondary border-secondary" + accordCardClass}
          style={{
            background: personaGradient,
          }}
        >
          <div className="absolute -top-8 -left-8 w-28 h-28 rounded-full bg-paper/40 blur-2xl" />
          <div className="relative">
            {!personaLoaded || (personaLoading && !persona) ? (
              <div className="font-display text-[18px] text-ink/60 italic lowercase flex items-center gap-2">
                <Stars className="w-4 h-4 animate-pulse" />
                reading your shelf...
              </div>
            ) : !persona ? (
              <div className="text-[12px] text-ink-soft lowercase">
                add a few bottles, then tap refresh.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 mb-2">
                  <Stars className="w-3.5 h-3.5 text-ink/70" />
                  <div className="text-[10px] tracking-[0.22em] uppercase text-ink/70">
                    you are
                  </div>
                </div>
                <div className="font-display text-[28px] text-ink lowercase leading-tight">
                  {persona.title.toLowerCase()}
                </div>
                <p className="font-display italic text-[15px] text-ink/80 lowercase mt-1">
                  {persona.tagline.toLowerCase()}
                </p>
                <div className="rule mt-4 mb-3 bg-ink/15" />
                <p className="text-[13px] text-ink/85 leading-snug">
                  {persona.description}
                </p>
                {persona.signature_notes?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {persona.signature_notes.map((n) => (
                      <span
                        key={n}
                        className="text-[10px] lowercase text-ink/80 border border-ink/20 rounded-full px-2 py-0.5"
                      >
                        {n.toLowerCase()}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex justify-center mt-3">
          <Button
            onClick={generatePersona}
            disabled={personaLoading}
            variant="ghost"
            size="sm"
            className="text-[11px] lowercase text-ink-soft hover:text-ink h-7"
          >
            {personaLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            re-read me
          </Button>
        </div>
      </SectionShell>

      <div className="rule mx-5" />

      {/* Section 1 — Twins */}
      <SectionShell
        eyebrow="shelf twins"
        title="people who smell like you"
        blurb="picks loved by collectors with overlapping taste."
        accent="hsl(var(--accent))"
      >
        <div className="flex justify-end mb-3">
          <Button
            onClick={loadTwins}
            disabled={twinsLoading}
            variant="ghost"
            size="sm"
            className="text-[11px] lowercase text-ink-soft hover:text-ink h-7"
          >
            {twinsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            refresh
          </Button>
        </div>
        {twinsLoading && !twins && (
          <div className="text-center py-10 text-[12px] text-ink-mute lowercase">
            <Sparkles className="w-5 h-5 mx-auto mb-2 animate-pulse" />
            reading your shelf...
          </div>
        )}
        {twins && (
          <>
            <p className="text-[13px] text-ink-soft italic font-display font-light mb-4 px-1">
              {twins.intro}
            </p>
            <div className="space-y-3">
              {twins.suggestions.map((s, i) => (
                <SuggestionCard
                  key={i}
                  s={s}
                  accent="hsl(var(--accent))"
                  saveState={saveStates[keyFor(s)] ?? "idle"}
                  onSave={() => saveSuggestion(s)}
                />
              ))}
            </div>
          </>
        )}
      </SectionShell>

      <div className="rule mx-5" />

      {/* Section 2 — Vibe */}
      <SectionShell
        eyebrow="vibe translator"
        title="describe a feeling"
        blurb="tell me a memory, a place, a person — i'll find the bottle."
        accent="hsl(22 50% 45%)"
      >
        <div className="bg-card border border-rule/40 rounded-2xl p-3">
          <Textarea
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
            placeholder="e.g. my grandmother's kitchen at christmas"
            className="border-0 bg-transparent resize-none min-h-[60px] text-[14px] focus-visible:ring-0 placeholder:text-ink-mute lowercase"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitVibe();
            }}
          />
          <div className="flex items-center justify-between gap-2 mt-2">
            <div className="text-[10px] text-ink-mute lowercase">⌘+enter</div>
            <Button
              onClick={() => submitVibe()}
              disabled={vibeLoading || !vibe.trim()}
              size="sm"
              className="rounded-full h-8 px-4 text-[12px] lowercase bg-ink text-paper hover:bg-ink/90"
            >
              {vibeLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              translate
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {VIBE_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => submitVibe(p)}
              disabled={vibeLoading}
              className="text-[10px] lowercase text-ink-soft border border-rule/50 rounded-full px-2.5 py-1 hover:bg-muted/60 hover:text-ink transition-colors"
            >
              {p}
            </button>
          ))}
        </div>

        {vibeLoading && (
          <div className="text-center py-8 text-[12px] text-ink-mute lowercase mt-4">
            <Wand2 className="w-5 h-5 mx-auto mb-2 animate-pulse" />
            translating...
          </div>
        )}
        {vibeResult && !vibeLoading && (
          <div className="mt-5 space-y-3">
            <p className="text-[13px] text-ink-soft italic font-display font-light px-1">
              {vibeResult.intro}
            </p>
            {vibeResult.suggestions.map((s, i) => (
              <SuggestionCard
                key={i}
                s={s}
                accent="hsl(22 50% 45%)"
                saveState={saveStates[keyFor(s)] ?? "idle"}
                onSave={() => saveSuggestion(s)}
              />
            ))}
          </div>
        )}
      </SectionShell>

      <div className="rule mx-5" />

      {/* Section 3 — Wildcard */}
      <SectionShell
        eyebrow="daily wildcard"
        title="scent of the day"
        blurb="one absurdly specific occasion. one perfume that genuinely fits."
        accent="hsl(340 50% 50%)"
      >
        <div
          className={"relative overflow-hidden rounded-2xl p-5 border bg-secondary border-secondary" + accordCardClass}
          style={{
            background: wildcardGradient,
          }}
        >
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-paper/40 blur-2xl border-secondary" />
          <div className="relative">
            <div className="flex items-center gap-1.5 mb-3">
              <Dices className="w-3.5 h-3.5 text-ink/70" />
              <div className="text-[10px] tracking-[0.22em] uppercase text-ink/70">
                the scenario
              </div>
            </div>
            {wildLoading && !wild && (
              <div className="font-display text-[18px] text-ink/60 italic lowercase">
                rolling the dice...
              </div>
            )}
            {wild && (
              <>
                <p className="font-display text-[22px] text-ink leading-tight italic lowercase">
                  “{wild.scenario}”
                </p>
                <div className="rule mt-5 mb-4 bg-ink/15" />
                <div className="text-[10px] tracking-[0.22em] uppercase text-ink/70 mb-2">
                  wear this
                </div>
                <div className="font-display text-[26px] text-ink lowercase leading-none">
                  {wild.pick.name.toLowerCase()}
                </div>
                <div className="text-[11px] text-ink/50 lowercase mt-1 tracking-wide">
                  by {wild.pick.house.toLowerCase()}
                </div>
                {(wild.pick as any).smells_like?.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <div className="text-[10px] tracking-[0.22em] uppercase text-ink/50 mb-2">smells like</div>
                    {(wild.pick as any).smells_like.slice(0, 5).map((b: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-[13px] text-ink/85 lowercase">
                        <span className="text-ink/30 mt-0.5">—</span>
                        <span>{b.toLowerCase()}</span>
                      </div>
                    ))}
                  </div>
                )}
                {wild.pick.notes && wild.pick.notes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {wild.pick.notes.slice(0, 5).map((n) => (
                      <span
                        key={n}
                        className="text-[10px] lowercase text-ink/80 border border-ink/20 rounded-full px-2 py-0.5"
                      >
                        {n.toLowerCase()}
                      </span>
                    ))}
                  </div>
                )}
                {wild.pick.why && (
                  <p className="text-[12px] text-ink/50 mt-3 italic lowercase">
                    {wild.pick.why.toLowerCase()}
                  </p>
                )}
                <div className="flex justify-end mt-4">
                  <SaveButton
                    state={saveStates[keyFor(wild.pick)] ?? "idle"}
                    onClick={() => saveSuggestion(wild.pick)}
                    variant="dark"
                  />
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex justify-center items-center gap-2 mt-3">
          <Button
            onClick={loadWild}
            disabled={wildLoading}
            variant="ghost"
            size="sm"
            className="text-[11px] lowercase text-ink-soft hover:text-ink h-7"
          >
            {wildLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Dices className="w-3 h-3" />}
            roll again
          </Button>
          {wild && (
            <>
              <span className="text-ink-soft/40 text-[11px]">·</span>
              <WildcardShare
                scenario={wild.scenario}
                pick={wild.pick}
                gradient={wildcardGradient}
                theme={theme}
              />
            </>
          )}
        </div>
      </SectionShell>
    </AppShell>
  );
}
