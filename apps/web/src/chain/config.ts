import { createPublicClient, defineChain, http, parseAbi } from "viem";
import deployments from "../../../../contracts/deployments/dogeosChikyu.json";

/** DogeOS Chikyū testnet. */
export const chikyu = defineChain({
  id: 6281971,
  name: "DogeOS Chikyū Testnet",
  nativeCurrency: { name: "Dogecoin", symbol: "DOGE", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.dogeos.com/"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://blockscout.testnet.dogeos.com" } },
  testnet: true,
});

export const EXPLORER = chikyu.blockExplorers.default.url;
export const FAUCET = "https://faucet.testnet.dogeos.com/";
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (a: string) => `${EXPLORER}/address/${a}`;

export const ADDR = {
  AgentRegistry: deployments.AgentRegistry as `0x${string}`,
  MazeEconomy: deployments.MazeEconomy as `0x${string}`,
  RewardReserve: deployments.RewardReserve as `0x${string}`,
  MatchResults: deployments.MatchResults as `0x${string}`,
};

export const registryAbi = parseAbi([
  "function createAgent(string name, uint8 personality)",
  "function updateAgent(string name, uint8 personality)",
  "function hasAgent(address owner) view returns (bool)",
  "function getAgent(address owner) view returns ((string name, uint8 personality, uint64 createdAt))",
  "error AlreadyRegistered()",
  "error NotRegistered()",
  "error InvalidName()",
  "error InvalidPersonality()",
]);

export const economyAbi = parseAbi([
  "function buy(uint256 itemId) payable",
  "function items(uint256 itemId) view returns (uint128 price, uint8 kind, bool active, bool exists)",
  "function owns(address player, uint256 itemId) view returns (bool)",
  "function entriesPurchased(address player, uint256 itemId) view returns (uint256)",
  "function paused() view returns (bool)",
  "error UnknownItem()",
  "error ItemInactive()",
  "error WrongPayment()",
  "error NoAgent()",
  "error AlreadyOwned()",
  "error EnforcedPause()",
]);

/** Matches AgentRegistry's personality index (deployed with 4 personalities). */
export const PERSONALITY_INDEX = { explorer: 0, survivor: 1, speedrunner: 2, aggressive: 3 } as const;

/** MazeEconomy.ItemKind */
export const ITEM_KIND = ["Special Maze entry", "Agent skin", "Movement trail", "Victory animation", "Nameplate"] as const;

/** Items listed on-chain, with how the game uses each. Prices always come from the contract. */
export const CATALOG = [
  { id: 100n, name: "Special Maze entry", description: "One run in any Special Maze: Twin Hunters, Unstable Core, Long Echo or Bare Hands.", color: "#FFB020" },
  { id: 1n, name: "Ember skin", description: "Turns your agent ember orange in the arena. Looks only.", color: "#FF7A3D" },
] as const;

export const SPECIAL_ENTRY_ID = 100n;
export const SKIN_COLORS: Record<string, string> = { "1": "#FF7A3D" };

export const publicClient = createPublicClient({ chain: chikyu, transport: http() });
