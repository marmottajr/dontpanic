# create-dontpanic

## 0.3.0

### Minor Changes

- Three ways into the system, and a switch for the one that already existed.

  **Public registration is now optional.** `PUBLIC_SIGNUP_ENABLED` (default `true`, preserving the
  behaviour a clone has always had) decides whether a stranger can create a company from the form.
  Off, the ways in are an invitation and the seed — which is what an internal deployment or a
  sales-led product wants. `NEXT_PUBLIC_SIGNUP_ENABLED` must agree, exactly like the captcha halves.

  **Invitations** are now the only door into a company that already exists. This replaces a flow in
  which an administrator typed a colleague's password and the account was written `emailVerified:
true` on the administrator's word — wrong twice over, because two people knew the credential and
  the address was never proven. The invitee now sets their own password, and the click on the mailed
  link is what proves the address. `POST /admin/invitations` and friends, plus the public
  `GET /auth/invitations/:token` and `POST /auth/invitations/accept`.

  **The platform operator can create a company** (`POST /platform/tenants`) and the first
  administrator is _invited_, never given a password.

  **Social sign-in** for Google, Apple and GitHub, each optional and off until configured. An
  identity nobody recognises goes through a short "finish your registration" step, because creating a
  company needs a name and a slug no identity provider can know. The API refuses to boot if a listed
  provider is missing a credential.

  Breaking for anyone scaffolding on top of the previous template: `POST /admin/users` and
  `adminCreateUserSchema` are gone (use the invitation flow), and `User.passwordHash` is now nullable
  — an account that only signs in through a provider has no password. Password login on such an
  account returns the ordinary invalid-credentials error and pays the same Argon2 cost, so response
  timing cannot enumerate which addresses are social-only.
