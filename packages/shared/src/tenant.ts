import { z } from 'zod';
import { captchaTokenSchema } from './auth';
import { paginationQuerySchema } from './common';
import { passwordSchema } from './primitives';
import { userDtoSchema } from './user';

/**
 * Tenancy contracts: public company signup with a trial, managing your own
 * company, and the platform operator's panel.
 *
 * Deliberately locale-neutral. Fields like `taxId` and `phone` are plain
 * strings here; validate them with the optional locale module
 * (`@dontpanic/shared/locale/br`) when your product is market-specific.
 */

export const tenantStatuses = ['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELED'] as const;
export const tenantStatusSchema = z.enum(tenantStatuses);
export type TenantStatus = (typeof tenantStatuses)[number];

/**
 * The slug identifies a company in URLs. Lowercase, digits and hyphen, never
 * starting or ending in a hyphen. Reserved names are refused by the API.
 */
export const tenantSlugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Use lowercase letters, digits and hyphens only',
  });

/** Slugs no company may take, because they collide with our own routes. */
export const RESERVED_TENANT_SLUGS = [
  'admin',
  'api',
  'app',
  'www',
  'mail',
  'ftp',
  'blog',
  'help',
  'support',
  'status',
  'docs',
  'login',
  'signup',
  'register',
  'auth',
  'dashboard',
  'settings',
  'billing',
  'static',
  'assets',
  'public',
  'superadmin',
  'root',
  'system',
  'null',
  'undefined',
] as const;

/** Postal address, kept generic — no country's format is assumed. */
export const tenantAddressSchema = z.object({
  postalCode: z.string().max(20).nullish(),
  street: z.string().max(150).nullish(),
  number: z.string().max(20).nullish(),
  complement: z.string().max(100).nullish(),
  district: z.string().max(100).nullish(),
  city: z.string().max(100).nullish(),
  state: z.string().max(100).nullish(),
  country: z.string().max(2).nullish(),
});
export type TenantAddress = z.infer<typeof tenantAddressSchema>;

export const signupSchema = z.object({
  // The company
  companyName: z.string().min(2).max(150),
  slug: tenantSlugSchema,
  taxId: z.string().max(40).optional(),
  companyPhone: z.string().max(30).optional(),
  // The person signing up — becomes the first user, with the ADMIN profile
  name: z.string().min(2).max(150),
  email: z.string().email().max(255),
  password: passwordSchema,
  // Literal `true`, not a boolean: an unchecked box must fail validation rather
  // than quietly record a refusal as an acceptance.
  acceptTerms: z.literal(true, { message: 'You must accept the terms of use' }),
  captchaToken: captchaTokenSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const tenantDtoSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  legalName: z.string().nullable(),
  taxId: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  status: tenantStatusSchema,
  trialEndsAt: z.string().datetime().nullable(),
  planId: z.string().uuid().nullable(),
  planName: z.string().nullable(),
  locale: z.string(),
  currency: z.string(),
  timezone: z.string(),
  createdAt: z.string().datetime(),
});
export type TenantDto = z.infer<typeof tenantDtoSchema>;

/** Signup response: the company created and its first user. */
export const signupResponseSchema = z.object({
  user: userDtoSchema,
  tenant: tenantDtoSchema,
});
export type SignupResponse = z.infer<typeof signupResponseSchema>;

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  legalName: z.string().max(150).nullish(),
  taxId: z.string().max(40).nullish(),
  phone: z.string().max(30).nullish(),
  address: tenantAddressSchema.partial().optional(),
  timezone: z.string().max(60).optional(),
  locale: z.string().max(10).optional(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const tenantBrandingSchema = z.object({
  logoUrl: z.string().url().nullish(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  typography: z.string().max(60).nullish(),
  documentFooter: z.string().max(2000).nullish(),
});
export type TenantBrandingInput = z.infer<typeof tenantBrandingSchema>;

export const tenantBrandingDtoSchema = tenantBrandingSchema.extend({
  logoUrl: z.string().nullable(),
  typography: z.string().nullable(),
  documentFooter: z.string().nullable(),
  updatedAt: z.string().datetime(),
});
export type TenantBrandingDto = z.infer<typeof tenantBrandingDtoSchema>;

export const planDtoSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  priceCents: z.number().int(),
  currency: z.string(),
  trialDays: z.number().int(),
  maxUsers: z.number().int().nullable(),
  /**
   * Commercial metadata, not a limit the API enforces — the same status
   * `priceCents` and `trialDays` have. Show it as part of what the plan
   * offers; do not write a screen that implies an upload will be refused,
   * because nothing refuses it. See the note on `Plan.maxStorageMb` in the
   * Prisma schema for what enforcing it would take.
   */
  maxStorageMb: z.number().int().nullable(),
  active: z.boolean(),
});
export type PlanDto = z.infer<typeof planDtoSchema>;

/**
 * How much of the plan is already spent — what the app needs to warn **before**
 * the user hits a limit, and to explain what to do when they do.
 *
 * A `null` limit means unlimited. `used` counts what exists right now.
 */
export const planUsageEntrySchema = z.object({
  used: z.number().int(),
  limit: z.number().int().nullable(),
});
export type PlanUsageEntry = z.infer<typeof planUsageEntrySchema>;

export const planUsageDtoSchema = z.object({
  planCode: z.string(),
  planName: z.string(),
  users: planUsageEntrySchema,
  /** Product-specific counters declared in `Plan.limits`, keyed by name. */
  resources: z.record(z.string(), planUsageEntrySchema),
  /**
   * Whether the plan allows being signed in on more than one device at a time.
   * When false, signing in somewhere drops the other session — which is what
   * stops a whole team sharing one basic-plan account.
   */
  concurrentSessions: z.boolean(),
});
export type PlanUsageDto = z.infer<typeof planUsageDtoSchema>;

export const suspendTenantSchema = z.object({
  reason: z.string().min(3).max(500),
});
export type SuspendTenantInput = z.infer<typeof suspendTenantSchema>;

export const extendTrialSchema = z.object({
  days: z.number().int().min(1).max(365),
});
export type ExtendTrialInput = z.infer<typeof extendTrialSchema>;

export const changePlanSchema = z.object({
  planId: z.string().uuid(),
});
export type ChangePlanInput = z.infer<typeof changePlanSchema>;

// ── Platform operator panel (`/api/platform/*`) ──────────────────────────────

export const platformTenantListQuerySchema = paginationQuerySchema.extend({
  status: tenantStatusSchema.optional(),
});
export type PlatformTenantListQuery = z.infer<typeof platformTenantListQuerySchema>;

export const platformTenantDtoSchema = tenantDtoSchema.extend({
  userCount: z.number().int(),
  suspendedAt: z.string().datetime().nullable(),
  suspendedReason: z.string().nullable(),
  canceledAt: z.string().datetime().nullable(),
});
export type PlatformTenantDto = z.infer<typeof platformTenantDtoSchema>;

/**
 * The operator creating a company on someone's behalf — a sale closed over the
 * phone, an onboarding done for a customer who will never see the signup form.
 *
 * Two things separate it from `signupSchema`, and both are the point:
 *
 *  - **No password.** The operator names the first administrator; the system
 *    invites them. Nobody at the vendor ever knows a customer's credential, and
 *    the address gets proven by the acceptance instead of being taken on faith.
 *  - **The commercial terms are inputs.** Plan, status and trial length are
 *    decisions the operator is making here, not defaults derived from whichever
 *    plan happens to carry `isDefault`.
 */
export const platformCreateTenantSchema = z.object({
  companyName: z.string().min(2).max(150),
  slug: tenantSlugSchema,
  legalName: z.string().max(150).nullish(),
  taxId: z.string().max(40).nullish(),
  /** Billing/contact address for the company itself, not the administrator's. */
  email: z.string().email().max(255),
  phone: z.string().max(30).nullish(),
  planId: z.string().uuid().nullish(),
  /** Only the two a company can legitimately start life in. */
  status: z.enum(['TRIAL', 'ACTIVE']).default('TRIAL'),
  /** Overrides the plan's own `trialDays`. Ignored unless status is TRIAL. */
  trialDays: z.number().int().min(0).max(365).optional(),
  locale: z.string().max(10).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().max(60).optional(),
  /** The first administrator, who receives the invitation. */
  adminEmail: z.string().email().max(255),
  adminName: z.string().min(2).max(150),
  /**
   * Create the company without mailing anyone. For imports and for a customer
   * being set up ahead of a kickoff call — the invite can be sent later from
   * the company's detail page.
   */
  sendInvitation: z.boolean().default(true),
});
export type PlatformCreateTenantInput = z.infer<typeof platformCreateTenantSchema>;

/** What the operator gets back: the company, and whether the invite went out. */
export const platformCreateTenantResponseSchema = z.object({
  tenant: platformTenantDtoSchema,
  invitationSent: z.boolean(),
});
export type PlatformCreateTenantResponse = z.infer<typeof platformCreateTenantResponseSchema>;

export const upsertPlanSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Use lowercase letters, digits and hyphens' }),
  name: z.string().min(2).max(80),
  description: z.string().max(500).nullish(),
  priceCents: z.number().int().min(0),
  currency: z.string().length(3),
  trialDays: z.number().int().min(0).max(365),
  maxUsers: z.number().int().min(1).nullish(),
  maxStorageMb: z.number().int().min(1).nullish(),
  limits: z.record(z.string(), z.number().int().min(0)).optional(),
  features: z.record(z.string(), z.boolean()).optional(),
  sortOrder: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});
export type UpsertPlanInput = z.infer<typeof upsertPlanSchema>;

/** What the operator sees on the panel's front page. */
export const platformStatsDtoSchema = z.object({
  tenants: z.record(tenantStatusSchema, z.number().int()),
  totalTenants: z.number().int(),
  totalUsers: z.number().int(),
  /** Signups per day over the requested window, oldest first. */
  signups: z.array(z.object({ date: z.string(), count: z.number().int() })),
});
export type PlatformStatsDto = z.infer<typeof platformStatsDtoSchema>;
