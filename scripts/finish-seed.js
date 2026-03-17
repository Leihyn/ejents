const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const addresses = JSON.parse(fs.readFileSync("deployed-addresses.json", "utf-8"));
  const taskMarket = await hre.ethers.getContractAt("TaskMarket", addresses.contracts.TaskMarket);

  // Fund treasury
  console.log("Funding TaskMarket treasury with 2.0 FIL...");
  const fundTx = await taskMarket.fundTreasury({ value: hre.ethers.parseEther("2.0") });
  await fundTx.wait();
  console.log("  Treasury:", hre.ethers.formatEther(await taskMarket.getTreasuryBalance()), "FIL");

  // Post initial tasks
  console.log("Posting 10 initial tasks...");
  const types = [0, 1, 2, 0, 1, 0, 2, 0, 1, 0];
  const cids = types.map((_, i) => hre.ethers.id(`initial-task-${i}`));
  const rewards = types.map(() => hre.ethers.parseEther("0.02"));
  const taskTx = await taskMarket.postTasks(types, cids, rewards, 200);
  await taskTx.wait();
  console.log("  Tasks posted");

  // Save manifest
  const agentConfigs = [
    { id: 0, name: "Worker-A", type: "WORKER" },
    { id: 1, name: "Worker-B", type: "WORKER" },
    { id: 2, name: "Worker-C", type: "WORKER" },
    { id: 3, name: "Spender-A", type: "SPENDER" },
    { id: 4, name: "Spender-B", type: "SPENDER" },
    { id: 5, name: "Arbitrageur-A", type: "ARBITRAGEUR" },
    { id: 6, name: "Arbitrageur-B", type: "ARBITRAGEUR" },
  ];
  fs.writeFileSync("agent-manifest.json", JSON.stringify(agentConfigs, null, 2));
  console.log("  Manifest saved");
  console.log("\n=== Seeding complete ===");
}

main().catch(console.error);
