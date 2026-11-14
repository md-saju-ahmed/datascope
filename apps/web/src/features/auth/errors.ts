export function authError(error: unknown, registration = false): string {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? error.status
      : undefined;
  if (status === 401)
    return 'Unable to sign in with those credentials. Check your email and password.';
  if (status === 409 && registration)
    return 'Unable to create this account. Try signing in with this email instead.';
  if (status === 429) return 'Too many attempts. Wait before trying again.';
  if (status === 403)
    return 'This request could not be completed. Refresh the page and try again, or contact your administrator.';
  if (status === 400)
    return 'Check your email and password against the requirements below and try again.';
  return 'Unable to reach the service. Check your connection and try again.';
}
