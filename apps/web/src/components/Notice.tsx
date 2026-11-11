import type { ReactNode } from "react";

export function Notice({ tone = "info", children }: { tone?: "info" | "danger" | "warning"; children: ReactNode }) {
  const styles = {
    info: "border-line bg-surface-muted text-ink",
    danger: "border-danger/40 bg-danger/10 text-danger",
    warning: "border-warning/40 bg-warning/10 text-ink",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}
