# Changelog

## 2026-09-16

- Updated `AegisCredentialRegistry.sol` so DID registration, credential anchoring, and audit logging are public wallet-signed writes; revocation and caller authorization remain owner-only. Deployed at `0x8ea34e36670557A552c25F37A81b895Ca0535F6c` on MST testnet.
- Added wallet network configuration validation, MST native-balance checks, and faucet guidance.
- Added the public CORS-enabled `POST /api/public/verify-presentation` endpoint.

