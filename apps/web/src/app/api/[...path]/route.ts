import { type NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BFF reverse-proxy. The browser only ever calls same-origin /api/*; this
 * handler forwards to the backend (server-side), relaying cookies and
 * Set-Cookie both ways. Keeps the API host private and httpOnly auth cookies
 * scoped to the web origin.
 */
const API_BASE = process.env.API_INTERNAL_URL ?? 'http://localhost:4201';
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'content-encoding',
  'host',
]);

/**
 * Header carrying the real client IP, and how many proxy hops in front of THIS
 * app are trusted to have written it. Deployment-specific — see the table in
 * CLAUDE.md ("Rate limit e IP do cliente").
 *
 * Hops of 0 (the default) means "nothing in front of me": no header is
 * believed, and the API rate-limits everyone behind this app as one client.
 * Restrictive but never bypassable — the safe thing to be wrong about.
 */
const CLIENT_IP_HEADER = (process.env.CLIENT_IP_HEADER ?? 'x-forwarded-for').toLowerCase();
const CLIENT_IP_TRUSTED_HOPS = Number.parseInt(process.env.CLIENT_IP_TRUSTED_HOPS ?? '0', 10) || 0;

/**
 * Forwarding headers a browser must never dictate. `fetch()` can set all of
 * these — none is on the forbidden-header list — and downstream they decide
 * which rate-limit bucket the request lands in. Dropped on the way in; a single
 * trusted x-forwarded-for is re-added below.
 */
const CLIENT_CONTROLLED = new Set([
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'forwarded',
  'cf-connecting-ip',
  'true-client-ip',
  'x-client-ip',
  'x-cluster-client-ip',
  'fastly-client-ip',
  'fly-client-ip',
  'x-vercel-forwarded-for',
]);

/**
 * Resolve the client IP, counting from the RIGHT. Load balancers append rather
 * than replace, so on `X-Forwarded-For: <forged>, <real>` the leftmost entry is
 * whatever the caller typed and the rightmost entries are the ones our own
 * infrastructure wrote. Single-value headers (x-real-ip, cf-connecting-ip) have
 * one entry and land on it either way.
 */
function resolveClientIp(req: NextRequest): string | null {
  if (CLIENT_IP_TRUSTED_HOPS < 1) return null;
  const raw = req.headers.get(CLIENT_IP_HEADER);
  if (!raw) return null;
  const hops = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return hops[Math.max(0, hops.length - CLIENT_IP_TRUSTED_HOPS)] ?? null;
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${API_BASE}/api/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (!HOP_BY_HOP.has(k) && !CLIENT_CONTROLLED.has(k)) headers.set(key, value);
  });
  const clientIp = resolveClientIp(req);
  if (clientIp) headers.set('x-forwarded-for', clientIp);
  headers.set('x-forwarded-host', req.nextUrl.host);
  headers.set('x-forwarded-proto', req.nextUrl.protocol.replace(':', ''));

  const method = req.method.toUpperCase();
  const init: RequestInit & { duplex?: 'half' } = { method, headers, redirect: 'manual' };
  if (method !== 'GET' && method !== 'HEAD') {
    const body = await req.arrayBuffer();
    if (body.byteLength > 0) {
      init.body = body;
      init.duplex = 'half';
    }
  }

  const upstream = await fetch(target, init);

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (!HOP_BY_HOP.has(k) && k !== 'set-cookie') out.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie?.() ?? []) out.append('set-cookie', cookie);

  const payload = await upstream.arrayBuffer();
  return new Response(payload, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
