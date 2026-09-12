-- ═══════════════════════════════════════════════════════════════════════════
-- Invitations and social sign-in.
--
-- Two ways into the system that did not exist before:
--   · an invitation, which is the only door into an EXISTING company;
--   · an OAuth identity, which is a second credential on a user.
--
-- Both tables carry `tenantId`, so `app.apply_tenant_rls()` at the bottom
-- protects them without anybody having to remember a policy. That call is the
-- whole reason a new table cannot be left out of the isolation by forgetfulness.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');
CREATE TYPE "OAuthProviderName" AS ENUM ('GOOGLE', 'APPLE', 'GITHUB');

-- ── A password is now optional ─────────────────────────────────────────────
-- An account that only ever signs in through Google/Apple/GitHub has no
-- password to store. Storing a random hash instead would be a lie the code
-- could not distinguish from a real credential.
--
-- Existing rows are unaffected: dropping NOT NULL widens the column, so this is
-- reversible in the only direction that matters (no data is rewritten) and no
-- account loses the ability to sign in with what it already has.
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- ── Invitations ────────────────────────────────────────────────────────────
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "profileId" UUID,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" UUID,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" UUID,
    "revokedAt" TIMESTAMP(3),
    "resentCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");
CREATE INDEX "invitations_tenantId_idx" ON "invitations"("tenantId");
CREATE INDEX "invitations_tenantId_status_idx" ON "invitations"("tenantId", "status");
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- At most one LIVE invitation per address per company.
--
-- A partial index, because the constraint only applies to PENDING rows: after
-- an invitation is accepted or revoked the same person may legitimately be
-- invited again, and a plain UNIQUE(tenantId, email) would refuse that forever.
-- Prisma's schema language cannot express a partial index, which is why this
-- lives here and is documented on the model.
--
-- It also closes the race the service's pre-check cannot: two admins inviting
-- the same colleague at the same moment both see "no pending invitation" and
-- both insert. Postgres refuses the second, and the service translates it.
CREATE UNIQUE INDEX "invitations_tenant_email_pending_key"
  ON "invitations"("tenantId", "email")
  WHERE "status" = 'PENDING';

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_acceptedUserId_fkey"
  FOREIGN KEY ("acceptedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Linked social accounts ─────────────────────────────────────────────────
CREATE TABLE "oauth_accounts" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "userId" UUID NOT NULL,
    "provider" "OAuthProviderName" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- The identity is the key: one Google account is one person. Matching on the
-- provider's immutable subject id and not on the e-mail is what stops a
-- recycled address from handing someone else's account to a new owner.
CREATE UNIQUE INDEX "oauth_accounts_provider_providerAccountId_key"
  ON "oauth_accounts"("provider", "providerAccountId");
CREATE UNIQUE INDEX "oauth_accounts_userId_provider_key"
  ON "oauth_accounts"("userId", "provider");
CREATE INDEX "oauth_accounts_userId_idx" ON "oauth_accounts"("userId");
CREATE INDEX "oauth_accounts_tenantId_idx" ON "oauth_accounts"("tenantId");

ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Isolation ──────────────────────────────────────────────────────────────
-- Both new tables have a `tenantId`, so the sweep finds and protects them.
-- Never end a migration that creates a table without this line.
SELECT app.apply_tenant_rls();
