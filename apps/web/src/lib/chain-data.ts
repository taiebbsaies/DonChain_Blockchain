import type { Address, PublicClient } from "viem";
import {
  CampaignState,
  MilestoneStatus,
  campaignFactoryAbi,
  donationReceiptAbi,
  donationVaultAbi,
  erc20Abi,
  milestoneTrackerAbi,
  type Deployment,
} from "@donchain/shared";
import { resolveJson, type CampaignMetadata, type MilestoneMetadata } from "./metadata";

// Lecture directe de la chaîne (Phase 1). En Phase 2, l'indexeur NestJS prendra le relais
// pour les listes et l'historique ; la chaîne reste la source de vérité.

export type CampaignSummary = {
  id: bigint;
  org: Address;
  vault: Address;
  tracker: Address;
  metadataURI: string;
  metadata: CampaignMetadata | null;
  state: CampaignState;
  paused: boolean;
  softCap: bigint;
  hardCap: bigint;
  minDonation: bigint;
  fundingDeadline: bigint;
  totalRaised: bigint;
  totalReleased: bigint;
  totalRefunded: bigint;
};

export type Proof = { cid: string; submitter: Address; timestamp: bigint };

export type Milestone = {
  id: bigint;
  supplier: Address;
  amount: bigint;
  deadline: bigint;
  descriptionHash: `0x${string}`;
  descriptionURI: string;
  metadata: MilestoneMetadata | null;
  status: MilestoneStatus;
  supplierConfirmed: boolean;
  approvedAt: bigint;
  approvedBy: Address;
  proofs: Proof[];
};

export type CampaignDetail = {
  summary: CampaignSummary;
  milestones: Milestone[];
  challengePeriod: bigint;
  gracePeriod: bigint;
  committed: bigint;
  /** Un seul jalon en cours à la fois. */
  sequential: boolean;
  /** Horodatage du dernier bloc : l'heure de référence de la chaîne (utile sur anvil). */
  chainNow: bigint;
};

export type DonorPosition = {
  donated: bigint;
  refundable: bigint;
  refunded: boolean;
  usdcBalance: bigint;
  allowance: bigint;
};

export type Receipt = { tokenId: bigint; campaign: Address; amount: bigint; timestamp: bigint };

export async function fetchCampaignSummary(
  client: PublicClient,
  dep: Deployment,
  id: bigint,
): Promise<CampaignSummary> {
  const c = await client.readContract({
    address: dep.factory,
    abi: campaignFactoryAbi,
    functionName: "getCampaign",
    args: [id],
  });
  const vault = { address: c.vault, abi: donationVaultAbi } as const;
  const [state, paused, softCap, hardCap, minDonation, fundingDeadline, totalRaised, totalReleased, totalRefunded, metadata] =
    await Promise.all([
      client.readContract({ ...vault, functionName: "state" }),
      client.readContract({ ...vault, functionName: "paused" }),
      client.readContract({ ...vault, functionName: "softCap" }),
      client.readContract({ ...vault, functionName: "hardCap" }),
      client.readContract({ ...vault, functionName: "minDonation" }),
      client.readContract({ ...vault, functionName: "fundingDeadline" }),
      client.readContract({ ...vault, functionName: "totalRaised" }),
      client.readContract({ ...vault, functionName: "totalReleased" }),
      client.readContract({ ...vault, functionName: "totalRefunded" }),
      resolveJson<CampaignMetadata>(c.metadataURI),
    ]);

  return {
    id,
    org: c.org,
    vault: c.vault,
    tracker: c.tracker,
    metadataURI: c.metadataURI,
    metadata,
    state: CampaignState[state],
    paused,
    softCap,
    hardCap,
    minDonation,
    fundingDeadline: BigInt(fundingDeadline),
    totalRaised,
    totalReleased,
    totalRefunded,
  };
}

export async function fetchCampaigns(client: PublicClient, dep: Deployment): Promise<CampaignSummary[]> {
  const count = await client.readContract({
    address: dep.factory,
    abi: campaignFactoryAbi,
    functionName: "campaignCount",
  });
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
  const campaigns = await Promise.all(ids.map((id) => fetchCampaignSummary(client, dep, id)));
  return campaigns.reverse(); // les plus récentes d'abord
}

async function fetchMilestone(client: PublicClient, tracker: Address, id: bigint): Promise<Milestone> {
  const t = { address: tracker, abi: milestoneTrackerAbi } as const;
  const [m, proofCount] = await Promise.all([
    client.readContract({ ...t, functionName: "getMilestone", args: [id] }),
    client.readContract({ ...t, functionName: "proofCount", args: [id] }),
  ]);
  const proofIndexes = Array.from({ length: Number(proofCount) }, (_, i) => BigInt(i));
  const [proofs, metadata] = await Promise.all([
    Promise.all(proofIndexes.map((i) => client.readContract({ ...t, functionName: "getProof", args: [id, i] }))),
    resolveJson<MilestoneMetadata>(m.descriptionURI),
  ]);

  return {
    id,
    supplier: m.supplier,
    amount: m.amount,
    deadline: BigInt(m.deadline),
    descriptionHash: m.descriptionHash,
    descriptionURI: m.descriptionURI,
    metadata,
    status: MilestoneStatus[m.status],
    supplierConfirmed: m.supplierConfirmed,
    approvedAt: BigInt(m.approvedAt),
    approvedBy: m.approvedBy,
    proofs: proofs.map((p) => ({ cid: p.cid, submitter: p.submitter, timestamp: BigInt(p.timestamp) })),
  };
}

export async function fetchCampaignDetail(client: PublicClient, dep: Deployment, id: bigint): Promise<CampaignDetail> {
  const summary = await fetchCampaignSummary(client, dep, id);
  const t = { address: summary.tracker, abi: milestoneTrackerAbi } as const;
  const [count, challengePeriod, gracePeriod, committed, sequential, block] = await Promise.all([
    client.readContract({ ...t, functionName: "milestoneCount" }),
    client.readContract({ ...t, functionName: "challengePeriod" }),
    client.readContract({ ...t, functionName: "gracePeriod" }),
    client.readContract({ ...t, functionName: "committed" }),
    client.readContract({ ...t, functionName: "sequential" }),
    client.getBlock(),
  ]);
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
  const milestones = await Promise.all(ids.map((mid) => fetchMilestone(client, summary.tracker, mid)));

  return {
    summary,
    milestones,
    challengePeriod: BigInt(challengePeriod),
    gracePeriod: BigInt(gracePeriod),
    committed,
    sequential,
    chainNow: block.timestamp,
  };
}

export async function fetchAllCampaignDetails(client: PublicClient, dep: Deployment): Promise<CampaignDetail[]> {
  const count = await client.readContract({
    address: dep.factory,
    abi: campaignFactoryAbi,
    functionName: "campaignCount",
  });
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
  const details = await Promise.all(ids.map((id) => fetchCampaignDetail(client, dep, id)));
  return details.reverse();
}

/** Jalons en cours (Pending, Submitted, Approved) : bloquent la clôture et, en mode séquentiel, le verrouillage. */
export function activeMilestoneCount(detail: CampaignDetail): number {
  return detail.milestones.filter((m) => m.status === "Pending" || m.status === "Submitted" || m.status === "Approved")
    .length;
}

export async function fetchDonorPosition(
  client: PublicClient,
  dep: Deployment,
  vault: Address,
  donor: Address,
): Promise<DonorPosition> {
  const v = { address: vault, abi: donationVaultAbi } as const;
  const [donated, refundable, refunded, usdcBalance, allowance] = await Promise.all([
    client.readContract({ ...v, functionName: "donations", args: [donor] }),
    client.readContract({ ...v, functionName: "refundableOf", args: [donor] }),
    client.readContract({ ...v, functionName: "refunded", args: [donor] }),
    client.readContract({ address: dep.usdc, abi: erc20Abi, functionName: "balanceOf", args: [donor] }),
    client.readContract({ address: dep.usdc, abi: erc20Abi, functionName: "allowance", args: [donor, vault] }),
  ]);
  return { donated, refundable, refunded, usdcBalance, allowance };
}

/** Reçus SBT du donateur, retrouvés via les événements Transfer (mint) du contrat de reçus. */
export async function fetchReceipts(client: PublicClient, dep: Deployment, owner: Address): Promise<Receipt[]> {
  const logs = await client.getContractEvents({
    address: dep.receipt,
    abi: donationReceiptAbi,
    eventName: "Transfer",
    args: { to: owner },
    fromBlock: BigInt(dep.startBlock),
  });
  const receipts = await Promise.all(
    logs.map(async (log) => {
      const tokenId = log.args.tokenId as bigint;
      const r = await client.readContract({
        address: dep.receipt,
        abi: donationReceiptAbi,
        functionName: "receiptOf",
        args: [tokenId],
      });
      return { tokenId, campaign: r.campaign, amount: r.amount, timestamp: BigInt(r.timestamp) };
    }),
  );
  return receipts.reverse();
}
