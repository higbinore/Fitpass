import type { GymRole } from "@/lib/schema";

export type GymMembershipRecord = {
  membershipId: string;
  gymId: string;
  userId: string;
  status: string;
  gymStatus: string;
  roles: string[];
};

export type MemberOwnershipRecord = {
  id: string;
  gymId: string;
  userId: string;
};

type AuthorizationDependencies = {
  /** Must resolve identity from Better Auth's verified server session. */
  getSessionUserId: () => Promise<string | null>;
  /** Must query by both authenticated user ID and requested gym ID. */
  findMembership: (
    userId: string,
    gymId: string,
  ) => Promise<GymMembershipRecord | null>;
  findGymStatus: (gymId: string) => Promise<string | null>;
  /** Must query the platform_admins table for the authenticated user ID. */
  findPlatformAdminUserId: (userId: string) => Promise<string | null>;
  /** Must query a member row by both member ID and authenticated user ID. */
  findMember: (
    memberId: string,
    gymId: string,
    userId: string,
  ) => Promise<MemberOwnershipRecord | null>;
};

export class AuthorizationError extends Error {
  constructor(message = "Access denied.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * Internal policy core. Production callers must use `lib/authz.ts`, which
 * binds these dependencies to Better Auth and Drizzle. Kept separate so the
 * policy can be tested with fakes and without opening a database connection.
 */
export function createAuthorizationApi(dependencies: AuthorizationDependencies) {
  async function verifiedUserId(): Promise<string> {
    const userId = await dependencies.getSessionUserId();
    if (typeof userId !== "string" || userId.length === 0) {
      throw new AuthorizationError("Authentication required.");
    }
    return userId;
  }

  async function requireGymRole(gymId: string, role: GymRole) {
    if (typeof gymId !== "string" || gymId.length === 0) {
      throw new AuthorizationError();
    }

    const userId = await verifiedUserId();
    const membership = await dependencies.findMembership(userId, gymId);

    if (
      !membership ||
      membership.userId !== userId ||
      membership.gymId !== gymId ||
      membership.status !== "active" ||
      !membership.roles.includes(role)
    ) {
      throw new AuthorizationError();
    }

    return { userId, gymId, membershipId: membership.membershipId, roles: membership.roles } as const;
  }

  return {
    requireGymOwner(gymId: string) {
      return requireGymRole(gymId, "gym_owner");
    },
    requireGymDeskStaff(gymId: string) {
      return requireGymRole(gymId, "gym_desk_staff");
    },
    requireGymMember(gymId: string) {
      return requireGymRole(gymId, "gym_member");
    },
    async requireActiveGymOwner(gymId: string) {
      const access = await requireGymRole(gymId, "gym_owner");
      if ((await dependencies.findGymStatus(gymId)) !== "active") {
        throw new AuthorizationError("This gym is archived and cannot perform new actions.");
      }
      return access;
    },
    async requireActiveGymDeskStaff(gymId: string) {
      const access = await requireGymRole(gymId, "gym_desk_staff");
      if ((await dependencies.findGymStatus(gymId)) !== "active") {
        throw new AuthorizationError("This gym is archived and cannot perform new actions.");
      }
      return access;
    },
    async requirePlatformAdmin() {
      const userId = await verifiedUserId();
      const adminUserId = await dependencies.findPlatformAdminUserId(userId);

      if (adminUserId !== userId) {
        throw new AuthorizationError();
      }

      return { userId } as const;
    },
    async requireOwnMemberRecord(gymId: string, memberId: string) {
      const access = await requireGymRole(gymId, "gym_member");
      if (typeof memberId !== "string" || memberId.length === 0) {
        throw new AuthorizationError();
      }

      const member = await dependencies.findMember(memberId, gymId, access.userId);
      if (!member || member.id !== memberId || member.gymId !== gymId || member.userId !== access.userId) {
        throw new AuthorizationError();
      }

      return { ...access, member } as const;
    },
  };
}
