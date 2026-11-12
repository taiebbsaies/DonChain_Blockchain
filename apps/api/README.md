# DonChain — API (Phase 2)

NestJS 12, PostgreSQL, viem. The blockchain stays the source of truth: the API only **indexes** it, **authenticates**
wallets and **publishes files to IPFS**. The whole index can be rebuilt from the chain at any time.

| Module | What it does |
|---|---|
| `auth` | Sign-In with Ethereum (EIP-4361): single-use nonce (10 min), domain and chain checks, ERC-1271 smart wallets. Issues a 15-minute JWT. Roles are read on-chain from `AttestationRegistry` (30 s cache). |
| `uploads` | `POST /uploads?kind=proof\|document\|metadata`, attested organisations only. File type checked from its bytes (PDF, PNG, JPEG, WebP, JSON), size limit, neutral file names (no personal data). Pins to Pinata, then to a second service (IPFS Pinning Service API). Without `PINATA_JWT`, local mode: content stored in Postgres and served at `GET /ipfs/:cid`. |
| `indexer` | Polls the chain, stores every factory / vault / tracker event in Postgres. Detects reorganisations by comparing stored block hashes with the chain and rolls back to the last common block. `CONFIRMATIONS` blocks of safety margin. |
| `explorer` | Public, read-only: `GET /campaigns`, `/campaigns/:id`, `/campaigns/:id/flows`, `/campaigns/:id/export.csv`, `/campaigns/:id/export.pdf`, `GET /health` (indexer lag). |

Security: helmet headers, CORS limited to the web app, global rate limit (300/min, 20/min on auth, 30/min on
uploads), strict input validation (unknown fields rejected), CSV formula injection neutralised, uploaded files served
with `Content-Security-Policy: sandbox`.

## Run locally

```shell
pnpm db                      # PostgreSQL in Docker (infra/docker-compose.yml)
cp apps/api/.env.example apps/api/.env
pnpm chain                   # anvil, in another terminal
pnpm chain:seed              # deploy + demo data + regenerate ABIs for web AND api
pnpm api                     # http://localhost:4000
```

Then start the web app with `NEXT_PUBLIC_API_URL=http://localhost:4000` and
`NEXT_PUBLIC_IPFS_GATEWAY=http://localhost:4000` in `apps/web/.env.local`.

Rebuild the index from scratch: `pnpm api:reindex`.

## Tests

```shell
pnpm --filter api test        # unit tests
pnpm --filter api test:e2e    # needs anvil + demo seed + Postgres (TEST_DATABASE_URL, db "donchain_test")
```

The e2e suite covers SIWE (replay, wrong domain, wrong signer), upload permissions and type checks, the local
gateway, CSV/PDF exports, a simulated chain reorganisation (snapshot, donation, revert) and a full rebuild.
