# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately via GitHub Security Advisories
(**Security → Report a vulnerability** on the repository) or by email to
**marcio@camposmotta.com.br**. Include:

- a description of the issue and its impact,
- steps to reproduce (a proof-of-concept if possible),
- affected version/commit.

You'll get an acknowledgement within **72 hours**. We aim to ship a fix or a
mitigation plan within **30 days**, and we'll credit you (if you want) once it's
resolved.

## Supported versions

This is a boilerplate template — security fixes land on `main`. Projects
generated from it should track `main` for patches.

## Scope notes

DontPanic ships hardened defaults (Argon2, JWT rotation + reuse detection, CSRF,
rate limiting, 2FA, helmet/CSP). If you find a place where a generated app is
insecure **by default**, that's in scope and we want to hear about it.
