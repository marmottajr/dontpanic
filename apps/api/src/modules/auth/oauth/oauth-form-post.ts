import type { FastifyInstance } from 'fastify';

/**
 * Apple's callback is a cross-site POST, and two pieces of the bootstrap have
 * to know about it. Both live here so the exception is one import in main.ts
 * and one place to read when someone asks why it exists.
 *
 * The route itself is `/api/auth/oauth/:provider/callback` — the global `api`
 * prefix included, because this runs at the Fastify level, below Nest's router.
 */
const FORM_POST_CALLBACK = /^\/api\/auth\/oauth\/[a-z0-9-]+\/callback\/?$/i;

export function isOAuthFormPostCallback(method: string, url: string): boolean {
  if (method.toUpperCase() !== 'POST') return false;
  return FORM_POST_CALLBACK.test(url.split('?')[0] ?? '');
}

/**
 * Teach Fastify to read Apple's body — and only Apple's.
 *
 * Fastify parses JSON and text out of the box and answers 415 to anything else,
 * which is a sensible default and exactly wrong for `response_mode=form_post`:
 * Apple sends `application/x-www-form-urlencoded` and the handler never runs.
 *
 * The parser refuses every other route on purpose. A blanket urlencoded parser
 * would make every mutation reachable from a plain cross-origin HTML form —
 * still blocked by the CSRF hook, but it is the sort of margin worth keeping
 * rather than spending.
 */
export function registerOAuthFormPostParser(fastify: FastifyInstance): void {
  fastify.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (req, body, done) => {
      if (!isOAuthFormPostCallback(req.method, req.url)) {
        done(Object.assign(new Error('Unsupported Media Type'), { statusCode: 415 }), undefined);
        return;
      }
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    },
  );
}

/**
 * Whether the double-submit CSRF check must be skipped for this request.
 *
 * It must, for this one route, and there is no way around it: the POST is
 * issued by appleid.apple.com, which has no way to know our CSRF token and no
 * reason to. Enforcing the check there would 403 every Apple sign-in.
 *
 * What replaces it is not nothing. The OAuth `state` parameter is this flow's
 * CSRF defence by design — a random value stored in an httpOnly, short-lived,
 * path-scoped cookie and compared on arrival, with a mismatch or a missing
 * cookie ending the flow. Anyone forging this POST would have to guess it.
 *
 * Narrow on purpose: method AND path. Widening it to, say, the whole
 * `/api/auth/oauth` prefix would take `complete-signup` — a route that creates
 * a company — out of CSRF protection too.
 */
export function skipsCsrf(method: string, url: string): boolean {
  return isOAuthFormPostCallback(method, url);
}
