import { useEffect, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useTheme, THEMES, type ThemeName } from "@/lib/theme";

const NICHE_LABELS: Record<number, string> = {
  1: "designer & mall scents, proudly",
  2: "mostly mainstream, a little adventurous",
  3: "open to everything",
  4: "lean niche, the weirder the better",
  5: "the most obscure scent known to man",
};

const THEME_SWATCHES: Record<ThemeName, {
  bg: string; card: string; ink: string; accent: string; rule: string;
  display: string; bodyLabel: string;
}> = {
  maison: {
    bg: "hsl(36 32% 95%)",
    card: "hsl(0 0% 100%)",
    ink: "hsl(24 18% 14%)",
    accent: "hsl(22 28% 32%)",
    rule: "hsl(28 14% 74%)",
    display: "'Fraunces', serif",
    bodyLabel: "fraunces · inter",
  },
  ledger: {
    bg: "hsl(0 0% 98%)",
    card: "hsl(210 20% 98%)",
    ink: "hsl(220 18% 12%)",
    accent: "hsl(220 18% 12%)",
    rule: "hsl(220 10% 68%)",
    display: "'JetBrains Mono', monospace",
    bodyLabel: "jetbrains mono",
  },
  accord: {
    bg: "hsl(0 0% 4%)",
    card: "hsl(0 0% 7%)",
    ink: "hsl(0 0% 96%)",
    accent: "hsl(0 0% 96%)",
    rule: "hsl(0 0% 28%)",
    display: "'JetBrains Mono', monospace",
    bodyLabel: "jetbrains mono",
  },
};

function ThemePreview({ id }: { id: ThemeName }) {
  const s = THEME_SWATCHES[id];
  return (
    <div
      className="aspect-[4/3] w-full p-3 flex flex-col justify-between border-b"
      style={{ background: s.bg, borderColor: s.rule }}
    >
      <div className="flex items-center justify-between">
        <div
          className="text-[8px] tracking-[0.22em] uppercase"
          style={{ color: s.ink, opacity: 0.6 }}
        >
          eau de
        </div>
        <div className="flex gap-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.ink }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.accent }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.card, border: `1px solid ${s.rule}` }} />
        </div>
      </div>
      <div
        style={{
          fontFamily: s.display,
          color: s.ink,
          fontSize: 22,
          lineHeight: 1,
          letterSpacing: id === "ledger" ? "-0.03em" : "-0.01em",
          fontWeight: id === "ledger" ? 500 : 400,
        }}
      >
        sillage
      </div>
      <div
        className="text-[9px] lowercase"
        style={{ color: s.ink, opacity: 0.55 }}
      >
        {s.bodyLabel}
      </div>
    </div>
  );
}

export default function Account() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [fullName, setFullName] = useState("");
  const [location, setLocation] = useState("");
  const [niche, setNiche] = useState<number>(3);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, location, niche_level, display_name")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setFullName(data.full_name ?? data.display_name ?? "");
        setLocation(data.location ?? "");
        setNiche(data.niche_level ?? 3);
      }
      setLoading(false);
    })();
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        location: location.trim() || null,
        niche_level: niche,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "couldn't save", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "saved", description: "your taste profile is updated" });
    }
  }

  async function detectLocation() {
    if (!navigator.geolocation) {
      toast({ title: "geolocation unavailable", variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
            { headers: { Accept: "application/json" } },
          );
          const j = await r.json();
          const a = j.address ?? {};
          const city = a.city || a.town || a.village || a.municipality || a.county || "";
          const country = a.country || "";
          const composed = [city, country].filter(Boolean).join(", ");
          if (composed) setLocation(composed);
          else toast({ title: "couldn't find your city" });
        } catch (e: any) {
          toast({ title: "lookup failed", description: e.message, variant: "destructive" });
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        toast({ title: "permission denied", description: err.message, variant: "destructive" });
      },
      { timeout: 10000 },
    );
  }

  return (
    <AppShell>
      <PageHeader eyebrow="the keeper" title="settings" hideSettings />
      <div className="px-5 space-y-5 pb-10">
        <div className="bg-card border border-rule/40 rounded-2xl p-4">
          <div className="text-[11px] text-ink-soft lowercase mb-1">signed in as</div>
          <div className="font-display text-[18px] text-ink">{user?.email}</div>
        </div>

        <section className="bg-card border border-rule/40 rounded-2xl p-4 space-y-5">
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-soft mb-1">
              your taste profile
            </div>
            <h2 className="font-display font-light text-[22px] text-ink lowercase leading-tight">
              personalization
            </h2>
            <p className="text-[12px] text-ink-soft lowercase mt-1">
              tunes what discover suggests for you.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-[12px] text-ink-mute lowercase">
              <Loader2 className="w-3 h-3 animate-spin" /> loading…
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-[11px] lowercase text-ink-soft">
                  name
                </Label>
                <Input
                  id="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="what should we call you"
                  maxLength={80}
                  className="h-10 text-[14px] lowercase"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="city" className="text-[11px] lowercase text-ink-soft">
                  location
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="city"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="city, country"
                    maxLength={120}
                    className="h-10 text-[14px] lowercase flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={detectLocation}
                    disabled={locating}
                    className="h-10 rounded-md border-rule/60 text-[12px] lowercase"
                  >
                    {locating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <MapPin className="w-3.5 h-3.5" />
                    )}
                    autofill
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label className="text-[11px] lowercase text-ink-soft">niche level</Label>
                  <div className="text-[11px] text-ink lowercase font-display">
                    {niche} · {NICHE_LABELS[niche]}
                  </div>
                </div>
                <Slider
                  value={[niche]}
                  min={1}
                  max={5}
                  step={1}
                  onValueChange={(v) => setNiche(v[0])}
                />
                <div className="flex justify-between text-[10px] text-ink-mute lowercase">
                  <span>designer</span>
                  <span>balanced</span>
                  <span>obscure</span>
                </div>
              </div>

              <Button
                onClick={save}
                disabled={saving}
                className="w-full h-11 rounded-full text-[13px] lowercase"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                save profile
              </Button>
            </>
          )}
        </section>

        {/* THEME PICKER */}
        <section className="bg-card border border-rule/40 rounded-2xl p-4 space-y-4">
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-ink-soft mb-1">
              the look
            </div>
            <h2 className="font-display font-light text-[22px] text-ink lowercase leading-tight">
              theme
            </h2>
            <p className="text-[12px] text-ink-soft lowercase mt-1">
              try a different aesthetic — applies instantly across the app.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {THEMES.map((t) => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id as ThemeName)}
                  className={`text-left rounded-xl border transition-all overflow-hidden ${
                    active
                      ? "border-ink ring-1 ring-ink"
                      : "border-rule/60 hover:border-ink-soft"
                  }`}
                >
                  <ThemePreview id={t.id as ThemeName} />
                  <div className="p-3">
                    <div className="font-display text-[16px] text-ink lowercase leading-none">
                      {t.label}
                    </div>
                    <div className="text-[10.5px] text-ink-soft lowercase italic mt-1 leading-snug">
                      {t.tagline}
                    </div>
                    {active && (
                      <div className="text-[9.5px] tracking-[0.22em] uppercase text-ink mt-2">
                        · current ·
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <Button
          onClick={signOut}
          variant="outline"
          className="w-full h-12 rounded-full border-rule/60 bg-card text-ink hover:bg-muted/60 text-[13px] lowercase"
        >
          sign out
        </Button>
      </div>
    </AppShell>
  );
}
