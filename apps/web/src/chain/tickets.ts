import { keccak256, parseAbi, parseEventLogs, toHex, type TransactionReceipt } from "viem";
import deployments from "../../../../contracts/deployments/dogeosChikyu.json";
import { publicClient } from "./config";

export const ticketsAbi = parseAbi([
  "function fee() view returns (uint256)",
  "function matchesPlayed(address) view returns (uint256)",
  "function kickOff(bytes32 rival) payable returns (uint256 matchId, bytes32 seed)",
  "event MatchStarted(uint256 indexed matchId, address indexed player, bytes32 indexed rival, bytes32 seed, uint256 fee)",
  "error WrongPayment()",
  "error TransferFailed()",
  "error EnforcedPause()",
]);

const fromEnv = import.meta.env.VITE_MATCH_TICKETS_ADDRESS as string | undefined;
const fromFile = (deployments as unknown as Record<string, string | undefined>).MatchTickets;

/** The MatchTickets contract, or null until it has been deployed. */
export const TICKETS_ADDRESS = ((fromEnv || fromFile) ?? null) as `0x${string}` | null;

export const rivalId = (clubId: string) => keccak256(toHex(clubId));

export async function readFee(): Promise<bigint | null> {
  if (!TICKETS_ADDRESS) return null;
  return publicClient.readContract({ address: TICKETS_ADDRESS, abi: ticketsAbi, functionName: "fee" });
}

/** Finds the MatchStarted event in a kick-off receipt. */
export function matchFromReceipt(receipt: TransactionReceipt) {
  const [ev] = parseEventLogs({ abi: ticketsAbi, eventName: "MatchStarted", logs: receipt.logs });
  if (!ev) throw new Error("The kick-off went through but the match details weren't found. Try again.");
  return { matchId: ev.args.matchId, seed: ev.args.seed };
}
