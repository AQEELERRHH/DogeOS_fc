// Deploys the AFTERMAZE contracts to DogeOS Chikyū and wires them together.
//   npx hardhat run scripts/deploy.js --network dogeosChikyu
//
// Env (optional):
//   SIGNER_ADDRESS   game-server key that signs reward vouchers and run results (default: deployer)
//   TREASURY_ADDRESS where non-reserve revenue goes                            (default: deployer)
const { ethers, network } = require("hardhat");
const fs = require("fs");

const DOGE = (n) => ethers.parseEther(String(n));

async function main() {
  const [deployer] = await ethers.getSigners();
  const signer = process.env.SIGNER_ADDRESS || deployer.address;
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;

  console.log(`Network ${network.name} | deployer ${deployer.address}`);
  console.log(`Balance ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} DOGE`);

  const registry = await (await ethers.getContractFactory("AgentRegistry")).deploy(deployer.address, 4);
  await registry.waitForDeployment();

  // Testnet limits: 10 DOGE per claim, 25/player/day, 200 global/day.
  const reserve = await (await ethers.getContractFactory("RewardReserve")).deploy(
    deployer.address, signer, await registry.getAddress(), DOGE(10), DOGE(25), DOGE(200)
  );
  await reserve.waitForDeployment();

  // 30% of shop revenue tops up the reward reserve.
  const economy = await (await ethers.getContractFactory("MazeEconomy")).deploy(
    deployer.address, await registry.getAddress(), treasury, await reserve.getAddress(), 3000
  );
  await economy.waitForDeployment();

  const results = await (await ethers.getContractFactory("MatchResults")).deploy(deployer.address, signer);
  await results.waitForDeployment();

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    signer,
    treasury,
    AgentRegistry: await registry.getAddress(),
    RewardReserve: await reserve.getAddress(),
    MazeEconomy: await economy.getAddress(),
    MatchResults: await results.getAddress(),
  };
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(`deployments/${network.name}.json`, JSON.stringify(out, null, 2));
  console.table(out);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
