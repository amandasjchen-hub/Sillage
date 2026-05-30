import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import heroImage from "@/assets/welcome-hero.jpg";
import flash1 from "@/assets/welcome-flash-1.png";
import flash2 from "@/assets/welcome-flash-2.png";
import flash3 from "@/assets/welcome-flash-3.png";
import flash4 from "@/assets/welcome-flash-4.png";
import flash5 from "@/assets/welcome-flash-5.png";

// Cycle through fonts then settle on mono.
const FONT_CYCLE = [
  "'Fraunces', serif",
  "'Archivo Black', sans-serif",
  "'Inter Tight', sans-serif",
  "'Manrope', sans-serif",
  "ui-serif, Georgia, serif",
  "'Inter Tight', sans-serif",
  "'JetBrains Mono', monospace", // final
];

// Flash through bottle images, land on heroImage.
const IMAGE_CYCLE = [flash1, flash2, flash3, flash4, flash5, heroImage];

const STEP_MS = 220;

export default function Welcome() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [step, setStep] = useState(0);

  const total = Math.max(FONT_CYCLE.length, IMAGE_CYCLE.length);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      if (i >= total - 1) {
        setStep(total - 1);
        clearInterval(interval);
      } else {
        setStep(i);
      }
    }, STEP_MS);
    return () => clearInterval(interval);
  }, [total]);

  const fontIndex = Math.min(step, FONT_CYCLE.length - 1);
  const imageIndex = Math.min(step, IMAGE_CYCLE.length - 1);

  const handleEnter = () => {
    sessionStorage.setItem("sillage_welcomed", "1");
    if (loading) return;
    navigate(user ? "/" : "/auth", { replace: true });
  };

  return (
    <div className="min-h-screen w-full bg-black text-white flex flex-col">
      {/* top bar */}
      <header className="flex items-center justify-between px-5 pt-5 text-[12px] tracking-[0.02em]">
        <div className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white" />
          <span className="lowercase">sillage</span>
        </div>
        <button
          onClick={handleEnter}
          className="lowercase hover:opacity-70 transition-opacity"
        >
          enter
        </button>
      </header>

      {/* hero */}
      <div className="relative flex-1 mx-5 mt-4 mb-6 overflow-hidden rounded-sm bg-neutral-900">
        {IMAGE_CYCLE.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: i === imageIndex ? 1 : 0 }}
          />
        ))}
        <div className="absolute inset-0 bg-black/20" />

        {/* center title */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <div className="text-[11px] tracking-[0.2em] uppercase text-white/80 mb-3 [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
            a perfume ledger
          </div>
          <h1
            className="text-white text-[44px] sm:text-[56px] leading-[0.95] tracking-[-0.02em] lowercase select-none [text-shadow:0_2px_16px_rgba(0,0,0,0.45)]"
            style={{ fontFamily: FONT_CYCLE[fontIndex] }}
          >
            sillage
          </h1>
        </div>

        {/* bottom caption */}
        <div className="absolute bottom-4 left-0 right-0 flex items-end justify-between px-5 text-[11px] text-white/80">
          <span className="lowercase">est. 2026</span>
          <button
            onClick={handleEnter}
            className="lowercase hover:text-white transition-colors"
          >
            tap to begin →
          </button>
        </div>
      </div>
    </div>
  );
}
