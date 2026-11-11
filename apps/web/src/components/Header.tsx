import Link from "next/link";
import { ConnectButton } from "./ConnectButton";
import { RoleNav } from "./RoleNav";
import { targetChain } from "@/lib/config";

export function Header() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Don<span className="text-brand">Chain</span>
          </Link>
          <nav aria-label="Navigation principale" className="flex gap-4 text-sm">
            <Link href="/" className="nav-link">
              Campagnes
            </Link>
            <Link href="/me" className="nav-link">
              Mes dons
            </Link>
            <RoleNav />
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted sm:inline">
            {targetChain.name}
          </span>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
