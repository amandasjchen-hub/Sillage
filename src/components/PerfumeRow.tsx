import { Link } from "react-router-dom";
import { Perfume } from "@/lib/supabase";

export default function PerfumeRow({ perfume }: { perfume: Perfume }) {
  const notes = [...(perfume.top_notes ?? []), ...(perfume.middle_notes ?? [])].slice(0, 3).join(" · ");
  return (
    <Link to={`/perfume/${perfume.id}`} className="block group">
      <div className="flex items-baseline justify-between gap-4 py-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <span className="label-caps text-ink-soft tabular-nums">
              {String((perfume as any)._n ?? "").padStart(2, "0")}
            </span>
            <h3 className="display text-2xl text-ink truncate group-hover:text-sienna transition-colors">
              {perfume.name}
            </h3>
          </div>
          {(perfume.house || notes) && (
            <div className="mt-1.5 pl-9 text-xs text-ink-soft tracking-wide">
              {perfume.house}
              {perfume.house && notes && <span className="mx-2">·</span>}
              <span className="italic">{notes}</span>
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          {perfume.rating != null ? (
            <div className="display text-xl text-ink tabular-nums">{perfume.rating.toFixed(1)}</div>
          ) : (
            <div className="label-caps text-ink-soft">—</div>
          )}
        </div>
      </div>
      <div className="rule" />
    </Link>
  );
}
