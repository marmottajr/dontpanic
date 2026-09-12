import { z } from 'zod';
import { paginationQuerySchema } from './common';
import { emailSchema, passwordSchema } from './primitives';
import { RoleEnum } from './user';

/**
 * Invitations — the only way into an existing company.
 *
 * Public signup creates a company and its first administrator; everyone else
 * arrives here. The shape below is deliberately the *same* whether the invite
 * was sent by a company ADMIN (adding a colleague) or by the platform operator
 * (handing over a company it just created), because the person receiving it
 * cannot tell the difference and should not have to.
 *
 * What is NOT in this contract, on purpose:
 *
 *  - the raw token. It is generated server-side, mailed once, and only its
 *    SHA-256 hash is stored — same discipline as password reset. It appears in
 *    a URL and in `acceptInvitationSchema`, never in a listing.
 *  - a `tenantId`. It comes from the inviter's JWT or from the platform scope;
 *    accepting one comes from the token. A client-supplied tenant here would be
 *    an invitation to join a company you were not invited to.
 */

export const invitationStatuses = ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] as const;
export const invitationStatusSchema = z.enum(invitationStatuses);
export type InvitationStatus = (typeof invitationStatuses)[number];

/**
 * Sending an invite. No password field: the whole point is that the invitee
 * chooses their own credential and the inviter never learns it.
 *
 * `role` is capped at ADMIN by the API — a company ADMIN inviting a SUPERADMIN
 * would be a privilege escalation out of the tenant, so the schema refuses the
 * value rather than relying on a guard remembering to check.
 */
export const createInvitationSchema = z.object({
  email: emailSchema,
  /** Optional courtesy: pre-fills the accept form. The invitee can change it. */
  name: z.string().min(2).max(150).optional(),
  role: z.enum(['ADMIN', 'USER']).default('USER'),
  /** Which permission profile the new user lands on. Null = the tenant default. */
  profileId: z.string().uuid().nullish(),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

/**
 * What a listing shows. `status` is computed, not stored: a PENDING row past
 * its `expiresAt` reports EXPIRED, so the UI never offers "resend" on something
 * the API would refuse.
 */
export const invitationDtoSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string().nullable(),
  role: RoleEnum,
  profileId: z.string().uuid().nullable(),
  profileName: z.string().nullable(),
  status: invitationStatusSchema,
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  invitedByName: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type InvitationDto = z.infer<typeof invitationDtoSchema>;

export const invitationListQuerySchema = paginationQuerySchema.extend({
  status: invitationStatusSchema.optional(),
});
export type InvitationListQuery = z.infer<typeof invitationListQuerySchema>;

/**
 * The unauthenticated preview behind `/invite/<token>`.
 *
 * It answers exactly one question — "is this link still good, and what am I
 * joining?" — and nothing more. No inviter e-mail, no user count, no company
 * id: the token travels in a URL through mail clients and proxies, so treat
 * everything it unlocks as semi-public. The invitee's own e-mail is included
 * because they already know it and the accept form has to show which address
 * the account will carry.
 */
export const invitationPreviewSchema = z.object({
  email: z.string(),
  name: z.string().nullable(),
  tenantName: z.string(),
  expiresAt: z.string().datetime(),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

/**
 * Accepting. The token proves the invitation; the password creates the account.
 *
 * `acceptTerms` is `literal(true)` for the same reason it is on signup: an
 * unchecked box must fail validation rather than quietly record a refusal as an
 * acceptance. An invited user accepts the terms exactly like a self-serve one —
 * their company having accepted them earlier is the company's act, not theirs.
 */
export const acceptInvitationSchema = z.object({
  token: z.string().min(10).max(512),
  name: z.string().min(2).max(150),
  password: passwordSchema,
  acceptTerms: z.literal(true, { message: 'You must accept the terms of use' }),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
