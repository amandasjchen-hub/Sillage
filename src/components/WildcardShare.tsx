import { useEffect, useRef, useState } from "react";
import { Share2, Loader2, X, Download } from "lucide-react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { ThemeName } from "@/lib/theme";

type Pick = { name: string; house: string; why: string; notes?: string[] };

function isMobile() {
  return /iphone|ipad|ipod|android/i.test(navigator.userAgent);
}

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    // Upgrade http→https to avoid mixed-content blocks on https origins.
    const safeUrl = url.replace(/^http:\/\//i, "https://");
    const res = await fetch(safeUrl, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Renders a 1080×1920 IG-Story-sized card off-screen, snapshots it to a PNG,
 * then shows the actual image in-app so mobile Safari can save it via long-press.
 */
export default function WildcardShare({
  scenario,
  pick,
  gradient,
  theme = "ledger",
}: {
  scenario: string;
  pick: Pick;
  gradient: string;
  theme?: ThemeName;
}) {
  const isAccord = theme === "accord";
  const isMaison = theme === "maison";
  const cardBackground = isMaison ? gradient : isAccord ? "#000000" : "#ffffff";
  const cardColor = isAccord ? "#ffffff" : "hsl(28, 18%, 18%)";
  const cardBorder = !isMaison && !isAccord ? "2px solid #000000" : "none";
  const dividerColor = isAccord ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.18)";
  const noteBorder = isAccord ? "1px solid rgba(255,255,255,0.35)" : "1px solid rgba(0,0,0,0.25)";
  const snapshotBg = isMaison ? "#f5f1ea" : isAccord ? "#000000" : "#ffffff";
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [bottleDataUrl, setBottleDataUrl] = useState<string | null>(null);

  // Look up a bottle photo for this pick. Three-tier resolution:
  //   1) shared perfume_image_cache (instant — populated by anyone who has
  //      ever fetched this bottle before)
  //   2) the user's own perfumes table (if they happen to own it)
  //   3) live fetch via the edge function, then write back to the cache
  // The resolved URL is then converted to a data URL in the background so
  // the off-screen story card has same-origin pixels ready for snapshot.
  useEffect(() => {
    let cancelled = false;
    setBottleDataUrl(null);
    (async () => {
      const cacheKey = `${pick.name}|${pick.house ?? ""}`.toLowerCase().trim();

      const resolveUrl = async (): Promise<string | null> => {
        try {
          // 1) shared cache
          const { data: cached } = await supabase
            .from("perfume_image_cache")
            .select("image_url")
            .eq("key", cacheKey)
            .maybeSingle();
          if (cached?.image_url) return cached.image_url;

          // 2) user's own collection
          const { data: rows } = await supabase
            .from("perfumes")
            .select("image_url, image_url_nobg, house, name")
            .ilike("name", pick.name)
            .limit(5);
          const match =
            rows?.find(
              (r: any) =>
                !pick.house ||
                !r.house ||
                r.house.toLowerCase().trim() === pick.house.toLowerCase().trim(),
            ) || rows?.[0];
          const owned = match?.image_url_nobg || match?.image_url;
          if (owned) {
            // backfill the shared cache for next time
            supabase
              .from("perfume_image_cache")
              .insert({
                key: cacheKey,
                name: pick.name,
                house: pick.house ?? null,
                image_url: owned,
                image_source: "user_collection",
              })
              .then(() => {});
            return owned;
          }

          // 3) live fetch
          const { data, error } = await supabase.functions.invoke("fetch-perfume-image", {
            body: { name: pick.name, house: pick.house },
          });
          if (error) return null;
          const url = ((data as any)?.image_url as string | undefined) ?? null;
          const source = ((data as any)?.image_source as string | undefined) ?? null;
          if (url) {
            supabase
              .from("perfume_image_cache")
              .insert({
                key: cacheKey,
                name: pick.name,
                house: pick.house ?? null,
                image_url: url,
                image_source: source,
              })
              .then(() => {});
          }
          return url;
        } catch {
          return null;
        }
      };

      const url = await resolveUrl();
      if (cancelled || !url) return;
      const dataUrl = await urlToDataUrl(url);
      if (!cancelled && dataUrl) setBottleDataUrl(dataUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [pick.name, pick.house]);

  async function snapshot(): Promise<{ dataUrl: string; blob: Blob; file: File }> {
    if (!cardRef.current) throw new Error("card not ready");
    // Two passes: first render warms fonts/layout, second produces clean PNG.
    await toPng(cardRef.current, { pixelRatio: 1, cacheBust: true, skipFonts: true });
    const dataUrl = await toPng(cardRef.current, {
      pixelRatio: 1,
      cacheBust: true,
      skipFonts: true,
      backgroundColor: snapshotBg,
    });
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `wildcard-${Date.now()}.png`, { type: "image/png" });
    return { dataUrl, blob, file };
  }

  function downloadImage(dataUrl: string) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `wildcard-${pick.name.toLowerCase().replace(/\s+/g, "-")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    try {
      const { dataUrl } = await snapshot();
      setPreviewUrl(dataUrl);

      toast({
        title: "story card ready",
        description: isMobile() ? "press and hold the image to save it" : "download it from the preview",
      });
    } catch (e: any) {
      console.error("share failed", e);
      toast({
        title: "couldn't generate image",
        description: e?.message ?? "try again",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          onClick={handleShare}
          disabled={busy}
          variant="ghost"
          size="sm"
          className="text-[11px] lowercase text-ink-soft hover:text-ink h-7 gap-1.5"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
          make story card
        </Button>
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm px-5 py-6 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
            <div>
              <div className="font-display text-[24px] leading-none text-ink lowercase">story card</div>
              <div className="text-[11px] text-ink-soft lowercase mt-1">
                {isMobile() ? "press and hold image → save to photos" : "download image"}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!isMobile() && (
                <Button
                  type="button"
                  onClick={() => downloadImage(previewUrl)}
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-ink-soft hover:text-ink"
                >
                  <Download className="w-4 h-4" />
                </Button>
              )}
              <Button
                type="button"
                onClick={() => setPreviewUrl(null)}
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-ink-soft hover:text-ink"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 flex items-center justify-center">
            <img
              src={previewUrl}
              alt={`${pick.name} wildcard story card`}
              className="max-h-full max-w-full rounded-sm shadow-2xl select-auto"
              style={{ WebkitTouchCallout: "default", WebkitUserSelect: "auto" }}
            />
          </div>
        </div>
      )}

      {/* Off-screen render target — exact IG Story aspect (1080×1920).
          Clipped to a 1px box so it occupies no visible space, but still
          renders into the document so html-to-image captures real pixels. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          overflow: "hidden",
          pointerEvents: "none",
          opacity: 0,
          zIndex: -1,
        }}
      >
        <div
          ref={cardRef}
          style={{
            width: 1080,
            height: 1920,
            background: cardBackground,
            border: cardBorder,
            display: "flex",
            flexDirection: "column",
            padding: "90px 90px 80px",
            boxSizing: "border-box",
            fontFamily: "Georgia, 'Times New Roman', serif",
            color: cardColor,
            position: "relative",
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 56,
            }}
          >
            {/* Header — section copy */}
            <div>
              <div
                style={{
                  fontFamily: "system-ui, sans-serif",
                  fontSize: 26,
                  letterSpacing: "0.4em",
                  textTransform: "uppercase",
                  opacity: 0.6,
                  marginBottom: 28,
                }}
              >
                daily wildcard
              </div>
              <div
                style={{
                  fontSize: 72,
                  lineHeight: 1.05,
                  textTransform: "lowercase",
                  marginBottom: 22,
                }}
              >
                scent of the day
              </div>
              <div
                style={{
                  fontFamily: "system-ui, sans-serif",
                  fontSize: 30,
                  lineHeight: 1.4,
                  opacity: 0.65,
                  textTransform: "lowercase",
                }}
              >
                one absurdly specific occasion. one perfume that genuinely fits.
              </div>
            </div>

            {/* Scenario */}
            <div>
              <div
                style={{
                  fontFamily: "system-ui, sans-serif",
                  fontSize: 24,
                  letterSpacing: "0.32em",
                  textTransform: "uppercase",
                  opacity: 0.65,
                  marginBottom: 22,
                }}
              >
                the scenario
              </div>
              <p
                style={{
                  fontStyle: "italic",
                  fontSize: 76,
                  lineHeight: 1.15,
                  margin: 0,
                  textTransform: "lowercase",
                }}
              >
                "{scenario}"
              </p>
            </div>

            <div
              style={{
                height: 1,
                background: dividerColor,
              }}
            />

            {/* Pick */}
            <div
              style={{
                display: "flex",
                gap: 48,
                alignItems: "center",
              }}
            >
              {bottleDataUrl && (
                <img
                  src={bottleDataUrl}
                  alt=""
                  crossOrigin="anonymous"
                  style={{
                    width: 260,
                    height: 340,
                    objectFit: "contain",
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "system-ui, sans-serif",
                    fontSize: 24,
                    letterSpacing: "0.32em",
                    textTransform: "uppercase",
                    opacity: 0.65,
                    marginBottom: 20,
                  }}
                >
                  wear this
                </div>
                <div
                  style={{
                    fontSize: bottleDataUrl ? 84 : 104,
                    lineHeight: 1,
                    textTransform: "lowercase",
                    marginBottom: 16,
                  }}
                >
                  {pick.name.toLowerCase()}
                </div>
                <div
                  style={{
                    fontFamily: "system-ui, sans-serif",
                    fontSize: 30,
                    opacity: 0.7,
                    textTransform: "lowercase",
                  }}
                >
                  {pick.house.toLowerCase()}
                </div>
              </div>
            </div>

            {/* Why */}
            {pick.why && (
              <p
                style={{
                  fontSize: 38,
                  lineHeight: 1.4,
                  margin: 0,
                  opacity: 0.9,
                }}
              >
                {pick.why}
              </p>
            )}

            {/* Notes */}
            {pick.notes && pick.notes.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {pick.notes.slice(0, 6).map((n) => (
                  <span
                    key={n}
                    style={{
                      fontFamily: "system-ui, sans-serif",
                      fontSize: 26,
                      textTransform: "lowercase",
                      border: noteBorder,
                      borderRadius: 999,
                      padding: "10px 26px",
                    }}
                  >
                    {n.toLowerCase()}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Footer pinned to bottom */}
          <div
            style={{
              textAlign: "center",
              fontFamily: "system-ui, sans-serif",
              fontSize: 20,
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              opacity: 0.55,
            }}
          >
            sillage
          </div>
        </div>
      </div>
    </>
  );
}
