require("@nomicfoundation/hardhat-toolbox");
const { vars, subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");
const path = require("path");

// Optional: compile with the npm "solc" package instead of downloading a native compiler
// (useful on locked-down networks). Run with LOCAL_SOLC=1.
if (process.env.LOCAL_SOLC === "1") {
  subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, _hre, runSuper) => {
    if (args.solcVersion !== "0.8.24") return runSuper();
    return {
      compilerPath: path.join(__dirname, "node_modules", "solc", "soljson.js"),
      isSolcJs: true,
      version: "0.8.24",
      longVersion: "0.8.24+commit.e11b9ed9",
    };
  });
}

// Set once with:  npx hardhat vars set DOGEOS_CHIKYU_PRIVATE_KEY
const PRIVATE_KEY = vars.get("DOGEOS_CHIKYU_PRIVATE_KEY", "");

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Conservative target until we confirm DogeOS opcode support (PUSH0 / MCOPY / TSTORE).
      evmVersion: "paris",
    },
  },
  networks: {
    dogeosChikyu: {
      url: process.env.DOGEOS_RPC_URL || "https://rpc.testnet.dogeos.com/",
      chainId: 6281971,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  // DogeOS testnet explorers are Blockscout-based. Default: the Blockscout instance, which accepts
  // any API key. To use L2Scan instead, set VERIFY_API_URL / VERIFY_BROWSER_URL / VERIFY_API_KEY.
  etherscan: {
    apiKey: { dogeosChikyu: process.env.VERIFY_API_KEY || "blockscout" },
    customChains: [
      {
        network: "dogeosChikyu",
        chainId: 6281971,
        urls: {
          apiURL: process.env.VERIFY_API_URL || "https://blockscout.testnet.dogeos.com/api",
          browserURL: process.env.VERIFY_BROWSER_URL || "https://blockscout.testnet.dogeos.com",
        },
      },
    ],
  },
  sourcify: { enabled: false },
};
