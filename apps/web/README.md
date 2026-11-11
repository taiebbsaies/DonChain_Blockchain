# DonChain — web app (Phase 1)

Next.js 16 (App Router), Tailwind CSS 4, wagmi 2 + viem. Reads the chain directly; no backend needed in Phase 1.

| Page | What it does |
|---|---|
| `/` | Campaign list with state and funding progress |
| `/campaigns/[id]` | Funding details, donate (approve + donate), refund, milestone timeline with proofs, release after the challenge window, expire overdue milestones |
| `/me` | The connected wallet's soulbound receipts |
| `/organisation` | Attested orgs: create campaigns, create / lock / cancel milestones, submit and revise proofs, close the campaign |
| `/prestataire` | Attested suppliers: sign the EIP-712 delivery confirmation, follow their milestones and payments |
| `/auditeur` | Attested auditors: approve or reject submitted milestones (blocked for the org and the supplier) |

Role links appear in the header only for roles the connected wallet holds in the `AttestationRegistry`.
Every rule is enforced by the contracts; the UI only explains and pre-checks.

## Run locally

From the repo root, in three terminals:

```shell
pnpm chain          # 1. anvil
pnpm chain:seed     # 2. deploy contracts, seed 3 demo campaigns, regenerate @donchain/shared
pnpm web            # 3. http://localhost:3000
```

In MetaMask, add the network `http://127.0.0.1:8545` (chain id 31337) and import anvil test keys:

| Anvil account | Role | Private key |
|---|---|---|
| 1 | Organisation | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| 2 | Supplier | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |
| 3 | Auditor | `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` |
| 4 | Donor (10,000 test USDC) | `0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a` |

These keys are public: never use them on a real network. After restarting anvil, clear the account
activity in MetaMask (Settings, Advanced) to avoid "nonce too high" errors.

To skip the 3-day challenge window and test a release:

```shell
cast rpc evm_increaseTime 259200 && cast rpc evm_mine
```

## Configuration

Copy `.env.example` to `.env.local`. `NEXT_PUBLIC_CHAIN_ID` selects the network; contract addresses come from
`@donchain/shared`, generated from `contracts/deployments/<chainId>.json`.

## Not in Phase 1

Mobile wallets (WalletConnect), IPFS uploads (metadata is stored as `data:` URIs for now), donor disputes,
the indexer-backed explorer, client-side proof hash verification, and CSV/PDF export.
