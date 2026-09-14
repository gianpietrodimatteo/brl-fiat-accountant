import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Dedicated ports, away from the 3000/3001 a dev or Docker stack uses. `reuseExistingServer` is off
 * below, so a busy port fails the run instead of testing against a server this config didn't start
 * (which could be in live mode, or holding an old database).
 */
const FRONTEND_PORT = 3100;
const BACKEND_PORT = 3101;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

/**
 * A new directory per run for the backend's SQLite file, so no run inherits history from an
 * earlier one. Every worker loads this config again; they inherit the variable from the runner and
 * so share its directory instead of creating their own.
 */
process.env.E2E_RUN_DIR ??= mkdtempSync(path.join(tmpdir(), "brl-fiat-accountant-e2e-"));
const databasePath = path.join(process.env.E2E_RUN_DIR, "app.db");

export default defineConfig({
  testDir: "./tests",
  // Specs run in parallel files; each one that creates quotes logs in as its own seeded user.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  // `next dev` compiles each route on its first visit, which can take longer than the 5s default.
  expect: { timeout: 15_000 },
  use: {
    baseURL: FRONTEND_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      name: "backend",
      command: "npx tsx src/index.ts",
      cwd: path.resolve(__dirname, "..", "backend"),
      env: {
        PORT: String(BACKEND_PORT),
        CORS_ORIGIN: FRONTEND_URL,
        SQLITE_DB_PATH: databasePath,
        // Never the real exchanges: the suite needs no network and gets deterministic prices.
        EXCHANGE_MODE: "simulated",
      },
      url: `${BACKEND_URL}/api/currencies`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: "frontend",
      command: `npx next dev --port ${FRONTEND_PORT}`,
      cwd: path.resolve(__dirname, "..", "frontend"),
      env: {
        NEXT_PUBLIC_API_BASE_URL: BACKEND_URL,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      url: `${FRONTEND_URL}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
