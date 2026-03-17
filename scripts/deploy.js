const hre = require("hardhat");
const fs = require("fs");

async function withRetry(fn, label, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === retries) throw e;
      console.log(`  [retry ${attempt}/${retries}] ${label}: ${e.message.split("\n")[0].slice(0, 60)}`);
      await new Promise(r => setTimeout(r, 8000 * attempt));
    }
  }
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying EJENTS with:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "tFIL\n");

  // --- Config ---
  const STORAGE_FEE = hre.ethers.parseEther("0.01");
  const FEE_INTERVAL = 5;
  const DISTRESS_THRESHOLD = hre.ethers.parseEther("0.05");
  const AUCTION_DURATION = 20;

  // --- 1. AgentRegistry ---
  console.log("1/4 Deploying AgentRegistry...");
  const registry = await withRetry(async () => {
    const AgentRegistry = await hre.ethers.getContractFactory("AgentRegistry");
    const r = await AgentRegistry.deploy(STORAGE_FEE, FEE_INTERVAL, DISTRESS_THRESHOLD);
    await r.waitForDeployment();
    return r;
  }, "AgentRegistry");
  const registryAddr = await registry.getAddress();
  console.log("  AgentRegistry:", registryAddr);

  // --- 2. TaskMarket ---
  console.log("2/4 Deploying TaskMarket...");
  const taskMarket = await withRetry(async () => {
    const TaskMarket = await hre.ethers.getContractFactory("TaskMarket");
    const t = await TaskMarket.deploy(registryAddr);
    await t.waitForDeployment();
    return t;
  }, "TaskMarket");
  const taskMarketAddr = await taskMarket.getAddress();
  console.log("  TaskMarket:", taskMarketAddr);

  // --- 3. LendingPool ---
  console.log("3/4 Deploying LendingPool...");
  const lendingPool = await withRetry(async () => {
    const LendingPool = await hre.ethers.getContractFactory("LendingPool");
    const l = await LendingPool.deploy(registryAddr);
    await l.waitForDeployment();
    return l;
  }, "LendingPool");
  const lendingPoolAddr = await lendingPool.getAddress();
  console.log("  LendingPool:", lendingPoolAddr);

  // --- 4. LiquidationQueue ---
  console.log("4/4 Deploying LiquidationQueue...");
  const liquidationQueue = await withRetry(async () => {
    const LiquidationQueue = await hre.ethers.getContractFactory("LiquidationQueue");
    const lq = await LiquidationQueue.deploy(registryAddr, AUCTION_DURATION);
    await lq.waitForDeployment();
    return lq;
  }, "LiquidationQueue");
  const liquidationQueueAddr = await liquidationQueue.getAddress();
  console.log("  LiquidationQueue:", liquidationQueueAddr);

  // --- Wire contracts together ---
  console.log("\nWiring contracts...");
  await withRetry(async () => {
    const tx = await registry.setContracts(taskMarketAddr, lendingPoolAddr, liquidationQueueAddr);
    await tx.wait();
  }, "setContracts");
  console.log("  Registry linked to TaskMarket, LendingPool, LiquidationQueue");

  // --- Save addresses ---
  const addresses = {
    network: "calibration",
    chainId: 314159,
    deployer: deployer.address,
    contracts: {
      AgentRegistry: registryAddr,
      TaskMarket: taskMarketAddr,
      LendingPool: lendingPoolAddr,
      LiquidationQueue: liquidationQueueAddr,
    },
    config: {
      storageFee: hre.ethers.formatEther(STORAGE_FEE),
      feeInterval: FEE_INTERVAL,
      distressThreshold: hre.ethers.formatEther(DISTRESS_THRESHOLD),
      auctionDuration: AUCTION_DURATION,
    },
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync("deployed-addresses.json", JSON.stringify(addresses, null, 2));
  console.log("\nAddresses saved to deployed-addresses.json");

  console.log("\n=== EJENTS deployed successfully ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
