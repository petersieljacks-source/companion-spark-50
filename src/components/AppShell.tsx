import type { ReactNode } from "react";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { TabBar } from "./TabBar";

export function AppShell({ children, title, back, hideTabBar }: { children: ReactNode; title: string; back?: () => void; hideTabBar?: boolean }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className={hideTabBar ? "min-h-screen" : "min-h-screen pb-20"}>
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-4 py-2.5">
        {back && (
          <button onClick={back} className="text-[13px] text-info">
            ← Back
          </button>
        )}
        <h2 className="flex-1 text-base font-semibold tracking-tight">{title}</h2>
      </header>
      {children}
      {!hideTabBar && <TabBar />}
    </div>
  );
}
