# DonChain — smart contracts

Foundry project. Solidity 0.8.28, OpenZeppelin 5.7.0 (vendored in `lib/`).

| Contract | Role |
|---|---|
| `AttestationRegistry` | KYC whitelist: `ORG_ROLE`, `SUPPLIER_ROLE`, `AUDITOR_ROLE`, `ARBITER_ROLE`, `PAUSER_ROLE` (admin = Safe multisig, optionally behind a timelock) |
| `CampaignFactory` | Deploys one `DonationVault` + one `MilestoneTracker` per campaign (EIP-1167 clones), stores the campaign `metadataURI` |
| `DonationVault` | USDC escrow, softCap / hardCap, SBT mint, pull refunds, release only by its tracker |
| `MilestoneTracker` | Frozen milestones, IPFS proof history, supplier EIP-712 confirmation + auditor approval (two distinct auditors above a threshold), donor disputes, expiry |
| `DonationReceipt` | Soulbound receipt (ERC-721 + ERC-5192) |

Milestone flow: `Draft → Pending → Submitted → Approved → (challenge period) → Released`,
alternatives `Rejected`, `Cancelled`, `Expired` (expiry halts the campaign), and `Disputed` (Phase 2).

### Phase 2: disputes and second auditor

- **Disputes (§5.4, §5.5).** During the challenge window, any donor of the campaign can call `openDispute(id, reason)`.
  The milestone moves to `Disputed` and payment is blocked. A refundable USDC deposit (`disputeDeposit`, set on the
  factory) is taken. One dispute per milestone, so a donor cannot block payment forever.
- **Resolution.** `resolveDispute(id, upheld, note)` by an `ARBITER_ROLE` or an auditor who is not the organisation, the
  supplier, an auditor who approved the milestone, or the disputer. Upheld: milestone `Rejected`, reserved funds freed,
  deposit returned. Dismissed: back to `Approved` (payable once the original window closes), deposit paid to the supplier.
  An unresolved dispute expires like any overdue milestone: campaign `Halted`, deposit returned.
- **Second auditor.** Milestones with `amount >= secondApprovalThreshold` (factory setting, 0 = off) need two distinct
  auditors. A new proof revision resets the first approval.
- **Optimizer.** Enabled (`optimizer_runs = 200`): without it `MilestoneTracker` exceeds the 24 KB contract size limit.

Campaign states: `Funding → Active → Completed`, or `Failed` (softCap missed) / `Halted` (milestone expired).
Refunds are full in `Failed` and pro-rata of unreleased funds in `Halted` / `Completed`; pause never blocks them.

Not yet: EAS attestations, multisig reassignment for blacklisted USDC addresses, external audit.

## Commands

```shell
forge build
forge test                       # unit, fuzz and invariant tests
forge coverage --report summary --no-match-coverage "test|script"

# Local demo chain (anvil accounts: 0 admin, 1 org, 2 supplier, 3 auditor, 4-7 donors, 8 second auditor, 9 arbiter)
anvil
forge script script/LocalDemo.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
pnpm --filter @donchain/shared generate   # refresh ABIs + addresses for the web app

# Skip the 3-day challenge window on campaign B's approved milestone, then release it
cast rpc evm_increaseTime 259200 --rpc-url http://127.0.0.1:8545 && cast rpc evm_mine --rpc-url http://127.0.0.1:8545

cp .env.example .env             # fill ADMIN_ADDRESS, BASESCAN_API_KEY
source .env
cast wallet import deployer --interactive   # once: stores the deployer key encrypted, never in a file
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify --account deployer
cd .. && pnpm --filter @donchain/shared generate   # adds chain 84532 to the web app and the API
```

The script writes `deployments/<chainId>.json`, hands registry and receipt administration to the Safe (or to a
`TimelockController` owned by the Safe when `TIMELOCK_DELAY > 0`, §9.3) and renounces the deployer's rights. The Safe
keeps `PAUSER_ROLE` directly so an emergency pause never waits for the timelock. After deployment the Safe grants
roles on `AttestationRegistry` (through the timelock if enabled: schedule, wait, execute).

GitHub Actions: `.github/workflows/ci.yml` runs fmt, build with size checks, tests, coverage (≥ 90 %), Slither, and
the API and web checks on every push. `.github/workflows/deploy-testnet.yml` deploys to Base Sepolia on demand.
