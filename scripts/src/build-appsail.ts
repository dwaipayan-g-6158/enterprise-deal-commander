// Assembles the AppSail deploy bundle: builds the SPA and the API server,
// copies the SPA's build output into the server's dist/ so one Express
// process serves both from one origin (see artifacts/api-server/src/app.ts's
// static-serving block), then adds the two things a Catalyst AppSail
// container needs that a plain single-process bundle doesn't:
//
//   1. A minimal package.json in dist/, so npm treats dist/ as its own
//      project root instead of walking up to one with `workspace:*` specs
//      it can't parse.
//   2. The real (unbundled) zcatalyst-sdk-node package installed straight
//      into dist/node_modules — it's marked `external` in build.mjs because
//      esbuild mis-transforms a vendored APM module inside it (see the
//      comment there), and AppSail's Console-managed-runtime deploy does not
//      run an install step of its own, so the package has to ship inside
//      the zip. Modeled on the sibling Customer-Insight-Engine project's
//      identical build-appsail.ts, including the pinned SDK version — keep
//      that version in sync with lib/db/package.json's dependency.
//
// Run via `pnpm --filter @workspace/scripts run build-appsail` from the repo
// root, and always from PowerShell on this host — Git-Bash/MSYS mangles
// BASE_PATH into a Windows path, which then gets baked into dist/index.html
// and 404s every asset. Sets env vars via `process.env` (not shell syntax)
// for the same reason.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync, copyFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, "..", "..");
const clientDir = path.join(repoRoot, "artifacts", "edc");
const serverDir = path.join(repoRoot, "artifacts", "api-server");
const clientPublicDir = path.join(clientDir, "dist", "public");
const serverDistDir = path.join(serverDir, "dist");
const serverPublicDir = path.join(serverDistDir, "public");

// Keep in sync with lib/db/package.json's zcatalyst-sdk-node dependency.
const CATALYST_SDK_VERSION = "3.4.0";

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): void {
  console.log(`\n> ${command} ${args.join(" ")}  (cwd: ${path.relative(repoRoot, cwd) || "."})`);
  // shell: true is required here for pnpm/npm to resolve correctly across
  // both native Windows and Git-Bash/MSYS shells. Args are fixed, trusted
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
  // 1. Build the SPA. BASE_PATH=/ because AppSail serves everything from a
  // single root origin (no sub-path) — the generated API client hard-codes
  // root-relative /api/... paths, so this isn't optional.
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

  // 3b. Install the real zcatalyst-sdk-node into dist/node_modules. Strip
  // pnpm-injected npm_config_* env vars first — running plain npm with them
  // inherited trips an unrelated EALLOWSCRIPTS guard.
  const npmEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith("npm_config_")),
  );
  writeFileSync(
    path.join(serverDistDir, "package.json"),
    JSON.stringify({ name: "edc-appsail-deploy", private: true }, null, 2),
  );
  run(
    "npm",
    ["install", "--no-save", "--omit=dev", `zcatalyst-sdk-node@${CATALYST_SDK_VERSION}`],
    serverDistDir,
    npmEnv,
  );

  // 4. Copy the AppSail startup config (source of truth lives outside dist/
  // since build.mjs wipes dist/ on every run).
  const appConfigSrc = path.join(serverDir, "app-config.json");
  if (existsSync(appConfigSrc)) {
    copyFileSync(appConfigSrc, path.join(serverDistDir, "app-config.json"));
    console.log(`Copied app-config.json -> ${path.relative(repoRoot, serverDistDir)}`);
  } else {
    console.warn(
      `\nWARNING: ${path.relative(repoRoot, appConfigSrc)} not found — skipping. ` +
        `Copy app-config.example.json to app-config.json and fill in real values first. ` +
        `The AppSail bundle in ${path.relative(repoRoot, serverDistDir)} has no startup config.`,
    );
  }

  // 5. Zip the bundle, ready to upload.
  //
  // This is a build step rather than a documented manual instruction because
  // getting it wrong is silent: zipping the FOLDER instead of its CONTENTS
  // produces a deployment that reaches "Completed" and then 500s every
  // request with `Cannot find module '/catalyst/index.mjs'`, because AppSail
  // expects the entry file at the zip root. Emitting the zip from here means
  // that layout is decided once, in code, instead of re-derived by hand on
  // every deploy.
  const zipPath = path.join(serverDir, "appsail-deploy.zip");
  if (existsSync(zipPath)) rmSync(zipPath);
  // Compress-Archive over `dist/*` (the glob, not `dist`) is what keeps the
  // contents flat. Run through PowerShell rather than a Node zip dependency
  // to avoid adding one to the toolchain for a single call.
  run(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Compress-Archive -Path '${path.join(serverDistDir, "*")}' -DestinationPath '${zipPath}' -CompressionLevel Optimal`,
    ],
    repoRoot,
    process.env,
  );
  const zipMb = (statSync(zipPath).size / (1024 * 1024)).toFixed(2);

  console.log(
    `\nAppSail bundle ready: ${path.relative(repoRoot, zipPath)} (${zipMb} MB)` +
      `\nDeploy it via the Catalyst Console — open the app itself, then` +
      ` Overview -> Create Deployment. Never \`catalyst deploy appsail\`, and never` +
      ` the AppSail list's "Deploy from Console" button (that one is` +
      ` first-time-creation only and errors with "The given AppSail name already exists").`,
  );
}

main();
