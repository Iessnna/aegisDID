# AegisDID API

Base URL: `http://localhost:3000`

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

The demo auth store is file-backed at `data/auth.json` and ignored by Git. Use SQLite/Postgres for multi-instance deployment.
