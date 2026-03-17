/**
 * LLM Decision Engine — Groq-powered arbitrageur reasoning
 * Feeds economic intelligence from Filecoin to an LLM, gets structured decisions back.
 * Reasoning logs are pinned to Filecoin for full auditability.
 */
const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are an autonomous financial arbitrageur agent in a decentralized economy on the Filecoin network.

Your job: analyze economic intelligence produced by worker agents and decide whether to LEND to distressed agents or WAIT for their liquidation.

You receive:
- Economic health metrics (balances, risk scores, flow analysis) computed by workers and stored on Filecoin
- On-chain data about distressed agents (balance, survival estimate, asset value)
- Your own balance and risk tolerance

Decision framework:
- LEND if the agent is likely to recover and the fee return exceeds liquidation gain
- WAIT_FOR_LIQUIDATION if the agent is terminal and you'll profit more from buying their assets at auction
- IDLE if no actionable opportunities exist

You MUST respond with valid JSON only. No markdown, no explanation outside the JSON.

Response format:
{
  "decision": "LEND" | "WAIT_FOR_LIQUIDATION" | "IDLE",
  "target": <agentId or null>,
  "confidence": <0.0-1.0>,
  "reasoning": "<2-3 sentence explanation of your economic logic>",
  "riskAssessment": "<1 sentence on what could go wrong>",
  "marketOutlook": "<1 sentence on overall economy health>"
}`;

/**
 * Ask the LLM to make a lend-vs-liquidate decision
 * @param {object} context - Economic context for the decision
 * @returns {object} Structured decision with reasoning
 */
async function getArbitrageurDecision(context) {
  const userPrompt = buildPrompt(context);

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 512,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    return {
      ...parsed,
      model: "llama-3.3-70b-versatile",
      provider: "groq",
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      latencyMs: null, // could add timing
    };
  } catch (e) {
    console.error(`[llm] Decision failed: ${e.message.split("\n")[0]}`);
    return null;
  }
}

function buildPrompt(ctx) {
  let prompt = `## Your Status
- Agent ID: ${ctx.agentId}
- Balance: ${ctx.balance} FIL
- Fee per interval: ${ctx.feePerInterval} FIL

## Economic Intelligence (from Filecoin)
`;

  if (ctx.intelligence) {
    if (ctx.intelligence.HEALTH_CHECK) {
      const h = ctx.intelligence.HEALTH_CHECK;
      prompt += `\n### Health Check (source: ${h.sourceCID?.slice(0, 20)}...)
- Total economy balance: ${h.totalBalance} FIL
- Average agent balance: ${h.avgBalance} FIL
- Active: ${h.activeCount}, Distressed: ${h.distressedCount}, Bankrupt: ${h.bankruptCount}
- Agents below threshold: ${JSON.stringify(h.belowThreshold || [])}
`;
    }
    if (ctx.intelligence.RISK_SCORE) {
      const r = ctx.intelligence.RISK_SCORE;
      prompt += `\n### Risk Scores (source: ${r.sourceCID?.slice(0, 20)}...)
- Average risk: ${r.avgRisk}
- Highest risk: Agent #${r.highestRisk?.id} (risk=${r.highestRisk?.risk}, survival=${r.highestRisk?.survivalEstimate})
- Rankings: ${JSON.stringify(r.rankings?.slice(0, 4))}
`;
    }
    if (ctx.intelligence.FLOW_ANALYSIS) {
      const f = ctx.intelligence.FLOW_ANALYSIS;
      prompt += `\n### Flow Analysis (source: ${f.sourceCID?.slice(0, 20)}...)
- Net system flow: ${f.netSystemFlow} FIL
- Total earned: ${f.totalEarned}, Total spent: ${f.totalSpent}
- Net producers: agents ${f.producers?.join(", ")}
- Net consumers: agents ${f.consumers?.join(", ")}
`;
    }
  } else {
    prompt += "No Filecoin intelligence available yet.\n";
  }

  if (ctx.distressedAgents && ctx.distressedAgents.length > 0) {
    prompt += `\n## Distressed Agents Requiring Decision\n`;
    for (const d of ctx.distressedAgents) {
      prompt += `
### Agent #${d.id}
- Balance: ${d.balance} FIL
- Survival: ${d.survivalIntervals} fee intervals
- Asset value: ${d.assetValue} FIL
- Tasks completed: ${d.tasksCompleted}
- Lending return (5% fee on 25% of your balance): ${d.expectedFeeReturn} FIL
- Liquidation gain (buy at 40% of value): ${d.expectedLiquidationGain} FIL
`;
    }
  } else {
    prompt += "\n## No distressed agents currently.\n";
  }

  if (ctx.activeAuctions > 0) {
    prompt += `\n## Active Auctions: ${ctx.activeAuctions}\n`;
  }

  prompt += "\nMake your decision. Respond with JSON only.";
  return prompt;
}

module.exports = { getArbitrageurDecision };
