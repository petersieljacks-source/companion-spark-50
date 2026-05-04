import { Link, useLocation } from "@tanstack/react-router";
import { Home, Activity, History, Settings as SettingsIcon } from "lucide-react";

const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/performance", label: "Progress", icon: Activity },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function TabBar() {
  const loc = useLocation();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-border bg-background"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map((t) => {
        const active =
          t.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(t.to);
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 py-2.5 pb-3 text-[11px] transition-colors ${
              active ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.8} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
