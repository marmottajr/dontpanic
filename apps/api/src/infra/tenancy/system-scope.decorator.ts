import { SetMetadata } from '@nestjs/common';

export const SYSTEM_SCOPE_KEY = 'systemScope';

/**
 * Marks a route as needing to run **outside** tenant isolation.
 *
 * It exists for one legitimate, narrow case: authenticating someone requires
 * finding them by e-mail before you know which company they belong to, and
 * registering a new company happens when there is no tenant yet.
 *
 * Every route carrying this decorator is an exception to the isolation and
 * should be treated as such in review. On a business-data route it is a
 * security bug — `system-scope.decorator.spec.ts` keeps the list short and
 * fails if someone widens it without thinking.
 */
export const SystemScope = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SYSTEM_SCOPE_KEY, true);
