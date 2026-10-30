import { and, eq, isNull } from "drizzle-orm";

import type { getDb } from "@/lib/db";
import { gymMembershipRoles, gymMemberships } from "@/lib/schema";

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Recheck a session-derived role after acquiring the gym row lock in a write transaction. */
export async function hasActiveGymRoleInTransaction(
  tx: Transaction,
  input: { gymId: string; userId: string; membershipId: string; role: "gym_owner" | "gym_desk_staff" | "gym_member" },
): Promise<boolean> {
  const [membership] = await tx.select({ id: gymMemberships.id })
    .from(gymMemberships)
    .innerJoin(gymMembershipRoles, and(
      eq(gymMembershipRoles.gymId, gymMemberships.gymId),
      eq(gymMembershipRoles.membershipId, gymMemberships.id),
    ))
    .where(and(
      eq(gymMemberships.gymId, input.gymId),
      eq(gymMemberships.id, input.membershipId),
      eq(gymMemberships.userId, input.userId),
      eq(gymMemberships.status, "active"),
      eq(gymMembershipRoles.role, input.role),
      isNull(gymMembershipRoles.revokedAt),
    ))
    .limit(1);
  return Boolean(membership);
}
