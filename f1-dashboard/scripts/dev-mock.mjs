/**
 * Run the dashboard against the local mock APIs (scripts/mock/server.mjs).
 *
 *   npm run mock                       between race weekends
 *   npm run mock -- live-race          a race in progress (shows the "needs credentials" fallback)
 *   npm run mock -- live-race --key    the same, pretending you have OpenF1 credentials (live timing)
 *   npm run mock -- live-practice --key
 *   npm run mock -- down               both APIs failing (error states)
 *
 * Starts the mock server and `next dev`, pointing the app at the mock via
 * OPENF1_BASE_URL / JOLPICA_BASE_URL. Written in Node rather than as an npm
 * one-liner so it works the same on Windows, macOS and Linux.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const scenario = args.find((a) => !a.startsWith("--")) ?? "between";
const withKey = args.includes("--key");
const port = process.env.MOCK_PORT ?? "4555";

const mock = spawn(process.execPath, [path.join(root, "scripts/mock/server.mjs"), scenario], {
  stdio: "inherit",
  env: { ...process.env, MOCK_PORT: port },
});

const next = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    OPENF1_BASE_URL: `http://localhost:${port}`,
    JOLPICA_BASE_URL: `http://localhost:${port}/ergast/f1`,
    // Real values from .env.local are ignored here: the mock accepts any token.
    OPENF1_API_KEY: withKey ? "mock-token" : "",
    OPENF1_USERNAME: "",
    OPENF1_PASSWORD: "",
  },
});

// Stop both when either exits or on Ctrl+C.
const stop = () => {
  mock.kill();
  next.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
mock.on("exit", (code) => {
  if (code) next.kill();
});
next.on("exit", (code) => {
  mock.kill();
  process.exit(code ?? 0);
});
