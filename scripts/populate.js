/**
 * Populate on-chain history — correct story arc with all event types.
 *
 * Story:
 *   Rounds 1-4: Everyone earns, fees each round (small drain)
 *   Rounds 5-7: Workers only earn, fees each round (spenders drain toward distress)
 *   → Arbs query + lend to distressed spenders
 *   Rounds 8-9: More fees → bankruptcies → auctions → arb bids
 */
require("dotenv").config();
const { getContracts, getAgentContracts } = require("../agents/contracts");
const { formatBal } = require("../agents/utils");
const { ethers } = require("ethers");

const WAIT = 2500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

process.on("unhandledRejection", () => {});
process.on("uncaughtException", (err) => {
  const msg = String(err.code || "") + " " + String(err.message || "");
  if (/TIMEOUT|ECONN|EHOST|EADDR|SOCKET|UND_ERR|EPIPE|timeout|ETIMEDOUT/i.test(msg)) {
    console.log(`  [swallowed] ${err.code || msg.slice(0, 40)}`);
    return;
  }
  console.error("Fatal:", err);
  process.exit(1);
});

async function tx(fn, label, retries = 5) {
  for (let i = 1; i <= retries; i++) {
    try {
      const t = await fn();
      if (t && t.wait) await t.wait();
      return t;
    } catch (e) {
      console.log(`  [${i}/${retries}] ${label}: ${(e.code || e.message?.split("\n")[0] || "").slice(0, 55)}`);
      if (i === retries) return null;
      await sleep(5000 * i);
    }
  }
}

async function showStatus(registry) {
  try {
    const types = ["WRK", "SPD", "ARB"];
    const st = ["ACTIVE", "DISTRESS", "BANKRUPT", "DORMANT"];
    for (let i = 0; i < 7; i++) {
      const a = await registry.getAgent(i);
      console.log(`  #${i} ${types[Number(a.agentType)]} ${st[Number(a.status)].padEnd(8)} ${formatBal(a.balance).padStart(8)} FIL  t:${a.tasksCompleted}`);
    }
  } catch { console.log("  (status failed)"); }
}

async function main() {
  const contracts = getContracts();
  const { registry, taskMarket, lendingPool, liquidationQueue } = contracts;
  const ctx = {};
  for (let i = 0; i < 7; i++) try { ctx[i] = getAgentContracts(i); } catch {}

  console.log("=== Populate On-Chain History ===\n");
  await showStatus(registry);

  // Helper: post 3 tasks + claim by specified agents
  async function doRound(round, workerIds, spenderIds) {
    console.log(`\n--- Round ${round} ---`);

    // Process fees every round (small incremental drain)
    await tx(() => registry.processFees(), "fees");
    await sleep(WAIT);

    // Post 3 tasks
    await tx(() =>
      taskMarket.postTasks(
        [round % 3, (round + 1) % 3, (round + 2) % 3],
        [`data-r${round}-0`, `data-r${round}-1`, `data-r${round}-2`],
        [ethers.parseEther("0.02"), ethers.parseEther("0.02"), ethers.parseEther("0.02")],
        200
      ), "post tasks");
    await sleep(WAIT);

    // Workers claim
    let avail = [];
    try { avail = await taskMarket.getAvailableTasks(); } catch {}
    let idx = 0;
    for (const w of workerIds) {
      if (idx >= avail.length) break;
      const ag = await registry.getAgent(w).catch(() => null);
      if (!ag || Number(ag.status) >= 2) continue;
      const tid = avail[idx++];
      await tx(async () => {
        await (await ctx[w].taskMarket.claimTask(tid, w)).wait();
        await (await ctx[w].taskMarket.completeTask(tid, w, `result-w${w}-r${round}`)).wait();
        console.log(`  Worker #${w} → task #${tid}`);
      }, `w#${w}`);
      await sleep(WAIT);
    }

    // Spenders claim from remaining available
    if (spenderIds.length > 0) {
      let avail2 = [];
      try { avail2 = await taskMarket.getAvailableTasks(); } catch {}
      let idx2 = 0;
      for (const s of spenderIds) {
        if (idx2 >= avail2.length) break;
        const ag = await registry.getAgent(s).catch(() => null);
        if (!ag || Number(ag.status) >= 2) continue;
        const tid = avail2[idx2++];
        await tx(async () => {
          await (await ctx[s].taskMarket.claimTask(tid, s)).wait();
          await (await ctx[s].taskMarket.completeTask(tid, s, `result-s${s}-r${round}`)).wait();
          console.log(`  Spender #${s} → task #${tid}`);
        }, `s#${s}`);
        await sleep(WAIT);
      }
    }

    await showStatus(registry);
  }

  // === Rounds 1-4: Everyone earns ===
  console.log("\n== Everyone earns ==");
  for (let r = 1; r <= 4; r++) {
    await doRound(r, [0, 1, 2], [3, 4]);
  }

  // === Rounds 5-7: Workers only (spenders drain) ===
  console.log("\n== Workers only — spenders draining ==");
  for (let r = 5; r <= 7; r++) {
    await doRound(r, [0, 1, 2], []);
  }

  // === ARB ACTIVITY — spenders should be distressed now ===
  console.log("\n== Arb intel + lending ==");
  let distressed = [];
  try { distressed = await registry.getDistressedAgents(); } catch {}
  console.log(`  Distressed: [${distressed.map(Number)}]`);

  // If nobody distressed yet, one more fee round
  if (distressed.length === 0) {
    console.log("  Extra fee round to push into distress...");
    await tx(() => registry.processFees(), "fees");
    await sleep(WAIT);
    try { distressed = await registry.getDistressedAgents(); } catch {}
    console.log(`  Distressed now: [${distressed.map(Number)}]`);
    await showStatus(registry);
  }

  // Arb intel queries
  for (const arbId of [5, 6]) {
    const arbAg = await registry.getAgent(arbId).catch(() => null);
    if (!arbAg || Number(arbAg.status) >= 2) continue;

    for (const tgt of distressed.slice(0, 3)) {
      const result = await tx(() => ctx[arbId].registry.queryAgentState(arbId, tgt), `arb#${arbId} query`);
      if (result) console.log(`  Arb #${arbId} queried #${Number(tgt)} (paid 0.001 FIL)`);
      else console.log(`  Arb #${arbId} query #${Number(tgt)} FAILED`);
      await sleep(WAIT);
    }

    // Lend to distressed — use wallet's native balance (not on-chain tracked balance)
    for (const tgt of distressed.slice(0, 2)) {
      const tgtAg = await registry.getAgent(tgt).catch(() => null);
      if (!tgtAg || Number(tgtAg.status) === 2) continue; // skip bankrupt
      const walletBal = await ctx[arbId].signer.provider.getBalance(ctx[arbId].signer.address);
      const amt = walletBal / 5n; // use 20% of native wallet balance
      if (amt > ethers.parseEther("0.01")) {
        const result = await tx(() =>
          ctx[arbId].lendingPool.offerLoan(arbId, Number(tgt), 500n, 40n, { value: amt }),
          `arb#${arbId} loan`
        );
        if (result) console.log(`  Arb #${arbId} lent ${formatBal(amt)} FIL → Agent #${Number(tgt)}`);
        else console.log(`  Arb #${arbId} loan to #${Number(tgt)} FAILED`);
        await sleep(WAIT);
      }
    }
  }

  await showStatus(registry);

  // === Rounds 8-9: Final push → bankruptcies ===
  console.log("\n== Final push ==");
  for (let r = 8; r <= 9; r++) {
    await doRound(r, [0, 1, 2], []);
  }

  // Extra fee rounds to bankrupt remaining distressed
  for (let i = 0; i < 2; i++) {
    await tx(() => registry.processFees(), "fees");
    await sleep(WAIT);
  }
  await showStatus(registry);

  // Trigger liquidations
  try {
    const bankrupt = await registry.getAgentsByStatus(2);
    for (const agentId of bankrupt) {
      const already = await liquidationQueue.agentLiquidated(agentId);
      if (!already) {
        const result = await tx(() =>
          liquidationQueue.triggerLiquidation(agentId, [], ethers.parseEther("0.01")),
          "liquidate"
        );
        if (result) console.log(`  AUCTION for Agent #${agentId}`);
        else console.log(`  AUCTION for Agent #${agentId} FAILED`);
        await sleep(WAIT);
      }
    }
  } catch {}

  // Arbs bid on auctions
  try {
    const active = await liquidationQueue.getActiveAuctions();
    for (const aId of active) {
      for (const arbId of [5, 6]) {
        const arbAg = await registry.getAgent(arbId).catch(() => null);
        if (!arbAg || Number(arbAg.status) >= 2) continue;
        const walletBal = await ctx[arbId].signer.provider.getBalance(ctx[arbId].signer.address);
        const bid = walletBal / 5n;
        if (bid > ethers.parseEther("0.01")) {
          const result = await tx(() =>
            ctx[arbId].liquidationQueue.submitBid(aId, arbId, { value: bid }),
            "bid"
          );
          if (result) console.log(`  Arb #${arbId} bid ${formatBal(bid)} on Auction #${aId}`);
          else console.log(`  Arb #${arbId} bid on Auction #${aId} FAILED`);
          await sleep(WAIT);
          break;
        }
      }
    }
  } catch {}

  // === Final ===
  console.log("\n=== FINAL STATE ===");
  await showStatus(registry);
  try {
    const tc = await taskMarket.getTaskCount();
    const lc = await lendingPool.getLoanCount();
    const ac = await liquidationQueue.getAuctionCount();
    console.log(`\n  Tasks: ${tc} | Loans: ${lc} | Auctions: ${ac}`);
  } catch {}
}

main().catch(console.error);
