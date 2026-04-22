import type { ReactNode } from "react";

export function Card({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`mx-4 my-3 rounded-xl border border-border bg-card px-5 py-4 ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
      {children}
    </div>
  );
}

export function LiftBadge({ kind }: { kind: "main" | "supp" | "bw" | "test" }) {
  const cls =
    kind === "main"
      ? "bg-info-bg text-info"
      : kind === "supp"
      ? "bg-supp-bg text-supp"
      : kind === "test"
      ? "bg-warning-bg text-warning"
      : "bg-bw-bg text-bw";
  const label = kind === "main" ? "5/3/1" : kind === "supp" ? "8–10" : kind === "test" ? "1RM" : "BW";
  return (
    <span className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-5 py-10 text-center text-sm text-muted-foreground">{children}</div>;
}
