import { Link } from "react-router-dom";
import { Perfume } from "@/lib/supabase";

// soft warm tile placeholders, cycled by index
const TILE_TINTS = [
  "linear-gradient(180deg, hsl(32 14% 88%) 0%, hsl(32 14% 82%) 100%)",
  "linear-gradient(180deg, hsl(28 12% 84%) 0%, hsl(28 12% 76%) 100%)",
  "linear-gradient(180deg, hsl(36 16% 90%) 0%, hsl(36 16% 84%) 100%)",
  "linear-gradient(180deg, hsl(22 14% 78%) 0%, hsl(22 14% 70%) 100%)",
  "linear-gradient(180deg, hsl(30 10% 86%) 0%, hsl(30 10% 78%) 100%)",
  "linear-gradient(180deg, hsl(20 12% 70%) 0%, hsl(20 12% 60%) 100%)",
];

export default function PerfumeTile({
  perfume,
  index = 0,
  compact = false,
}: {
  perfume: Perfume;
  index?: number;
  compact?: boolean;
}) {
  const tint = TILE_TINTS[index % TILE_TINTS.length];
  // alternate aspect to give the grid moodboard rhythm (only in default view)
  const tall = !compact && (index % 5 === 0 || index % 5 === 3);

  return (
    <Link to={`/perfume/${perfume.id}`} className="group block">
      <div
        className={`relative w-full overflow-hidden shadow-[var(--shadow-tile)] ${
          compact ? "rounded-[8px] aspect-square" : tall ? "rounded-[12px] aspect-[3/4]" : "rounded-[12px] aspect-square"
        }`}
        style={{ background: tint }}
      >
        {perfume.image_url ? (
          <img
            src={perfume.image_url}
            alt={perfume.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`font-display italic text-ink/30 leading-none select-none ${
                compact ? "text-2xl" : "text-5xl"
              }`}
            >
              {perfume.name.charAt(0).toLowerCase()}
            </div>
          </div>
        )}
        {perfume.rating != null && !compact && (
          <div className="absolute top-2 right-2 bg-paper/90 backdrop-blur-sm rounded-full px-2 py-0.5 text-[10px] tabular-nums text-ink">
            {perfume.rating.toFixed(1)}
          </div>
        )}
        {perfume.blind_buy && !compact && (
          <div
            className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[9px] lowercase tracking-wide text-paper"
            style={{
              background:
                perfume.blind_buy === "safe"
                  ? "hsl(140 30% 38%)"
                  : perfume.blind_buy === "risky"
                  ? "hsl(28 60% 45%)"
                  : "hsl(340 50% 45%)",
            }}
          >
            {perfume.blind_buy}
          </div>
        )}
      </div>
      <div className={compact ? "mt-1 px-0.5" : "mt-2 px-0.5"}>
        <div
          className={`text-ink leading-tight lowercase truncate ${
            compact ? "text-[10.5px]" : "text-[13px]"
          }`}
        >
          {perfume.name.toLowerCase()}
        </div>
        {perfume.house && !compact && (
          <div className="text-[11px] text-ink-soft mt-0.5 lowercase truncate">
            {perfume.house.toLowerCase()}
          </div>
        )}
      </div>
    </Link>
  );
}
