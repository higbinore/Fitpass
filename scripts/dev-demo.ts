import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants, copyFileSync, existsSync } from "node:fs";
import net from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseLocalReviewServerTarget } from "../lib/demo-local-guard.ts";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const preloader = resolve(root, "scripts/dev-demo-preload.cjs");
const credentialSetup = resolve(root, "scripts/demo-credentials.ts");
const nextCli = resolve(root, "node_modules/next/dist/bin/next");
const reviewTsConfig = resolve(root, "tsconfig.fitpass-review.json");

function fail(message: string): never {
  throw new Error(message);
}

function assertIgnored(pathFromRoot: string) {
  const result = spawnSync("git", ["check-ignore", "-q", pathFromRoot], { cwd: root, windowsHide: true });
  if (result.error || result.status !== 0) fail("The local review output directory is not gitignored; refusing to start.");
}

async function assertPortFree() {
  await new Promise<void>((resolvePromise, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(new Error("Port 3000 is already in use. Stop that server yourself, then retry; this command will not terminate it.")));
    server.listen(3000, "127.0.0.1", () => server.close((error) => error ? reject(error) : resolvePromise()));
  });
}

async function main() {
  parseLocalReviewServerTarget(process.env.DATABASE_URL);
  if (!process.env.APPDATA) fail("APPDATA is unavailable; cannot use the configured Windows pgpass.conf path.");
  process.env.PGPASSFILE ??= resolve(process.env.APPDATA, "postgresql", "pgpass.conf");
  if (!existsSync(process.env.PGPASSFILE)) fail("The local pgpass.conf path is unavailable; no database connection was attempted.");
  if (!existsSync(preloader) || !existsSync(credentialSetup) || !existsSync(nextCli)) fail("A required local FitPass review-server file is missing.");

  const localDir = resolve(root, ".fitpass-local");
  const emailSinkFile = resolve(localDir, "email-sink.jsonl");
  assertIgnored(".fitpass-local/demo-credentials.json");
  assertIgnored(".fitpass-local/email-sink.jsonl");
  assertIgnored("tsconfig.fitpass-review.json");
  if (!existsSync(reviewTsConfig)) copyFileSync(resolve(root, "tsconfig.json"), reviewTsConfig, constants.COPYFILE_EXCL);
  await assertPortFree();

  process.env.FITPASS_DEMO_LOCAL_ONLY = "1";
  process.env.FITPASS_LOCAL_MAIL_SINK_FILE = emailSinkFile;
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("base64url");
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.FITPASS_INITIAL_GYM_SLUG = "fitpass-elite-fitness-club";
  process.env.FITPASS_PAYMENT_MODE = "demo";
  process.env.PAYSTACK_SECRET_KEY = "sk_test_fitpass_local_no_network";
  process.env.RESEND_API_KEY = "fitpass_local_mail_sink_no_network";
  process.env.EMAIL_FROM = "FitPass Local <local@fitpass.test>";
  process.env.CRON_SECRET = randomBytes(24).toString("hex");
  delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const guardOption = `--require="${preloader.replaceAll("\\", "/")}"`;
  process.env.NODE_OPTIONS = guardOption;
  const credentialsResult = spawnSync(process.execPath, ["--experimental-strip-types", credentialSetup], {
    cwd: root,
    env: process.env,
    windowsHide: true,
    stdio: "inherit",
  });
  if (credentialsResult.error || credentialsResult.status !== 0) fail("Local demo credential setup failed; the review server was not started.");

  process.stdout.write("FitPass local review server: http://localhost:3000\n");
  process.stdout.write("Demo accounts: platform-admin@fitpass-demo.test, gym-owner@fitpass-demo.test, desk-staff@fitpass-demo.test, gym-member@fitpass-demo.test\n");
  process.stdout.write("Read the generated local passwords only from .fitpass-local/demo-credentials.json.\n");
  process.stdout.write("Local reset-email links are written only to .fitpass-local/email-sink.jsonl; Paystack network calls are blocked.\n");

  const server = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", "3000"], {
    cwd: root,
    env: process.env,
    windowsHide: true,
    stdio: "inherit",
  });
  server.once("error", () => { process.exitCode = 1; });
  server.once("exit", (code) => { process.exitCode = code ?? 1; });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "FitPass local review server failed."}\n`);
  process.exitCode = 1;
});
