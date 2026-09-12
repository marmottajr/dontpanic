import { z } from 'zod';
import { tenantDtoSchema, tenantSlugSchema } from './tenant';
import { userDtoSchema } from './user';

/**
 * Social sign-in. Every provider is optional and off until configured, so a
 * fresh clone boots with none of them and the login screen simply has no
 * buttons.
 *
 * Shape of the flow, because the contract only makes sense against it:
 *
 *   GET  /auth/oauth/:provider/start      → 302 to the provider
 *   ←    /auth/oauth/:provider/callback   → 302 back into the web app
 *   POST /auth/oauth/complete-signup      → only when the callback could not
 *                                           finish on its own
 *
 * The callback finishes on its own in the two ordinary cases: the social
 * account is already linked, or its **verified** e-mail matches an existing
 * user (which links it). The third case — an e-mail nobody has — cannot finish,
 * because creating a company needs a name and a slug that no identity provider
 * has any way of knowing. So it parks the verified identity in a short-lived,
 * single-use ticket and sends the browser to a form. That is the one extra
 * step, and it exists so nobody ends up owning a company called
 * `joao-silva-gmail-com`.
 */

export const oauthProviders = ['google', 'apple', 'github'] as const;
export const oauthProviderSchema = z.enum(oauthProviders);
export type OAuthProvider = (typeof oauthProviders)[number];

/**
 * Why a callback bounced the user back to `/login` instead of signing them in.
 *
 * These reach the browser as `?error=<code>` and get translated there, so they
 * are codes and not sentences. They are also deliberately coarse: `failed`
 * covers a bad state cookie, a rejected code exchange and a provider outage
 * alike, because telling an attacker which of those happened only helps them
 * calibrate.
 *
 *  - `unverified_email` — the provider knows the address but has not confirmed
 *    it. Accepting it would let anyone who can create an account there claim a
 *    DontPanic user with that address.
 *  - `no_account`       — nothing to sign in to, and public signup is off.
 *  - `signup_disabled`  — same, said from the signup entry point.
 *  - `account_conflict` — the address exists but belongs to a company that
 *    cannot be joined this way (deleted, or a SUPERADMIN).
 *  - `provider_disabled`— the button was rendered for a provider the API does
 *    not have configured. Almost always the two halves of the env disagreeing.
 */
export const oauthErrorCodes = [
  'failed',
  'unverified_email',
  'no_account',
  'signup_disabled',
  'account_conflict',
  'provider_disabled',
] as const;
export const oauthErrorCodeSchema = z.enum(oauthErrorCodes);
export type OAuthErrorCode = (typeof oauthErrorCodes)[number];

/** Which providers this deployment actually has keys for. */
export const oauthProvidersResponseSchema = z.object({
  providers: z.array(oauthProviderSchema),
  /** Whether an unknown identity may go on to create a company. */
  signupEnabled: z.boolean(),
});
export type OAuthProvidersResponse = z.infer<typeof oauthProvidersResponseSchema>;

/**
 * What the "finish your registration" screen is allowed to know.
 *
 * Read with the ticket, never with a session — there is no account yet. The
 * e-mail is fixed and shown read-only: it came from the provider's verified
 * claim, and letting the form edit it would turn a verified identity into a
 * self-asserted one.
 */
export const oauthPendingRegistrationSchema = z.object({
  provider: oauthProviderSchema,
  email: z.string(),
  name: z.string().nullable(),
});
export type OAuthPendingRegistration = z.infer<typeof oauthPendingRegistrationSchema>;

/**
 * Finishing it. Mirrors `signupSchema` minus everything the provider already
 * proved: no e-mail (it is in the ticket) and no password (there is none — the
 * account signs in through the provider).
 */
export const completeOAuthSignupSchema = z.object({
  ticket: z.string().min(10).max(512),
  companyName: z.string().min(2).max(150),
  slug: tenantSlugSchema,
  taxId: z.string().max(40).optional(),
  companyPhone: z.string().max(30).optional(),
  name: z.string().min(2).max(150),
  acceptTerms: z.literal(true, { message: 'You must accept the terms of use' }),
});
export type CompleteOAuthSignupInput = z.infer<typeof completeOAuthSignupSchema>;

export const completeOAuthSignupResponseSchema = z.object({
  user: userDtoSchema,
  tenant: tenantDtoSchema,
});
export type CompleteOAuthSignupResponse = z.infer<typeof completeOAuthSignupResponseSchema>;

/** One linked social account, for the security section of the profile page. */
export const oauthAccountDtoSchema = z.object({
  provider: oauthProviderSchema,
  email: z.string().nullable(),
  linkedAt: z.string().datetime(),
});
export type OAuthAccountDto = z.infer<typeof oauthAccountDtoSchema>;
