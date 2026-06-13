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

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${API_BASE}/api/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
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
