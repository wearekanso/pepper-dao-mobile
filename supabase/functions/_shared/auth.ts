/**
 * Access checks shared by the Edge Functions.
 */

/**
 * True when the request carries this project's service role key, which only
 * server code has. Every app user has a JWT through anonymous sign-in, so a
 * JWT alone never counts.
 */
export function isServiceRequest(req: Request): boolean {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = bearerToken(req);
  return !!serviceKey && !!token && timingSafeEqual(token, serviceKey);
}

/** True when `header` holds the value of the `secretEnvName` function secret */
export function hasSharedSecret(req: Request, header: string, secretEnvName: string): boolean {
  const secret = Deno.env.get(secretEnvName);
  const value = req.headers.get(header);
  return !!secret && !!value && timingSafeEqual(value, secret);
}

/** The token from `Authorization: Bearer <token>`, if any */
export function bearerToken(req: Request): string | null {
  return req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || null;
}

/** Constant-time string comparison, so a wrong guess leaks no timing */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
