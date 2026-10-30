export function canAddAccounts(input: { limit: number; active: number; pendingInvitations: number; addsNewAccount: boolean }): boolean {
  return !input.addsNewAccount || input.active + input.pendingInvitations < input.limit;
}

export function canAddMember(input: { limit: number; active: number; pendingInvitations: number }): boolean {
  return input.active + input.pendingInvitations < input.limit;
}
