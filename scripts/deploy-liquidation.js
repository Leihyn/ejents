const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  // Addresses from partial deploy
  const registryAddr = "0xdC74e032653B3a593ed6B8D2Bea2acd16965C28B";
  const taskMarketAddr = "0x15880a9E1719AAd5a37C99203c51C2E445651c94";
  const lendingPoolAddr = "0x56B3D1AD2E803c893CC8ecfdA638d5979BA45291";
  const AUCTION_DURATION = 20;

  console.log("Deploying LiquidationQueue...");
  const LiquidationQueue = await hre.ethers.getContractFactory("LiquidationQueue");
  const liquidationQueue = await LiquidationQueue.deploy(registryAddr, AUCTION_DURATION);
  await liquidationQueue.waitForDeployment();
  const liquidationQueueAddr = await liquidationQueue.getAddress();
  console.log("  LiquidationQueue:", liquidationQueueAddr);

  // Wire contracts
  console.log("Wiring contracts...");
  const registry = await hre.ethers.getContractAt("AgentRegistry", registryAddr);
  const tx = await registry.setContracts(taskMarketAddr, lendingPoolAddr, liquidationQueueAddr);
  await tx.wait();
  console.log("  Done");

  // Save addresses
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
      storageFee: "0.01",
      feeInterval: 10,
      distressThreshold: "0.05",
      auctionDuration: AUCTION_DURATION,
    },
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync("deployed-addresses.json", JSON.stringify(addresses, null, 2));

  const envAdditions = `
# Contract addresses (deployed ${new Date().toISOString()})
REGISTRY_ADDRESS=${registryAddr}
TASK_MARKET_ADDRESS=${taskMarketAddr}
LENDING_POOL_ADDRESS=${lendingPoolAddr}
LIQUIDATION_QUEUE_ADDRESS=${liquidationQueueAddr}
`;
  fs.appendFileSync(".env", envAdditions);

  console.log("\n=== EJENTS fully deployed ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
