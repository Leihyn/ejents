/**
 * Resume seeding from where we left off — fully idempotent.
 */
const hre = require("hardhat");
const fs = require("fs");

async function withRetry(fn, label, retries = 8) {
  for (let i = 1; i <= retries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === retries) throw e;
      console.log(`  [retry ${i}/${retries}] ${label}: ${(e.code || e.message?.split("\n")[0])?.slice(0, 50)}`);
      await new Promise(r => setTimeout(r, 8000 * i));
    }
  }
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const addresses = JSON.parse(fs.readFileSync("deployed-addresses.json", "utf-8"));
  const registry = await hre.ethers.getContractAt("AgentRegistry", addresses.contracts.AgentRegistry);
  const taskMarket = await hre.ethers.getContractAt("TaskMarket", addresses.contracts.TaskMarket);
  const manifest = JSON.parse(fs.readFileSync("agent-manifest.json", "utf-8"));

  const configs = [
    { name: "Worker-A", type: 0, balance: "0.3" },
    { name: "Worker-B", type: 0, balance: "0.3" },
    { name: "Worker-C", type: 0, balance: "0.3" },
    { name: "Spender-A", type: 1, balance: "0.2" },
    { name: "Spender-B", type: 1, balance: "0.2" },
    { name: "Arbitrageur-A", type: 2, balance: "0.5" },
    { name: "Arbitrageur-B", type: 2, balance: "0.5" },
  ];

  // Fund ALL unfunded wallets
  console.log("Checking wallet funding...");
  for (let i = 0; i < manifest.length; i++) {
    const isArb = configs[i].type === 2;
    const minBal = hre.ethers.parseEther(isArb ? "0.2" : "0.03");
    const fundAmt = hre.ethers.parseEther(isArb ? "0.3" : "0.05");
    const bal = await hre.ethers.provider.getBalance(manifest[i].wallet);
    if (bal < minBal) {
      await withRetry(async () => {
        const tx = await deployer.sendTransaction({ to: manifest[i].wallet, value: fundAmt });
        await tx.wait();
        console.log(`  Funded #${i} ${configs[i].name} with ${hre.ethers.formatEther(fundAmt)} FIL`);
      }, `Fund #${i}`);
    } else {
      console.log(`  #${i} ${configs[i].name} already funded (${hre.ethers.formatEther(bal)} FIL)`);
    }
  }

  // Register all unregistered agents
  const count = Number(await registry.getAgentCount());
  console.log(`\nCurrently registered: ${count}`);

  for (let i = count; i < configs.length; i++) {
    const c = configs[i];
    await withRetry(async () => {
      const tx = await registry.registerAgent(c.type, manifest[i].wallet, { value: hre.ethers.parseEther(c.balance) });
      await tx.wait();
      console.log(`  Registered #${i} ${c.name} (${c.balance} FIL)`);
    }, `Register #${i}`);
  }
  console.log(`Total agents: ${await registry.getAgentCount()}`);

  // Fund treasury if needed
  const treasury = await taskMarket.getTreasuryBalance();
  if (treasury < hre.ethers.parseEther("1")) {
    console.log("\nFunding treasury...");
    await withRetry(async () => {
      const tx = await taskMarket.fundTreasury({ value: hre.ethers.parseEther("2.0") });
      await tx.wait();
      console.log(`  Treasury: ${hre.ethers.formatEther(await taskMarket.getTreasuryBalance())} FIL`);
    }, "Treasury");
  }

  // Post initial tasks if none exist
  const tc = Number(await taskMarket.getTaskCount());
  if (tc === 0) {
    console.log("\nPosting initial tasks...");
    await withRetry(async () => {
      const types = [0, 1, 2, 0, 1, 0, 2, 0, 1, 0];
      const cids = types.map((_, i) => `initial-task-${i}`);
      const rewards = types.map(() => hre.ethers.parseEther("0.02"));
      const tx = await taskMarket.postTasks(types, cids, rewards, 200);
      await tx.wait();
      console.log(`  Posted ${types.length} tasks`);
    }, "Tasks");
  }

  console.log("\n=== Seed complete ===");
}

main().catch(console.error);
