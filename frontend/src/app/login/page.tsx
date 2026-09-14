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
    <main className="flex flex-1 items-center justify-center px-6 py-8">
      <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-3">
        <h1 className="text-2xl font-semibold">Log in</h1>
        <label htmlFor="username" className="text-sm">
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
          className="rounded border border-foreground/20 bg-transparent px-3 py-2"
        />
        <button
          type="submit"
          disabled={trimmed === "" || pending}
          className="rounded bg-foreground px-3 py-2 text-background disabled:opacity-50"
        >
          Log in
        </button>
        {failure !== null && (
          <p role="alert" className="text-sm text-red-600">
            {FAILURE_MESSAGES[failure]}
          </p>
        )}
      </form>
    </main>
  );
}
