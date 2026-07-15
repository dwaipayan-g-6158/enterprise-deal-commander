// Assembles a single-process deploy bundle: builds the SPA and the API
// server, then copies the SPA's build output into the server's dist/ so one
// Express process can serve both from one origin (see artifacts/api-server/
// src/app.ts's static-serving block).
//
// Run via `pnpm --filter @workspace/scripts run build-single` from the repo
// root. Sets env vars via `process.env` (not shell syntax) specifically to
// avoid the Git-Bash/MSYS path-mangling that corrupts BASE_PATH into a
// Windows path on this host — always build through this script, not by hand.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, "..", "..");
const clientDir = path.join(repoRoot, "artifacts", "edc");
const serverDir = path.join(repoRoot, "artifacts", "api-server");
const clientPublicDir = path.join(clientDir, "dist", "public");
const serverDistDir = path.join(serverDir, "dist");
const serverPublicDir = path.join(serverDistDir, "public");

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): void {
  console.log(`\n> ${command} ${args.join(" ")}  (cwd: ${path.relative(repoRoot, cwd) || "."})`);
  // shell: true is required here for pnpm to resolve correctly across both
  // native Windows and Git-Bash/MSYS shells. Args are fixed, trusted
  // literals (never user input), so the escaping caveat behind Node's
  // DEP0190 warning doesn't apply to this call.
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (exit ${result.status}): ${command} ${args.join(" ")}`);
  }
}

function main(): void {
  // 1. Build the SPA. BASE_PATH=/ because the single process serves
  // everything from a single root origin (no sub-path).
  run("pnpm", ["run", "build"], clientDir, {
    ...process.env,
    BASE_PATH: "/",
    PORT: process.env.PORT ?? "5173",
  });

  if (!existsSync(clientPublicDir)) {
    throw new Error(`Client build did not produce ${clientPublicDir}`);
  }

  // 2. Build the API server (esbuild bundle to dist/*.mjs).
  run("pnpm", ["run", "build"], serverDir, process.env);

  if (!existsSync(serverDistDir)) {
    throw new Error(`Server build did not produce ${serverDistDir}`);
  }

  // 3. Copy the SPA build into the server's dist/public — app.ts serves
  // static files from `path.join(__dirname, "public")` at runtime.
  rmSync(serverPublicDir, { recursive: true, force: true });
  cpSync(clientPublicDir, serverPublicDir, { recursive: true });
  console.log(`\nCopied ${path.relative(repoRoot, clientPublicDir)} -> ${path.relative(repoRoot, serverPublicDir)}`);

  console.log(
    `\nSingle-process bundle ready at ${path.relative(repoRoot, serverDistDir)} ` +
      `— run with: node --enable-source-maps ${path.relative(repoRoot, path.join(serverDistDir, "index.mjs"))}`,
  );
}

main();
