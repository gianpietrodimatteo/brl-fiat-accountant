import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_STORAGE_KEY, SessionProvider } from "@/lib/session";
import Home from "./page";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});

function renderHome() {
  render(
    <SessionProvider>
      <Home />
    </SessionProvider>,
  );
}

describe("Home", () => {
  it("sends a visitor with no session to /login", () => {
    renderHome();

    expect(router.replace).toHaveBeenCalledExactlyOnceWith("/login");
  });

  it("sends a logged-in user to /quotation", () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token: "t", username: "alice" }));

    renderHome();

    expect(router.replace).toHaveBeenCalledExactlyOnceWith("/quotation");
  });
});
