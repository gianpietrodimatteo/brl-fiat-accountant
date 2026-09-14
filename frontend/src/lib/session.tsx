"use client";

/**
 * The logged-in user, kept in `sessionStorage`: it survives a reload, ends when the tab closes and
 * isn't shared with other tabs. Storage is only read in the browser, through
 * `useSyncExternalStore`, so the server render and the first client render agree (`ready: false`)
 * and the stored session appears right after hydration.
 */

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { ApiResult } from "./api";

export const SESSION_STORAGE_KEY = "brl-fiat-accountant.session";

export interface Session {
  token: string;
  username: string;
}

export interface SessionContextValue {
  /** `false` until the browser's storage has been read: during server rendering and hydration. */
  ready: boolean;
  /** The current session, or `null` when logged out or not `ready` yet. */
  session: Session | null;
  signIn(token: string, username: string): void;
  clearSession(): void;
  /**
   * Runs an authenticated API call with the current token. A `401 unauthorized` answer clears the
   * session, which sends the user to `/login` from any authenticated screen.
   */
  authenticated<T>(call: (token: string) => Promise<ApiResult<T>>): Promise<ApiResult<T>>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const value = useMemo<SessionContextValue>(
    () => ({
      ready: snapshot !== undefined,
      session: snapshot ?? null,
      signIn,
      clearSession,
      authenticated,
    }),
    [snapshot],
  );
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error("useSession must be used inside a SessionProvider");
  }
  return value;
}

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedSession: Session | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-parses only when the stored string changes, so the snapshot stays referentially stable. */
function getSnapshot(): Session | null {
  const raw = readStorage();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSession = parseSession(raw);
  }
  return cachedSession;
}

/** Nothing is known about the session on the server. */
function getServerSnapshot(): undefined {
  return undefined;
}

function signIn(token: string, username: string): void {
  writeStorage(JSON.stringify({ token, username } satisfies Session));
}

function clearSession(): void {
  writeStorage(null);
}

async function authenticated<T>(
  call: (token: string) => Promise<ApiResult<T>>,
): Promise<ApiResult<T>> {
  const session = getSnapshot();
  if (session === null) {
    return {
      ok: false,
      error: {
        kind: "api_error",
        status: 401,
        code: "unauthorized",
        message: "Not logged in",
        details: {},
      },
    };
  }

  const result = await call(session.token);
  const unauthorized =
    !result.ok &&
    result.error.kind === "api_error" &&
    result.error.status === 401 &&
    result.error.code === "unauthorized";
  // A late 401 for a token that has since been replaced must not end the newer session.
  if (unauthorized && getSnapshot()?.token === session.token) {
    clearSession();
  }
  return result;
}

function readStorage(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (e.g. blocked by browser settings): treated as logged out.
    return null;
  }
}

function writeStorage(raw: string | null): void {
  try {
    if (raw === null) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, raw);
    }
  } catch {
    // Nothing to persist to; the snapshot below reads back whatever storage actually holds.
  }
  listeners.forEach((listener) => listener());
}

/** Anything but `{ token, username }` with two non-empty strings is no session. */
function parseSession(raw: string | null): Session | null {
  if (raw === null) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { token, username } = value as Record<string, unknown>;
  if (
    typeof token !== "string" ||
    token === "" ||
    typeof username !== "string" ||
    username === ""
  ) {
    return null;
  }
  return { token, username };
}
