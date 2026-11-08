import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export type FollowStatus = "pending" | "accepted" | null;

export default function FollowButton({
  targetId,
  status,
  isPrivate,
  onChange,
}: {
  targetId: string;
  status: FollowStatus;
  isPrivate?: boolean;
  onChange: (next: FollowStatus) => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user || user.id === targetId) return null;

  const follow = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from("follows")
      .insert({ follower_id: user.id, followee_id: targetId })
      .select("status")
      .single();
    setBusy(false);
    if (error) return toast.error(error.message);
    onChange(data.status as FollowStatus);
  };

  const unfollow = async () => {
    if (status === "accepted" && !confirm("unfollow?")) return;
    setBusy(true);
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("followee_id", targetId);
    setBusy(false);
    if (error) return toast.error(error.message);
    onChange(null);
  };

  const label =
    status === "accepted" ? "following" : status === "pending" ? "requested" : isPrivate ? "request" : "follow";

  return (
    <button
      onClick={status ? unfollow : follow}
      disabled={busy}
      className={`shrink-0 h-9 px-4 rounded-full text-[12px] lowercase transition-colors inline-flex items-center gap-1.5 ${
        status
          ? "border border-rule/60 text-ink-soft hover:text-ink"
          : "bg-ink text-paper hover:opacity-85"
      }`}
    >
      {busy && <Loader2 className="w-3 h-3 animate-spin" />}
      {label}
    </button>
  );
}
