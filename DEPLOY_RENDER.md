# Manual Render deployment

## Create the service

1. Push this repository to GitHub without committing `.env`, `data/aegisdid.db`, or private keys.
2. In Render, create a **Web Service** from the repository.
3. Runtime: **Node**.
4. Build command: `npm install && npm run db:migrate && npm run db:seed && npm run build`.
5. Start command: `npm start`.
6. Health check path: `/api/health`.
7. Attach a persistent disk at `/opt/render/project/src/data`.

## Required environment variables

Set these in Render Environment, never in GitHub:

- `NODE_ENV=production`
- `AUTH_HASH_SALT`: random secret, at least 32 characters
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`: at least 10 characters
- `DATABASE_PATH=/opt/render/project/src/data/aegisdid.db`
- `MST_RPC_URL`
- `MST_PRIVATE_KEY`: server wallet private key, only if server-side MST anchoring is required
- `MST_CREDENTIAL_REGISTRY_ADDRESS`
- `AEGIS_TRUSTED_ISSUERS_JSON`: registered issuer DID to public JWK map, or `{}` until an issuer is onboarded

Optional:

- `GEMINI_API_KEY`
- `REDIS_URL`

The public client variables from `render.yaml` must be present at build time: `VITE_MST_CHAIN_ID`, `VITE_MST_NETWORK_NAME`, `VITE_MST_RPC_URL`, `VITE_MST_EXPLORER_URL`, `VITE_MST_CREDENTIAL_REGISTRY_ADDRESS`, `VITE_MST_MIN_NATIVE_BALANCE`, and `VITE_MST_FAUCET_URL`.

## After deploy

1. Open `/api/health` and confirm HTTP 200.
2. Register a normal account and sign in.
3. Confirm the account DID appears in Identity.
4. Open `/demo-verifier.html` and test the widget.
5. Confirm the request appears only in that account's ZK Apps activity.
6. Test the API with a backend-only `aegis_live_` key.

Do not put an API key or `MST_PRIVATE_KEY` in browser code, HTML, Vite `VITE_*` variables, or frontend hosting configuration.