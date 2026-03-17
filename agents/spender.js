/**
 * Spender Agent — aggressive task completion, burns fast
 * Signs with its OWN wallet key.
 */
const { writeState } = require("./filecoin");
const { formatBal } = require("./utils");
const { processTaskData } = require("./task-data");

async function spenderBehavior(agentId, contracts, agentContracts, log) {
  const { registry } = contracts;
  const agent = await registry.getAgent(agentId);

  if (agent.status === 3n) return;

  let availableTasks;
  try {
    availableTasks = await agentContracts.taskMarket.getAvailableTasks();
  } catch {
    return;
  }

  if (availableTasks.length === 0) {
    log("No tasks, but still burning overhead...");
    return;
  }

  const taskId = availableTasks[0];
  try {
    log(`Grabbing task #${taskId} (signing as ${agentContracts.signer.address.slice(0, 10)}...)...`);
    const claimTx = await agentContracts.taskMarket.claimTask(taskId, agentId);
    await claimTx.wait();

    log(`Speed-processing task #${taskId}...`);
    const result = await processTaskData(taskId, agentId, "SPENDER", contracts);

    let resultCID;
    if (result) {
      resultCID = result.cid;
      log(`Computed ${result.taskType} (spender-speed)`);
    } else {
      resultCID = `spender-${agentId}-task${taskId}-${Date.now()}`;
    }

    const completeTx = await agentContracts.taskMarket.completeTask(taskId, agentId, resultCID);
    await completeTx.wait();

    const updated = await registry.getAgent(agentId);
    log(`Task #${taskId} crushed! Balance: ${formatBal(updated.balance)} FIL`);
  } catch (e) {
    log(`Task #${taskId} failed: ${e.message.split("\n")[0].slice(0, 80)}`);
  }

  // Write state every cycle (more Filecoin writes = faster burn)
  const updated = await registry.getAgent(agentId);
  const stateResult = await writeState(agentId, {
    agentId: Number(agentId),
    agentType: "SPENDER",
    wallet: agentContracts.signer.address,
    balance: formatBal(updated.balance),
    status: Number(updated.status),
    tasksCompleted: Number(updated.tasksCompleted),
    totalEarned: formatBal(updated.totalEarned),
    totalSpent: formatBal(updated.totalSpent),
    lastAction: "aggressive_cycle",
    block: await contracts.provider.getBlockNumber(),
    timestamp: Date.now(),
  });

  if (stateResult) {
    const cidTx = await agentContracts.registry.updateStateCID(agentId, stateResult.cid);
    await cidTx.wait();
    log(`State synced: ${stateResult.cid.slice(0, 24)}...`);
  }
}

module.exports = { spenderBehavior };
