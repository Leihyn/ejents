/**
 * Arbitrageur Agent — LLM-powered, pays for intelligence, signs with own wallet
 *
 * Pipeline:
 *   1. Pay to query distressed agents' state (on-chain intel fee)
 *   2. Read worker results from Filecoin
 *   3. Feed everything to LLM
 *   4. Execute decision (lend/wait)
 *   5. Pin reasoning to Filecoin
 */
const { writeState } = require("./filecoin");
const { formatBal, estimateAssetValue, estimateSurvivalIntervals } = require("./utils");
const { fetchEconomicIntelligence } = require("./task-data");
const { getArbitrageurDecision } = require("./llm");
const { ethers } = require("ethers");

async function arbitrageurBehavior(agentId, contracts, agentContracts, log) {
  const { registry } = contracts;
  const { config } = contracts;
  const agent = await registry.getAgent(agentId);

  if (agent.status === 3n) return;

  const balance = agent.balance;
  const feePerInterval = ethers.parseEther(config.storageFee);

  // --- 1. Fetch Filecoin intelligence from workers (IPFS retrieval) ---
  let intel = null;
  try {
    log("Retrieving worker intelligence from IPFS...");
    intel = await fetchEconomicIntelligence();
    if (intel) {
      const types = Object.keys(intel);
      log(`Retrieved ${types.length} reports from Filecoin: ${types.map(t => {
        const src = intel[t].sourceCID;
        return `${t}(${src ? src.slice(0, 16) + '...' : 'n/a'})`;
      }).join(", ")}`);
    } else {
      log("No worker intelligence pinned to Filecoin yet");
    }
  } catch (e) {
    log(`Intel fetch failed: ${e.message.split("\n")[0].slice(0, 60)}`);
  }

  // --- 2. Query distressed agents (PAID — creates on-chain intel market) ---
  let distressedAgents;
  try {
    distressedAgents = await registry.getDistressedAgents();
  } catch {
    distressedAgents = [];
  }

  const distressedData = [];
  for (const targetId of distressedAgents) {
    // Pay to query target's state CID (on-chain fee)
    try {
      const queryTx = await agentContracts.registry.queryAgentState(agentId, targetId);
      await queryTx.wait();
      log(`Paid intel fee to query Agent #${targetId} state`);
    } catch (e) {
      log(`Intel query failed for #${targetId}: ${e.message.split("\n")[0].slice(0, 60)}`);
    }

    const target = await registry.getAgent(targetId);
    const targetHistory = {
      totalEarned: formatBal(target.totalEarned),
      tasksCompleted: Number(target.tasksCompleted),
      totalSpent: formatBal(target.totalSpent),
    };
    const assetValue = estimateAssetValue(targetHistory);
    const survivalIntervals = estimateSurvivalIntervals(target.balance, feePerInterval);
    const maxLoanAmount = balance / 4n;
    const expectedFeeReturn = (maxLoanAmount * 500n) / 10000n;
    const expectedBidPrice = (assetValue * 40n) / 100n;
    const expectedLiquidationGain = assetValue > expectedBidPrice ? assetValue - expectedBidPrice : 0n;

    distressedData.push({
      id: Number(targetId),
      balance: formatBal(target.balance),
      survivalIntervals,
      assetValue: formatBal(assetValue),
      tasksCompleted: Number(target.tasksCompleted),
      expectedFeeReturn: formatBal(expectedFeeReturn),
      expectedLiquidationGain: formatBal(expectedLiquidationGain),
      maxLoanAmount,
    });
  }

  let activeAuctions;
  try {
    activeAuctions = await agentContracts.liquidationQueue.getActiveAuctions();
  } catch {
    activeAuctions = [];
  }

  // --- 3. Ask LLM ---
  const llmContext = {
    agentId: Number(agentId),
    balance: formatBal(balance),
    feePerInterval: config.storageFee,
    intelligence: intel,
    distressedAgents: distressedData,
    activeAuctions: activeAuctions.length,
  };

  let decision;
  let llmResponse = null;

  log("Querying LLM for economic decision...");
  llmResponse = await getArbitrageurDecision(llmContext);

  if (llmResponse) {
    log(`LLM: ${llmResponse.decision} (confidence: ${llmResponse.confidence})`);
    log(`Reasoning: ${llmResponse.reasoning}`);
    decision = llmResponse;
  } else {
    log("LLM unavailable — fallback to rules");
    decision = makeRuleBasedDecision(distressedData);
  }

  // --- 4. Execute (signed by agent's own wallet) ---
  if (decision.decision === "LEND" && decision.target !== null) {
    const targetData = distressedData.find((d) => d.id === decision.target);
    if (targetData && targetData.maxLoanAmount > 0n) {
      try {
        log(`Executing LEND: ${formatBal(targetData.maxLoanAmount)} FIL → Agent #${decision.target}`);
        const tx = await agentContracts.lendingPool.offerLoan(agentId, decision.target, 500n, 50n, {
          value: targetData.maxLoanAmount,
        });
        await tx.wait();
        log(`Loan issued to Agent #${decision.target} (signed by ${agentContracts.signer.address.slice(0, 10)}...)`);
        decision.executed = true;
      } catch (e) {
        log(`Loan failed: ${e.message.split("\n")[0].slice(0, 80)}`);
        decision.executed = false;
      }
    }
  }

  // --- 5. Bid on auctions (signed by agent's wallet) ---
  for (const auctionId of activeAuctions) {
    try {
      const [aAgentId, , , reservePrice, , , highestBid] = await agentContracts.liquidationQueue.getAuction(auctionId);
      const maxBid = balance / 3n;
      if (maxBid > highestBid && maxBid >= reservePrice) {
        log(`Bidding ${formatBal(maxBid)} on Auction #${auctionId}`);
        const tx = await agentContracts.liquidationQueue.submitBid(auctionId, agentId, { value: maxBid });
        await tx.wait();
        decision.bid = { auctionId: Number(auctionId), amount: formatBal(maxBid) };
      }
    } catch (e) {
      log(`Bid failed: ${e.message.split("\n")[0].slice(0, 80)}`);
    }
  }

  // --- 6. Pin reasoning to Filecoin ---
  const updated = await registry.getAgent(agentId);
  const stateResult = await writeState(agentId, {
    agentId: Number(agentId),
    agentType: "ARBITRAGEUR",
    wallet: agentContracts.signer.address,
    balance: formatBal(updated.balance),
    status: Number(updated.status),
    totalEarned: formatBal(updated.totalEarned),
    totalSpent: formatBal(updated.totalSpent),
    llmDecision: llmResponse ? {
      decision: llmResponse.decision,
      target: llmResponse.target,
      confidence: llmResponse.confidence,
      reasoning: llmResponse.reasoning,
      riskAssessment: llmResponse.riskAssessment,
      marketOutlook: llmResponse.marketOutlook,
      model: llmResponse.model,
    } : null,
    intelligence: intel ? {
      sourceCIDs: Object.fromEntries(
        Object.entries(intel).map(([k, v]) => [k, v.sourceCID])
      ),
    } : null,
    distressedCount: distressedAgents.length,
    activeAuctions: activeAuctions.length,
    block: await contracts.provider.getBlockNumber(),
    timestamp: Date.now(),
  });

  if (stateResult) {
    const cidTx = await agentContracts.registry.updateStateCID(agentId, stateResult.cid);
    await cidTx.wait();
    log(`LLM reasoning pinned to Filecoin: ${stateResult.cid.slice(0, 24)}...`);
  }
}

function makeRuleBasedDecision(distressedData) {
  if (distressedData.length === 0) {
    return { decision: "IDLE", target: null, confidence: 1.0, reasoning: "No distressed agents.", riskAssessment: "None.", marketOutlook: "Stable." };
  }
  const target = distressedData[0];
  const feeReturn = parseFloat(target.expectedFeeReturn);
  const liqGain = parseFloat(target.expectedLiquidationGain);
  if (feeReturn > liqGain && target.survivalIntervals > 1) {
    return { decision: "LEND", target: target.id, confidence: 0.6, reasoning: `Fee return > liquidation gain. Agent #${target.id} has ${target.survivalIntervals} intervals.`, riskAssessment: "May default.", marketOutlook: "Unknown." };
  }
  return { decision: "WAIT_FOR_LIQUIDATION", target: target.id, confidence: 0.6, reasoning: `Liquidation gain > fee return.`, riskAssessment: "Competing bids.", marketOutlook: "Unknown." };
}

module.exports = { arbitrageurBehavior };
