"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "@/lib/session";

/**
 * Wraps the authenticated screens: sends a visitor without a session to `/login` (including after
 * a `401 unauthorized` cleared it) and shows the shared header otherwise.
 */
export function AuthenticatedShell({ children }: { children: ReactNode }) {
  const { ready, session } = useSession();
  const router = useRouter();

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
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-foreground/10 px-6 py-4">
        <nav className="flex gap-4">
          <Link href="/quotation" className="hover:underline">
            Quotation
          </Link>
          <Link href="/history" className="hover:underline">
            History
          </Link>
        </nav>
        <p className="text-sm">
          Logged in as <strong>{session.username}</strong>
        </p>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </>
  );
}
