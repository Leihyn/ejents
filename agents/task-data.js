/**
 * Task Data Pipeline — real Filecoin read → compute → Filecoin write
 *
 * Three task types:
 *   HEALTH_CHECK (STORE)    — Economy health metrics
 *   RISK_SCORE (RETRIEVE)   — Per-agent risk ranking + anomaly detection
 *   FILECOIN_ANALYSIS (VERIFY) — Real Filecoin network analysis (miner power, storage stats)
 */
const { ethers } = require("ethers");
const { writeState, readState } = require("./filecoin");
const { formatBal } = require("./utils");

const FILECOIN_RPC = "https://api.calibration.node.glif.io/rpc/v1";

// --- Task Types ---
const TASK_TYPES = ["HEALTH_CHECK", "RISK_SCORE", "FILECOIN_ANALYSIS"];

// --- CID Registry (maps taskId → real IPFS CID for worker fetching) ---
const cidRegistry = {
  taskData: {},
  taskResults: {},
  latestResults: {},
};

/**
 * Keeper: build economy snapshot + Filecoin network data, pin to Filecoin.
 */
async function buildTaskPayload(registry, cycle, taskTypeIndex) {
  const taskType = TASK_TYPES[taskTypeIndex % TASK_TYPES.length];
  const agentCount = await registry.getAgentCount();
  const agents = [];

  for (let i = 0; i < agentCount; i++) {
    const a = await registry.getAgent(i);
    agents.push({
      id: i,
      balance: formatBal(a.balance),
      status: Number(a.status),
      tasksCompleted: Number(a.tasksCompleted),
      totalEarned: formatBal(a.totalEarned),
      totalSpent: formatBal(a.totalSpent),
      wallet: a.owner,
    });
  }

  const payload = {
    type: "TASK_DATA",
    taskType,
    cycle,
    agentSnapshots: agents,
    timestamp: Date.now(),
  };

  // For FILECOIN_ANALYSIS tasks, include real network data
  if (taskType === "FILECOIN_ANALYSIS") {
    try {
      const networkData = await fetchFilecoinNetworkData();
      payload.filecoinNetwork = networkData;
    } catch (e) {
      console.log(`[task-data] Filecoin network fetch failed: ${e.message.split("\n")[0]}`);
    }
  }

  const result = await writeState(`task-${taskType}-${cycle}`, payload);
  if (!result) return null;

  return {
    cid: result.cid,
    taskType,
    payload,
  };
}

/**
 * Fetch real Filecoin network data from Calibration testnet RPC
 */
async function fetchFilecoinNetworkData() {
  // Get chain head
  const headRes = await filRpc("Filecoin.ChainHead", []);
  const height = headRes?.Height || 0;

  // Sample miners and get power data
  const minerList = await filRpc("Filecoin.StateListMiners", [null]);
  const totalMiners = minerList ? minerList.length : 0;

  // Sample 10 random miners for power analysis
  const sampleSize = Math.min(10, totalMiners);
  const sampledMiners = [];
  const indices = new Set();
  while (indices.size < sampleSize && indices.size < totalMiners) {
    indices.add(Math.floor(Math.random() * totalMiners));
  }

  let totalRawPower = 0n;
  let totalQAPower = 0n;
  let networkRawPower = 0n;
  let networkQAPower = 0n;
  let activeMinerCount = 0;

  for (const idx of indices) {
    const minerId = minerList[idx];
    try {
      const power = await filRpc("Filecoin.StateMinerPower", [minerId, null]);
      if (power) {
        const rawPower = BigInt(power.MinerPower?.RawBytePower || "0");
        const qaPower = BigInt(power.MinerPower?.QualityAdjPower || "0");
        const hasMinPower = power.HasMinPower || false;

        if (rawPower > 0n) activeMinerCount++;
        totalRawPower += rawPower;
        totalQAPower += qaPower;

        if (networkRawPower === 0n) {
          networkRawPower = BigInt(power.TotalPower?.RawBytePower || "0");
          networkQAPower = BigInt(power.TotalPower?.QualityAdjPower || "0");
        }

        sampledMiners.push({
          id: minerId,
          rawPowerTiB: Number(rawPower / (1024n ** 4n)),
          qaPowerTiB: Number(qaPower / (1024n ** 4n)),
          hasMinPower,
        });
      }
    } catch {
      // Skip failed miners
    }
  }

  return {
    chainHeight: height,
    totalMiners,
    sampledMiners: sampledMiners.length,
    activeInSample: activeMinerCount,
    networkRawPowerTiB: Number(networkRawPower / (1024n ** 4n)),
    networkQAPowerTiB: Number(networkQAPower / (1024n ** 4n)),
    minerSample: sampledMiners,
    fetchedAt: Date.now(),
  };
}

async function filRpc(method, params) {
  const res = await fetch(FILECOIN_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

/**
 * Worker/Spender: fetch task data from Filecoin, compute, write result.
 * Returns real CID string for on-chain storage.
 */
async function processTaskData(taskId, agentId, agentType, contracts) {
  const task = await contracts.taskMarket.getTask(taskId);
  const taskTypeIndex = Number(task.taskType);
  const taskType = TASK_TYPES[taskTypeIndex % TASK_TYPES.length];

  // Fetch task data from Filecoin
  const realCid = cidRegistry.taskData[Number(taskId)];
  let sourceData = null;
  let sourceCID = null;

  if (realCid) {
    sourceData = await readState(realCid);
    sourceCID = realCid;
  }

  // Also try the on-chain dataCID (now a real IPFS CID string)
  if (!sourceData && task.dataCID && task.dataCID.startsWith("baf")) {
    sourceData = await readState(task.dataCID);
    sourceCID = task.dataCID;
  }

  // Compute
  let computed;
  if (sourceData && sourceData.agentSnapshots) {
    computed = computeMetrics(taskType, sourceData.agentSnapshots, sourceData.filecoinNetwork);
  } else {
    const agentCount = await contracts.registry.getAgentCount();
    const snapshots = [];
    for (let i = 0; i < agentCount; i++) {
      const a = await contracts.registry.getAgent(i);
      snapshots.push({
        id: i,
        balance: formatBal(a.balance),
        status: Number(a.status),
        tasksCompleted: Number(a.tasksCompleted),
        totalEarned: formatBal(a.totalEarned),
        totalSpent: formatBal(a.totalSpent),
      });
    }
    computed = computeMetrics(taskType, snapshots, null);
    sourceCID = "on-chain-fallback";
  }

  // DAG lineage
  const parentResult = cidRegistry.latestResults[taskType] || null;

  const result = {
    type: "TASK_RESULT",
    taskId: Number(taskId),
    taskType,
    agentId: Number(agentId),
    agentType,
    sourceCID,
    parentResultCID: parentResult ? parentResult.cid : null,
    round: parentResult ? (parentResult.round || 0) + 1 : 1,
    computed,
    timestamp: Date.now(),
  };

  const pinResult = await writeState(`result-${agentId}-task${taskId}`, result);
  if (!pinResult) return null;

  // Update registry
  cidRegistry.taskResults[Number(taskId)] = {
    cid: pinResult.cid,
    agentId: Number(agentId),
    taskType,
  };
  cidRegistry.latestResults[taskType] = {
    cid: pinResult.cid,
    taskId: Number(taskId),
    agentId: Number(agentId),
    round: result.round,
    timestamp: Date.now(),
  };

  return {
    cid: pinResult.cid,
    computed,
    taskType,
  };
}

/**
 * Arbitrageur: fetch latest worker results from Filecoin.
 */
async function fetchEconomicIntelligence() {
  const intelligence = {};

  for (const taskType of TASK_TYPES) {
    const latest = cidRegistry.latestResults[taskType];
    if (!latest) continue;

    const data = await readState(latest.cid);
    if (data && data.computed) {
      intelligence[taskType] = {
        ...data.computed,
        sourceCID: latest.cid,
        producedBy: latest.agentId,
        round: latest.round,
        age: Date.now() - latest.timestamp,
      };
    }
  }

  return Object.keys(intelligence).length > 0 ? intelligence : null;
}

// --- Compute Functions ---

function computeMetrics(taskType, snapshots, filecoinNetwork) {
  switch (taskType) {
    case "HEALTH_CHECK":
      return computeHealthCheck(snapshots);
    case "RISK_SCORE":
      return computeRiskScore(snapshots);
    case "FILECOIN_ANALYSIS":
      return computeFilecoinAnalysis(snapshots, filecoinNetwork);
    default:
      return computeHealthCheck(snapshots);
  }
}

function computeHealthCheck(snapshots) {
  const balances = snapshots.map((s) => parseFloat(s.balance));
  const total = balances.reduce((a, b) => a + b, 0);
  const avg = total / balances.length;
  const belowThreshold = snapshots
    .filter((s) => parseFloat(s.balance) < 0.05)
    .map((s) => ({ id: s.id, balance: s.balance, status: s.status }));

  return {
    metric: "HEALTH_CHECK",
    totalBalance: total.toFixed(4),
    avgBalance: avg.toFixed(4),
    minBalance: Math.min(...balances).toFixed(4),
    maxBalance: Math.max(...balances).toFixed(4),
    agentCount: snapshots.length,
    activeCount: snapshots.filter((s) => s.status === 0).length,
    distressedCount: snapshots.filter((s) => s.status === 1).length,
    bankruptCount: snapshots.filter((s) => s.status === 2).length,
    belowThreshold,
  };
}

function computeRiskScore(snapshots) {
  const scored = snapshots.map((s) => {
    const balance = parseFloat(s.balance);
    const spent = parseFloat(s.totalSpent);
    const earned = parseFloat(s.totalEarned);
    const tasks = s.tasksCompleted;

    const burnRate = tasks > 0 ? spent / tasks : 0;
    const earnRate = tasks > 0 ? earned / tasks : 0;
    const netRate = earnRate - burnRate;
    const risk = balance < 0.01 ? 1.0 : Math.max(0, Math.min(1, (burnRate - earnRate) / (balance + 0.001)));

    // Anomaly detection: flag agents whose behavior deviates from their type
    // Workers should earn steadily, Spenders burn fast, Arbitrageurs hold
    let anomaly = null;
    if (s.status !== 2) { // Not bankrupt
      const typeExpectations = {
        0: { minEarnRate: 0.01, maxBurnRate: 0.02, label: "WORKER" },   // Workers earn, low burn
        1: { minEarnRate: 0, maxBurnRate: 999, label: "SPENDER" },       // Spenders burn wildly
        2: { minEarnRate: 0, maxBurnRate: 0.005, label: "ARBITRAGEUR" }, // Arbs hold capital
      };
      // Infer type from position: 0-2 workers, 3-4 spenders, 5-6 arbs
      const inferredType = s.id <= 2 ? 0 : s.id <= 4 ? 1 : 2;
      const expect = typeExpectations[inferredType];
      if (expect && tasks > 0) {
        if (earnRate < expect.minEarnRate && tasks > 2) {
          anomaly = `${expect.label} earning below expected (${earnRate.toFixed(4)} < ${expect.minEarnRate})`;
        }
        if (burnRate > expect.maxBurnRate && inferredType !== 1) {
          anomaly = `${expect.label} burning faster than expected (${burnRate.toFixed(4)} > ${expect.maxBurnRate})`;
        }
      }
    }

    return {
      id: s.id,
      balance: s.balance,
      risk: risk.toFixed(4),
      burnRate: burnRate.toFixed(4),
      earnRate: earnRate.toFixed(4),
      netRate: netRate.toFixed(4),
      survivalEstimate: netRate >= 0 ? "stable" : `${Math.floor(balance / Math.abs(netRate))} tasks`,
      anomaly,
    };
  });

  scored.sort((a, b) => parseFloat(b.risk) - parseFloat(a.risk));
  const anomalies = scored.filter((s) => s.anomaly);

  return {
    metric: "RISK_SCORE",
    rankings: scored,
    highestRisk: scored[0],
    lowestRisk: scored[scored.length - 1],
    avgRisk: (scored.reduce((a, s) => a + parseFloat(s.risk), 0) / scored.length).toFixed(4),
    anomalies,
    anomalyCount: anomalies.length,
  };
}

function computeFilecoinAnalysis(snapshots, filecoinNetwork) {
  // Agent economy flow analysis
  let totalEarned = 0, totalSpent = 0, totalTasks = 0;
  const flows = snapshots.map((s) => {
    const earned = parseFloat(s.totalEarned);
    const spent = parseFloat(s.totalSpent);
    totalEarned += earned;
    totalSpent += spent;
    totalTasks += s.tasksCompleted;
    return { id: s.id, netFlow: (earned - spent).toFixed(4), earned: s.totalEarned, spent: s.totalSpent, tasks: s.tasksCompleted };
  });

  // Gini coefficient (wealth inequality)
  const balances = snapshots.map(s => parseFloat(s.balance)).sort((a, b) => a - b);
  const n = balances.length;
  const totalBalance = balances.reduce((a, b) => a + b, 0);
  let giniNum = 0;
  for (let i = 0; i < n; i++) {
    giniNum += (2 * (i + 1) - n - 1) * balances[i];
  }
  const gini = totalBalance > 0 ? (giniNum / (n * totalBalance)).toFixed(4) : "0";

  // Velocity of money (transaction volume / supply)
  const velocity = totalBalance > 0 ? ((totalEarned + totalSpent) / totalBalance).toFixed(4) : "0";

  const result = {
    metric: "FILECOIN_ANALYSIS",
    economy: {
      totalEarned: totalEarned.toFixed(4),
      totalSpent: totalSpent.toFixed(4),
      netSystemFlow: (totalEarned - totalSpent).toFixed(4),
      totalTasks,
      giniCoefficient: gini,
      moneyVelocity: velocity,
      producers: flows.filter((f) => parseFloat(f.netFlow) > 0).map((p) => p.id),
      consumers: flows.filter((f) => parseFloat(f.netFlow) <= 0).map((c) => c.id),
    },
    flows,
  };

  // Include real Filecoin network data if available
  if (filecoinNetwork) {
    result.filecoinNetwork = {
      chainHeight: filecoinNetwork.chainHeight,
      totalMiners: filecoinNetwork.totalMiners,
      networkRawPowerTiB: filecoinNetwork.networkRawPowerTiB,
      networkQAPowerTiB: filecoinNetwork.networkQAPowerTiB,
      sampledMiners: filecoinNetwork.sampledMiners,
      activeInSample: filecoinNetwork.activeInSample,
      minerPowerDistribution: filecoinNetwork.minerSample?.map(m => ({
        id: m.id,
        rawPowerTiB: m.rawPowerTiB,
        hasMinPower: m.hasMinPower,
      })),
    };
  }

  return result;
}

module.exports = {
  TASK_TYPES,
  cidRegistry,
  buildTaskPayload,
  processTaskData,
  fetchEconomicIntelligence,
  fetchFilecoinNetworkData,
};
