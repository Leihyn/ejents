/**
 * Simulated economy — generates realistic on-chain history with all event types.
 *
 * Strategy: interleave fees with tasks so spenders gradually drain,
 * arbs lend while they're DISTRESSED (not bankrupt), and eventually
 * one agent goes bankrupt → auction.
 */
require("dotenv").config();
const { getContracts, getAgentContracts } = require("../agents/contracts");
const { formatBal, sleep } = require("../agents/utils");
const { ethers } = require("ethers");

// Prevent unhandled rejections from killing the process
process.on("unhandledRejection", (err) => {
  console.log(`  [unhandled] ${err.code || err.message?.split("\n")[0]?.slice(0, 60)}`);
});

async function retry(fn, label, n = 5) {
  for (let i = 1; i <= n; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === n) throw e;
      console.log(`  [retry ${i}/${n}] ${label}: ${(e.code || e.message?.split("\n")[0])?.slice(0, 50)}`);
      await sleep(5000 * i);
    }
  }
}

async function status(registry) {
  const count = await registry.getAgentCount();
  const types = ["WRK", "SPD", "ARB"];
  const st = ["ACTIVE", "DISTRESS", "BANKRUPT", "DORMANT"];
  const lines = [];
  for (let i = 0; i < count; i++) {
    const a = await registry.getAgent(i);
    lines.push(`  #${i} ${types[Number(a.agentType)].padEnd(4)} ${st[Number(a.status)].padEnd(8)} ${formatBal(a.balance).padStart(8)} FIL  t:${a.tasksCompleted}`);
  }
  console.log(lines.join("\n"));
}

async function main() {
  console.log("=== Economy Simulation ===\n");
  const contracts = getContracts();
  const { registry, taskMarket, lendingPool, liquidationQueue } = contracts;

  const ctx = {};
  for (let i = 0; i < 7; i++) {
    try { ctx[i] = getAgentContracts(i); } catch {}
  }

  let taskIdCounter = Number(await taskMarket.getTaskCount());

  for (let round = 1; round <= 15; round++) {
    console.log(`\n─── Round ${round} ───`);

    // Process fees
    await retry(async () => {
      const tx = await registry.processFees();
      await tx.wait();
    }, "fees");

    await status(registry);

    // Post 3 tasks (if treasury allows)
    const treasury = await taskMarket.getTreasuryBalance();
    if (treasury > ethers.parseEther("0.06")) {
      await retry(async () => {
        const types = [round % 3, (round + 1) % 3, (round + 2) % 3];
        const cids = types.map((_, i) => `sim-r${round}-t${i}`);
        const rewards = types.map(() => ethers.parseEther("0.02"));
        const tx = await taskMarket.postTasks(types, cids, rewards, 200);
        await tx.wait();
        console.log(`  Posted 3 tasks`);
      }, "post tasks");
    }

    // Workers always claim (if not bankrupt)
    const avail = await taskMarket.getAvailableTasks();
    let taskIdx = 0;
    for (const wId of [0, 1, 2]) {
      if (taskIdx >= avail.length) break;
      const ag = await registry.getAgent(wId);
      if (Number(ag.status) >= 2) continue;
      const tid = avail[taskIdx++];
      await retry(async () => {
        await (await ctx[wId].taskMarket.claimTask(tid, wId)).wait();
        await (await ctx[wId].taskMarket.completeTask(tid, wId, `result-w${wId}-r${round}`)).wait();
        console.log(`  Worker #${wId} → task #${tid}`);
      }, `w#${wId}`).catch(() => {});
    }

    // Spenders claim only in early rounds (they slow down)
    if (round <= 8) {
      const avail2 = await taskMarket.getAvailableTasks();
      let ti2 = 0;
      for (const sId of [3, 4]) {
        if (ti2 >= avail2.length) break;
        const ag = await registry.getAgent(sId);
        if (Number(ag.status) >= 2) continue;
        const tid = avail2[ti2++];
        await retry(async () => {
          await (await ctx[sId].taskMarket.claimTask(tid, sId)).wait();
          await (await ctx[sId].taskMarket.completeTask(tid, sId, `result-s${sId}-r${round}`)).wait();
          console.log(`  Spender #${sId} → task #${tid}`);
        }, `s#${sId}`).catch(() => {});
      }
    }

    // Arbs: intel queries + lend from round 5+
    if (round >= 5) {
      const distressed = await registry.getDistressedAgents();
      if (distressed.length > 0) {
        console.log(`  Distressed: ${distressed.map(Number)}`);
      }

      for (const arbId of [5, 6]) {
        const arbAg = await registry.getAgent(arbId);
        if (Number(arbAg.status) >= 2) continue;

        // Paid intel queries
        for (const tgt of distressed.slice(0, 2)) {
          await retry(async () => {
            await (await ctx[arbId].registry.queryAgentState(arbId, tgt)).wait();
            console.log(`  Arb #${arbId} queried #${tgt} (0.001 FIL)`);
          }, "query").catch(() => {});
        }

        // Lend to first distressed (small amount)
        if (distressed.length > 0) {
          const tgt = Number(distressed[0]);
          const amt = arbAg.balance / 8n;
          if (amt > ethers.parseEther("0.01")) {
            await retry(async () => {
              await (await ctx[arbId].lendingPool.offerLoan(arbId, tgt, 500n, 30n, { value: amt })).wait();
              console.log(`  Arb #${arbId} lent ${formatBal(amt)} → #${tgt}`);
            }, "loan").catch(e => console.log(`  Loan failed: ${e.message.split("\n")[0].slice(0, 50)}`));
          }
        }
      }
    }

    // Check for bankruptcies → liquidate
    try {
      const bankrupt = await registry.getAgentsByStatus(2);
      for (const agentId of bankrupt) {
        const already = await liquidationQueue.agentLiquidated(agentId);
        if (!already) {
          await retry(async () => {
            await (await liquidationQueue.triggerLiquidation(agentId, [], ethers.parseEther("0.01"))).wait();
            console.log(`  LIQUIDATION: Auction for Agent #${agentId}`);
          }, "liq").catch(() => {});
        }
      }
    } catch {}

    // Settle expired auctions
    try {
      const aCnt = await liquidationQueue.getAuctionCount();
      const block = await contracts.provider.getBlockNumber();
      for (let i = 0; i < aCnt; i++) {
        const [, , endBlock, , , , , settled] = await liquidationQueue.getAuction(i);
        if (!settled && block > Number(endBlock)) {
          await retry(async () => {
            await (await liquidationQueue.settleAuction(i)).wait();
            console.log(`  Auction #${i} settled`);
          }, "settle").catch(() => {});
        }
      }
    } catch {}

    // Arbs bid on active auctions
    try {
      const active = await liquidationQueue.getActiveAuctions();
      for (const aId of active) {
        for (const arbId of [5, 6]) {
          const arbAg = await registry.getAgent(arbId);
          if (Number(arbAg.status) >= 2) continue;
          const bid = arbAg.balance / 5n;
          if (bid > ethers.parseEther("0.01")) {
            await retry(async () => {
              await (await ctx[arbId].liquidationQueue.submitBid(aId, arbId, { value: bid })).wait();
              console.log(`  Arb #${arbId} bid ${formatBal(bid)} on Auction #${aId}`);
            }, "bid").catch(() => {});
            break;
          }
        }
      }
    } catch {}

    await sleep(3000);
  }

  console.log("\n=== Final ===");
  await status(registry);
  const tc = await taskMarket.getTaskCount();
  const lc = await lendingPool.getLoanCount();
  const ac = await liquidationQueue.getAuctionCount();
  console.log(`\n  Tasks: ${tc} | Loans: ${lc} | Auctions: ${ac}`);
}

main().catch(console.error);
