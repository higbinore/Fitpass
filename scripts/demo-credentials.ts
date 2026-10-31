import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";

import { parseLocalReviewServerTarget } from "../lib/demo-local-guard.ts";

const DEMO_EMAILS = [
  "platform-admin@fitpass-demo.test",
  "gym-owner@fitpass-demo.test",
  "desk-staff@fitpass-demo.test",
  "gym-member@fitpass-demo.test",
] as const;

function assertIgnored(pathFromRoot: string) {
  const result = spawnSync("git", ["check-ignore", "-q", pathFromRoot], {
    cwd: process.cwd(),
    windowsHide: true,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) throw new Error("The local credential path is not gitignored; refusing to write it.");
}

async function main() {
  if (process.env.FITPASS_DEMO_LOCAL_ONLY !== "1") throw new Error("This credential rotation is available only from npm run dev:demo.");
  parseLocalReviewServerTarget(process.env.DATABASE_URL);

  const root = process.cwd();
  const credentialsPath = resolve(root, ".fitpass-local", "demo-credentials.json");
  const pendingPath = `${credentialsPath}.pending`;
  assertIgnored(".fitpass-local/demo-credentials.json");
  assertIgnored(".fitpass-local/email-sink.jsonl");
  if (existsSync(credentialsPath)) {
    process.stdout.write("Local demo credentials already exist; account passwords were not changed.\n");
    return;
  }
  if (existsSync(pendingPath)) throw new Error("A previous local credential setup needs review; refusing to rotate accounts again.");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the exact local demo target.");
  const pool = new Pool({ connectionString: databaseUrl, max: 1, application_name: "fitpass-local-demo-credentials" });
  const passwords = Object.fromEntries(DEMO_EMAILS.map((email) => [email, randomBytes(24).toString("base64url")])) as Record<(typeof DEMO_EMAILS)[number], string>;
  const pending = JSON.stringify({ createdAt: new Date().toISOString(), accounts: DEMO_EMAILS.map((email) => ({ email, password: passwords[email] })) }, null, 2);
  let pendingCreated = false;
  let committed = false;

  try {
    const users = await pool.query<{ id: string; email: string; email_verified: boolean }>(
      `SELECT id, email, email_verified FROM public."user" WHERE email = ANY($1::text[]) ORDER BY email`,
      [DEMO_EMAILS],
    );
    if (users.rowCount !== DEMO_EMAILS.length || users.rows.some((user) => !user.email_verified)) {
      throw new Error("The exact four verified local demo accounts are required; no credentials were changed.");
    }
    const accounts = await pool.query<{ id: string; user_id: string; email: string }>(
      `SELECT a.id, a.user_id, u.email FROM public."account" a JOIN public."user" u ON u.id = a.user_id WHERE u.email = ANY($1::text[]) AND a.provider_id = 'credential' ORDER BY u.email`,
      [DEMO_EMAILS],
    );
    if (accounts.rowCount !== DEMO_EMAILS.length || new Set(accounts.rows.map((row) => row.email)).size !== DEMO_EMAILS.length) {
      throw new Error("Each local demo account must have exactly one credential account; no credentials were changed.");
    }
    const passwordHashes = new Map<string, string>(await Promise.all(DEMO_EMAILS.map(async (email) => [email, await hashPassword(passwords[email])] as const)));

    mkdirSync(dirname(credentialsPath), { recursive: true });
    const descriptor = openSync(pendingPath, "wx", 0o600);
    try {
      writeFileSync(descriptor, pending, { encoding: "utf8" });
    } finally {
      closeSync(descriptor);
    }
    pendingCreated = true;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const account of accounts.rows) {
        const result = await client.query(
          `UPDATE public."account" SET password = $1, updated_at = now() WHERE id = $2 AND provider_id = 'credential' RETURNING id`,
          [passwordHashes.get(account.email), account.id],
        );
        if (result.rowCount !== 1) throw new Error("A local demo credential row changed during rotation; transaction rolled back.");
      }
      await client.query("COMMIT");
      committed = true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    renameSync(pendingPath, credentialsPath);
    process.stdout.write("Local demo credentials were rotated and saved to .fitpass-local/demo-credentials.json. Passwords were not printed.\n");
  } catch (error) {
    if (pendingCreated && !committed && existsSync(pendingPath)) unlinkSync(pendingPath);
    if (committed && existsSync(pendingPath)) {
      process.stderr.write("Credential update committed; the local credentials are in .fitpass-local/demo-credentials.json.pending.\n");
    }
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Local demo credential setup failed."}\n`);
  process.exitCode = 1;
});
