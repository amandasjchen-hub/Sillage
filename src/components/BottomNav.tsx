import { Link, useLocation } from "react-router-dom";
import { Library, Layers, Heart, BookOpen, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "ledger", icon: Library },
  { to: "/shelves", label: "shelves", icon: Layers },
  { to: "/discover", label: "discover", icon: Sparkles },
  { to: "/wishlist", label: "wishlist", icon: Heart },
  { to: "/diary", label: "diary", icon: BookOpen },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-paper/95 backdrop-blur border-t border-rule/50" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
      <div className="mx-auto max-w-md grid grid-cols-5">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || (to !== "/" && pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex flex-col items-center gap-1.5 py-4 transition-colors",
                active ? "text-ink" : "text-ink-mute hover:text-ink"
              )}
            >
              <Icon className="w-[22px] h-[22px]" strokeWidth={1.5} />
              <span className="text-[11px] lowercase tracking-wide">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
