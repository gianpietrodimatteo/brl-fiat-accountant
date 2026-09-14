import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { login, type ApiResult, type LoginResponse } from "@/lib/api";
import { SESSION_STORAGE_KEY, SessionProvider } from "@/lib/session";
import LoginPage from "./page";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", () => ({ login: vi.fn() }));

const TOKEN = "0b8e6a52-3c1f-4f7e-9d2a-6f1b2c3d4e5f";
const networkError = { ok: false, error: { kind: "network_error" } } as const;

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});

function renderLogin() {
  const view = render(
    <SessionProvider>
      <LoginPage />
    </SessionProvider>,
  );
  return {
    ...view,
    input: () => screen.getByRole("textbox", { name: "Username" }),
    submit: () => screen.getByRole("button", { name: "Log in" }),
  };
}

describe("LoginPage", () => {
  it("renders one username field, one submit button and no password field", () => {
    const { container } = renderLogin();

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(container.querySelectorAll("input")).toHaveLength(1);
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it("logs alice in, stores the session and goes to /quotation", async () => {
    vi.mocked(login).mockResolvedValue({
      ok: true,
      data: { token: TOKEN, user: { username: "alice" } },
    });
    const { input, submit } = renderLogin();

    await userEvent.type(input(), "alice");
    await userEvent.click(submit());

    expect(login).toHaveBeenCalledWith("alice");
    expect(JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!)).toEqual({
      token: TOKEN,
      username: "alice",
    });
    expect(router.replace).toHaveBeenCalledWith("/quotation");
  });

  it("shows an unknown-username message for mallory and stays on /login", async () => {
    vi.mocked(login).mockResolvedValue({
      ok: false,
      error: {
        kind: "api_error",
        status: 401,
        code: "invalid_username",
        message: "Unknown username",
        details: {},
      },
    });
    const { input, submit } = renderLogin();

    await userEvent.type(input(), "mallory");
    await userEvent.click(submit());

    expect(screen.getByRole("alert")).toHaveTextContent(/unknown username/i);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
    expect(input()).toHaveValue("mallory");
  });

  it("shows a connection message on network_error and lets the form be submitted again", async () => {
    vi.mocked(login).mockResolvedValue(networkError);
    const { input, submit } = renderLogin();

    await userEvent.type(input(), "alice");
    await userEvent.click(submit());

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't reach the server/i);
    expect(submit()).toBeEnabled();

    await userEvent.click(submit());
    expect(login).toHaveBeenCalledTimes(2);
  });

  it("shows the connection message for any other failure", async () => {
    vi.mocked(login).mockResolvedValue({
      ok: false,
      error: {
        kind: "api_error",
        status: 500,
        code: "internal_error",
        message: "boom",
        details: {},
      },
    });
    const { input, submit } = renderLogin();

    await userEvent.type(input(), "alice");
    await userEvent.click(submit());

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't reach the server/i);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("sends the username without surrounding whitespace", async () => {
    vi.mocked(login).mockResolvedValue(networkError);
    const { input, submit } = renderLogin();

    await userEvent.type(input(), "  alice ");
    await userEvent.click(submit());

    expect(login).toHaveBeenCalledWith("alice");
  });

  it("disables submit for an empty or whitespace-only username", async () => {
    const { input, submit } = renderLogin();

    expect(submit()).toBeDisabled();
    await userEvent.type(input(), "   ");
    expect(submit()).toBeDisabled();
    await userEvent.type(input(), "a");
    expect(submit()).toBeEnabled();
  });

  it("disables submit while the request is pending, so a double click sends one request", async () => {
    let answer!: (value: ApiResult<LoginResponse>) => void;
    vi.mocked(login).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { input, submit } = renderLogin();

    await userEvent.type(input(), "alice");
    await userEvent.dblClick(submit());

    expect(login).toHaveBeenCalledOnce();
    expect(submit()).toBeDisabled();

    await act(async () => answer(networkError));
    expect(submit()).toBeEnabled();
  });

  it("sends a visitor who already has a session to /quotation", () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token: TOKEN, username: "bob" }));

    renderLogin();

    expect(router.replace).toHaveBeenCalledWith("/quotation");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
