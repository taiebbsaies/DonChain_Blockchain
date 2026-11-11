// Génère src/abis.ts et src/deployments.ts depuis la sortie Foundry.
// Usage : (cd contracts && forge build) puis `pnpm --filter @donchain/shared generate`
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contractsDir = join(root, "..", "..", "contracts");
const CONTRACTS = [
  "CampaignFactory",
  "DonationVault",
  "MilestoneTracker",
  "DonationReceipt",
  "AttestationRegistry",
];
const header = "// Fichier généré par scripts/generate.mjs. Ne pas modifier à la main.\n\n";

let abis = header;
for (const name of CONTRACTS) {
  const file = join(contractsDir, "out", `${name}.sol`, `${name}.json`);
  if (!existsSync(file)) throw new Error(`ABI introuvable : ${file}. Lancez "forge build" dans contracts/.`);
  const { abi } = JSON.parse(readFileSync(file, "utf8"));
  const ident = name[0].toLowerCase() + name.slice(1) + "Abi";
  abis += `export const ${ident} = ${JSON.stringify(abi, null, 2)} as const;\n\n`;
}
// ABI ERC-20 minimal pour l'USDC (approve, allowance, balanceOf, decimals, mint du mock)
abis += `export const erc20Abi = ${JSON.stringify(
  JSON.parse(readFileSync(join(contractsDir, "out", "MockUSDC.sol", "MockUSDC.json"), "utf8")).abi,
  null,
  2,
)} as const;\n`;
writeFileSync(join(root, "src", "abis.ts"), abis);

const depDir = join(contractsDir, "deployments");
const deployments = {};
if (existsSync(depDir)) {
  for (const f of readdirSync(depDir).filter((f) => f.endsWith(".json"))) {
    const d = JSON.parse(readFileSync(join(depDir, f), "utf8"));
    deployments[d.chainId] = d;
  }
}
writeFileSync(
  join(root, "src", "deployments.ts"),
  header +
    `export type Deployment = {
  chainId: number;
  startBlock: number;
  usdc: \`0x\${string}\`;
  registry: \`0x\${string}\`;
  receipt: \`0x\${string}\`;
  factory: \`0x\${string}\`;
};

export const deployments: Record<number, Deployment> = ${JSON.stringify(deployments, null, 2)};
`,
);
console.log(`abis.ts : ${CONTRACTS.length + 1} ABI ; deployments.ts : chaînes ${Object.keys(deployments).join(", ") || "aucune"}`);
