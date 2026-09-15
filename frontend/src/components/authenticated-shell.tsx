"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "@/lib/session";

/**
 * Wraps the authenticated screens: sends a visitor without a session to `/login` (including after
 * a `401 unauthorized` cleared it) and shows the shared header otherwise.
 */
export function AuthenticatedShell({ children }: { children: ReactNode }) {
  const { ready, session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && session === null) {
      router.replace("/login");
    }
  }, [ready, session, router]);

  if (session === null) {
    return null;
  }

  return (
    <>
      <header className="border-b border-line bg-surface/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-8">
            <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <span aria-hidden className="size-2 rounded-full bg-accent" />
              BRL Fiat Accountant
            </span>
            <nav className="flex gap-1 text-sm">
              <NavLink href="/quotation" active={pathname === "/quotation"}>
                Quotation
              </NavLink>
              <NavLink href="/history" active={pathname === "/history"}>
                History
              </NavLink>
            </nav>
          </div>
          <p className="text-sm text-muted">
            Logged in as <strong className="font-medium text-foreground">{session.username}</strong>
          </p>
        </div>
      </header>
      <main className="flex flex-1 justify-center px-6 py-12">{children}</main>
    </>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 transition-colors ${
        active ? "bg-white/5 text-foreground" : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
