const destinations =
  /^\/(dashboard|datasets|search|saved-views|history|analytics|settings|admin)(\/|$)/;

export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096) return '/dashboard';
  // Reject ambiguous encodings and URL parser normalization before navigating.
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\s]/u.test(value) ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return '/dashboard';
  try {
    const url = new URL(value, 'https://local.invalid');
    const decoded = decodeURIComponent(url.pathname);
    if (
      url.origin !== 'https://local.invalid' ||
      decoded !== url.pathname ||
      !destinations.test(url.pathname) ||
      url.pathname.includes('//') ||
      value.split(/[?#]/)[0] !== url.pathname
    )
      return '/dashboard';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/dashboard';
  }
}

export function signInPath(returnTo: unknown) {
  return `/login?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`;
}
