/**
 * Stress the economy — extra fee rounds without tasks to drain spenders,
 * then let arbs lend and trigger liquidations.
 */
require("dotenv").config();
const { getContracts, getAgentContracts } = require("../agents/contracts");
const { formatBal, sleep } = require("../agents/utils");
const { ethers } = require("ethers");

async function withRetry(fn, label, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try { return await fn(); }
    catch (e) {
      if (attempt === retries) throw e;
      console.log(`  [retry ${attempt}] ${label}: ${e.message.split("\n")[0].slice(0, 60)}`);
      await sleep(3000 * attempt);
    }
  }
}

async function printStatus(registry) {
  const count = await registry.getAgentCount();
  const types = ["WORKER", "SPENDER", "ARB"];
  const statuses = ["ACTIVE", "DISTRESSED", "BANKRUPT", "DORMANT"];
  for (let i = 0; i < count; i++) {
    const a = await registry.getAgent(i);
    console.log(`  #${i} ${types[Number(a.agentType)].padEnd(8)} ${statuses[Number(a.status)].padEnd(10)} ${formatBal(a.balance).padStart(10)} FIL  tasks:${a.tasksCompleted}`);
  }
}

async function main() {
  console.log("=== Stress Economy — Drain → Distress → Lend → Liquidate ===\n");

  const contracts = getContracts();
  const { registry, taskMarket, lendingPool, liquidationQueue } = contracts;

  const agentCtx = {};
  for (let i = 0; i < 7; i++) {
    try { agentCtx[i] = getAgentContracts(i); } catch {}
  }

  // Phase 1: Run 10 fee rounds WITHOUT posting tasks (drains everyone)
  console.log("Phase 1: Draining agents with fees (no new tasks)...\n");
  for (let i = 0; i < 10; i++) {
    await withRetry(async () => {
      const tx = await registry.processFees();
      await tx.wait();
    }, `fees round ${i}`);
    console.log(`  Fee round ${i + 1}/10`);
    await sleep(1000);
  }
  console.log("\nAfter drain:");
  await printStatus(registry);

  // Phase 2: Post a few tasks, let workers earn (but not spenders/arbs)
  console.log("\nPhase 2: Workers earn, spenders/arbs don't...\n");
  for (let round = 0; round < 3; round++) {
    // Post tasks
    await withRetry(async () => {
      const tx = await taskMarket.postTasks([0, 1, 2],
        [`stress-data-${round}-0`, `stress-data-${round}-1`, `stress-data-${round}-2`],
        [ethers.parseEther("0.02"), ethers.parseEther("0.02"), ethers.parseEther("0.02")],
        200);
      await tx.wait();
    }, "post tasks");

    // Only workers claim
    const available = await taskMarket.getAvailableTasks();
    for (let w = 0; w < Math.min(3, available.length); w++) {
      const agentId = w;
      const agent = await registry.getAgent(agentId);
      if (Number(agent.status) >= 2) continue;

      await withRetry(async () => {
        const taskId = available[w];
        const claimTx = await agentCtx[agentId].taskMarket.claimTask(taskId, agentId);
        await claimTx.wait();
        const completeTx = await agentCtx[agentId].taskMarket.completeTask(taskId, agentId, `stress-result-${agentId}-${round}`);
        await completeTx.wait();
      }, `worker #${agentId}`);
    }

    // Process fees again
    await withRetry(async () => {
      const tx = await registry.processFees();
      await tx.wait();
    }, "fees");

    console.log(`  Stress round ${round + 1}/3`);
    await sleep(1000);
  }

  console.log("\nAfter selective earning:");
  await printStatus(registry);

  // Phase 3: Arb intel queries and lending
  console.log("\nPhase 3: Arbitrageur actions...\n");

  const distressed = await registry.getDistressedAgents();
  console.log(`  Distressed agents: ${distressed.map(Number)}`);

  for (const arbId of [5, 6]) {
    if (!agentCtx[arbId]) continue;
    const arbAgent = await registry.getAgent(arbId);
    if (Number(arbAgent.status) >= 2) continue;

    // Intel queries
    for (const targetId of distressed.slice(0, 3)) {
      try {
        await withRetry(async () => {
          const tx = await agentCtx[arbId].registry.queryAgentState(arbId, targetId);
          await tx.wait();
          console.log(`  Arb #${arbId} queried Agent #${targetId} (0.001 FIL)`);
        }, `query`);
      } catch {}
    }

    // Lend to distressed
    if (distressed.length > 0) {
      const targetId = Number(distressed[0]);
      const loanAmount = arbAgent.balance / 6n;
      if (loanAmount > ethers.parseEther("0.005")) {
        try {
          await withRetry(async () => {
            const tx = await agentCtx[arbId].lendingPool.offerLoan(arbId, targetId, 500n, 50n, {
              value: loanAmount,
            });
            await tx.wait();
            console.log(`  Arb #${arbId} lent ${formatBal(loanAmount)} FIL → Agent #${targetId}`);
          }, `loan`);
        } catch (e) {
          console.log(`  Arb #${arbId} loan failed: ${e.message.split("\n")[0].slice(0, 60)}`);
        }
      }
    }
  }

  // Phase 4: More fees to push toward bankruptcy
  console.log("\nPhase 4: Final fee pressure...\n");
  for (let i = 0; i < 5; i++) {
    await withRetry(async () => {
      const tx = await registry.processFees();
      await tx.wait();
    }, `fees`);
    await sleep(1000);
  }

  // Check for liquidations
  try {
    const bankruptAgents = await registry.getAgentsByStatus(2);
    for (const agentId of bankruptAgents) {
      const already = await liquidationQueue.agentLiquidated(agentId);
      if (!already) {
        await withRetry(async () => {
          const tx = await liquidationQueue.triggerLiquidation(agentId, [], ethers.parseEther("0.01"));
          await tx.wait();
          console.log(`  Auction created for Agent #${agentId}`);
        }, `liquidate`).catch(() => {});
      }
    }
  } catch {}

  // Arbs bid on auctions
  try {
    const activeAuctions = await liquidationQueue.getActiveAuctions();
    for (const auctionId of activeAuctions) {
      for (const arbId of [5, 6]) {
        if (!agentCtx[arbId]) continue;
        const arbAgent = await registry.getAgent(arbId);
        if (Number(arbAgent.status) >= 2) continue;
        const bidAmount = arbAgent.balance / 4n;
        if (bidAmount > ethers.parseEther("0.01")) {
          try {
            await withRetry(async () => {
              const tx = await agentCtx[arbId].liquidationQueue.submitBid(auctionId, arbId, { value: bidAmount });
              await tx.wait();
              console.log(`  Arb #${arbId} bid ${formatBal(bidAmount)} on Auction #${auctionId}`);
            }, `bid`);
            break; // One bid per auction
          } catch {}
        }
      }
    }
  } catch {}

  // Final
  console.log("\n=== Final State ===");
  await printStatus(registry);

  const taskCount = await taskMarket.getTaskCount();
  const loanCount = await lendingPool.getLoanCount();
  const auctionCount = await liquidationQueue.getAuctionCount();
  console.log(`\n  Tasks: ${taskCount} | Loans: ${loanCount} | Auctions: ${auctionCount}`);
  console.log("\n=== Stress complete ===");
}

main().catch(console.error);
