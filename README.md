# DOGE FC

**You manage. They play.** A 5-a-side football manager game on DogeOS. You set the formation and tactics for a squad of AI footballers, shout instructions from the touchline, and watch your players carry out the plan on their own.

```
doge-fc/
├── apps/web/          Web app: React + Phaser + Tailwind (Vite). Deployed on Vercel.
├── packages/engine/   Deterministic 5-a-side match engine (TypeScript, no browser needed)
└── contracts/         Solidity (Hardhat), deployed on DogeOS Chikyū
```

## Play locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests
npm run sim        # balance report: formations, tactics and clubs over many matches
```

## The match engine (`packages/engine`)

- **Pitch:** 40 × 24 m walled cage, 5 m goals, 10 ticks per second, two 90-second halves (a "40-minute" match).
- **Players** decide every moment between passing, shooting, dribbling, holding, pressing, marking and covering. Choices depend on their attributes (pace, passing, shooting, dribbling, tackling, positioning, reflexes, stamina), positions and team tactics.
- **Tactics:** five formations (2-2, 1-2-1, 2-1-1, 3-1, 1-1-2), mentality, pressing, passing style and width. They can be changed mid-match and are recorded so a match replays exactly.
- **AI managers** for the four rival clubs react to the score, the clock and the opponent's tactics.
- **Commentary** is rule-based and deterministic.
- **Deterministic:** same seed and same instructions give the same match, so results can be verified server-side.

All clubs and players are fictional.

## Contracts

`contracts/` holds the first contract set (registry, shop, reward reserve, match results) deployed on DogeOS Chikyū, with addresses in `contracts/deployments/dogeosChikyu.json`. They were written for the earlier maze prototype and will be adapted and redeployed for the DOGE FC economy (kits and cosmetics in DOGE, prizes from an on-chain reserve, no pay-to-win).
