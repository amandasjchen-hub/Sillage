import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Image as ImageIcon, Loader2, RotateCcw, Sparkles, Pencil, Check } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

type Identification = {
  identified: boolean;
  name: string;
  house: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  alternatives?: { name: string; house: string }[];
};

const MAX_DIM = 1280;

async function fileToCompressedDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Resize via canvas to keep payloads small
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  let { naturalWidth: w, naturalHeight: h } = img;
  if (w > MAX_DIM || h > MAX_DIM) {
    if (w >= h) {
      h = Math.round((h * MAX_DIM) / w);
      w = MAX_DIM;
    } else {
      w = Math.round((w * MAX_DIM) / h);
      h = MAX_DIM;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function ScanPerfume() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [result, setResult] = useState<Identification | null>(null);
  const [status, setStatus] = useState<"owned" | "wishlist">("owned");
  const [saving, setSaving] = useState(false);

  // tidy up object URLs (we use data URLs, so this is mostly defensive)
  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function reset() {
    setPreviewUrl(null);
    setResult(null);
    setIdentifying(false);
    setSaving(false);
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "please choose an image", variant: "destructive" });
      return;
    }
    setResult(null);
    setIdentifying(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setPreviewUrl(dataUrl);
      const { data, error } = await supabase.functions.invoke("identify-perfume", {
        body: { image: dataUrl },
      });
      if (error) throw error;
      const r = data as Identification & { error?: string };
      if ((r as any).error) throw new Error((r as any).error);
      setResult(r);
      if (!r.identified) {
        toast({
          title: "couldn't read the bottle",
          description: "try better light, or fill the frame with the front label",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "scan failed",
        description: e?.message ?? "try again",
        variant: "destructive",
      });
    } finally {
      setIdentifying(false);
    }
  }

  function pickAlternative(alt: { name: string; house: string }) {
    if (!result) return;
    setResult({ ...result, name: alt.name, house: alt.house, confidence: "medium" });
  }

  async function confirmAndAdd() {
    if (!user || !result) return;
    setSaving(true);
    try {
      // dedupe — already on shelf?
      const { data: existing } = await supabase
        .from("perfumes")
        .select("id, status")
        .ilike("name", result.name.trim())
        .ilike("house", result.house.trim())
        .limit(1)
        .maybeSingle();

      if (existing) {
        toast({
          title: "already on your shelf",
          description: `${result.name.toLowerCase()} — ${existing.status}`,
        });
        navigate(`/perfume/${existing.id}`);
        return;
      }

      // insert minimal row immediately; enrich in background
      const { data: inserted, error } = await supabase
        .from("perfumes")
        .insert({
          user_id: user.id,
          name: result.name.trim(),
          house: result.house.trim(),
          status,
          ai_enriched: false,
        })
        .select()
        .single();
      if (error) throw error;

      toast({
        title: "added",
        description: `${result.name.toLowerCase()} — pulling notes & image…`,
      });
      navigate(`/perfume/${inserted.id}`);

      // background enrich — same pattern as Discover save flow
      (async () => {
        try {
          const [enrichRes, imgRes] = await Promise.all([
            supabase.functions.invoke("enrich-perfume", {
              body: { name: result.name.trim(), house: result.house.trim() },
            }),
            supabase.functions.invoke("fetch-perfume-image", {
              body: { name: result.name.trim(), house: result.house.trim() },
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
              top_notes: enriched?.top_notes ?? [],
              middle_notes: enriched?.middle_notes ?? [],
              base_notes: enriched?.base_notes ?? [],
              similar_perfumes: enriched?.similar_perfumes ?? [],
              official_sources: enriched?.official_sources ?? [],
              community_summary: enriched?.community_summary ?? null,
              community_accords: enriched?.community_accords ?? [],
              community_descriptors: enriched?.community_descriptors ?? [],
              olfactory_family: Array.isArray(enriched?.olfactory_family)
                ? enriched.olfactory_family.slice(0, 2)
                : enriched?.olfactory_family
                  ? [enriched.olfactory_family]
                  : [],
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
      toast({
        title: "couldn't save",
        description: e?.message ?? "try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function editDetails() {
    if (!result) return;
    const params = new URLSearchParams({
      name: result.name,
      house: result.house,
      status,
    });
    navigate(`/add?${params.toString()}`);
  }

  return (
    <AppShell hideNav>
      <header className="px-5 pt-8 pb-6">
        <Link
          to="/"
          className="text-[12px] inline-flex items-center gap-1.5 text-ink-soft hover:text-ink lowercase"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> back
        </Link>
        <div className="mt-5 flex items-baseline justify-between">
          <h1 className="font-display font-light text-[36px] text-ink lowercase tracking-[-0.02em]">
            scan a bottle
          </h1>
          <Link to="/add" className="text-[11px] lowercase text-ink-soft hover:text-ink underline-offset-4 hover:underline">
            type instead
          </Link>
        </div>
        <p className="text-[12px] text-ink-soft lowercase mt-2">
          point your camera at the front label.
        </p>
      </header>

      <div className="px-5 space-y-5 pb-12">
        {/* hidden inputs — one for camera capture, one for picking from library */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleFile(f);
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleFile(f);
          }}
        />

        {!previewUrl && !identifying && (
          <div className="space-y-3">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="w-full aspect-[4/5] rounded-2xl border-2 border-dashed border-rule/60 bg-card hover:bg-muted/40 transition-colors flex flex-col items-center justify-center gap-3 text-ink-soft"
            >
              <Camera className="w-10 h-10" strokeWidth={1.25} />
              <span className="text-[13px] lowercase">take a photo</span>
              <span className="text-[10px] text-ink-mute lowercase max-w-[18rem] text-center">
                fill the frame with the front label · steady hands · good light
              </span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 text-[12px] lowercase text-ink-soft hover:text-ink py-3"
            >
              <ImageIcon className="w-3.5 h-3.5" /> or pick from your library
            </button>
          </div>
        )}

        {previewUrl && (
          <div className="rounded-2xl overflow-hidden bg-card border border-rule/40">
            <img
              src={previewUrl}
              alt="captured bottle"
              className="w-full max-h-[60vh] object-contain bg-ink/5"
            />
          </div>
        )}

        {identifying && (
          <div className="text-center py-8 text-[12px] text-ink-mute lowercase">
            <Sparkles className="w-5 h-5 mx-auto mb-2 animate-pulse" />
            reading the label…
          </div>
        )}

        {result && !identifying && (
          <div className="bg-card border border-rule/40 rounded-2xl p-5 space-y-4">
            {result.identified ? (
              <>
                <div>
                  <div className="flex items-center gap-2 text-[10px] tracking-[0.22em] uppercase text-ink-soft mb-1">
                    <span>best guess</span>
                    <span className="text-ink-mute">·</span>
                    <span
                      className={
                        result.confidence === "high"
                          ? "text-ink"
                          : result.confidence === "medium"
                            ? "text-ink-soft"
                            : "text-ink-mute"
                      }
                    >
                      {result.confidence} confidence
                    </span>
                  </div>
                  <div className="font-display text-[28px] text-ink lowercase leading-tight">
                    {result.name.toLowerCase()}
                  </div>
                  <div className="text-[12px] text-ink-soft lowercase mt-0.5">
                    {result.house.toLowerCase()}
                  </div>
                  {result.reasoning && (
                    <p className="text-[12px] text-ink-soft italic font-display font-light mt-3">
                      “{result.reasoning}”
                    </p>
                  )}
                </div>

                {result.alternatives && result.alternatives.length > 0 && (
                  <div>
                    <div className="text-[10px] tracking-[0.22em] uppercase text-ink-soft mb-1.5">
                      or maybe
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.alternatives.map((a, i) => (
                        <button
                          key={i}
                          onClick={() => pickAlternative(a)}
                          className="text-[11px] lowercase text-ink-soft border border-rule/60 rounded-full px-2.5 py-1 hover:bg-muted/60 hover:text-ink"
                        >
                          {a.name.toLowerCase()} · {a.house.toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-[10px] tracking-[0.22em] uppercase text-ink-soft mb-1.5">
                    add as
                  </div>
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
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    onClick={confirmAndAdd}
                    disabled={saving}
                    className="w-full h-11 rounded-full text-[13px] lowercase"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    add to {status}
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={editDetails}
                      variant="outline"
                      className="h-10 rounded-full text-[12px] lowercase border-rule/60"
                    >
                      <Pencil className="w-3 h-3 mr-1.5" /> edit first
                    </Button>
                    <Button
                      onClick={reset}
                      variant="outline"
                      className="h-10 rounded-full text-[12px] lowercase border-rule/60"
                    >
                      <RotateCcw className="w-3 h-3 mr-1.5" /> rescan
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center space-y-3 py-2">
                <p className="font-display italic text-[18px] text-ink lowercase">
                  the label was hard to read.
                </p>
                <p className="text-[12px] text-ink-soft lowercase">
                  {result.reasoning}
                </p>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button
                    onClick={reset}
                    className="h-10 rounded-full text-[12px] lowercase"
                  >
                    <RotateCcw className="w-3 h-3 mr-1.5" /> try again
                  </Button>
                  <Button
                    onClick={editDetails}
                    variant="outline"
                    className="h-10 rounded-full text-[12px] lowercase border-rule/60"
                  >
                    <Pencil className="w-3 h-3 mr-1.5" /> add manually
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
