# AegisDID API

Base URL: `http://localhost:3000`

## Database

Server-side records use SQLite through Drizzle ORM. Set `DATABASE_PATH` to override the default `./data/aegisdid.db`. Apply tracked migrations with `npm run db:migrate`; this also imports legacy `data/auth.json` records once and skips existing IDs on repeat runs. Seed the first administrator once with `ADMIN_EMAIL` and `ADMIN_PASSWORD` using `npm run db:seed`.

Protected AI routes accept either the HttpOnly `aegis_session` cookie created by login or an API key header:

```http
Authorization: Bearer aegis_live_...
```

API keys are displayed once at creation and stored only as hashes.

## Authentication

### Register

```http
POST /api/auth/register
Content-Type: application/json

{"email":"judge@example.com","password":"a-strong-password"}
```

Password must be at least 10 characters. Returns `201` and sets an HttpOnly session cookie.

### Login

```http
POST /api/auth/login
Content-Type: application/json

{"email":"judge@example.com","password":"a-strong-password"}
```

Returns `200`. Five failed attempts per email/IP are allowed per 15-minute window; further attempts return `429`.

### Current session

```http
GET /api/auth/me
```

Returns `{ "authenticated": false }` or the authenticated user and API-key metadata.

### Logout

```http
POST /api/auth/logout
```

Invalidates the current session and returns `204`.

## API keys

### Create a key

Requires a session cookie.

```http
POST /api/auth/api-keys
Content-Type: application/json

{"name":"My verifier integration"}
```

Returns `201` with the raw `apiKey` once and non-secret metadata. Only the authenticated owner can revoke it.

### Revoke a key

```http
DELETE /api/auth/api-keys/:keyId
```

Returns `204` when the key belongs to the authenticated user.

## Wallets, transactions, and roles

`POST /api/auth/wallet` links the authenticated account to an EIP-1193 wallet address. A wallet can belong to only one account.

`POST /api/transactions` accepts a transaction type and hash after a browser wallet confirms it. The server verifies the receipt, sender, registry target, and success status against `MST_RPC_URL` before storing it. `GET /api/transactions` returns only the current user's records; administrators may request a specific `userId`.

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first server start to seed one admin account. Admin routes are under `/api/admin/*` and require the authenticated session role.

The updated `contracts/AegisCredentialRegistry.sol` is deployed on MST testnet at `0x8ea34e36670557A552c25F37A81b895Ca0535F6c`. DID registration, credential anchoring, and audit logging are public wallet-signed writes; only revocation and caller authorization are owner-only. The deployment script is `npm run deploy:registry`.

## Public presentation verification

`POST /api/public/verify-presentation` is unauthenticated, CORS-enabled, and rate-limited by IP. It reuses the server's cryptographic presentation checks and returns the holder DID, valid revealed claims, and verification time.

```bash
curl -X POST http://localhost:3000/api/public/verify-presentation \
  -H "Content-Type: application/json" \
  --data @presentation.json
```

## Integrate AegisDID on your site

Load the hosted widget once and add a button with a credential requirement. Multiple requirements are comma-separated. The popup always asks the user to approve, verifies the redacted presentation server-side, and sends the result only back to the requesting origin.

```html
<button id="age-check" data-aegisdid="verify" data-require="ProofOfAgeCredential:age>=18">
  Verify age with AegisDID
</button>
<script src="https://your-aegisdid-domain.example/widget/aegisdid-verify.js"></script>
<script>
  document.getElementById('age-check').addEventListener('aegisdid:verified', function (event) {
    console.log(event.detail);
    // { type: 'AEGISDID_VERIFY_RESULT', valid: true, holderDid, revealedClaims, presentation }
  });
  document.getElementById('age-check').addEventListener('aegisdid:rejected', function () {
    console.log('The user rejected the request.');
  });
</script>
```

The widget accepts predicates such as `ProofOfAgeCredential:age>=18` and `ProofOfHumanityCredential:isUniqueHuman is true`. The browser message listener accepts messages only from the AegisDID widget origin and the popup it opened. Predicate-only claims are transmitted without raw values; the returned presentation contains issuer-signed predicate attestations.

## AI endpoints

Both require a session cookie or a valid bearer API key. Each identity is limited to 30 requests per minute.

### Behavioral and fraud analysis

```http
POST /api/ai/analyze-behavior-and-fraud
Authorization: Bearer aegis_live_...
Content-Type: application/json

{
  "telemetry": {},
  "presentation": null,
  "networkContext": {"eigenTrust": 0.88, "isSybilSuspect": false},
  "simulationAttackType": "linear_bot"
}
```

Returns a `FraudAnalysisResult` containing `humanityScore`, `botProbability`, `decision`, anomalies, reasons, and an audit signature.

### Network audit

```http
POST /api/ai/audit-network
Authorization: Bearer aegis_live_...
Content-Type: application/json

{"nodes": [], "edges": []}
```

Returns `{ "success": true, "analysis": "...", "timestamp": "..." }`.

## Common errors

- `400`: malformed request, invalid challenge, expired presentation, or failed cryptographic verification.
- `401`: missing or invalid session/API key.
- `409`: presentation challenge already spent or duplicate account email.
- `429`: login or AI rate limit exceeded.
- `500`: unexpected server failure.

The demo auth store is migrated into SQLite. `REDIS_URL` is optional and remains a cache only. The installed `@mstblockchain/mst-vibe-kit` package is used as the official MST scaffolding/deployment path; runtime admin fallback uses the optional EVM registry adapter in `src/lib/mstAnchor.ts`.

### MST status

```http
GET /api/blockchain/status
```

Returns whether the server has enough configuration to submit registry transactions. The app remains fully functional when it returns `configured: false`.
