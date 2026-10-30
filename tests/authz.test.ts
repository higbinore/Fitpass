import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorizationError,
  createAuthorizationApi,
  type GymMembershipRecord,
  type MemberOwnershipRecord,
} from "../lib/authz-internal.ts";

const gymA = "gym-a";
const gymB = "gym-b";
const userA = "user-a";
const userB = "user-b";
const memberA = "member-a";

function makeApi({
  sessionUserId = userA as string | null,
  memberships = [] as GymMembershipRecord[],
  platformAdminIds = [] as string[],
  memberRecords = [] as MemberOwnershipRecord[],
} = {}) {
  const membershipLookups: Array<{ userId: string; gymId: string }> = [];
  const platformAdminLookups: string[] = [];
  const gymStatuses = new Map<string, string>();
  const memberLookups: Array<{ memberId: string; userId: string }> = [];

  const api = createAuthorizationApi({
    async getSessionUserId() {
      return sessionUserId;
    },
    async findMembership(userId, gymId) {
      membershipLookups.push({ userId, gymId });
      const found = memberships.find((row) => row.userId === userId && row.gymId === gymId) ?? null;
      if (found) gymStatuses.set(gymId, found.gymStatus);
      return found;
    },
    async findGymStatus(gymId) { return gymStatuses.get(gymId) ?? null; },
    async findPlatformAdminUserId(userId) {
      platformAdminLookups.push(userId);
      return platformAdminIds.includes(userId) ? userId : null;
    },
    async findMember(memberId, gymId, userId) {
      memberLookups.push({ memberId, userId });
      return (
        memberRecords.find(
          (row) => row.id === memberId && row.gymId === gymId && row.userId === userId,
        ) ?? null
      );
    },
  });

  return { api, membershipLookups, platformAdminLookups, memberLookups };
}

function membership(gymId: string, userId: string, roles: string[], overrides: Partial<GymMembershipRecord> = {}): GymMembershipRecord {
  return { membershipId: `membership-${gymId}-${userId}`, gymId, userId, status: "active", gymStatus: "active", roles, ...overrides };
}

function expectDenied(operation: Promise<unknown>) {
  return assert.rejects(operation, AuthorizationError);
}

test("forged identity claims do not replace the authenticated session identity", async () => {
  const { api, membershipLookups } = makeApi({
    memberships: [membership(gymA, userB, ["gym_owner"])],
  });

  const callWithForgedIdentity = api.requireGymOwner as unknown as (
    gymId: string,
    claim: { userId: string },
  ) => Promise<unknown>;

  await expectDenied(callWithForgedIdentity(gymA, { userId: userB }));
  assert.deepEqual(membershipLookups, [{ userId: userA, gymId: gymA }]);
});

test("forged membership objects are ignored; authorization uses the lookup result", async () => {
  const { api, membershipLookups } = makeApi();
  const callWithForgedMembership = api.requireGymOwner as unknown as (
    gymId: string,
    membership: GymMembershipRecord,
  ) => Promise<unknown>;

  await expectDenied(
    callWithForgedMembership(gymA, {
      membershipId: "forged-membership",
      gymId: gymA,
      userId: userA,
      status: "active",
      gymStatus: "active",
      roles: ["gym_owner"],
    }),
  );
  assert.deepEqual(membershipLookups, [{ userId: userA, gymId: gymA }]);
});

test("a membership in one gym does not authorize another gym", async () => {
  const { api } = makeApi({
    memberships: [membership(gymA, userA, ["gym_desk_staff"])],
  });

  await expectDenied(api.requireGymDeskStaff(gymB));
});

test("missing sessions and missing memberships fail closed", async () => {
  const noSession = makeApi({ sessionUserId: null });
  await expectDenied(noSession.api.requireGymMember(gymA));

  const noMembership = makeApi();
  await expectDenied(noMembership.api.requireGymMember(gymA));
});

test("desk staff cannot perform owner-only operations", async () => {
  const { api } = makeApi({
    memberships: [membership(gymA, userA, ["gym_desk_staff"])],
  });

  await expectDenied(api.requireGymOwner(gymA));
});

test("a person can hold owner and member roles on one membership", async () => {
  const { api } = makeApi({
    memberships: [membership(gymA, userA, ["gym_owner", "gym_member"])],
    memberRecords: [{ id: memberA, gymId: gymA, userId: userA }],
  });

  assert.equal((await api.requireGymOwner(gymA)).membershipId, `membership-${gymA}-${userA}`);
  assert.equal((await api.requireOwnMemberRecord(gymA, memberA)).member.id, memberA);
});

test("suspended or revoked memberships fail closed, while archived history stays readable", async () => {
  for (const record of [
    membership(gymA, userA, ["gym_owner"], { status: "suspended" }),
    membership(gymA, userA, ["gym_owner"], { status: "revoked" }),
  ]) {
    const { api } = makeApi({ memberships: [record] });
    await expectDenied(api.requireGymOwner(gymA));
  }

  const archived = makeApi({ memberships: [membership(gymA, userA, ["gym_owner"], { gymStatus: "archived" })] });
  assert.equal((await archived.api.requireGymOwner(gymA)).userId, userA);
  await expectDenied(archived.api.requireActiveGymOwner(gymA));
});

test("platform-admin access queries the authenticated user's platform record", async () => {
  const { api, platformAdminLookups } = makeApi({ platformAdminIds: [userB] });

  await expectDenied(api.requirePlatformAdmin());
  assert.deepEqual(platformAdminLookups, [userA]);

  const provisioned = makeApi({ platformAdminIds: [userA] });
  assert.deepEqual(await provisioned.api.requirePlatformAdmin(), {
    userId: userA,
  });
  assert.deepEqual(provisioned.platformAdminLookups, [userA]);
});

test("member ownership is checked against a database-loaded record and session user", async () => {
  const { api, memberLookups } = makeApi({
    memberships: [membership(gymA, userA, ["gym_member"])],
    memberRecords: [{ id: memberA, gymId: gymA, userId: userA }],
  });

  const access = await api.requireOwnMemberRecord(gymA, memberA);
  assert.equal(access.member.id, memberA);
  assert.deepEqual(memberLookups, [{ memberId: memberA, userId: userA }]);

  const otherMember = makeApi({
    memberships: [membership(gymA, userA, ["gym_member"])],
    memberRecords: [{ id: memberA, gymId: gymA, userId: userB }],
  });
  await expectDenied(otherMember.api.requireOwnMemberRecord(gymA, memberA));

  const wrongGym = makeApi({
    memberships: [membership(gymA, userA, ["gym_member"])],
    memberRecords: [{ id: memberA, gymId: gymB, userId: userA }],
  });
  await expectDenied(wrongGym.api.requireOwnMemberRecord(gymA, memberA));
});

test("invalid membership roles cannot be elevated", async () => {
  const { api } = makeApi({
    memberships: [
      membership(gymA, userA, ["platform_admin"]),
      membership(gymB, userA, ["owner"]),
    ],
  });

  await expectDenied(api.requireGymOwner(gymA));
  await expectDenied(api.requireGymOwner(gymB));
});
