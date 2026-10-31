export const PLATFORM_ADMIN_ACTIVE_LIMIT = 10;

export function canGrantPlatformAdmin(activeCount: number): boolean {
  return Number.isInteger(activeCount) && activeCount >= 0 && activeCount < PLATFORM_ADMIN_ACTIVE_LIMIT;
}

export function canSuspendPlatformAdmin(input: { targetIsActive: boolean; activeCount: number }): boolean {
  return !input.targetIsActive || (Number.isInteger(input.activeCount) && input.activeCount > 1);
}

export function canReinstatePlatformAdmin(input: { targetIsSuspended: boolean; activeCount: number }): boolean {
  return !input.targetIsSuspended || canGrantPlatformAdmin(input.activeCount);
}
