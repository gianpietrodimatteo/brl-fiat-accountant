"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { login } from "@/lib/api";
import { useSession } from "@/lib/session";

type LoginFailure = "unknown_username" | "unreachable";

const FAILURE_MESSAGES: Record<LoginFailure, string> = {
  unknown_username: "Unknown username.",
  unreachable: "Couldn't reach the server. Please try again.",
};

export default function LoginPage() {
  const { ready, session, signIn } = useSession();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<LoginFailure | null>(null);

  // Covers both a visitor who arrives logged in and a successful submit below.
  useEffect(() => {
    if (session !== null) {
      router.replace("/quotation");
    }
  }, [session, router]);

  if (!ready || session !== null) {
    return null;
  }

  const trimmed = username.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed === "" || pending) {
      return;
    }
    setPending(true);
    setFailure(null);

    const result = await login(trimmed);
    if (result.ok) {
      signIn(result.data.token, result.data.user.username);
      return;
    }
    const unknown =
      result.error.kind === "api_error" &&
      result.error.status === 401 &&
      result.error.code === "invalid_username";
    setFailure(unknown ? "unknown_username" : "unreachable");
    setPending(false);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-8">
      <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <span aria-hidden className="size-2 rounded-full bg-accent" />
        BRL Fiat Accountant
      </p>
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-5 rounded-xl border border-line bg-surface p-8 shadow-2xl shadow-black/40"
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Log in</h1>
          <p className="mt-1 text-sm text-muted">Enter your username to continue.</p>
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor="username"
            className="text-xs font-medium uppercase tracking-wider text-muted"
          >
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="rounded-md border border-line bg-background px-3 py-2.5 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
        <button
          type="submit"
          disabled={trimmed === "" || pending}
          className="rounded-md bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Log in
        </button>
        {failure !== null && (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {FAILURE_MESSAGES[failure]}
          </p>
        )}
      </form>
    </main>
  );
}
