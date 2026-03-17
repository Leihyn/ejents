const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const addresses = JSON.parse(fs.readFileSync("deployed-addresses.json", "utf-8"));
  const registry = await hre.ethers.getContractAt("AgentRegistry", addresses.contracts.AgentRegistry);

  console.log("Wiring contracts...");
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const tx = await registry.setContracts(
        addresses.contracts.TaskMarket,
        addresses.contracts.LendingPool,
        addresses.contracts.LiquidationQueue
      );
      await tx.wait();
      console.log("Done!");
      return;
    } catch (e) {
      console.log(`  attempt ${attempt}: ${(e.code || e.message?.split("\n")[0] || "").slice(0, 50)}`);
      await new Promise(r => setTimeout(r, 8000 * attempt));
    }
  }
}

main().catch(console.error);
