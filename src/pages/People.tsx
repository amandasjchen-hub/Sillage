import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import FollowButton, { FollowStatus } from "@/components/FollowButton";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Person = {
  id: string;
  username: string | null;
  full_name: string | null;
  is_private_account?: boolean;
  follow_status?: FollowStatus;
  status?: FollowStatus;
};

type Tab = "find" | "following" | "followers" | "requests";
const TABS: Tab[] = ["find", "following", "followers", "requests"];

function PersonName({ p }: { p: Person }) {
  const inner = (
    <>
      <div className="font-display text-[18px] text-ink lowercase leading-tight truncate">
        {p.username ? `@${p.username}` : "someone"}
      </div>
      {p.full_name && (
        <div className="text-[12px] text-ink-soft lowercase truncate">{p.full_name.toLowerCase()}</div>
      )}
    </>
  );
  return p.username ? (
    <Link to={`/u/${p.username}`} className="min-w-0 flex-1">
      {inner}
    </Link>
  ) : (
    <div className="min-w-0 flex-1">{inner}</div>
  );
}

export default function People() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("find");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [list, setList] = useState<Person[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [requestCount, setRequestCount] = useState(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_profiles", { q: term });
      setResults((data as Person[]) ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const loadList = async (kind: Exclude<Tab, "find">) => {
    setLoadingList(true);
    const { data, error } = await supabase.rpc("get_follow_list", { kind });
    if (error) toast.error(error.message);
    setList((data as Person[]) ?? []);
    if (kind === "requests") setRequestCount(((data as Person[]) ?? []).length);
    setLoadingList(false);
  };

  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_follow_list", { kind: "requests" }).then(({ data }: any) => {
      setRequestCount((data ?? []).length);
    });
  }, [user]);

  useEffect(() => {
    if (tab !== "find") loadList(tab);
  }, [tab]);

  const approve = async (p: Person) => {
    if (!user) return;
    const { error } = await supabase
      .from("follows")
      .update({ status: "accepted" })
      .eq("follower_id", p.id)
      .eq("followee_id", user.id);
    if (error) return toast.error(error.message);
    loadList("requests");
  };

  const decline = async (p: Person) => {
    if (!user) return;
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", p.id)
      .eq("followee_id", user.id);
    if (error) return toast.error(error.message);
    loadList("requests");
  };

  return (
    <AppShell>
      <PageHeader eyebrow="the circle" title="people" />
      <div className="px-5 pb-10">
        <div className="flex gap-1.5 mb-5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-8 px-3.5 rounded-full text-[12px] lowercase whitespace-nowrap transition-colors ${
                tab === t ? "bg-ink text-paper" : "border border-rule/60 text-ink-soft hover:text-ink"
              }`}
            >
              {t}
              {t === "requests" && requestCount > 0 ? ` · ${requestCount}` : ""}
            </button>
          ))}
        </div>

        {tab === "find" && (
          <>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search by username"
              maxLength={24}
              className="bg-card border-rule/60 rounded-xl h-12 mb-4 lowercase"
            />
            {searching ? (
              <div className="flex items-center gap-2 text-[12px] text-ink-mute lowercase py-4">
                <Loader2 className="w-3 h-3 animate-spin" /> searching…
              </div>
            ) : q.trim().length < 2 ? (
              <p className="text-[12px] text-ink-soft lowercase py-4">type at least two letters of a username.</p>
            ) : results.length === 0 ? (
              <p className="text-[12px] text-ink-soft lowercase py-4">no one found.</p>
            ) : (
              <ul className="space-y-2.5">
                {results.map((p) => (
                  <li
                    key={p.id}
                    className="bg-card border border-rule/40 rounded-2xl p-4 flex items-center gap-3"
                  >
                    <PersonName p={p} />
                    <FollowButton
                      targetId={p.id}
                      status={p.follow_status ?? null}
                      isPrivate={p.is_private_account}
                      onChange={(next) =>
                        setResults((rs) => rs.map((r) => (r.id === p.id ? { ...r, follow_status: next } : r)))
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab !== "find" &&
          (loadingList ? (
            <div className="text-[11px] text-ink-soft lowercase py-12 text-center">loading…</div>
          ) : list.length === 0 ? (
            <p className="text-[12px] text-ink-soft lowercase py-8 text-center">
              {tab === "following" && "you're not following anyone yet."}
              {tab === "followers" && "no followers yet."}
              {tab === "requests" && "no pending requests."}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {list.map((p) => (
                <li
                  key={p.id}
                  className="bg-card border border-rule/40 rounded-2xl p-4 flex items-center gap-3"
                >
                  <PersonName p={p} />
                  {tab === "following" && (
                    <FollowButton
                      targetId={p.id}
                      status={p.status ?? "accepted"}
                      onChange={(next) => {
                        if (next === null) setList((ls) => ls.filter((l) => l.id !== p.id));
                      }}
                    />
                  )}
                  {tab === "requests" && (
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => approve(p)}
                        className="h-9 px-4 rounded-full bg-ink text-paper text-[12px] lowercase hover:opacity-85"
                      >
                        approve
                      </button>
                      <button
                        onClick={() => decline(p)}
                        className="h-9 px-4 rounded-full border border-rule/60 text-ink-soft hover:text-ink text-[12px] lowercase"
                      >
                        decline
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </div>
    </AppShell>
  );
}
