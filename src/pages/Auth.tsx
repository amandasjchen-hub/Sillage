import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Auth() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("welcome.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        sessionStorage.setItem("sillage_welcomed", "1");
        window.location.replace("/");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-theme="accord" className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="mx-auto w-full max-w-md flex-1 flex flex-col px-6 pt-20">
        <div className="text-[11px] text-ink-soft lowercase mb-3">your personal perfume ledger</div>
        <h1 className="font-display font-light text-[56px] leading-[0.95] text-ink lowercase tracking-[-0.03em]">
          sillage
        </h1>
        <p className="mt-5 text-[14px] text-ink-soft leading-relaxed max-w-xs lowercase">
          a perfume journal to hold your bottle collection and your scent memories
        </p>

        <form onSubmit={submit} className="mt-12 space-y-4">
          <div>
            <label className="text-[11px] text-ink-soft lowercase block mb-1.5">email</label>
            <Input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-card border-rule/60 rounded-xl h-12"
            />
          </div>
          <div>
            <label className="text-[11px] text-ink-soft lowercase block mb-1.5">password</label>
            <Input
              type="password" required minLength={6} value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-card border-rule/60 rounded-xl h-12"
            />
          </div>
          <Button
            type="submit" disabled={busy}
            className="w-full h-12 rounded-full bg-ink text-paper hover:opacity-90 lowercase text-[13px]"
          >
            {busy ? "..." : mode === "signin" ? "enter" : "begin"}
          </Button>
        </form>

        <div className="mt-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-rule/60" />
          <span className="text-[11px] text-ink-mute lowercase">or</span>
          <div className="flex-1 h-px bg-rule/60" />
        </div>

        <button
          type="button"
          onClick={async () => {
            const { error } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: window.location.origin },
            });
            if (error) toast.error(error.message || "Could not sign in with Google");
          }}
          className="mt-6 w-full h-12 bg-card border border-rule/60 text-ink hover:bg-muted/60 transition-colors rounded-full text-[13px] lowercase flex items-center justify-center gap-3"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          continue with google
        </button>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-8 text-[12px] text-ink-soft hover:text-ink self-start lowercase"
        >
          {mode === "signin" ? "no ledger yet? create one →" : "already have a ledger? sign in →"}
        </button>
      </div>
    </div>
  );
}
