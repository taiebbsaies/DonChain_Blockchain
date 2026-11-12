// Miroir des enums Solidity (l'ordre doit rester identique aux contrats).

export const CampaignState = ["Funding", "Active", "Failed", "Halted", "Completed"] as const;
export type CampaignState = (typeof CampaignState)[number];

export const MilestoneStatus = [
  "Draft",
  "Pending",
  "Submitted",
  "Approved",
  "Released",
  "Rejected",
  "Cancelled",
  "Expired",
  "Disputed",
] as const;
export type MilestoneStatus = (typeof MilestoneStatus)[number];

/** USDC a 6 décimales. */
export const USDC_DECIMALS = 6;
