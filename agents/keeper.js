/**
 * Keeper — processes fees on schedule and posts new tasks to keep economy alive
 * Now writes real economy snapshots to Filecoin as task dataCIDs
 */
const { ethers } = require("ethers");
const { getContracts } = require("./contracts");
const { sleep, formatBal } = require("./utils");
const { buildTaskPayload, cidRegistry } = require("./task-data");

async function runKeeper() {
  const contracts = getContracts();
  const { registry, taskMarket, liquidationQueue } = contracts;
  const config = contracts.config;

  console.log("[keeper] Starting fee processor & task generator");
  console.log(`[keeper] Fee: ${config.storageFee} FIL every ${config.feeInterval} blocks\n`);

  let cycle = 0;

  while (true) {
    cycle++;
    console.log(`\n[keeper] === Cycle ${cycle} ===`);

    try {
      // Process fees
      console.log("[keeper] Processing fees...");
      const feeTx = await registry.processFees();
      await feeTx.wait();
      console.log("[keeper] Fees processed");

      // Print agent status summary
      const agentCount = await registry.getAgentCount();
      for (let i = 0; i < agentCount; i++) {
        const agent = await registry.getAgent(i);
        const statusNames = ["ACTIVE", "DISTRESSED", "BANKRUPT", "DORMANT"];
        const typeNames = ["WORKER", "SPENDER", "ARBITRAGEUR"];
        console.log(
          `  #${i} ${typeNames[Number(agent.agentType)].padEnd(12)} ${statusNames[Number(agent.status)].padEnd(10)} ${formatBal(agent.balance).padStart(10)} FIL  tasks:${agent.tasksCompleted}`
        );
      }

      // Check for bankrupt agents that need liquidation
      const bankruptAgents = await registry.getAgentsByStatus(2); // BANKRUPT
      for (const agentId of bankruptAgents) {
        const alreadyLiquidated = await liquidationQueue.agentLiquidated(agentId);
        if (!alreadyLiquidated) {
          const agent = await registry.getAgent(agentId);
          console.log(`[keeper] Triggering liquidation for Agent #${agentId}...`);
          const assetCIDs = agent.stateCID !== ethers.ZeroHash ? [agent.stateCID] : [];
          const reservePrice = ethers.parseEther("0.01");
          const liqTx = await liquidationQueue.triggerLiquidation(agentId, assetCIDs, reservePrice);
          await liqTx.wait();
          console.log(`[keeper] Auction created for Agent #${agentId}`);
        }
      }

      // Settle ended auctions
      const auctionCount = await liquidationQueue.getAuctionCount();
      for (let i = 0; i < auctionCount; i++) {
        const [, , endBlock, , , , , settled] = await liquidationQueue.getAuction(i);
        const currentBlock = await contracts.provider.getBlockNumber();
        if (!settled && currentBlock > Number(endBlock)) {
          console.log(`[keeper] Settling auction #${i}...`);
          try {
            const settleTx = await liquidationQueue.settleAuction(i);
            await settleTx.wait();
            console.log(`[keeper] Auction #${i} settled`);
          } catch (e) {
            console.log(`[keeper] Settle failed: ${e.message.split("\n")[0].slice(0, 60)}`);
          }
        }
      }

      // Post new tasks with real Filecoin-backed data payloads
      const treasury = await taskMarket.getTreasuryBalance();
      if (treasury > ethers.parseEther("0.1")) {
        const taskCount = 3;
        const taskTypes = [0, 1, 2]; // STORE=HEALTH_CHECK, RETRIEVE=RISK_SCORE, VERIFY=FLOW_ANALYSIS
        const dataCIDs = [];
        const rewards = [];

        for (let i = 0; i < taskCount; i++) {
          const payload = await buildTaskPayload(registry, cycle, taskTypes[i]);
          if (payload) {
            dataCIDs.push(payload.cidHash);
            // Store real CID so workers can fetch it
            const nextTaskId = await taskMarket.getTaskCount();
            cidRegistry.taskData[Number(nextTaskId) + i] = payload.cid;
            console.log(`[keeper] Task data pinned: ${payload.taskType} → ${payload.cid.slice(0, 20)}...`);
          } else {
            dataCIDs.push(ethers.id(`task-cycle${cycle}-${i}-${Date.now()}`));
          }
          rewards.push(ethers.parseEther("0.02"));
        }

        const taskTx = await taskMarket.postTasks(taskTypes, dataCIDs, rewards, 100);
        await taskTx.wait();
        console.log(`[keeper] Posted ${taskCount} tasks with Filecoin data payloads (treasury: ${formatBal(treasury)} FIL)`);
      } else {
        console.log(`[keeper] Treasury low: ${formatBal(treasury)} FIL — no new tasks`);
      }
    } catch (e) {
      console.error(`[keeper] Error:`, e.message.split("\n")[0]);
    }

    // Wait ~feeInterval blocks (30s per block on calibnet)
    const waitMs = Number(config.feeInterval) * 30 * 1000;
    console.log(`[keeper] Sleeping ${waitMs / 1000}s until next cycle...`);
    await sleep(waitMs);
  }
}

module.exports = { runKeeper };

// Run directly
if (require.main === module) {
  runKeeper().catch(console.error);
}
