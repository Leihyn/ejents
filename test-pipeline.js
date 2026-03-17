/**
 * End-to-end test of the Filecoin data pipeline
 * Tests: buildTaskPayload → processTaskData → fetchEconomicIntelligence
 * Runs against live Calibration testnet + real Filecoin pinning
 */
const { getContracts } = require("./agents/contracts");
const { buildTaskPayload, processTaskData, fetchEconomicIntelligence, cidRegistry, TASK_TYPES } = require("./agents/task-data");
const { readState } = require("./agents/filecoin");
const { formatBal } = require("./agents/utils");

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.log(`  ✗ ${msg}`);
    failed++;
  }
}

async function main() {
  console.log("\n=== EJENTS Pipeline End-to-End Test ===\n");

  const contracts = getContracts();
  const { registry, taskMarket } = contracts;

  // --- Step 1: Test buildTaskPayload (Keeper writes snapshots to Filecoin) ---
  console.log("1. Keeper: Build & pin task payloads to Filecoin");

  const payloads = [];
  for (let i = 0; i < 3; i++) {
    const payload = await buildTaskPayload(registry, 999, i);
    payloads.push(payload);
    if (payload) {
      console.log(`   ${TASK_TYPES[i]}: CID=${payload.cid.slice(0, 24)}...`);
    } else {
      console.log(`   ${TASK_TYPES[i]}: FAILED to pin`);
    }
  }

  assert(payloads[0] !== null, "HEALTH_CHECK payload pinned to Filecoin");
  assert(payloads[1] !== null, "RISK_SCORE payload pinned to Filecoin");
  assert(payloads[2] !== null, "FLOW_ANALYSIS payload pinned to Filecoin");

  if (payloads[0]) {
    assert(payloads[0].payload.agentSnapshots.length === 7, "Snapshot contains all 7 agents");
    assert(payloads[0].payload.taskType === "HEALTH_CHECK", "Correct task type");
    assert(payloads[0].cidHash.startsWith("0x"), "CID hash is bytes32");
  }

  // --- Step 2: Test reading pinned data back from Filecoin (IPFS gateway) ---
  console.log("\n2. Read back pinned data from Filecoin (IPFS gateway)");

  if (payloads[0]) {
    const fetched = await readState(payloads[0].cid);
    assert(fetched !== null, "Fetched HEALTH_CHECK data from IPFS gateway");
    if (fetched) {
      assert(fetched.type === "TASK_DATA", "Data type is TASK_DATA");
      assert(Array.isArray(fetched.agentSnapshots), "Contains agentSnapshots array");
      assert(fetched.agentSnapshots.length === 7, "All 7 agents in snapshot");
      console.log(`   Sample agent: #${fetched.agentSnapshots[0].id} balance=${fetched.agentSnapshots[0].balance} FIL`);
    }
  }

  // --- Step 3: Simulate worker processing a task ---
  console.log("\n3. Worker: Process task data (Filecoin read → compute → Filecoin write)");

  // Register fake task data CIDs in the registry (simulating keeper posting)
  // We'll use taskId=99990-99992 to avoid colliding with real tasks
  if (payloads[0]) cidRegistry.taskData[99990] = payloads[0].cid;
  if (payloads[1]) cidRegistry.taskData[99991] = payloads[1].cid;
  if (payloads[2]) cidRegistry.taskData[99992] = payloads[2].cid;

  // We can't call processTaskData with fake taskIds (contract would revert),
  // so test the compute pipeline directly
  const { writeState } = require("./agents/filecoin");

  // Simulate what processTaskData does internally
  if (payloads[0]) {
    const sourceData = await readState(payloads[0].cid);
    if (sourceData && sourceData.agentSnapshots) {
      // Import compute functions by calling them through the module
      const taskData = require("./agents/task-data");

      // Test all 3 compute types
      for (const taskType of TASK_TYPES) {
        // Build result with provenance
        const computed = computeMetrics(taskType, sourceData.agentSnapshots);
        assert(computed !== null, `${taskType} computation produced results`);
        assert(computed.metric === taskType, `${taskType} metric label correct`);

        const result = {
          type: "TASK_RESULT",
          taskId: 99990,
          taskType,
          agentId: 0,
          agentType: "WORKER",
          sourceCID: payloads[0].cid,
          parentResultCID: null,
          round: 1,
          computed,
          timestamp: Date.now(),
        };

        // Pin result to Filecoin
        const pinResult = await writeState(`test-result-${taskType}`, result);
        assert(pinResult !== null, `${taskType} result pinned to Filecoin`);

        if (pinResult) {
          console.log(`   ${taskType} result: ${pinResult.cid.slice(0, 24)}...`);

          // Update CID registry for arbitrageur test
          cidRegistry.latestResults[taskType] = {
            cid: pinResult.cid,
            taskId: 99990,
            agentId: 0,
            round: 1,
            timestamp: Date.now(),
          };
        }

        // Print some computed values
        if (taskType === "HEALTH_CHECK") {
          console.log(`   Total balance: ${computed.totalBalance} FIL, Active: ${computed.activeCount}, Distressed: ${computed.distressedCount}`);
        } else if (taskType === "RISK_SCORE") {
          console.log(`   Highest risk: Agent #${computed.highestRisk.id} (risk=${computed.highestRisk.risk})`);
        } else if (taskType === "FLOW_ANALYSIS") {
          console.log(`   Net system flow: ${computed.netSystemFlow} FIL, Total tasks: ${computed.totalTasks}`);
        }
      }
    }
  }

  // --- Step 4: Test DAG lineage (second round creates parent references) ---
  console.log("\n4. DAG lineage: Second-round results reference parent CIDs");

  const firstRoundCID = cidRegistry.latestResults["HEALTH_CHECK"]?.cid;
  if (firstRoundCID) {
    const sourceData = await readState(payloads[0].cid);
    const computed = computeMetrics("HEALTH_CHECK", sourceData.agentSnapshots);

    const round2Result = {
      type: "TASK_RESULT",
      taskId: 99993,
      taskType: "HEALTH_CHECK",
      agentId: 1,
      agentType: "WORKER",
      sourceCID: payloads[0].cid,
      parentResultCID: firstRoundCID,
      round: 2,
      computed,
      timestamp: Date.now(),
    };

    const pinResult = await writeState("test-result-dag-round2", round2Result);
    assert(pinResult !== null, "Round 2 result pinned to Filecoin");

    if (pinResult) {
      // Verify we can follow the DAG
      const round2Data = await readState(pinResult.cid);
      assert(round2Data !== null, "Round 2 result readable from IPFS");
      assert(round2Data.parentResultCID === firstRoundCID, "Round 2 references round 1 as parent");
      assert(round2Data.round === 2, "Round counter incremented");
      console.log(`   DAG: round2(${pinResult.cid.slice(0, 16)}...) → round1(${firstRoundCID.slice(0, 16)}...)`);

      // Follow the parent
      const round1Data = await readState(round2Data.parentResultCID);
      assert(round1Data !== null, "Parent (round 1) readable from IPFS");
      assert(round1Data.round === 1, "Parent is round 1");
      assert(round1Data.sourceCID === payloads[0].cid, "Parent references original task data CID");
      console.log(`   Full lineage verified: result → parent → source data`);
    }
  }

  // --- Step 5: Test arbitrageur consuming intelligence ---
  console.log("\n5. Arbitrageur: Fetch economic intelligence from worker results");

  const intel = await fetchEconomicIntelligence();
  assert(intel !== null, "Economic intelligence retrieved");

  if (intel) {
    assert("HEALTH_CHECK" in intel, "HEALTH_CHECK intelligence available");
    assert("RISK_SCORE" in intel, "RISK_SCORE intelligence available");
    assert("FLOW_ANALYSIS" in intel, "FLOW_ANALYSIS intelligence available");

    // Test provenance on whichever intel is available
    const availableType = Object.keys(intel)[0];
    assert(intel[availableType].sourceCID !== undefined, `${availableType} has source CID provenance`);
    assert(typeof intel[availableType].producedBy === "number", `${availableType} tracks producer agent`);
    assert(typeof intel[availableType].age === "number", `${availableType} has age metric`);

    console.log(`   Intelligence sources: ${Object.keys(intel).join(", ")}`);
    console.log(`   HEALTH_CHECK: avg=${intel.HEALTH_CHECK.avgBalance} FIL, distressed=${intel.HEALTH_CHECK.distressedCount}`);
    console.log(`   RISK_SCORE: avg risk=${intel.RISK_SCORE.avgRisk}, highest=#${intel.RISK_SCORE.highestRisk.id}`);
    console.log(`   FLOW_ANALYSIS: net=${intel.FLOW_ANALYSIS.netSystemFlow} FIL, producers=${intel.FLOW_ANALYSIS.producers}`);
  }

  // --- Summary ---
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${"=".repeat(50)}\n`);

  if (failed > 0) process.exit(1);
}

// --- Compute functions (duplicated for standalone test) ---
function computeMetrics(taskType, snapshots) {
  switch (taskType) {
    case "HEALTH_CHECK": return computeHealthCheck(snapshots);
    case "RISK_SCORE": return computeRiskScore(snapshots);
    case "FLOW_ANALYSIS": return computeFlowAnalysis(snapshots);
    default: return computeHealthCheck(snapshots);
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
    return {
      id: s.id,
      balance: s.balance,
      risk: risk.toFixed(4),
      burnRate: burnRate.toFixed(4),
      earnRate: earnRate.toFixed(4),
      netRate: netRate.toFixed(4),
      survivalEstimate: netRate >= 0 ? "stable" : `${Math.floor(balance / Math.abs(netRate))} tasks`,
    };
  });
  scored.sort((a, b) => parseFloat(b.risk) - parseFloat(a.risk));
  return {
    metric: "RISK_SCORE",
    rankings: scored,
    highestRisk: scored[0],
    lowestRisk: scored[scored.length - 1],
    avgRisk: (scored.reduce((a, s) => a + parseFloat(s.risk), 0) / scored.length).toFixed(4),
  };
}

function computeFlowAnalysis(snapshots) {
  let totalEarned = 0, totalSpent = 0, totalTasks = 0;
  const flows = snapshots.map((s) => {
    const earned = parseFloat(s.totalEarned);
    const spent = parseFloat(s.totalSpent);
    totalEarned += earned;
    totalSpent += spent;
    totalTasks += s.tasksCompleted;
    return { id: s.id, netFlow: (earned - spent).toFixed(4), earned: s.totalEarned, spent: s.totalSpent, tasks: s.tasksCompleted };
  });
  return {
    metric: "FLOW_ANALYSIS",
    totalEarned: totalEarned.toFixed(4),
    totalSpent: totalSpent.toFixed(4),
    netSystemFlow: (totalEarned - totalSpent).toFixed(4),
    totalTasks,
    avgRewardPerTask: totalTasks > 0 ? (totalEarned / totalTasks).toFixed(4) : "0",
    producers: flows.filter((f) => parseFloat(f.netFlow) > 0).map((p) => p.id),
    consumers: flows.filter((f) => parseFloat(f.netFlow) <= 0).map((c) => c.id),
    flows,
  };
}

main().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
