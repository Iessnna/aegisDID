# AegisDID

AegisDID is a privacy-first decentralized identity workspace for signed verifiable credentials, selective disclosure, local document protection, and human-risk analysis.

## What it does

- Generates an ECDSA P-256 DID in the browser.
- Keeps identity keys in encrypted browser storage.
- Hashes and AES-GCM encrypts uploaded documents locally.
- Stores encrypted document files in IndexedDB, not on the server.
- Creates signed document proofs that can be shared without sharing files.
- Verifies signed presentations and one-time verifier challenges.
- Records wallet-signed DID, credential, and audit transactions on MST.
- Provides an authenticated API for verifier integrations.
- Shows account-owned API and verifier activity in the ZK Apps view.
- Includes a synthetic Attack Lab for testing fraud defenses.

## Important trust boundary

A document upload is not proof that a government authority issued the document.

The application distinguishes between:

- **Document integrity:** the holder signed the uploaded file hash.
- **Issuer authenticity:** a registered issuer signed a credential.
- **Government verification:** requires an official issuer integration or trusted issuer key.

The included credentials and DApps are local test fixtures for demonstrating the flow. They are not Aadhar, DigiLocker, university, employer, or government attestations.

## Run locally

Requirements:

- Node.js 20 or newer
- npm
- Optional: MetaMask or another EIP-1193 wallet for MST transactions

Install dependencies:

```bash
npm install
```

Create `.env` from `.env.example` and set at least:

```env
AUTH_HASH_SALT=use-a-random-secret-of-at-least-32-characters
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=use-a-password-of-at-least-10-characters
DATABASE_PATH=./data/aegisdid.db
```

Start the development server:

```bash
npm run dev
```

Open:

- App: http://localhost:3000
- Connected verifier test site: http://localhost:3000/demo-verifier.html
- Health check: http://localhost:3000/api/health

## Test the verification flow

1. Open AegisDID and create an account or sign in.
2. Open **Identity** and confirm the local demo credentials are visible.
3. Open the demo verifier website.
4. Select an age or humanity request.
5. Click **Verify with AegisDID**.
6. Approve or reject the request in the AegisDID popup.
7. Return to **Zero-Knowledge Apps** and open **Integration Activity**.

Only requests made by the signed-in account or its API keys appear in that account's activity feed. Anonymous public checks are not assigned to an account.

## API integration

Protected AI endpoints accept either the AegisDID session cookie or a server-side API key:

```http
Authorization: Bearer aegis_live_your_key
```

Never put an API key in browser JavaScript.

Main endpoints:

- `POST /api/public/verify-presentation` - verify a presentation; public and rate-limited.
- `POST /api/ai/analyze-behavior-and-fraud` - analyze telemetry and fraud signals.
- `POST /api/ai/audit-network` - audit a graph submitted by an authorized integration.
- `GET /api/integrations/activity` - view activity owned by the signed-in account.
- `POST /api/verifier/sessions` - issue a five-minute audience-bound verifier session.

See [API_DOCS.md](API_DOCS.md) for request formats and the widget integration contract.

## Add the widget to another website

```html
<button id="verify-age" data-aegisdid="verify" data-require="ProofOfAgeCredential:age>=18">
  Verify with AegisDID
</button>

<script src="https://YOUR-AEGISDID-DOMAIN/widget/aegisdid-verify.js"></script>
<script>
document.getElementById('verify-age').addEventListener('aegisdid:verified', function (event) {
  if (event.detail.valid) {
    // Apply the website's own access policy here.
    console.log('Verified holder:', event.detail.holderDid);
  }
});
</script>
```

For local testing, use:

```html
<script src="http://localhost:3000/widget/aegisdid-verify.js"></script>
```

The external site receives the verification result and selected disclosures, never the user's encrypted document.

## Deploy manually on Render

Read [DEPLOY_RENDER.md](DEPLOY_RENDER.md). The short version is:

- Build: `npm install && npm run db:migrate && npm run db:seed && npm run build`
- Start: `npm start`
- Health path: `/api/health`
- Persistent disk mount: `/opt/render/project/src/data`

Required production secrets include `AUTH_HASH_SALT`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and the MST server configuration if server-side anchoring is enabled. Keep `.env`, wallet private keys, API keys, and the SQLite database out of Git.

## Development commands

```bash
npm run dev        # migrate database and start the Vite/Express server
npm run lint       # TypeScript validation
npm run build      # production frontend and server build
npm run db:migrate # apply Drizzle migrations and import legacy auth data
npm run db:seed    # create or synchronize the admin account
npm run deploy:registry
```

## Current limitations

- Attack Lab scenarios are synthetic by design.
- The trust graph becomes real only for users, credentials, transactions, and fraud records persisted by the backend.
- DApp cards are integration examples until external partners register and implement callbacks.
- Behavioral fallback is a deterministic telemetry rules engine, not a replacement for an AI provider.
- Official government verification requires an authorized API or issuer credential feed.
- The included hash commitments are selective-disclosure demonstrations, not a full SNARK system.

## Security notes

- Do not upload real identity documents while using the demo environment.
- Do not commit `.env` or expose `MST_PRIVATE_KEY`.
- Use HTTPS in production.
- Use fresh production secrets rather than development values.
- Register issuer public keys server-side before accepting issuer credentials.
- Treat client-reported behavioral telemetry as one signal, not cryptographic proof.

## License

This project includes the existing Apache-2.0 and MIT-licensed project components. No additional license terms are asserted here.
