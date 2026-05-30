import { ReactNode } from "react";
import BottomNav from "./BottomNav";

export default function AppShell({ children, hideNav }: { children: ReactNode; hideNav?: boolean }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-md pb-24">{children}</div>
      {!hideNav && <BottomNav />}
    </div>
  );
}
