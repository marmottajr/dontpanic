import { NextResponse, type NextRequest } from 'next/server';

// Next 16 renamed the "middleware" convention to "proxy".

/**
 * Pre-auth pages: for people who do NOT have a session. Someone already signed
 * in has no business on the login screen, so they get sent home.
 */
const PRE_AUTH_PREFIXES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  // Accepting an invitation IS a registration — it creates the account and
  // signs it in — so it belongs with `/signup` and not with the open pages.
  // Someone who already has a session and opens an invite link is sent home
  // rather than shown a form that would build a second account under the first
  // one's cookies.
  '/invite',
];

/**
 * Open to everyone, signed in or not — a different idea from "pre-auth", and
 * the distinction matters: putting the terms page in the list above would bounce
 * a logged-in reader to the dashboard, which is the opposite of what a document
 * anyone may read at any time should do.
 */
const OPEN_PREFIXES = ['/termos', '/privacidade'];

const matches = (prefixes: string[], pathname: string): boolean =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Coarse gate: presence of the access cookie. Real enforcement is the API;
  // the client silently refreshes on 401. (access_token is Path=/, so it's
  // visible here; the refresh_token is path-scoped to /api/auth.)
  const authed = req.cookies.has('access_token');

  // Checked first, and by exact match only where it has to be: '/' cannot be a
  // prefix, because `'/anything'.startsWith('/')` is true and would switch the
  // whole gate off.
  if (matches(OPEN_PREFIXES, pathname)) return NextResponse.next();

  const isPreAuth = matches(PRE_AUTH_PREFIXES, pathname);

  if (!authed && !isPreAuth) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }
  if (authed && isPreAuth) {
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
