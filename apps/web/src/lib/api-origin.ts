export function apiOrigin() {
  const origin = new URL(
    process.env.API_INTERNAL_ORIGIN ?? 'http://127.0.0.1:4000',
  );
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error('Invalid API origin configuration');
  return origin;
}
