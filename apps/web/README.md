# DonChain — web app

Next.js 16 (App Router), Tailwind CSS 4, wagmi 2 + viem. Reads the chain directly. The Phase 2 API is optional: when
`NEXT_PUBLIC_API_URL` is set, organisations can upload files to IPFS and the fund-flow explorer is enabled.

| Page | What it does |
|---|---|
| `/` | Campaign list with state and funding progress |
| `/campaigns/[id]` | Funding details, donate (approve + donate), refund, milestone timeline with proofs (with in-browser fingerprint check against the on-chain CID), donor disputes during the challenge window, release after the window, expire overdue milestones |
| `/campaigns/[id]/flux` | Fund-flow explorer from the API index, CSV and PDF exports (needs the API) |
| `/me` | The connected wallet's soulbound receipts |
| `/organisation` | Attested orgs: create campaigns, create / lock / cancel milestones, submit and revise proofs, close the campaign |
| `/prestataire` | Attested suppliers: sign the EIP-712 delivery confirmation, follow their milestones and payments |
| `/auditeur` | Attested auditors: approve or reject submitted milestones (blocked for the org and the supplier); 1/2 then 2/2 for large amounts |
| `/arbitrage` | Arbiters and independent auditors: resolve donor disputes |

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
| 8 | Second auditor | `0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97` |
| 9 | Arbiter | `0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6` |

These keys are public: never use them on a real network. After restarting anvil, clear the account
activity in MetaMask (Settings, Advanced) to avoid "nonce too high" errors.

To skip the 3-day challenge window and test a release:

```shell
cast rpc evm_increaseTime 259200 && cast rpc evm_mine
```

Amounts accept French formats: `1 000`, `1.000` and `1 000,50` are read as one thousand. The amount actually
understood is shown under every amount field.

Wallets: connect first, then switch network as a separate step (some wallets hang when both happen together). Mobile
wallets connect through WalletConnect when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set.

## Configuration

Copy `.env.example` to `.env.local`. `NEXT_PUBLIC_CHAIN_ID` selects the network; contract addresses come from
`@donchain/shared`, generated from `contracts/deployments/<chainId>.json`.

Without the API, campaign and milestone descriptions are stored as `data:` URIs in the transaction (still valid).
