import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import FollowButton, { FollowStatus } from "@/components/FollowButton";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type PublicProfile = {
  id: string;
  username: string;
  full_name: string | null;
  is_private_account: boolean;
  follower_count: number;
  following_count: number;
  follow_status: FollowStatus;
  can_view: boolean;
  is_blocked: boolean;
};

type SharedShelf = { id: string; name: string; description: string | null; perfume_count: number };
type SharedPerfume = { id: string; name: string; house: string | null; image_url: string | null; status: string };
type Wearing = { perfume_id: string; name: string; house: string | null; image_url: string | null; worn_on: string };

function Bottle({ p }: { p: { name: string; house: string | null; image_url: string | null } }) {
  return (
    <div>
      <div className="aspect-square rounded-[10px] overflow-hidden bg-muted/60 flex items-center justify-center">
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="font-display italic text-4xl text-ink/30 select-none">
            {p.name.charAt(0).toLowerCase()}
          </span>
        )}
      </div>
      <div className="mt-1.5 text-[12px] text-ink lowercase leading-tight">{p.name.toLowerCase()}</div>
      {p.house && <div className="text-[10px] text-ink-mute lowercase">{p.house.toLowerCase()}</div>}
    </div>
  );
}

export default function Profile() {
  const { username } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [wearing, setWearing] = useState<Wearing | null>(null);
  const [shelves, setShelves] = useState<SharedShelf[]>([]);
  const [openShelf, setOpenShelf] = useState<string | null>(null);
  const [shelfPerfumes, setShelfPerfumes] = useState<Record<string, SharedPerfume[]>>({});
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!username) return;
    const { data } = await supabase.rpc("get_public_profile", { p_username: username });
    const p = ((data as PublicProfile[]) ?? [])[0] ?? null;
    setProfile(p);
    if (p?.can_view) {
      const [{ data: w }, { data: s }] = await Promise.all([
        supabase.rpc("get_wearing_today", { p_user: p.id }),
        supabase.rpc("get_profile_shelves", { p_user: p.id }),
      ]);
      setWearing(((w as Wearing[]) ?? [])[0] ?? null);
      setShelves((s as SharedShelf[]) ?? []);
    } else {
      setWearing(null);
      setShelves([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [username]);

  const blockUser = async () => {
    if (!user || !profile) return;
    if (!confirm(`block @${profile.username}? they won't be able to find you or see your shelves.`)) return;
    const { error } = await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: profile.id });
    if (error) return toast.error(error.message);
    toast.success("blocked.");
    setReporting(false);
    load();
  };

  const unblockUser = async () => {
    if (!user || !profile) return;
    const { error } = await supabase
      .from("blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", profile.id);
    if (error) return toast.error(error.message);
    toast.success("unblocked.");
    load();
  };

  const sendReport = async () => {
    if (!user || !profile || !reason) return;
    setSending(true);
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      reported_id: profile.id,
      reason,
      details: details.trim() || null,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success("thanks — we'll take a look.");
    setReporting(false);
    setReason("");
    setDetails("");
  };

  const toggleShelf = async (id: string) => {
    if (openShelf === id) return setOpenShelf(null);
    setOpenShelf(id);
    if (!shelfPerfumes[id]) {
      const { data } = await supabase.rpc("get_shelf_perfumes", { p_shelf: id });
      setShelfPerfumes((m) => ({ ...m, [id]: (data as SharedPerfume[]) ?? [] }));
    }
  };

  const onFollowChange = async (next: FollowStatus) => {
    if (!profile) return;
    const wasAccepted = profile.follow_status === "accepted";
    const nowAccepted = next === "accepted";
    setProfile({
      ...profile,
      follow_status: next,
      can_view: nowAccepted,
      follower_count: profile.follower_count + (nowAccepted ? 1 : 0) - (wasAccepted ? 1 : 0),
    });
    if (nowAccepted) {
      const [{ data: w }, { data: s }] = await Promise.all([
        supabase.rpc("get_wearing_today", { p_user: profile.id }),
        supabase.rpc("get_profile_shelves", { p_user: profile.id }),
      ]);
      setWearing(((w as Wearing[]) ?? [])[0] ?? null);
      setShelves((s as SharedShelf[]) ?? []);
    } else {
      setWearing(null);
      setShelves([]);
      setOpenShelf(null);
    }
  };

  const isMe = !!profile && profile.id === user?.id;

  return (
    <AppShell>
      <div className="px-5 pt-10 pb-10">
        <Link
          to="/people"
          className="text-[12px] inline-flex items-center gap-1.5 text-ink-soft hover:text-ink lowercase"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> people
        </Link>

        {loading ? (
          <div className="text-[11px] text-ink-soft lowercase py-16 text-center">loading…</div>
        ) : !profile ? (
          <div className="py-16 text-center">
            <div className="font-display italic text-2xl text-ink lowercase mb-2">no one by that name.</div>
          </div>
        ) : (
          <>
            <div className="mt-6 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display font-light text-[34px] text-ink lowercase tracking-[-0.02em] leading-none truncate">
                  @{profile.username}
                </h1>
                {profile.full_name && (
                  <div className="text-[13px] text-ink-soft lowercase mt-1.5">{profile.full_name.toLowerCase()}</div>
                )}
                <div className="text-[11px] text-ink-mute lowercase mt-2 tracking-wide">
                  {profile.follower_count} followers · {profile.following_count} following
                </div>
              </div>
              {!profile.is_blocked && (
                <FollowButton
                  targetId={profile.id}
                  status={profile.follow_status}
                  isPrivate={profile.is_private_account}
                  onChange={onFollowChange}
                />
              )}
            </div>

            {isMe && (
              <p className="text-[11px] text-ink-soft lowercase italic mt-4">
                this is how you look to your followers. only shelves you've shared show up.{" "}
                <Link to="/account" className="underline">
                  sharing settings
                </Link>
              </p>
            )}

            {profile.is_blocked ? (
              <div className="mt-10 bg-card border border-rule/40 rounded-2xl p-6 text-center space-y-3">
                <p className="text-[13px] text-ink-soft lowercase">you've blocked @{profile.username}.</p>
                <button
                  onClick={unblockUser}
                  className="h-9 px-4 rounded-full border border-rule/60 text-ink text-[12px] lowercase hover:bg-muted/60"
                >
                  unblock
                </button>
              </div>
            ) : !profile.can_view ? (
              <div className="mt-10 bg-card border border-rule/40 rounded-2xl p-6 text-center">
                <Lock className="w-4 h-4 mx-auto text-ink-mute mb-2" strokeWidth={1.5} />
                <p className="text-[13px] text-ink-soft lowercase">
                  {profile.follow_status === "pending"
                    ? "request sent. you'll see their shelves once they approve."
                    : profile.is_private_account
                      ? "this account is private. request to follow to see their shelves."
                      : "follow to see their shelves and what they're wearing."}
                </p>
              </div>
            ) : (
              <>
                {wearing && (
                  <section className="mt-8 bg-card border border-rule/40 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-16 h-16 shrink-0 rounded-[10px] overflow-hidden bg-muted/60 flex items-center justify-center">
                      {wearing.image_url ? (
                        <img src={wearing.image_url} alt={wearing.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-display italic text-2xl text-ink/30">
                          {wearing.name.charAt(0).toLowerCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[10px] tracking-[0.22em] uppercase text-ink-soft">
                        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(140,40%,42%)]" />
                        wearing today
                      </div>
                      <div className="font-display text-[20px] text-ink lowercase leading-tight mt-1 truncate">
                        {wearing.name.toLowerCase()}
                      </div>
                      {wearing.house && (
                        <div className="text-[12px] text-ink-soft lowercase truncate">{wearing.house.toLowerCase()}</div>
                      )}
                    </div>
                  </section>
                )}

                <section className="mt-8">
                  <div className="text-[10px] tracking-[0.22em] uppercase text-ink-soft mb-3">shelves</div>
                  {shelves.length === 0 ? (
                    <p className="text-[12px] text-ink-soft lowercase">nothing shared yet.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {shelves.map((s) => (
                        <li key={s.id} className="bg-card border border-rule/40 rounded-2xl p-4">
                          <button onClick={() => toggleShelf(s.id)} className="w-full text-left">
                            <div className="font-display text-[20px] text-ink lowercase leading-tight">
                              {s.name.toLowerCase()}
                            </div>
                            {s.description && (
                              <div className="text-[12px] text-ink-soft italic lowercase mt-0.5">
                                {s.description.toLowerCase()}
                              </div>
                            )}
                            <div className="text-[10px] text-ink-mute lowercase tracking-[0.08em] mt-1">
                              {s.perfume_count} {s.perfume_count === 1 ? "bottle" : "bottles"}
                            </div>
                          </button>
                          {openShelf === s.id && (
                            <div className="grid grid-cols-3 gap-3 mt-4">
                              {(shelfPerfumes[s.id] ?? []).map((p) => (
                                <Bottle key={p.id} p={p} />
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}

            {!isMe && !profile.is_blocked && (
              <section className="mt-10 pt-6 border-t border-rule/40">
                {!reporting ? (
                  <div className="flex gap-4 text-[12px] lowercase text-ink-mute">
                    <button onClick={() => setReporting(true)} className="hover:text-ink">
                      report
                    </button>
                    <button onClick={blockUser} className="hover:text-destructive">
                      block
                    </button>
                  </div>
                ) : (
                  <div className="bg-card border border-rule/40 rounded-2xl p-4 space-y-3">
                    <div className="text-[13px] text-ink lowercase">what's wrong with @{profile.username}?</div>
                    <div className="flex flex-wrap gap-1.5">
                      {["spam", "harassment", "inappropriate", "impersonation", "other"].map((r) => (
                        <button
                          key={r}
                          onClick={() => setReason(r)}
                          className={`h-8 px-3.5 rounded-full text-[12px] lowercase transition-colors ${
                            reason === r ? "bg-ink text-paper" : "border border-rule/60 text-ink-soft hover:text-ink"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      maxLength={1000}
                      placeholder="anything else we should know (optional)"
                      className="w-full bg-paper border border-rule/40 rounded-xl p-3 text-[13px] min-h-[80px]"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={sendReport}
                        disabled={!reason || sending}
                        className="h-9 px-4 rounded-full bg-ink text-paper text-[12px] lowercase disabled:opacity-40"
                      >
                        {sending ? "sending…" : "send report"}
                      </button>
                      <button
                        onClick={() => setReporting(false)}
                        className="h-9 px-4 rounded-full border border-rule/60 text-ink-soft text-[12px] lowercase"
                      >
                        cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
