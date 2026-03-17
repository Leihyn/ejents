/**
 * Fast on-chain history populator — generates real contract activity
 * without waiting for slow IPFS pinning.
 *
 * Creates: fee rounds, task completions, loans, status changes, auctions.
 * Uses placeholder CIDs for speed, then real agents add real CIDs after.
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

async function main() {
  console.log("=== Fast On-Chain History Populator ===\n");

  const contracts = getContracts();
  const { registry, taskMarket, lendingPool, liquidationQueue } = contracts;

  // Build agent contract instances
  const agentCtx = {};
  for (let i = 0; i < 7; i++) {
    try { agentCtx[i] = getAgentContracts(i); }
    catch { console.log(`Agent #${i}: no wallet`); }
  }

  const ROUNDS = 8;

  for (let round = 1; round <= ROUNDS; round++) {
    console.log(`\n--- Round ${round}/${ROUNDS} ---`);

    // 1. Process fees (keeper)
    await withRetry(async () => {
      const tx = await registry.processFees();
      await tx.wait();
      console.log("  Fees processed");
    }, "fees");

    // Print status
    const count = await registry.getAgentCount();
    const types = ["WORKER", "SPENDER", "ARB"];
    const statuses = ["ACTIVE", "DISTRESSED", "BANKRUPT", "DORMANT"];
    for (let i = 0; i < count; i++) {
      const a = await registry.getAgent(i);
      console.log(`  #${i} ${types[Number(a.agentType)].padEnd(8)} ${statuses[Number(a.status)].padEnd(10)} ${formatBal(a.balance).padStart(10)} FIL  tasks:${a.tasksCompleted}`);
    }

    // 2. Post tasks if treasury has funds
    const treasury = await taskMarket.getTreasuryBalance();
    if (treasury > ethers.parseEther("0.1")) {
      await withRetry(async () => {
        const taskTypes = [0, 1, 2];
        const cids = taskTypes.map((_, i) => `snapshot-round${round}-task${i}`);
        const rewards = taskTypes.map(() => ethers.parseEther("0.02"));
        const tx = await taskMarket.postTasks(taskTypes, cids, rewards, 200);
        await tx.wait();
        console.log(`  Posted 3 tasks (treasury: ${formatBal(treasury)} FIL)`);
      }, "post tasks");
    }

    // 3. Workers claim and complete tasks
    const available = await taskMarket.getAvailableTasks();
    const workerIds = [0, 1, 2].filter(id => agentCtx[id]);
    for (let w = 0; w < Math.min(workerIds.length, available.length); w++) {
      const agentId = workerIds[w];
      const taskId = available[w];
      const agent = await registry.getAgent(agentId);
      if (Number(agent.status) >= 2) continue; // skip bankrupt

      await withRetry(async () => {
        const claimTx = await agentCtx[agentId].taskMarket.claimTask(taskId, agentId);
        await claimTx.wait();
        const resultCID = `result-agent${agentId}-task${taskId}-round${round}`;
        const completeTx = await agentCtx[agentId].taskMarket.completeTask(taskId, agentId, resultCID);
        await completeTx.wait();
        const updated = await registry.getAgent(agentId);
        console.log(`  Worker #${agentId} completed task #${taskId} → ${formatBal(updated.balance)} FIL (tasks: ${updated.tasksCompleted})`);
      }, `worker #${agentId}`);
    }

    // 4. Spenders claim tasks too (burn faster)
    const available2 = await taskMarket.getAvailableTasks();
    const spenderIds = [3, 4].filter(id => agentCtx[id]);
    for (let s = 0; s < Math.min(spenderIds.length, available2.length); s++) {
      const agentId = spenderIds[s];
      const taskId = available2[s];
      const agent = await registry.getAgent(agentId);
      if (Number(agent.status) >= 2) continue;

      await withRetry(async () => {
        const claimTx = await agentCtx[agentId].taskMarket.claimTask(taskId, agentId);
        await claimTx.wait();
        const resultCID = `result-spender${agentId}-task${taskId}-round${round}`;
        const completeTx = await agentCtx[agentId].taskMarket.completeTask(taskId, agentId, resultCID);
        await completeTx.wait();
        const updated = await registry.getAgent(agentId);
        console.log(`  Spender #${agentId} completed task #${taskId} → ${formatBal(updated.balance)} FIL`);
      }, `spender #${agentId}`);
    }

    // 5. Arbitrageur intel queries + lending (rounds 3+)
    if (round >= 3) {
      for (const arbId of [5, 6]) {
        if (!agentCtx[arbId]) continue;
        const arbAgent = await registry.getAgent(arbId);
        if (Number(arbAgent.status) >= 2) continue;

        // Paid intel query
        const distressed = await registry.getDistressedAgents();
        for (const targetId of distressed.slice(0, 2)) {
          await withRetry(async () => {
            const tx = await agentCtx[arbId].registry.queryAgentState(arbId, targetId);
            await tx.wait();
            console.log(`  Arb #${arbId} queried Agent #${targetId} (paid 0.001 FIL)`);
          }, `intel query #${arbId}`).catch(() => {});
        }

        // Lend to first distressed agent
        if (distressed.length > 0) {
          const targetId = Number(distressed[0]);
          const loanAmount = arbAgent.balance / 5n;
          if (loanAmount > ethers.parseEther("0.01")) {
            await withRetry(async () => {
              const tx = await agentCtx[arbId].lendingPool.offerLoan(arbId, targetId, 500n, 50n, {
                value: loanAmount,
              });
              await tx.wait();
              console.log(`  Arb #${arbId} lent ${formatBal(loanAmount)} FIL → Agent #${targetId}`);
            }, `loan #${arbId}`).catch(e => {
              console.log(`  Arb #${arbId} loan failed: ${e.message.split("\n")[0].slice(0, 60)}`);
            });
          }
        }
      }
    }

    // 6. Liquidation check (keeper)
    try {
      const bankruptAgents = await registry.getAgentsByStatus(2);
      for (const agentId of bankruptAgents) {
        const already = await liquidationQueue.agentLiquidated(agentId);
        if (!already) {
          await withRetry(async () => {
            const tx = await liquidationQueue.triggerLiquidation(agentId, [], ethers.parseEther("0.01"));
            await tx.wait();
            console.log(`  Liquidation auction created for Agent #${agentId}`);
          }, `liquidate #${agentId}`).catch(() => {});
        }
      }
    } catch {}

    // 7. Settle expired auctions
    try {
      const auctionCount = await liquidationQueue.getAuctionCount();
      const currentBlock = await contracts.provider.getBlockNumber();
      for (let i = 0; i < auctionCount; i++) {
        const [, , endBlock, , , , , settled] = await liquidationQueue.getAuction(i);
        if (!settled && currentBlock > Number(endBlock)) {
          await withRetry(async () => {
            const tx = await liquidationQueue.settleAuction(i);
            await tx.wait();
            console.log(`  Auction #${i} settled`);
          }, `settle #${i}`).catch(() => {});
        }
      }
    } catch {}

    // Short pause between rounds
    await sleep(2000);
  }

  // Final status
  console.log("\n=== Final State ===");
  const finalCount = await registry.getAgentCount();
  for (let i = 0; i < finalCount; i++) {
    const a = await registry.getAgent(i);
    const types = ["WORKER", "SPENDER", "ARBITRAGEUR"];
    const statuses = ["ACTIVE", "DISTRESSED", "BANKRUPT", "DORMANT"];
    console.log(`  #${i} ${types[Number(a.agentType)].padEnd(12)} ${statuses[Number(a.status)].padEnd(10)} ${formatBal(a.balance).padStart(10)} FIL  tasks:${a.tasksCompleted}  earned:${formatBal(a.totalEarned)}  spent:${formatBal(a.totalSpent)}`);
  }

  const taskCount = await taskMarket.getTaskCount();
  const loanCount = await lendingPool.getLoanCount();
  const auctionCount = await liquidationQueue.getAuctionCount();
  console.log(`\n  Tasks: ${taskCount} | Loans: ${loanCount} | Auctions: ${auctionCount}`);
  console.log("\n=== Done — run 'npm run agents' for real IPFS CIDs ===");
}

main().catch(console.error);
