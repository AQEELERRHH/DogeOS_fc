// Deploys MatchTickets (1 DOGE per kick-off, paid into the existing RewardReserve)
// and adds its address to deployments/<network>.json.
//   npx hardhat run scripts/deploy-tickets.js --network dogeosChikyu
//
// Env (optional):
//   MATCH_FEE  fee in DOGE (default 1)
const { ethers, network, run } = require("hardhat");
const fs = require("fs");

async function main() {
  const file = `deployments/${network.name}.json`;
  const dep = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!dep.RewardReserve) throw new Error(`No RewardReserve in ${file}`);

  const [deployer] = await ethers.getSigners();
  const fee = ethers.parseEther(process.env.MATCH_FEE || "1");
  console.log(`Network ${network.name} | deployer ${deployer.address}`);
  console.log(`Reserve ${dep.RewardReserve} | fee ${ethers.formatEther(fee)} DOGE`);

  const tickets = await (await ethers.getContractFactory("MatchTickets")).deploy(deployer.address, dep.RewardReserve, fee);
  await tickets.waitForDeployment();
  const address = await tickets.getAddress();
  console.log(`MatchTickets ${address}`);

  dep.MatchTickets = address;
  fs.writeFileSync(file, JSON.stringify(dep, null, 2));
  console.log(`Saved to ${file}`);

  if (network.name !== "hardhat") {
    console.log("Waiting a few blocks before verifying…");
    await tickets.deploymentTransaction().wait(5);
    try {
      await run("verify:verify", { address, constructorArguments: [deployer.address, dep.RewardReserve, fee] });
    } catch (e) {
      console.log(`Verification skipped: ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
