import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listHistory } from "@/lib/api";
import { SESSION_STORAGE_KEY, SessionProvider, useSession } from "@/lib/session";
import { AuthenticatedShell } from "./authenticated-shell";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", () => ({ listHistory: vi.fn() }));

const TOKEN = "0b8e6a52-3c1f-4f7e-9d2a-6f1b2c3d4e5f";

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});

function logIn(username: string) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token: TOKEN, username }));
}

/** An authenticated screen that loads the history through the session's shared 401 handling. */
function HistoryButton() {
  const { authenticated } = useSession();
  return (
    <button type="button" onClick={() => authenticated((token) => listHistory(token))}>
      Load history
    </button>
  );
}

function renderShell() {
  return render(
    <SessionProvider>
      <AuthenticatedShell>
        <HistoryButton />
      </AuthenticatedShell>
    </SessionProvider>,
  );
}

describe("AuthenticatedShell", () => {
  it("redirects a visitor with no session to /login and renders nothing", () => {
    const { container } = renderShell();

    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(container).toBeEmptyDOMElement();
  });

  it("treats a corrupted stored session as logged out", () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, "{corrupted");

    const { container } = renderShell();

    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the screen for a restored session without redirecting", () => {
    logIn("alice");

    renderShell();

    expect(screen.getByRole("button", { name: "Load history" })).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows the username and links to Quotation and History in the header", () => {
    logIn("carol");

    renderShell();

    expect(screen.getByRole("banner")).toHaveTextContent("carol");
    expect(screen.getByRole("link", { name: "Quotation" })).toHaveAttribute("href", "/quotation");
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute("href", "/history");
  });

  it("clears the session and redirects to /login when a call answers 401 unauthorized", async () => {
    logIn("alice");
    vi.mocked(listHistory).mockResolvedValue({
      ok: false,
      error: {
        kind: "api_error",
        status: 401,
        code: "unauthorized",
        message: "A valid bearer token is required",
        details: {},
      },
    });
    renderShell();

    await userEvent.click(screen.getByRole("button", { name: "Load history" }));

    expect(listHistory).toHaveBeenCalledWith(TOKEN);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });
});
