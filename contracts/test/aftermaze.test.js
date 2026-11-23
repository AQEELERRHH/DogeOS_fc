const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const DOGE = (n) => ethers.parseEther(String(n));
const id = (s) => ethers.id(s);

async function deployAll() {
  const [admin, signer, treasury, alice, bob] = await ethers.getSigners();

  const registry = await (await ethers.getContractFactory("AgentRegistry")).deploy(admin.address, 4);
  const reserve = await (await ethers.getContractFactory("RewardReserve")).deploy(
    admin.address, signer.address, await registry.getAddress(), DOGE(10), DOGE(25), DOGE(100)
  );
  const economy = await (await ethers.getContractFactory("MazeEconomy")).deploy(
    admin.address, await registry.getAddress(), treasury.address, await reserve.getAddress(), 3000
  );
  const results = await (await ethers.getContractFactory("MatchResults")).deploy(admin.address, signer.address);

  return { admin, signer, treasury, alice, bob, registry, reserve, economy, results };
}

async function signClaim(signer, reserve, player, rewardId, amount, deadline) {
  const { chainId } = await ethers.provider.getNetwork();
  const domain = { name: "AFTERMAZE RewardReserve", version: "1", chainId, verifyingContract: await reserve.getAddress() };
  const types = {
    RewardClaim: [
      { name: "player", type: "address" },
      { name: "rewardId", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  return signer.signTypedData(domain, types, { player, rewardId, amount, deadline });
}

async function signRun(signer, results, run) {
  const { chainId } = await ethers.provider.getNetwork();
  const domain = { name: "AFTERMAZE MatchResults", version: "1", chainId, verifyingContract: await results.getAddress() };
  const types = {
    RunResult: [
      { name: "runId", type: "bytes32" },
      { name: "player", type: "address" },
      { name: "mode", type: "uint8" },
      { name: "mazeId", type: "bytes32" },
      { name: "score", type: "uint32" },
      { name: "replayHash", type: "bytes32" },
    ],
  };
  return signer.signTypedData(domain, types, run);
}

describe("AgentRegistry", () => {
  it("one agent per wallet, with name and personality validation", async () => {
    const { registry, alice } = await deployAll();
    await expect(registry.connect(alice).createAgent("NOVA", 2)).to.emit(registry, "AgentCreated");
    expect(await registry.hasAgent(alice.address)).to.equal(true);
    await expect(registry.connect(alice).createAgent("NOVA-2", 1)).to.be.revertedWithCustomError(registry, "AlreadyRegistered");
    await expect(registry.connect(alice).updateAgent("", 1)).to.be.revertedWithCustomError(registry, "InvalidName");
    await expect(registry.connect(alice).updateAgent("NOVA", 4)).to.be.revertedWithCustomError(registry, "InvalidPersonality");
    await registry.connect(alice).updateAgent("NOVA PRIME", 3);
    expect((await registry.getAgent(alice.address)).name).to.equal("NOVA PRIME");
  });
});

describe("MazeEconomy", () => {
  it("sells cosmetics once, special mazes repeatedly, and splits revenue to the reserve", async () => {
    const { economy, registry, reserve, treasury, alice, admin } = await deployAll();
    await economy.connect(admin).setItem(1, 1, DOGE(10), true); // Skin
    await economy.connect(admin).setItem(100, 0, DOGE(5), true); // Special maze

    await expect(economy.connect(alice).buy(1, { value: DOGE(10) })).to.be.revertedWithCustomError(economy, "NoAgent");
    await registry.connect(alice).createAgent("NOVA", 0);

    await expect(economy.connect(alice).buy(1, { value: DOGE(9) })).to.be.revertedWithCustomError(economy, "WrongPayment");

    const tBefore = await ethers.provider.getBalance(treasury.address);
    await economy.connect(alice).buy(1, { value: DOGE(10) });
    expect(await ethers.provider.getBalance(await reserve.getAddress())).to.equal(DOGE(3)); // 30%
    expect((await ethers.provider.getBalance(treasury.address)) - tBefore).to.equal(DOGE(7));
    await expect(economy.connect(alice).buy(1, { value: DOGE(10) })).to.be.revertedWithCustomError(economy, "AlreadyOwned");

    await economy.connect(alice).buy(100, { value: DOGE(5) });
    await economy.connect(alice).buy(100, { value: DOGE(5) });
    expect(await economy.entriesPurchased(alice.address, 100)).to.equal(2n);
  });

  it("cannot change an existing item's kind", async () => {
    const { economy, admin } = await deployAll();
    await economy.connect(admin).setItem(1, 1, DOGE(1), true);
    await expect(economy.connect(admin).setItem(1, 2, DOGE(1), true)).to.be.revertedWithCustomError(economy, "InvalidConfig");
  });
});

describe("RewardReserve", () => {
  async function ready() {
    const ctx = await deployAll();
    await ctx.registry.connect(ctx.alice).createAgent("NOVA", 0);
    await ctx.admin.sendTransaction({ to: await ctx.reserve.getAddress(), value: DOGE(200) });
    return ctx;
  }

  it("pays a valid voucher exactly once", async () => {
    const { reserve, signer, alice } = await ready();
    const rewardId = id("first-clear:daily:2026-11-23");
    const deadline = (await time.latest()) + 3600;
    const sig = await signClaim(signer, reserve, alice.address, rewardId, DOGE(5), deadline);

    await expect(reserve.connect(alice).claim(rewardId, DOGE(5), deadline, sig))
      .to.changeEtherBalance(alice, DOGE(5));
    await expect(reserve.connect(alice).claim(rewardId, DOGE(5), deadline, sig))
      .to.be.revertedWithCustomError(reserve, "AlreadyClaimed");
  });

  it("rejects wrong signer, wrong player, expired vouchers and over-limit amounts", async () => {
    const { reserve, signer, alice, bob, registry } = await ready();
    await registry.connect(bob).createAgent("BOLT", 1);
    const rewardId = id("achievement:no-bombs");
    const deadline = (await time.latest()) + 3600;

    const forged = await signClaim(alice, reserve, alice.address, rewardId, DOGE(5), deadline);
    await expect(reserve.connect(alice).claim(rewardId, DOGE(5), deadline, forged)).to.be.revertedWithCustomError(reserve, "BadSignature");

    const forAlice = await signClaim(signer, reserve, alice.address, rewardId, DOGE(5), deadline);
    await expect(reserve.connect(bob).claim(rewardId, DOGE(5), deadline, forAlice)).to.be.revertedWithCustomError(reserve, "BadSignature");

    const big = await signClaim(signer, reserve, alice.address, rewardId, DOGE(11), deadline);
    await expect(reserve.connect(alice).claim(rewardId, DOGE(11), deadline, big)).to.be.revertedWithCustomError(reserve, "AmountOutOfRange");

    const past = (await time.latest()) - 1;
    const old = await signClaim(signer, reserve, alice.address, rewardId, DOGE(5), past);
    await expect(reserve.connect(alice).claim(rewardId, DOGE(5), past, old)).to.be.revertedWithCustomError(reserve, "Expired");
  });

  it("enforces the per-player daily cap and resets the next day", async () => {
    const { reserve, signer, alice } = await ready();
    const deadline = (await time.latest()) + 3 * 86400;
    for (let i = 0; i < 2; i++) {
      const r = id(`m:${i}`);
      await reserve.connect(alice).claim(r, DOGE(10), deadline, await signClaim(signer, reserve, alice.address, r, DOGE(10), deadline));
    }
    const r3 = id("m:2");
    const s3 = await signClaim(signer, reserve, alice.address, r3, DOGE(10), deadline);
    await expect(reserve.connect(alice).claim(r3, DOGE(10), deadline, s3)).to.be.revertedWithCustomError(reserve, "PlayerDailyCapReached");
    await time.increase(86400);
    await expect(reserve.connect(alice).claim(r3, DOGE(10), deadline, s3)).to.changeEtherBalance(alice, DOGE(10));
  });

  it("never pays more than it holds", async () => {
    const { reserve, signer, alice, registry, admin } = await deployAll();
    await registry.connect(alice).createAgent("NOVA", 0);
    await admin.sendTransaction({ to: await reserve.getAddress(), value: DOGE(1) });
    const r = id("x");
    const deadline = (await time.latest()) + 3600;
    const s = await signClaim(signer, reserve, alice.address, r, DOGE(2), deadline);
    await expect(reserve.connect(alice).claim(r, DOGE(2), deadline, s)).to.be.revertedWithCustomError(reserve, "InsufficientReserve");
  });
});

describe("MatchResults", () => {
  it("seals a verified run once and tracks personal bests", async () => {
    const { results, signer, alice } = await deployAll();
    const run = { runId: id("run-1"), player: alice.address, mode: 0, mazeId: id("daily:2026-11-23"), score: 1200, replayHash: id("replay-1") };
    const sig = await signRun(signer, results, run);
    await expect(results.connect(alice).submit(run.runId, run.mode, run.mazeId, run.score, run.replayHash, sig))
      .to.emit(results, "RunRecorded").withArgs(run.runId, alice.address, 0, run.mazeId, 1200, run.replayHash, true);
    await expect(results.connect(alice).submit(run.runId, run.mode, run.mazeId, run.score, run.replayHash, sig))
      .to.be.revertedWithCustomError(results, "AlreadyRecorded");
    expect(await results.personalBest(alice.address, 0)).to.equal(1200);

    const tampered = { ...run, runId: id("run-2"), score: 99999 };
    await expect(results.connect(alice).submit(tampered.runId, 0, run.mazeId, 99999, run.replayHash, sig))
      .to.be.revertedWithCustomError(results, "BadSignature");
  });
});
