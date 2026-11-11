// Fichier généré par scripts/generate.mjs. Ne pas modifier à la main.

export type Deployment = {
  chainId: number;
  startBlock: number;
  usdc: `0x${string}`;
  registry: `0x${string}`;
  receipt: `0x${string}`;
  factory: `0x${string}`;
};

export const deployments: Record<number, Deployment> = {
  "31337": {
    "chainId": 31337,
    "factory": "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    "receipt": "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    "registry": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    "startBlock": 0,
    "usdc": "0x5FbDB2315678afecb367f032d93F642f64180aa3"
  }
};
