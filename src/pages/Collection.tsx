import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, ArrowUpDown, X, LayoutGrid, Rows3, Grid3x3 } from "lucide-react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import PerfumeTile from "@/components/PerfumeTile";
import { supabase, Perfume, Shelf } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SortKey =
  | "newest"
  | "oldest"
  | "brand"
  | "family"
  | "price_high"
  | "price_low"
  | "rating";

const SORT_LABELS: Record<SortKey, string> = {
  newest: "newest first",
  oldest: "oldest first",
  brand: "by brand",
  family: "by olfactory family",
  price_high: "most expensive",
  price_low: "least expensive",
  rating: "highest rated",
};

const FAMILIES = ["floral", "woody", "aquatic", "oriental", "fresh", "musk"] as const;
type Family = (typeof FAMILIES)[number];

export default function Collection({ status = "owned" as "owned" | "wishlist" }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Perfume[]>([]);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [shelfMembership, setShelfMembership] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>("newest");
  const [familyFilter, setFamilyFilter] = useState<Family | null>(null);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "compact" | "list">(
    () =>
      (typeof window !== "undefined" &&
        (localStorage.getItem("collection_view") as "grid" | "compact" | "list")) ||
      "grid",
  );
  const [groupBy, setGroupBy] = useState<"none" | "brand" | "family">(
    () => (typeof window !== "undefined" && (localStorage.getItem("collection_group") as "none" | "brand" | "family")) || "none",
  );

  useEffect(() => {
    localStorage.setItem("collection_view", view);
  }, [view]);
  useEffect(() => {
    localStorage.setItem("collection_group", groupBy);
  }, [groupBy]);

  const shelfId = params.get("shelf");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      supabase.from("perfumes").select("*").eq("status", status),
      supabase.from("shelves").select("*").order("name"),
      supabase.from("perfume_shelves").select("perfume_id, shelf_id"),
    ]).then(([p, sh, ps]) => {
      setItems((p.data as Perfume[]) ?? []);
      setShelves((sh.data as Shelf[]) ?? []);
      const map: Record<string, string[]> = {};
      ((ps.data as { perfume_id: string; shelf_id: string }[]) ?? []).forEach((row) => {
        (map[row.perfume_id] ??= []).push(row.shelf_id);
      });
      setShelfMembership(map);
      setLoading(false);
    });
  }, [user, status]);

  const activeShelf = useMemo(
    () => shelves.find((s) => s.id === shelfId) ?? null,
    [shelves, shelfId],
  );

  const familyCounts = useMemo(() => {
    const counts: Record<Family, number> = {
      floral: 0, woody: 0, aquatic: 0, oriental: 0, fresh: 0, musk: 0,
    };
    for (const p of items) {
      for (const f of p.olfactory_family ?? []) {
        if ((FAMILIES as readonly string[]).includes(f)) counts[f as Family]++;
      }
    }
    return counts;
  }, [items]);

  const brands = useMemo(
    () =>
      Array.from(new Set(items.map((p) => p.house).filter(Boolean) as string[])).sort(),
    [items],
  );

  const visible = useMemo(() => {
    let arr = items;
    if (shelfId) arr = arr.filter((p) => shelfMembership[p.id]?.includes(shelfId));
    if (familyFilter)
      arr = arr.filter((p) => (p.olfactory_family ?? []).includes(familyFilter));
    if (brandFilter) arr = arr.filter((p) => p.house === brandFilter);
    const sorted = [...arr];
    sorted.sort((a, b) => {
      switch (sort) {
        case "newest":
          return +new Date(b.created_at) - +new Date(a.created_at);
        case "oldest":
          return +new Date(a.created_at) - +new Date(b.created_at);
        case "brand":
          return (a.house ?? "~").localeCompare(b.house ?? "~");
        case "family":
          return ((a.olfactory_family?.[0]) ?? "~").localeCompare(
            (b.olfactory_family?.[0]) ?? "~",
          );
        case "price_high":
          return (b.price_usd ?? -1) - (a.price_usd ?? -1);
        case "price_low":
          return (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity);
        case "rating":
          return (b.rating ?? -1) - (a.rating ?? -1);
      }
    });
    return sorted;
  }, [items, shelfId, shelfMembership, familyFilter, brandFilter, sort]);

  const eyebrow = status === "owned" ? (activeShelf ? "shelf" : "my perfumes") : "longing for";
  const title = activeShelf
    ? activeShelf.name.toLowerCase()
    : status === "owned"
      ? "my perfumes"
      : "wishlist";

  const clearShelf = () => {
    const next = new URLSearchParams(params);
    next.delete("shelf");
    setParams(next);
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        meta={`${visible.length} ${visible.length === 1 ? "bottle" : "bottles"}`}
        right={
          <Link
            to={`/add?status=${status}`}
            className="w-10 h-10 rounded-full bg-ink text-paper flex items-center justify-center hover:opacity-80 transition-opacity"
            aria-label="Add perfume"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
          </Link>
        }
      />

      <div className="px-5">
        {/* family chips — always show all six */}
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-none">
          {FAMILIES.map((f) => {
            const active = familyFilter === f;
            const count = familyCounts[f];
            const dim = count === 0 && !active;
            return (
              <button
                key={f}
                onClick={() => setFamilyFilter(active ? null : f)}
                className={`shrink-0 text-[11px] lowercase px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 transition-colors ${
                  active
                    ? "bg-ink text-paper border-ink"
                    : dim
                      ? "bg-transparent border-rule/30 text-ink-mute"
                      : "bg-card border-rule/50 text-ink-soft hover:text-ink"
                }`}
              >
                {f}
                <span className={`tabular-nums text-[10px] ${active ? "text-paper/70" : "text-ink-mute"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* active filter chips */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {activeShelf && (
            <button
              onClick={clearShelf}
              className="text-[11px] lowercase px-2.5 py-1 rounded-full bg-ink text-paper inline-flex items-center gap-1.5"
            >
              shelf: {activeShelf.name.toLowerCase()} <X className="w-3 h-3" />
            </button>
          )}
          {brandFilter && (
            <button
              onClick={() => setBrandFilter(null)}
              className="text-[11px] lowercase px-2.5 py-1 rounded-full bg-card border border-rule/50 text-ink inline-flex items-center gap-1.5"
            >
              {brandFilter.toLowerCase()} <X className="w-3 h-3" />
            </button>
          )}

          <div className="ml-auto flex gap-2">
            {/* brand picker */}
            {brands.length > 0 && !brandFilter && (
              <DropdownMenu>
                <DropdownMenuTrigger className="text-[11px] text-ink-soft hover:text-ink lowercase px-2.5 py-1 rounded-full border border-rule/40 bg-card">
                  brand
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-paper border-rule/40 max-h-72 overflow-auto">
                  {brands.map((b) => (
                    <DropdownMenuItem
                      key={b}
                      onClick={() => setBrandFilter(b)}
                      className="text-[12px] lowercase"
                    >
                      {b.toLowerCase()}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* sort */}
            <DropdownMenu>
              <DropdownMenuTrigger className="text-[11px] text-ink-soft hover:text-ink lowercase px-2.5 py-1 rounded-full border border-rule/40 bg-card inline-flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" /> {SORT_LABELS[sort].split(" ")[0]}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-paper border-rule/40">
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <DropdownMenuItem
                    key={k}
                    onClick={() => setSort(k)}
                    className="text-[12px] lowercase"
                  >
                    {SORT_LABELS[k]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* group (list view) */}
            {view === "list" && (
              <DropdownMenu>
                <DropdownMenuTrigger className="text-[11px] text-ink-soft hover:text-ink lowercase px-2.5 py-1 rounded-full border border-rule/40 bg-card">
                  group: {groupBy}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-paper border-rule/40">
                  {(["none", "brand", "family"] as const).map((g) => (
                    <DropdownMenuItem key={g} onClick={() => setGroupBy(g)} className="text-[12px] lowercase">
                      {g}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* view toggle */}
            <div className="inline-flex items-center rounded-full border border-rule/40 bg-card overflow-hidden">
              <button
                onClick={() => setView("grid")}
                aria-label="Grid view"
                className={`px-2 py-1 ${view === "grid" ? "bg-ink text-paper" : "text-ink-soft"}`}
              >
                <LayoutGrid className="w-3 h-3" />
              </button>
              <button
                onClick={() => setView("compact")}
                aria-label="Compact grid view"
                className={`px-2 py-1 ${view === "compact" ? "bg-ink text-paper" : "text-ink-soft"}`}
              >
                <Grid3x3 className="w-3 h-3" />
              </button>
              <button
                onClick={() => setView("list")}
                aria-label="List view"
                className={`px-2 py-1 ${view === "list" ? "bg-ink text-paper" : "text-ink-soft"}`}
              >
                <Rows3 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-[11px] text-ink-soft lowercase py-12 text-center">loading…</div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <div className="font-display italic text-2xl text-ink mb-2 lowercase">
              a quiet shelf.
            </div>
            <p className="text-[13px] text-ink-soft mb-8 lowercase">
              {activeShelf
                ? "no bottles on this shelf yet."
                : status === "owned"
                  ? "begin with the first bottle you own."
                  : "note the perfumes you long to meet."}
            </p>
            <Link
              to={`/add?status=${status}`}
              className="inline-flex items-center gap-2 text-[12px] lowercase bg-ink text-paper px-5 py-2.5 rounded-full hover:opacity-80 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" /> add a perfume
            </Link>
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-3">
            {visible.map((p, i) => (
              <PerfumeTile key={p.id} perfume={p} index={i} />
            ))}
          </div>
        ) : view === "compact" ? (
          <div className="grid grid-cols-4 gap-2">
            {visible.map((p, i) => (
              <PerfumeTile key={p.id} perfume={p} index={i} compact />
            ))}
          </div>
        ) : (
          <ListView items={visible} groupBy={groupBy} />
        )}
      </div>
    </AppShell>
  );
}

function ListView({
  items,
  groupBy,
}: {
  items: Perfume[];
  groupBy: "none" | "brand" | "family";
}) {
  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "", items }];
    const map = new Map<string, Perfume[]>();
    for (const p of items) {
      const keys =
        groupBy === "brand"
          ? [p.house?.toLowerCase() || "—"]
          : (p.olfactory_family ?? []).length > 0
            ? p.olfactory_family.map((f) => f.toLowerCase())
            : ["—"];
      for (const key of keys) {
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(p);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, items]) => ({ key, items }));
  }, [items, groupBy]);

  return (
    <div className="border-t border-rule/40">
      {groups.map((g) => (
        <div key={g.key}>
          {g.key && (
            <div className="sticky top-0 z-10 bg-paper/95 backdrop-blur-sm px-1 py-2 flex items-baseline justify-between border-b border-rule/40">
              <div className="label-caps text-ink-soft">{g.key}</div>
              <div className="text-[10px] text-ink-soft tabular-nums">{g.items.length}</div>
            </div>
          )}
          {g.items.map((p) => (
            <Link
              key={p.id}
              to={`/perfume/${p.id}`}
              className="grid grid-cols-[1fr_auto] gap-3 items-baseline px-1 py-2.5 border-b border-rule/30 hover:bg-card/50 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-[13px] text-ink truncate lowercase">
                  {p.name.toLowerCase()}
                </div>
                <div className="text-[10.5px] text-ink-soft truncate lowercase mt-0.5">
                  {[
                    p.house?.toLowerCase(),
                    p.olfactory_family?.length
                      ? p.olfactory_family.map((f) => f.toLowerCase()).join(" / ")
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end">
                <div className="text-[12px] text-ink tabular-nums">
                  {p.rating != null ? p.rating.toFixed(1) : "—"}
                </div>
                {p.price_usd != null && (
                  <div className="text-[10px] text-ink-soft tabular-nums">
                    ${p.price_usd.toFixed(0)}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
