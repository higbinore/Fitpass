import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

type WebhookFixture = {
  transactionId: string;
  reference: string;
  amountKobo: number;
  paidAt: string;
};

type RouteFixtures = {
  gymAId: string;
  gymBId: string;
  memberAId: string;
  memberBId: string;
  lastOwnerMembershipId: string;
  expiredMemberCode: string;
  inviteToken: string;
  capacityInviteEmail: string;
  cookies: {
    gymAOwner: string;
    gymADesk: string;
    gymAMember: string;
    gymBMember: string;
    wrongEmailInvitee: string;
    matchingInvitee: string;
  };
  webhook: WebhookFixture;
};

function isLoopback(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

const databaseUrl = process.env.FITPASS_TEST_DATABASE_URL;
const apiOrigin = process.env.FITPASS_TEST_API_ORIGIN;
const rawFixtures = process.env.FITPASS_TEST_ROUTE_FIXTURES;
const integrationSkip = !databaseUrl || !apiOrigin || !rawFixtures
  ? "Skipped: configure a disposable local FITPASS_TEST_DATABASE_URL, local API origin, and route fixtures to run route integration tests."
  : false;

let fixtures: RouteFixtures | undefined;
let origin: URL | undefined;
let paystackTestSecret: string | undefined;

if (!integrationSkip) {
  try {
    const dbUrl = new URL(databaseUrl!);
    const dbName = decodeURIComponent(dbUrl.pathname.slice(1)).toLowerCase();
    if (!/^postgres(?:ql)?:$/.test(dbUrl.protocol) || !isLoopback(dbUrl.hostname) || !/(test|demo)/.test(dbName)) {
      throw new Error();
    }
    origin = new URL(apiOrigin!);
    if (origin.protocol !== "http:" || !isLoopback(origin.hostname)) throw new Error();
    fixtures = JSON.parse(rawFixtures!) as RouteFixtures;
    paystackTestSecret = process.env.PAYSTACK_SECRET_KEY;
  } catch {
    throw new Error("Route integration tests require valid loopback-only disposable database/API configuration and JSON fixtures.");
  }
}

const cookies = () => fixtures!.cookies;
async function api(path: string, cookie: string, method = "GET", body?: unknown) {
  return fetch(new URL(path, origin), {
    method,
    headers: {
      cookie,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
  });
}

test("gym A cannot read owner data or write a check-in in gym B", { skip: integrationSkip }, async () => {
  const ownerRead = await api(`/api/gyms/${fixtures!.gymBId}/owner-summary`, cookies().gymAOwner);
  assert.ok(ownerRead.status === 401 || ownerRead.status === 403);

  const checkinWrite = await api(`/api/gyms/${fixtures!.gymBId}/checkins`, cookies().gymADesk, "POST", { code: "INVALID-TEST-CODE" });
  assert.ok(checkinWrite.status === 401 || checkinWrite.status === 403);
});

test("a gym A owner cannot edit gym B through either gym or platform settings routes", { skip: integrationSkip }, async () => {
  const ownerEdit = await api(`/api/gyms/${fixtures!.gymBId}/settings`, cookies().gymAOwner, "PATCH", {});
  assert.ok(ownerEdit.status === 401 || ownerEdit.status === 403);
  const platformEdit = await api(`/api/platform/gyms/${fixtures!.gymBId}`, cookies().gymAOwner, "PATCH", {});
  assert.ok(platformEdit.status === 401 || platformEdit.status === 403);
});

test("member and desk roles cannot escalate into owner operations", { skip: integrationSkip }, async () => {
  const escalation = await api(`/api/gyms/${fixtures!.gymAId}/invitations`, cookies().gymAMember, "POST", {
    email: "role-escalation-denied@example.invalid",
    roles: ["gym_owner"],
  });
  assert.ok(escalation.status === 401 || escalation.status === 403);

  const deskReport = await api(`/api/gyms/${fixtures!.gymAId}/reports`, cookies().gymADesk);
  assert.ok(deskReport.status === 401 || deskReport.status === 403);
});

test("a member reads only their own profile and cannot select another gym's profile", { skip: integrationSkip }, async () => {
  const own = await api(`/api/gyms/${fixtures!.gymAId}/me`, cookies().gymAMember);
  assert.equal(own.status, 200);
  const ownBody = await own.json() as { member?: { id?: string } };
  assert.equal(ownBody.member?.id, fixtures!.memberAId);
  assert.notEqual(ownBody.member?.id, fixtures!.memberBId);

  const otherGym = await api(`/api/gyms/${fixtures!.gymBId}/me`, cookies().gymAMember);
  assert.ok(otherGym.status === 401 || otherGym.status === 403 || otherGym.status === 404);
});

test("invitation acceptance rejects the wrong email and cannot be replayed", { skip: integrationSkip }, async () => {
  const wrongEmail = await api("/api/invitations/accept", cookies().wrongEmailInvitee, "POST", { token: fixtures!.inviteToken });
  assert.ok(wrongEmail.status === 401 || wrongEmail.status === 403);

  const accepted = await api("/api/invitations/accept", cookies().matchingInvitee, "POST", { token: fixtures!.inviteToken });
  assert.ok(accepted.status === 200 || accepted.status === 201);

  const replay = await api("/api/invitations/accept", cookies().matchingInvitee, "POST", { token: fixtures!.inviteToken });
  // The acceptance route intentionally masks used invitations as not found.
  assert.ok(replay.status === 400 || replay.status === 404 || replay.status === 409);
});

test("the final active gym owner cannot be revoked", { skip: integrationSkip }, async () => {
  const response = await api(
    `/api/gyms/${fixtures!.gymAId}/memberships/${fixtures!.lastOwnerMembershipId}`,
    cookies().gymAOwner,
    "PATCH",
    { status: "revoked" },
  );
  assert.equal(response.status, 409);
});

test("package admin-account capacity is enforced by the invitation route", { skip: integrationSkip }, async () => {
  const response = await api(`/api/gyms/${fixtures!.gymAId}/invitations`, cookies().gymAOwner, "POST", {
    email: fixtures!.capacityInviteEmail,
    roles: ["gym_desk_staff"],
  });
  assert.equal(response.status, 409);
});

test("expired memberships do not create successful check-ins", { skip: integrationSkip }, async () => {
  const before = await api(`/api/gyms/${fixtures!.gymAId}/checkins`, cookies().gymADesk);
  assert.equal(before.status, 200);
  const beforeCount = (await before.json() as { todayCount: number }).todayCount;

  const rejected = await api(`/api/gyms/${fixtures!.gymAId}/checkins`, cookies().gymADesk, "POST", { code: fixtures!.expiredMemberCode });
  assert.equal(rejected.status, 409);

  const after = await api(`/api/gyms/${fixtures!.gymAId}/checkins`, cookies().gymADesk);
  assert.equal(after.status, 200);
  assert.equal((await after.json() as { todayCount: number }).todayCount, beforeCount);
});

test("a Paystack webhook replay is idempotent", { skip: integrationSkip || !paystackTestSecret?.startsWith("sk_test_") }, async () => {
  const event = {
    event: "charge.success",
    data: {
      id: fixtures!.webhook.transactionId,
      reference: fixtures!.webhook.reference,
      amount: fixtures!.webhook.amountKobo,
      currency: "NGN",
      status: "success",
      paid_at: fixtures!.webhook.paidAt,
    },
  };
  const raw = JSON.stringify(event);
  const signature = createHmac("sha512", paystackTestSecret!).update(raw).digest("hex");
  const send = () => fetch(new URL("/api/paystack/webhook", origin), {
    method: "POST",
    headers: { "content-type": "application/json", "x-paystack-signature": signature },
    body: raw,
  });

  const first = await send();
  assert.equal(first.status, 200);
  const replay = await send();
  assert.equal(replay.status, 200);
  assert.equal((await replay.json() as { duplicate?: boolean }).duplicate, true);
});
