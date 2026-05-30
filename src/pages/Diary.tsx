import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { supabase, DiaryEntry, Perfume } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type Row = DiaryEntry & { perfume: Pick<Perfume, "id" | "name" | "house"> | null };

export default function Diary() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("diary_entries")
      .select("*, perfume:perfumes(id,name,house)")
      .order("worn_on", { ascending: false })
      .then(({ data }) => {
        setRows((data as any) ?? []);
        setLoading(false);
      });
  }, [user]);

  return (
    <AppShell>
      <PageHeader eyebrow="scent memories" title="diary" meta={`${rows.length} entries`} />
      <div className="px-5">
        {loading ? (
          <div className="text-[11px] text-ink-soft lowercase py-12 text-center">loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <div className="font-display italic text-2xl text-ink mb-2 lowercase">no memories pressed.</div>
            <p className="text-[13px] text-ink-soft lowercase">open a perfume to begin its diary.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="bg-card border border-rule/40 rounded-2xl p-4">
                <div className="text-[11px] text-ink-soft lowercase mb-1">
                  {new Date(r.worn_on).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }).toLowerCase()}
                  {r.occasion && <> · {r.occasion.toLowerCase()}</>}
                </div>
                {r.perfume && (
                  <Link to={`/perfume/${r.perfume.id}`} className="font-display text-[18px] text-ink lowercase hover:text-espresso">
                    {r.perfume.name.toLowerCase()}
                    {r.perfume.house && <span className="text-ink-mute text-[13px] font-body italic ml-2">— {r.perfume.house.toLowerCase()}</span>}
                  </Link>
                )}
                {r.memory && <p className="font-display italic text-[15px] text-ink mt-2 leading-snug lowercase">{r.memory.toLowerCase()}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
