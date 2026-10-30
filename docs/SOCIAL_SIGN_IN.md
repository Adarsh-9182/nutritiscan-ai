# Google and GitHub sign-in

Both options use the existing FastAPI health account, root HttpOnly browser session and subscription identity. They are available on `/login` and the private health sign-in screen. `/account` supports explicitly linking a provider after a recent sign-in. Email/password remains independent.

## Configure the providers

Create or use OAuth applications owned by NutritiScan. Client secrets belong only on the existing Railway API service. Do not put them in `NEXT_PUBLIC_*`, source control or chat. This code does not create provider applications, accept provider terms, or invent credentials.

| Provider | Exact authorized callback | API service variables |
| --- | --- | --- |
| Google OAuth Web application | `https://www.nutritiscan.com/api/account/oauth/google/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| GitHub OAuth application | `https://www.nutritiscan.com/api/account/oauth/github/callback` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |

For Google, set the app homepage to `https://www.nutritiscan.com`, supply the site's privacy/terms links, and configure the consent screen for the intended audience. If left in Testing, only explicitly configured test users can sign in. Any Google publishing or verification requirements must be completed before claiming general availability. If retaining a native Google ID-token client, the API must validate the intended Web client audience; do not substitute an Android client ID.

For GitHub, set homepage `https://www.nutritiscan.com`, callback as above, and disable device-flow features that the app does not use. The login requests only `user:email`; it reads the stable user ID and verified primary email, with no repository permissions. GitHub requires a verified primary email; private email visibility is supported through the email API.

On the API, `HEALTH_ALLOWED_ORIGINS` must include `https://www.nutritiscan.com`. Other allowed origins do not automatically become OAuth callbacks registered with a provider. Use separate development apps/callbacks for local testing. On Vercel, `OAUTH_WEB_ORIGIN` defaults to `https://www.nutritiscan.com` in production and `http://localhost:3000` in development. Preview deployments deliberately cannot start a production-origin sign-in flow. The former browser-only `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is no longer needed by the web UI; client IDs are read from the API at runtime.

## Deploy and verify

1. Run `node scripts/migrate-account.mjs` with the existing site `DATABASE_URL`. It adds only the short-lived `ns_account_oauth_states` table. Local PGlite installs the same schema.
2. Deploy the API from `backend/`; its existing release command `python -m nutritiscan.migrate` adds `health_github_identities` and `health_oauth_link_intents`. Existing Google identities and accounts remain in their original tables. No account IDs, records or subscription owners are migrated.
3. Set the provider variables on the API, redeploy it, then deploy the web app. GET `/api/account/providers` reports runtime availability without exposing secrets. Buttons stay disabled with a setup/unavailable explanation until the API reports a configured provider.
4. Test each provider with an owner-controlled account: cancel consent, successful first sign-in, returning sign-in, logout and revoked-session rejection. Verify the intended workspace is restored. Provider end-to-end verification requires actual provider apps and an interactive owner login; mocked tests do not establish live OAuth availability.
5. For an existing email/password account, sign in with that method, open `/account`, and choose Link Google or Link GitHub within 15 minutes. Confirm it retains the same account ID, subscription and consent choices. A matching email alone never merges accounts. An identity owned by another account cannot be transferred by linking. Account deletion removes both provider identities and outstanding link intents; provider access/refresh tokens are never stored.

## Security and test boundaries

Both providers use authorization code flow with S256 PKCE. Google ID tokens additionally require the expected issuer, audience, verified email, expiry and nonce. The health service exchanges codes directly with fixed provider endpoints; redirect URIs must match its allowed front-end callback paths. No provider token or medical content is returned to the browser.

Starts require same-origin POST, strict input validation and rate limits. Random browser-bound state is stored for ten minutes, consumed atomically once and provider-bound. PKCE verifiers, nonces and narrow linking tickets are encrypted with an authenticated, domain-separated account key before persistence in Neon. Only the short-lived callback cookie uses SameSite=Lax; existing account/session cookies remain SameSite=Strict. Callback responses suppress referrers and cache storage. Return destinations are allowlisted.

Linking requires a short-lived, once-only API ticket bound to the original account, provider and active session. Logging out invalidates outstanding link authorization. Account linking never automatically grants health storage or AI-processing consent.

Checks: `npm run verify`, and `PYTHONPATH=backend python -m pytest backend/tests -q` plus `ruff check backend --select E9,F`. Tests cover forged/missing browser state, cross-provider state, expiration, replay/concurrent callbacks, encrypted persistence, unsafe redirects, nonce mismatch, unverified email, explicit linking, revoked/stale sessions and account ownership.

References: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Google token validation](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [GitHub OAuth web flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [GitHub verified email API](https://docs.github.com/en/rest/users/emails).
