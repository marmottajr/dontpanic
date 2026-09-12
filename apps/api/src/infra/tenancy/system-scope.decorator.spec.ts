import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Reflector } from '@nestjs/core';
import { SystemScope, SYSTEM_SCOPE_KEY } from './system-scope.decorator';

describe('SystemScope', () => {
  const reflector = new Reflector();

  it('marks a method', () => {
    class Routes {
      @SystemScope()
      login(): void {}
      list(): void {}
    }

    expect(reflector.get(SYSTEM_SCOPE_KEY, Routes.prototype.login)).toBe(true);
    expect(reflector.get(SYSTEM_SCOPE_KEY, Routes.prototype.list)).toBeUndefined();
  });

  it('marks a whole class', () => {
    @SystemScope()
    class PublicRoutes {}
    class ScopedRoutes {}

    expect(reflector.get(SYSTEM_SCOPE_KEY, PublicRoutes)).toBe(true);
    expect(reflector.get(SYSTEM_SCOPE_KEY, ScopedRoutes)).toBeUndefined();
  });

  it('keeps the list of routes that escape tenant isolation short and explicit', () => {
    // Every `@SystemScope()` is an exception to the isolation between
    // companies. This test fails when someone adds one — on purpose: the new
    // exception has to be justified in review and added here by hand.
    const root = join(__dirname, '..', '..');
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
          const source = readFileSync(full, 'utf8');
          const uses = source.match(/^\s*@SystemScope\(\)/gm);
          if (uses) found.push(`${relative(root, full)}:${uses.length}`);
        }
      }
    };
    walk(root);

    expect(found.sort()).toEqual([
      // The whole authentication surface, and only it: every one of these runs
      // before there is a tenant to derive a scope from. In order —
      // signup, verify-email, resend-verification, login, 2fa/verify,
      // refresh, forgot-password, reset-password. Anything authenticated
      // (logout, me, …) stays inside tenant isolation.
      'modules/auth/auth.controller.ts:8',

      // `POST auth/oauth/complete-signup`. A social identity nobody recognises
      // is finishing registration, which creates the company — so there is no
      // tenant yet, exactly as on `signup`. The `start` and `callback` routes
      // are NOT here: they open their own `asSystem` transaction inside the
      // service, which is narrower than marking the whole request.
      'modules/auth/oauth/oauth.controller.ts:1',

      // `GET auth/invitations/:token` and `POST auth/invitations/accept`. Both
      // run for someone with no session, and the tenant is the *result* of
      // resolving the token rather than an input to it — the same shape as
      // login, where the company is discovered from the e-mail. Neither route
      // reads anything the token did not name: the preview returns one
      // invitation, and the accept writes one user into the company that
      // invited them. The seat check inside accept re-enters tenant scope
      // deliberately (see InvitationsService.accept) instead of counting
      // across companies.
      'modules/invitations/public-invitations.controller.ts:2',
    ]);
  });
});
