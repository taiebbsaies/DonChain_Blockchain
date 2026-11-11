# DonChain — smart contracts (Phase 1 MVP)

Foundry project. Solidity 0.8.28, OpenZeppelin 5.7.0 (vendored in `lib/`).

| Contract | Role |
|---|---|
| `AttestationRegistry` | KYC whitelist: `ORG_ROLE`, `SUPPLIER_ROLE`, `AUDITOR_ROLE`, `PAUSER_ROLE` (admin = Safe multisig) |
| `CampaignFactory` | Deploys one `DonationVault` + one `MilestoneTracker` per campaign (EIP-1167 clones), stores the campaign `metadataURI` |
| `DonationVault` | USDC escrow, softCap / hardCap, SBT mint, pull refunds, release only by its tracker |
| `MilestoneTracker` | Frozen milestones, IPFS proof history, supplier EIP-712 confirmation + auditor approval, expiry |
| `DonationReceipt` | Soulbound receipt (ERC-721 + ERC-5192) |

Milestone flow: `Draft → Pending → Submitted → Approved → (challenge period) → Released`,
alternatives `Rejected`, `Cancelled`, `Expired` (expiry halts the campaign).

Campaign states: `Funding → Active → Completed`, or `Failed` (softCap missed) / `Halted` (milestone expired).
Refunds are full in `Failed` and pro-rata of unreleased funds in `Halted` / `Completed`; pause never blocks them.

Not in Phase 1: donor disputes (`openDispute`), second auditor for large amounts, EAS attestations,
multisig reassignment for blacklisted USDC addresses.

## Commands

```shell
forge build
forge test                       # unit, fuzz and invariant tests
forge coverage --report summary --no-match-coverage "test|script"

# Local demo chain (anvil accounts: 0 admin, 1 org, 2 supplier, 3 auditor, 4-7 donors)
anvil
forge script script/LocalDemo.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
pnpm --filter @donchain/shared generate   # refresh ABIs + addresses for the web app

# Skip the 3-day challenge window on campaign B's approved milestone, then release it
cast rpc evm_increaseTime 259200 --rpc-url http://127.0.0.1:8545 && cast rpc evm_mine --rpc-url http://127.0.0.1:8545

cp .env.example .env             # fill ADMIN_ADDRESS, BASESCAN_API_KEY
source .env
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify --account <keystore>
```

After deployment the Safe grants roles on `AttestationRegistry`.
