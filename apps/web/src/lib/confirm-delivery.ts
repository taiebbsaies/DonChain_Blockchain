import { keccak256, toBytes, type Address } from "viem";

/**
 * Message EIP-712 signé par le prestataire pour confirmer une livraison (§5.2, §9.2).
 * Doit rester identique à CONFIRM_TYPEHASH et au domaine EIP712 de MilestoneTracker.sol.
 */
export function buildConfirmDeliveryTypedData(params: {
  chainId: number;
  tracker: Address;
  milestoneId: bigint;
  supplier: Address;
  amount: bigint;
  latestProofCid: string;
  nonce: bigint;
  deadline: bigint;
}) {
  return {
    domain: {
      name: "DonChain MilestoneTracker",
      version: "1",
      chainId: params.chainId,
      verifyingContract: params.tracker,
    },
    types: {
      ConfirmDelivery: [
        { name: "tracker", type: "address" },
        { name: "milestoneId", type: "uint256" },
        { name: "supplier", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "proofHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "ConfirmDelivery",
    message: {
      tracker: params.tracker,
      milestoneId: params.milestoneId,
      supplier: params.supplier,
      amount: params.amount,
      proofHash: keccak256(toBytes(params.latestProofCid)),
      nonce: params.nonce,
      deadline: params.deadline,
    },
  } as const;
}
