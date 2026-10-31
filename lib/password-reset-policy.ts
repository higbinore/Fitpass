export const PASSWORD_RESET_RESPONSE = Object.freeze({
  message: "If this email is associated with a FitPass account, a reset link will be sent if email delivery is available.",
});

/** Hide account existence and email-provider failures behind one public response. */
export async function requestPasswordResetPrivately(send: () => Promise<unknown>) {
  try { await send(); } catch { /* The public response deliberately does not disclose delivery or account state. */ }
  return PASSWORD_RESET_RESPONSE;
}
