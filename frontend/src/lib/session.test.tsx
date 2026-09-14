import { act, renderHook } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "./api";
import { SESSION_STORAGE_KEY, SessionProvider, useSession } from "./session";

const TOKEN = "0b8e6a52-3c1f-4f7e-9d2a-6f1b2c3d4e5f";

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderSession() {
  return renderHook(() => useSession(), { wrapper: SessionProvider });
}

function stored(): unknown {
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

function apiError(status: number, code: string): ApiResult<never> {
  return { ok: false, error: { kind: "api_error", status, code, message: code, details: {} } };
}

describe("stored session", () => {
  it("is none when nothing is stored", () => {
    const { result } = renderSession();

    expect(result.current.ready).toBe(true);
    expect(result.current.session).toBeNull();
  });

  it("signIn stores the token and username and exposes them", () => {
    const { result } = renderSession();

    act(() => result.current.signIn(TOKEN, "alice"));

    expect(stored()).toEqual({ token: TOKEN, username: "alice" });
    expect(result.current.session).toEqual({ token: TOKEN, username: "alice" });
  });

  it("is restored from sessionStorage on mount, as after a reload", () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token: TOKEN, username: "bob" }));

    const { result } = renderSession();

    expect(result.current.session).toEqual({ token: TOKEN, username: "bob" });
  });

  it("clearSession removes it from sessionStorage", () => {
    const { result } = renderSession();
    act(() => result.current.signIn(TOKEN, "alice"));

    act(() => result.current.clearSession());

    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it.each([
    ["not JSON", "{not json"],
    ["JSON null", "null"],
    ["an array", "[]"],
    ["a missing username", JSON.stringify({ token: TOKEN })],
    ["a non-string token", JSON.stringify({ token: 42, username: "alice" })],
    ["an empty token", JSON.stringify({ token: "", username: "alice" })],
  ])("treats %s as logged out", (_, raw) => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, raw);

    const { result } = renderSession();

    expect(result.current.ready).toBe(true);
    expect(result.current.session).toBeNull();
  });

  it("treats unavailable storage as logged out", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    const { result } = renderSession();

    expect(result.current.session).toBeNull();
  });
});

describe("server rendering and hydration", () => {
  it("renders without reading storage on the server and hydrates without a mismatch", async () => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ token: TOKEN, username: "alice" }),
    );
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const consoleError = vi.spyOn(console, "error");

    function Probe() {
      const { ready, session } = useSession();
      return <p>{ready ? (session?.username ?? "logged out") : "loading"}</p>;
    }
    const app = (
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    const html = renderToString(app);
    expect(html).toContain("loading");
    expect(getItem).not.toHaveBeenCalled();

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    await act(async () => {
      hydrateRoot(container, app, { onRecoverableError: (error) => console.error(error) });
    });

    expect(container.textContent).toBe("alice");
    expect(consoleError).not.toHaveBeenCalled();
    container.remove();
  });
});

describe("authenticated", () => {
  it("passes the current token and returns the call's result", async () => {
    const { result } = renderSession();
    act(() => result.current.signIn(TOKEN, "alice"));
    const call = vi.fn(async () => ({ ok: true, data: "history" }) as const);

    const answer = await result.current.authenticated(call);

    expect(call).toHaveBeenCalledWith(TOKEN);
    expect(answer).toEqual({ ok: true, data: "history" });
  });

  it("clears the session on 401 unauthorized", async () => {
    const { result } = renderSession();
    act(() => result.current.signIn(TOKEN, "alice"));

    await act(() => result.current.authenticated(async () => apiError(401, "unauthorized")));

    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it.each([
    ["410 quote_expired", apiError(410, "quote_expired")],
    ["503 no_quote_capability", apiError(503, "no_quote_capability")],
    ["network_error", { ok: false, error: { kind: "network_error" } } as const],
  ])("keeps the session on %s", async (_, failure) => {
    const { result } = renderSession();
    act(() => result.current.signIn(TOKEN, "alice"));

    await act(() => result.current.authenticated(async () => failure));

    expect(result.current.session).toEqual({ token: TOKEN, username: "alice" });
  });

  it("keeps a newer session when a 401 for the replaced token arrives late", async () => {
    const { result } = renderSession();
    act(() => result.current.signIn(TOKEN, "alice"));
    let answer!: (value: ApiResult<never>) => void;
    const pending = result.current.authenticated(
      () => new Promise((resolve) => (answer = resolve)),
    );

    act(() => result.current.signIn("new-token", "alice"));
    await act(async () => {
      answer(apiError(401, "unauthorized"));
      await pending;
    });

    expect(result.current.session).toEqual({ token: "new-token", username: "alice" });
  });

  it("answers 401 unauthorized without calling when there is no session", async () => {
    const { result } = renderSession();
    const call = vi.fn();

    const answer = await result.current.authenticated(call);

    expect(call).not.toHaveBeenCalled();
    expect(answer).toMatchObject({ ok: false, error: { status: 401, code: "unauthorized" } });
  });
});
