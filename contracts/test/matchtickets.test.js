const { expect } = require("chai");
const { ethers } = require("hardhat");

const DOGE = (n) => ethers.parseEther(String(n));
const RIVAL = ethers.id("iron-wolves");

describe("MatchTickets", () => {
  async function setup() {
    const [owner, player, other] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("AgentRegistry")).deploy(owner.address, 4);
    const reserve = await (await ethers.getContractFactory("RewardReserve")).deploy(
      owner.address, owner.address, await registry.getAddress(), DOGE(10), DOGE(25), DOGE(200)
    );
    const tickets = await (await ethers.getContractFactory("MatchTickets")).deploy(owner.address, await reserve.getAddress(), DOGE(1));
    return { owner, player, other, reserve, tickets };
  }

  it("charges the fee, sends it to the reserve and emits a seed", async () => {
    const { player, reserve, tickets } = await setup();
    const before = await ethers.provider.getBalance(await reserve.getAddress());
    const tx = await tickets.connect(player).kickOff(RIVAL, { value: DOGE(1) });
    const receipt = await tx.wait();
    const ev = receipt.logs.map((l) => tickets.interface.parseLog(l)).find((e) => e && e.name === "MatchStarted");
    expect(ev.args.matchId).to.equal(1n);
    expect(ev.args.player).to.equal(player.address);
    expect(ev.args.rival).to.equal(RIVAL);
    expect(ev.args.seed).to.not.equal(ethers.ZeroHash);
    expect(await ethers.provider.getBalance(await reserve.getAddress())).to.equal(before + DOGE(1));
    expect(await reserve.totalFunded()).to.equal(DOGE(1));
    expect(await tickets.matchesPlayed(player.address)).to.equal(1n);
  });

  it("gives every match a different seed", async () => {
    const { player, tickets } = await setup();
    const seeds = new Set();
    for (let i = 0; i < 3; i++) {
      const r = await (await tickets.connect(player).kickOff(RIVAL, { value: DOGE(1) })).wait();
      seeds.add(r.logs.map((l) => tickets.interface.parseLog(l)).find((e) => e && e.name === "MatchStarted").args.seed);
    }
    expect(seeds.size).to.equal(3);
  });

  it("rejects the wrong payment", async () => {
    const { player, tickets } = await setup();
    await expect(tickets.connect(player).kickOff(RIVAL, { value: DOGE(0.5) })).to.be.revertedWithCustomError(tickets, "WrongPayment");
    await expect(tickets.connect(player).kickOff(RIVAL, { value: DOGE(2) })).to.be.revertedWithCustomError(tickets, "WrongPayment");
  });

  it("lets only the owner change the fee, the reserve and pause", async () => {
    const { owner, player, other, tickets } = await setup();
    await expect(tickets.connect(player).setFee(DOGE(2))).to.be.revertedWithCustomError(tickets, "OwnableUnauthorizedAccount");
    await expect(tickets.connect(player).pause()).to.be.revertedWithCustomError(tickets, "OwnableUnauthorizedAccount");
    await tickets.connect(owner).setFee(DOGE(2));
    expect(await tickets.fee()).to.equal(DOGE(2));
    await tickets.connect(owner).pause();
    await expect(tickets.connect(player).kickOff(RIVAL, { value: DOGE(2) })).to.be.revertedWithCustomError(tickets, "EnforcedPause");
    await expect(tickets.connect(owner).setReserve(ethers.ZeroAddress)).to.be.revertedWithCustomError(tickets, "ZeroAddress");
    await tickets.connect(owner).setReserve(other.address);
    expect(await tickets.reserve()).to.equal(other.address);
  });
});
