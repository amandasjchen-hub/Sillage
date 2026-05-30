import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Ctx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({ user: null, session: null, loading: true, signOut: async () => {} });

async function restoreOAuthSessionFromUrl() {
  const currentUrl = new URL(window.location.href);
  const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token") ?? currentUrl.searchParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token") ?? currentUrl.searchParams.get("refresh_token");

  if (!accessToken || !refreshToken) return false;

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;

  currentUrl.hash = "";
  currentUrl.searchParams.delete("access_token");
  currentUrl.searchParams.delete("refresh_token");
  currentUrl.searchParams.delete("expires_at");
  currentUrl.searchParams.delete("expires_in");
  currentUrl.searchParams.delete("provider_token");
  currentUrl.searchParams.delete("token_type");
  currentUrl.searchParams.delete("type");
  sessionStorage.setItem("sillage_welcomed", "1");
  window.history.replaceState({}, document.title, "/");
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });

    restoreOAuthSessionFromUrl()
      .catch(() => {})
      .then((restored) => {
        supabase.auth.getSession().then(({ data }) => {
          if (!active) return;
          setSession(data.session);
          setLoading(false);
          if (restored && data.session && window.location.pathname !== "/") {
            window.location.replace("/");
          }
        });
      });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthCtx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        signOut: async () => { await supabase.auth.signOut(); },
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
