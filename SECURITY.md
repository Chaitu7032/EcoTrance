# EcoTrace security guide

## Security boundary

EcoTrace is a server-backed application. SerpApi, Groq, database credentials, and all other secrets belong only to the backend. The frontend receives audit results and public source URLs, never provider credentials.

## Secrets

- Keep secrets in `backend/.env` or a deployment secret manager.
- Never commit `.env`, `.env.local`, database URLs, API keys, bearer tokens, or production logs.
- `.gitignore` already excludes local environment files, logs, build output, and local PostgreSQL data.
- Rotate a credential immediately if it appears in chat, screenshots, logs, source control, or an issue.
- Use separate development and production keys with the smallest provider permissions available.

Required secret variables include `SERPAPI_KEY`, `GROQ_API_KEY`, and the database connection string. `GEMINI_API_KEY` is supported by configuration but is not required for the current audit path.

## API protections

The Express app currently:

- disables `x-powered-by`;
- enables Helmet security headers;
- restricts CORS to `FRONTEND_URL`;
- limits JSON request bodies to 1 MB;
- applies a 120-request-per-minute API rate limit;
- validates audit request bodies with Zod;
- uses parameterized PostgreSQL queries through the repository layer;
- returns generic 500 responses in production while retaining detailed server-side logs.

Do not expose the backend directly to the public internet without TLS, a reverse proxy, and an appropriate production rate-limit strategy. If the app is deployed behind a proxy, configure trusted proxy behavior deliberately before relying on IP-based rate limiting.

## Provider and LLM safety

Provider requests are made server-side. Authorization headers are never sent to the browser. Logs redact API-key-shaped fields, authorization headers, database URLs, and configured provider key values.

LLM prompts contain retrieved public evidence only. Do not put credentials, private customer information, internal instructions, or database records into evidence snippets. The model is instructed not to invent sources, dates, facts, or unsupported claims. Structured output is validated before it affects the evidence model.

LLM and SerpApi limits are security and availability controls. Do not bypass `CreditManager`, cache checks, request deduplication, prompt-size checks, TPM checks, or retry limits.

## Data protection

Treat audit input, company names, source URLs, snippets, claims, and exports as potentially sensitive business research. Restrict database access to the application role, require TLS for remote PostgreSQL, and use encrypted managed storage in production. Do not expose raw database errors or provider responses through the API.

The UI should display safe outcome labels such as `Provider unavailable` or `Search configuration issue`, not stack traces, raw HTTP responses, or provider JSON.

## Deployment checklist

- Set `NODE_ENV=production`.
- Use a strong, private database credential and TLS-enabled connection.
- Set an explicit production `FRONTEND_URL`; do not use `*` CORS.
- Use HTTPS for frontend, API, database, and provider connections.
- Store secrets in the platform secret manager.
- Keep dependencies updated and review lockfile changes.
- Run `npm test`, `npm run lint`, and `npm run typecheck` in CI.
- Restrict PostgreSQL network access to the backend.
- Configure log retention and access controls; logs may contain research queries and URLs.
- Back up the database and test restoration.
- Monitor rate-limit responses, provider failures, authentication failures, and abnormal audit volume.

## Incident response

1. Revoke and rotate the affected provider/database credential.
2. Preserve relevant timestamps, audit IDs, request IDs, and safe logs without copying secrets.
3. Identify whether the exposure was source control, logs, browser output, or a third-party provider.
4. Remove the secret from the exposure source and invalidate cached copies where possible.
5. Review provider, database, and application access logs.
6. Patch the cause, deploy, and document the incident.

## Reporting

Report suspected vulnerabilities privately to the project owner. Include the affected route or component, reproduction steps, impact, and a minimal proof of concept. Do not include live credentials or personal data.
