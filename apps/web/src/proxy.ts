import { NextResponse, type NextRequest } from 'next/server';

// Next 16 renamed the "middleware" convention to "proxy".
// Pre-auth pages; everything else requires a session cookie.
const PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Coarse gate: presence of the access cookie. Real enforcement is the API;
  // the client silently refreshes on 401. (access_token is Path=/, so it's
  // visible here; the refresh_token is path-scoped to /api/auth.)
  const authed = req.cookies.has('access_token');
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!authed && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }
  if (authed && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.svg|.*\\..*).*)'],
};
