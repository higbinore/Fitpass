import "server-only";

import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { gymMembershipRoles, gymMemberships, gyms, members, platformAdmins, platformPackages, platformSubscriptions } from "@/lib/schema";
import { isFeatureEnabled } from "@/lib/feature-policy";
import { AuthorizationError, createAuthorizationApi } from "@/lib/authz-internal";

const authorization = createAuthorizationApi({
  async getSessionUserId() {
    const session = await getAuth().api.getSession({ headers: await headers() });
    return session?.user?.id ?? null;
  },
  async findMembership(userId, gymId) {
    const rows = await getDb()
      .select({
        membershipId: gymMemberships.id,
        gymId: gymMemberships.gymId,
        userId: gymMemberships.userId,
        status: gymMemberships.status,
        gymStatus: gyms.status,
        role: gymMembershipRoles.role,
      })
      .from(gymMemberships)
      .innerJoin(gyms, eq(gyms.id, gymMemberships.gymId))
      .leftJoin(
        gymMembershipRoles,
        and(
          eq(gymMembershipRoles.gymId, gymMemberships.gymId),
          eq(gymMembershipRoles.membershipId, gymMemberships.id),
          isNull(gymMembershipRoles.revokedAt),
        ),
      )
      .where(and(eq(gymMemberships.userId, userId), eq(gymMemberships.gymId, gymId)));

    const membership = rows[0];
    return membership
      ? {
          membershipId: membership.membershipId,
          gymId: membership.gymId,
          userId: membership.userId,
          status: membership.status,
          gymStatus: membership.gymStatus,
          roles: rows.flatMap((row) => (row.role ? [row.role] : [])),
        }
      : null;
  },
  async findGymStatus(gymId) {
    const [gym] = await getDb()
      .select({ status: gyms.status })
      .from(gyms)
      .where(eq(gyms.id, gymId))
      .limit(1);
    return gym?.status ?? null;
  },
  async findPlatformAdminUserId(userId) {
    const [admin] = await getDb()
      .select({ userId: platformAdmins.userId })
      .from(platformAdmins)
      .where(eq(platformAdmins.userId, userId))
      .limit(1);

    return admin?.userId ?? null;
  },
  async findMember(memberId, gymId, userId) {
    const [member] = await getDb()
      .select({ id: members.id, gymId: members.gymId, userId: members.userId })
      .from(members)
      .where(
        and(
          eq(members.id, memberId),
          eq(members.gymId, gymId),
          eq(members.userId, userId),
        ),
      )
      .limit(1);

    return member ?? null;
  },
});

/** These helpers read identity and authorization records on the server. */
export const requireGymOwner = authorization.requireGymOwner;
export const requireGymDeskStaff = authorization.requireGymDeskStaff;
export const requireGymMember = authorization.requireGymMember;
export const requirePlatformAdmin = authorization.requirePlatformAdmin;
export const requireOwnMemberRecord = authorization.requireOwnMemberRecord;

/** Active owner operations require either a current paid period or the gym's unexpired trial. */
async function requireCurrentPackageAccess(gymId: string) {
  const now = new Date();
  const [subscription] = await getDb().select({ id: platformSubscriptions.id })
    .from(platformSubscriptions)
    .where(and(
      eq(platformSubscriptions.gymId, gymId),
      inArray(platformSubscriptions.status, ["active", "trialing"]),
      gt(platformSubscriptions.currentPeriodEnd, now),
    )).limit(1);
  if (!subscription) throw new AuthorizationError("The gym's FitPass trial has ended or its subscription is inactive. Open FitPass billing to restore operational access.");
}

export async function requireActiveGymOwner(gymId: string) {
  const access = await authorization.requireActiveGymOwner(gymId);
  await requireCurrentPackageAccess(gymId);
  return access;
}

export async function requireActiveGymDeskStaff(gymId: string) {
  const access = await authorization.requireActiveGymDeskStaff(gymId);
  await requireCurrentPackageAccess(gymId);
  return access;
}

/** Owner-only package feature gate. Routes must still use the role-specific helper for other roles. */
export async function requireGymFeature(gymId: string, featureKey: string) {
  const access = await authorization.requireGymOwner(gymId);
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(featureKey)) throw new AuthorizationError();
  const [packageData] = await getDb().select({ features: platformPackages.features })
    .from(platformSubscriptions)
    .innerJoin(platformPackages, eq(platformPackages.id, platformSubscriptions.packageId))
    .where(and(eq(platformSubscriptions.gymId, gymId), inArray(platformSubscriptions.status, ["active", "trialing"]), gt(platformSubscriptions.currentPeriodEnd, new Date())))
    .limit(1);
  if (!isFeatureEnabled(packageData?.features, featureKey)) {
    throw new AuthorizationError("This feature is not enabled in the gym's current FitPass package.");
  }
  return access;
}
export { AuthorizationError };

/** Authenticated email data for flows that bind a verified invitation to an account. */
export async function requireVerifiedUser() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new AuthorizationError("Authentication required.");
  }
  if (!session.user.emailVerified) {
    throw new AuthorizationError("Verify your email address before continuing.");
  }
  return { userId: session.user.id, email: session.user.email, name: session.user.name };
}
