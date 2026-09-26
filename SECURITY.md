# Security boundary

The production Worker is intended to be reached only through the configured
OpenAI Sites gateway and the allowlisted custom domains in
`worker/request-security.ts`. Requests for any other host, including a direct
`workers.dev` hostname, are rejected before application routing.

The `oai-authenticated-user-email` header is therefore treated as trusted only
when both conditions hold:

1. the request URL uses an allowlisted gateway/custom hostname; and
2. the normalized email is present in the production secret
   `SNTSS_OWNER_EMAILS`.

That identity can bootstrap an owner login, but the bootstrap immediately
creates a normal database-backed privileged session. All later authorization
uses that session rather than the forwarded email alone.

Regression coverage in `tests/request-security.test.mjs` rejects direct Worker
hosts. `tests/security-hardening.test.mjs` verifies that the owner list is not
hardcoded, authorization stays centralized, credential tokens are not logged,
and DeVi cannot select a matrícula outside the active session.
