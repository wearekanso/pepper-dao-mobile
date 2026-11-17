/**
 * Response helpers shared by the Edge Functions.
 */

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info, x-sync-secret',
};

/** JSON response with CORS headers */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Answer for a CORS preflight request */
export function preflight(): Response {
  return new Response(null, { headers: CORS_HEADERS });
}
