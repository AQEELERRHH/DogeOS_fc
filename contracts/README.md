# AFTERMAZE — contracts (DogeOS Chikyū testnet)

Single-player DOGE economy for AFTERMAZE. Four contracts:

| Contract | Job |
|---|---|
| `AgentRegistry` | One NOVA per wallet (name + personality index). Gates the shop and rewards. |
| `MazeEconomy` | Native-DOGE shop: Special Maze entries (repeatable) and cosmetics (own once). Sends `reserveBps` of each sale to the RewardReserve, the rest to the treasury. |
| `RewardReserve` | Replaces PrizePool. Holds real DOGE; pays server-signed EIP-712 vouchers once per `(rewardId, player)`, with per-claim, per-player-daily and global-daily caps. |
| `MatchResults` | Optional on-chain "seal" of a verified run: score + replay hash, personal bests per mode. History/replays stay in the DB. |

## Trust model (important)
The game runs in the browser, so the client can't be trusted to report wins. The game server
re-runs every reward-eligible run from `(seed, agent config, replay inputs)` with the same
deterministic simulation, and only then signs a voucher / run result. Contracts check that signature.

## Network
- Chain ID `6281971`, RPC `https://rpc.testnet.dogeos.com/`, explorer `https://dogeos-testnet.l2scan.co`
- Payments use native DOGE (`msg.value`, 18 decimals).
- Compiled for `evmVersion: paris` with OpenZeppelin 5.0.2 until DogeOS opcode support (PUSH0/MCOPY/TSTORE) is confirmed.

## Commands
```bash
npm install
npx hardhat test
npx hardhat vars set DOGEOS_CHIKYU_PRIVATE_KEY        # fresh testnet-only key
npx hardhat run scripts/deploy.js --network dogeosChikyu
npx hardhat verify --network dogeosChikyu <address> <constructor args...>
```
On a network that blocks the solc download, prefix with `LOCAL_SOLC=1` to use the npm compiler.
If `verify` hangs on "Pending in queue", Ctrl-C and check the explorer (known L2Scan issue).

After deploy: fund the reserve (`fund()` or a plain transfer), then add shop items with `setItem`.

## MatchTickets (DOGE FC match fee)

Every DOGE FC match costs a fixed fee (1 DOGE on testnet). `kickOff(rival)` takes the fee, sends it
straight to `RewardReserve`, and emits `MatchStarted(matchId, player, rival, seed, fee)`. The web app
plays the match from that seed, so every match is fixed on-chain before it starts. A single match never
pays out; the reserve funds season and leaderboard prizes.

Deploy (uses the RewardReserve already in `deployments/dogeosChikyu.json` and adds the new address to it):

```bash
LOCAL_SOLC=1 npm run deploy:tickets
```

Owner functions: `setFee`, `setReserve`, `pause`, `unpause`.
