/**
 * EJENTS — Main agent orchestrator
 * Each agent signs with its own wallet. Keeper uses deployer key.
 */
const { getContracts, getAgentContracts } = require("./contracts");
const { workerBehavior } = require("./worker");
const { spenderBehavior } = require("./spender");
const { arbitrageurBehavior } = require("./arbitrageur");
const { sleep, formatBal } = require("./utils");
const { buildTaskPayload, cidRegistry, TASK_TYPES } = require("./task-data");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const CYCLE_PAUSE = 5000;
const ROUND_PAUSE = 15000;
const MAX_ROUNDS = parseInt(process.env.MAX_ROUNDS || "0", 10); // 0 = infinite

function makeLogger(agentId, name) {
  return (msg) => {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] #${agentId} ${name}: ${msg}`);
  };
}

async function processFees(contracts, cycle) {
  const { registry, taskMarket, liquidationQueue } = contracts;

  console.log(`\n[keeper] === Round ${cycle} — Processing fees ===`);
  try {
    const feeTx = await registry.processFees();
    await feeTx.wait();
  } catch (e) {
    console.log(`[keeper] Fee processing: ${e.message.split("\n")[0].slice(0, 80)}`);
  }

  // Print status
  const agentCount = await registry.getAgentCount();
  const types = ["WORKER", "SPENDER", "ARBITRAGEUR"];
  const statuses = ["ACTIVE", "DISTRESSED", "BANKRUPT", "DORMANT"];
  for (let i = 0; i < agentCount; i++) {
    const a = await registry.getAgent(i);
    console.log(
      `  #${i} ${types[Number(a.agentType)].padEnd(12)} ${statuses[Number(a.status)].padEnd(10)} ${formatBal(a.balance).padStart(12)} FIL  tasks:${a.tasksCompleted}  wallet:${a.owner.slice(0, 8)}...`
    );
  }

  // Liquidations
  try {
    const bankruptAgents = await registry.getAgentsByStatus(2);
    for (const agentId of bankruptAgents) {
      const already = await liquidationQueue.agentLiquidated(agentId);
      if (!already) {
        const agent = await registry.getAgent(agentId);
        console.log(`[keeper] Liquidating Agent #${agentId}...`);
        const cids = agent.stateCID ? [agent.stateCID] : [];
        const tx = await liquidationQueue.triggerLiquidation(agentId, cids, ethers.parseEther("0.01"));
        await tx.wait();
        console.log(`[keeper] Auction created for Agent #${agentId}`);
      }
    }
  } catch (e) {
    console.log(`[keeper] Liquidation check: ${e.message.split("\n")[0].slice(0, 60)}`);
  }

  // Settle auctions
  try {
    const auctionCount = await liquidationQueue.getAuctionCount();
    const currentBlock = await contracts.provider.getBlockNumber();
    for (let i = 0; i < auctionCount; i++) {
      const [, , endBlock, , , , , settled] = await liquidationQueue.getAuction(i);
      if (!settled && currentBlock > Number(endBlock)) {
        const tx = await liquidationQueue.settleAuction(i);
        await tx.wait();
        console.log(`[keeper] Auction #${i} settled`);
      }
    }
  } catch {}

  // Post tasks with real Filecoin data payloads (real CID strings on-chain)
  try {
    const treasury = await taskMarket.getTreasuryBalance();
    if (treasury > ethers.parseEther("0.1")) {
      const taskCount = 3;
      const taskTypes = [0, 1, 2]; // STORE=HEALTH_CHECK, RETRIEVE=RISK_SCORE, VERIFY=FILECOIN_ANALYSIS
      const dataCIDs = [];
      const rewards = [];

      for (let i = 0; i < taskCount; i++) {
        const payload = await buildTaskPayload(registry, cycle, taskTypes[i]);
        if (payload) {
          dataCIDs.push(payload.cid); // Real IPFS CID string!
          const nextTaskId = await taskMarket.getTaskCount();
          cidRegistry.taskData[Number(nextTaskId) + i] = payload.cid;
          console.log(`[keeper] Task data pinned: ${payload.taskType} → ${payload.cid.slice(0, 24)}...`);
        } else {
          dataCIDs.push(`fallback-task-r${cycle}-${i}`);
        }
        rewards.push(ethers.parseEther("0.02"));
      }

      const tx = await taskMarket.postTasks(taskTypes, dataCIDs, rewards, 100);
      await tx.wait();
      console.log(`[keeper] Posted ${taskCount} tasks with real IPFS CIDs on-chain (treasury: ${formatBal(treasury)} FIL)`);
    }
  } catch (e) {
    console.log(`[keeper] Task posting: ${e.message.split("\n")[0].slice(0, 60)}`);
  }
}

async function main() {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║     EJENTS — Autonomous Agent Economy     ║
  ║     Filecoin Calibration Testnet          ║
  ║     7 Agents · 7 Wallets · LLM Powered   ║
  ╚═══════════════════════════════════════════╝
  `);

  const contracts = getContracts();
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "agent-manifest.json"), "utf-8")
  );

  // Build per-agent contract instances (each with its own signer)
  const agentContractsMap = {};
  for (const agent of manifest) {
    try {
      agentContractsMap[agent.id] = getAgentContracts(agent.id);
      console.log(`Agent #${agent.id} ${agent.name}: wallet ${agentContractsMap[agent.id].signer.address.slice(0, 10)}...`);
    } catch (e) {
      console.log(`Agent #${agent.id} ${agent.name}: NO WALLET (${e.message})`);
    }
  }

  console.log("\nPipeline: Filecoin read → compute → Filecoin write → on-chain settle");
  console.log("Intel market: arbitrageurs pay 0.001 FIL per agent state query");
  console.log("");

  const behaviors = {
    WORKER: workerBehavior,
    SPENDER: spenderBehavior,
    ARBITRAGEUR: arbitrageurBehavior,
  };

  let round = 0;

  while (true) {
    round++;

    // Keeper (deployer key)
    await processFees(contracts, round);
    await sleep(CYCLE_PAUSE);

    // Each agent with its own wallet
    for (const agent of manifest) {
      const behaviorFn = behaviors[agent.type];
      if (!behaviorFn) continue;

      const agentCtx = agentContractsMap[agent.id];
      if (!agentCtx) continue;

      const log = makeLogger(agent.id, agent.name);
      try {
        const state = await contracts.registry.getAgent(agent.id);
        if (state.status === 3n) {
          log("BANKRUPT — skipping");
          continue;
        }
        await behaviorFn(agent.id, contracts, agentCtx, log);
      } catch (e) {
        log(`Error: ${e.message.split("\n")[0].slice(0, 80)}`);
      }
      await sleep(CYCLE_PAUSE);
    }

    console.log(`\n[system] Round ${round} complete.`);
    if (MAX_ROUNDS > 0 && round >= MAX_ROUNDS) {
      console.log(`[system] Reached MAX_ROUNDS=${MAX_ROUNDS}. Exiting.`);
      break;
    }
    console.log(`Waiting ${ROUND_PAUSE / 1000}s...\n`);
    await sleep(ROUND_PAUSE);
  }
}

main().catch(console.error);
