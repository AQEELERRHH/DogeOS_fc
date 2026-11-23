# AFTERMAZE

Single-player autonomous-agent maze survival game on DogeOS. You train one robot, NOVA, and send it into THE GRID. It plays on its own.

```
aftermaze/
├── apps/web/           Playable web app: React + Phaser + Tailwind (Vite). Runs the engine in a Web Worker.
├── contracts/          Solidity (Hardhat): AgentRegistry, MazeEconomy, RewardReserve, MatchResults
│                       Deployed + verified on DogeOS Chikyū (see contracts/deployments/)
└── packages/engine/    Standalone TypeScript game engine + NOVA's brain (no Phaser, runs in Node or browser)
```

## Run the web app

```bash
npm install          # from the repo root (npm workspaces)
npm run dev          # http://localhost:5173
npm run build        # production build → apps/web/dist
```

Deploys on Vercel from the repo root using `vercel.json` (no settings to change).
Current version: everything is saved in the browser (localStorage). Wallet login, DOGE purchases,
server-side match verification and reward claims are the next steps.

## Engine (`packages/engine`)

| File | What it does |
|---|---|
| `config.ts` | Modes (daily, survival, special, endless, training), difficulty curve by level, Special Mazes |
| `maze.ts` | Seeded maze generation: braided corridors, 3 spread-out crystals, exit, bonuses, Sentinel routes, Seeker spawns |
| `sim.ts` | One tick at a time: Echo Trail, pulse bombs, Seeker/Sentinel AI, hits, validated collapses, scoring |
| `agent/brain.ts` | Rules-based decision engine (weighted A*, threat maps, dead-end awareness, bomb logic). Every action comes with a plain-English reason. |
| `agent/policy.ts` | 4 personalities, 5 behaviour weights, append-only policy versions, rollback |
| `agent/learning.ts` | Experience-replay learning: replays recent mazes with bounded adjustments, keeps only what helps |
| `agent/coaching.ts` | Plain-language coaching → behaviour changes (never executes input) |
| `match.ts` / `replay.ts` | Full match runner, Endless Grid, compact replays, keccak256 replay hash (for `MatchResults`) |

### Rules as implemented
- **Echo Trail:** the 2 most recent tiles stay passable; older ones crystallise and block NOVA and enemies for 30 ticks, unless bombed.
- **Pulse bombs:** 2 per match, radius 2. They clear crystallised trail and stun enemies for 12 ticks (+50 points each).
- **Seeker:** chases at full speed within its sight range. Out of sight, it creeps to where it last saw NOVA.
- **Sentinel:** patrols a straight corridor back and forth. Its corridor always has a way around.
- **Collapse:** a warning 24 ticks ahead, then a corridor segment closes. It's re-checked at closing time and skipped if it would make the maze unsolvable.
- **Hits:** 3 HP. Each hit gives a short grace period.
- **Scoring:** crystal 100, bonus 25, escape 250, stun 50, no-damage 200, speed up to 150.

### Commands
```bash
cd packages/engine
npm install
npm test                                              # 19 tests
npm run simulate -- --personality survivor --matches 10 --level 3
npm run simulate -- --seed demo --watch --matches 1   # board printed every tick
npm run simulate -- --coach "avoid enemies and stop wasting bombs"
npm run simulate -- --same-maze --seed daily-x --matches 6   # watch NOVA adapt to one maze
```

### Measured behaviour (40 mazes per cell, untrained agents)
| Level | 1 | 3 | 5 | 8 | 12 |
|---|---|---|---|---|---|
| Escape rate | ~78% | ~63% | ~36% | ~16% | ~5% |

A match takes ~30–65 ms to simulate, so the server can re-run every match to check it.
