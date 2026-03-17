const hre = require("hardhat");
const fs = require("fs");
const { ethers } = require("ethers");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const addresses = JSON.parse(fs.readFileSync("deployed-addresses.json", "utf-8"));

  const registry = await hre.ethers.getContractAt("AgentRegistry", addresses.contracts.AgentRegistry);
  const taskMarket = await hre.ethers.getContractAt("TaskMarket", addresses.contracts.TaskMarket);

  console.log("=== Seeding EJENTS (Multi-Wallet Mode) ===\n");

  // --- Generate unique wallets for each agent ---
  const agentConfigs = [
    { name: "Worker-A",      type: 0, balance: "0.3" },
    { name: "Worker-B",      type: 0, balance: "0.3" },
    { name: "Worker-C",      type: 0, balance: "0.3" },
    { name: "Spender-A",     type: 1, balance: "0.2" },
    { name: "Spender-B",     type: 1, balance: "0.2" },
    { name: "Arbitrageur-A", type: 2, balance: "0.5" },
    { name: "Arbitrageur-B", type: 2, balance: "0.5" },
  ];

  const wallets = [];

  console.log("Generating agent wallets...");
  for (let i = 0; i < agentConfigs.length; i++) {
    const wallet = ethers.Wallet.createRandom();
    wallets.push(wallet);
    console.log(`  #${i} ${agentConfigs[i].name}: ${wallet.address}`);
  }

  // Save keys IMMEDIATELY so we don't lose them on crash
  const manifest = agentConfigs.map((config, i) => ({
    id: i,
    name: config.name,
    type: ["WORKER", "SPENDER", "ARBITRAGEUR"][config.type],
    initialBalance: config.balance,
    wallet: wallets[i].address,
    privateKey: wallets[i].privateKey,
  }));
  fs.writeFileSync("agent-manifest.json", JSON.stringify(manifest, null, 2));
  let envKeys = "\n# Agent wallet keys (generated " + new Date().toISOString() + ")\n";
  for (let i = 0; i < wallets.length; i++) {
    envKeys += `AGENT_${i}_KEY=${wallets[i].privateKey}\n`;
  }
  fs.appendFileSync(".env", envKeys);
  console.log("  Keys saved to agent-manifest.json and .env\n");

  // Retry helper for flaky RPC
  async function withRetry(fn, label, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        if (attempt === retries) throw e;
        console.log(`  [retry ${attempt}/${retries}] ${label}: ${e.message.split("\n")[0].slice(0, 60)}`);
        await new Promise(r => setTimeout(r, 3000 * attempt));
      }
    }
  }

  // Fund each wallet with gas money (arbs get more for loans/bids)
  console.log("Funding agent wallets with gas...");
  for (let i = 0; i < wallets.length; i++) {
    const isArb = agentConfigs[i].type === 2;
    const gasFund = hre.ethers.parseEther(isArb ? "0.3" : "0.05");
    await withRetry(async () => {
      const tx = await deployer.sendTransaction({
        to: wallets[i].address,
        value: gasFund,
      });
      await tx.wait();
      console.log(`  Funded #${i} ${agentConfigs[i].name} with ${isArb ? "0.3" : "0.05"} FIL gas`);
    }, `Fund #${i}`);
  }

  // Register agents with their unique wallet addresses
  console.log("\nRegistering agents...");
  for (let i = 0; i < agentConfigs.length; i++) {
    const config = agentConfigs[i];
    await withRetry(async () => {
      const tx = await registry.registerAgent(config.type, wallets[i].address, {
        value: hre.ethers.parseEther(config.balance),
      });
      const receipt = await tx.wait();
      console.log(`  Registered #${i} ${config.name} (${config.balance} FIL, wallet: ${wallets[i].address.slice(0, 10)}...) — tx: ${receipt.hash.slice(0, 16)}...`);
    }, `Register #${i}`);
  }

  console.log(`\n  Total agents: ${await registry.getAgentCount()}`);

  // Fund TaskMarket treasury
  const treasuryAmount = "2.0";
  console.log(`\nFunding TaskMarket treasury with ${treasuryAmount} FIL...`);
  const fundTx = await taskMarket.fundTreasury({ value: hre.ethers.parseEther(treasuryAmount) });
  await fundTx.wait();
  console.log(`  Treasury balance: ${hre.ethers.formatEther(await taskMarket.getTreasuryBalance())} FIL`);

  // Post initial tasks with placeholder CIDs (keeper will post real ones)
  console.log("\nPosting initial tasks...");
  const taskTypes = [0, 1, 2, 0, 1, 0, 2, 0, 1, 0];
  const taskCIDs = taskTypes.map((_, i) => `initial-task-${i}`);
  const taskRewards = taskTypes.map(() => hre.ethers.parseEther("0.02"));
  const deadlineBlocks = 200;

  const taskTx = await taskMarket.postTasks(taskTypes, taskCIDs, taskRewards, deadlineBlocks);
  await taskTx.wait();
  console.log(`  Posted ${taskTypes.length} tasks (0.02 FIL each, ${deadlineBlocks} block deadline)`);

  console.log("\n=== Seeding complete (7 agents, 7 wallets) ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
