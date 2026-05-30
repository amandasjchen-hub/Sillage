import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type ThemeName = "maison" | "ledger" | "accord";

export const THEMES: { id: ThemeName; label: string; tagline: string }[] = [
  { id: "maison", label: "maison", tagline: "the original — moodboard editorial" },
  { id: "ledger", label: "ledger", tagline: "cool minimalism — mono, slate, hard edges" },
  { id: "accord", label: "accord", tagline: "black canvas, white ink — gallery after-hours" },
];

const LS_KEY = "sillage_theme";

type Ctx = {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
};

const ThemeCtx = createContext<Ctx>({ theme: "maison", setTheme: () => {} });

// Map legacy stored names → new names.
function normalize(t: string | null | undefined): ThemeName {
  if (t === "ledger") return "ledger";
  if (t === "maison") return "maison";
  // legacy: old "maison" was the chic one → now "ledger"
  if (t === "maison_legacy") return "ledger";
  // legacy: old "sillage" was the original → now "maison"
  if (t === "sillage") return "maison";
  return "maison";
}

function applyTheme(t: ThemeName) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", t);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeName>(() => {
    if (typeof window === "undefined") return "maison";
    return normalize(localStorage.getItem(LS_KEY));
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("theme")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const t = normalize((data as any)?.theme);
      setThemeState(t);
      localStorage.setItem(LS_KEY, t);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setTheme = (t: ThemeName) => {
    setThemeState(t);
    localStorage.setItem(LS_KEY, t);
    applyTheme(t);
    if (user) {
      supabase
        .from("profiles")
        .update({ theme: t })
        .eq("id", user.id)
        .then(({ error }) => {
          if (error) console.error("theme persist failed", error);
        });
    }
  };

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
