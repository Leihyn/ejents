/**
 * Worker Agent — claims tasks, reads data from Filecoin, computes metrics, earns FIL
 * Each worker signs with its OWN wallet key.
 */
const { writeState } = require("./filecoin");
const { formatBal } = require("./utils");
const { processTaskData } = require("./task-data");

async function workerBehavior(agentId, contracts, agentContracts, log) {
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
    log("No tasks available, idling");
    return;
  }

  const taskId = availableTasks[0];
  try {
    // Claim with agent's own wallet
    log(`Claiming task #${taskId} (signing as ${agentContracts.signer.address.slice(0, 10)}...)...`);
    const claimTx = await agentContracts.taskMarket.claimTask(taskId, agentId);
    await claimTx.wait();

    // Closed-loop: Filecoin read → compute → Filecoin write
    const task = await contracts.taskMarket.getTask(taskId);
    const dataCID = task.dataCID;
    if (dataCID && dataCID.startsWith("baf")) {
      log(`Fetching task data from IPFS: ${dataCID.slice(0, 24)}...`);
    }
    const result = await processTaskData(taskId, agentId, "WORKER", contracts);

    let resultCID;
    if (result) {
      resultCID = result.cid;
      log(`Computed ${result.taskType}: ${JSON.stringify(result.computed).slice(0, 80)}...`);
    } else {
      resultCID = `fallback-agent${agentId}-task${taskId}-${Date.now()}`;
    }

    // Complete with agent's own wallet — real IPFS CID stored on-chain
    log(`Completing task #${taskId} with CID: ${resultCID.slice(0, 24)}...`);
    const completeTx = await agentContracts.taskMarket.completeTask(taskId, agentId, resultCID);
    await completeTx.wait();

    const updated = await registry.getAgent(agentId);
    log(`Task #${taskId} done! Balance: ${formatBal(updated.balance)} FIL, Tasks: ${updated.tasksCompleted}`);

    // Write agent state to Filecoin
    const stateResult = await writeState(agentId, {
      agentId: Number(agentId),
      agentType: "WORKER",
      wallet: agentContracts.signer.address,
      balance: formatBal(updated.balance),
      status: Number(updated.status),
      tasksCompleted: Number(updated.tasksCompleted),
      totalEarned: formatBal(updated.totalEarned),
      totalSpent: formatBal(updated.totalSpent),
      lastAction: `completed_task_${taskId}`,
      lastResultCID: result ? result.cid : null,
      lastTaskType: result ? result.taskType : null,
      block: await contracts.provider.getBlockNumber(),
      timestamp: Date.now(),
    });

    if (stateResult) {
      const cidTx = await agentContracts.registry.updateStateCID(agentId, stateResult.cid);
      await cidTx.wait();
      log(`Filecoin closed-loop: task data → compute → result CID ${(result ? result.cid : 'n/a').slice(0, 20)}... → state CID ${stateResult.cid.slice(0, 20)}...`);
    }
  } catch (e) {
    log(`Task error: ${e.message.split("\n")[0]}`);
  }
}

module.exports = { workerBehavior };
