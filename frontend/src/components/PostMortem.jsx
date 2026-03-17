import { useState, useEffect } from "react";
import { getTaskMarket, getRegistry, getLendingPool, getLiquidationQueue, GATEWAY_URL, AGENT_NAMES, AGENT_TYPES, ethers } from "../lib/contracts";

const TASK_TYPE_LABELS = ["HEALTH_CHECK", "RISK_SCORE", "FLOW_ANALYSIS"];
const TASK_STATUS_LABELS = ["AVAILABLE", "CLAIMED", "COMPLETED", "EXPIRED"];

function CidLink({ cid, label }) {
  if (!cid || cid.length === 0) return <span className="text-text-muted">—</span>;
  const short = cid.slice(0, 14) + "..." + cid.slice(-6);
  const isIpfs = cid.startsWith("baf");
  return (
    <span className="text-[10px] font-mono text-blue opacity-80" title={cid}>
      {label && <span className="text-text-muted mr-1">{label}</span>}
      {isIpfs ? (
        <a href={`${GATEWAY_URL}/${cid}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{short}</a>
      ) : short}
    </span>
  );
}

function StatCard({ label, value, sub, color = "text-text-primary" }) {
  return (
    <div className="bg-bg-elevated rounded-[var(--radius-sm)] p-2.5">
      <div className="text-[9px] text-text-muted mb-0.5">{label}</div>
      <div className={`font-mono text-sm font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-[9px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function AgentTimeline({ agents, loans, auctions, completedTasks }) {
  // Build timeline of events per agent
  const events = [];

  // Task completions
  for (const t of completedTasks) {
    events.push({
      agentId: t.claimedBy,
      type: "task",
      label: `Completed ${TASK_TYPE_LABELS[t.taskType] || "TASK"} #${t.id}`,
      detail: `+${t.reward} FIL`,
      color: "text-green",
      cid: t.resultCID,
    });
  }

  // Loans — show for both lender and borrower
  for (const l of loans) {
    events.push({
      agentId: l.lenderId,
      type: "lend",
      label: `Lent ${parseFloat(l.principal).toFixed(4)} FIL → ${AGENT_NAMES[l.borrowerId] || `#${l.borrowerId}`}`,
      detail: l.repaid ? "repaid" : l.defaulted ? "DEFAULTED" : "active",
      color: l.repaid ? "text-green" : l.defaulted ? "text-red" : "text-blue",
    });
    events.push({
      agentId: l.borrowerId,
      type: "borrow",
      label: `Borrowed ${parseFloat(l.principal).toFixed(4)} FIL ← ${AGENT_NAMES[l.lenderId] || `#${l.lenderId}`}`,
      detail: l.repaid ? "repaid" : l.defaulted ? "DEFAULTED" : "active",
      color: l.repaid ? "text-green" : l.defaulted ? "text-red" : "text-amber",
    });
  }

  // Intel queries — arbs paid to query distressed agents (infer from loans: if you lent, you queried first)
  const lenderIds = [...new Set(loans.map((l) => l.lenderId))];
  const queriedTargets = {};
  for (const l of loans) {
    const key = `${l.lenderId}-${l.borrowerId}`;
    if (!queriedTargets[key]) {
      queriedTargets[key] = true;
      events.push({
        agentId: l.lenderId,
        type: "intel",
        label: `Paid intel fee to query ${AGENT_NAMES[l.borrowerId] || `#${l.borrowerId}`}`,
        detail: "-0.001 FIL",
        color: "text-[#8b5cf6]",
      });
    }
  }

  // Auctions — show bids and liquidation
  for (const a of auctions) {
    events.push({
      agentId: a.agentId,
      type: "liquidated",
      label: `Liquidated (Auction #${a.id})`,
      detail: a.settled ? "settled" : "active",
      color: "text-red",
    });
    if (a.highestBidderId < agents.length && parseFloat(a.highestBid) > 0) {
      events.push({
        agentId: a.highestBidderId,
        type: "bid",
        label: `Bid ${parseFloat(a.highestBid).toFixed(4)} FIL on Auction #${a.id} (Agent #${a.agentId})`,
        detail: a.settled ? "won" : "leading",
        color: "text-[#8b5cf6]",
      });
    }
  }

  // Filecoin state — arbs with CIDs have LLM reasoning pinned
  for (const agent of agents) {
    if (agent.agentType === 2 && agent.stateCID && agent.stateCID.startsWith("baf")) {
      events.push({
        agentId: agent.id,
        type: "llm",
        label: "LLM decision pinned to Filecoin",
        detail: "Llama 3.3 70B",
        color: "text-blue",
        cid: agent.stateCID,
      });
    }
  }

  // Group by agent
  const byAgent = {};
  for (const e of events) {
    if (!byAgent[e.agentId]) byAgent[e.agentId] = [];
    byAgent[e.agentId].push(e);
  }

  return (
    <div className="space-y-2">
      {agents.map((agent) => {
        const agentEvents = byAgent[agent.id] || [];
        if (agentEvents.length === 0 && agent.status !== 2) return null;
        return (
          <div key={agent.id} className="border border-border rounded-[var(--radius-sm)] p-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold">{AGENT_NAMES[agent.id] || `Agent #${agent.id}`}</span>
                <span className="text-[9px] text-text-muted">{AGENT_TYPES[agent.agentType]}</span>
                {agent.status === 2 && (
                  <span className="text-[9px] font-mono text-red bg-red/10 px-1 rounded">BANKRUPT</span>
                )}
              </div>
              <span className="text-[10px] font-mono text-text-muted">{parseFloat(agent.balance).toFixed(4)} FIL</span>
            </div>
            {agentEvents.length > 0 ? (
              <div className="space-y-0.5">
                {agentEvents.slice(0, 8).map((e, i) => (
                  <div key={i} className="flex items-center justify-between text-[9px]">
                    <span className="text-text-secondary">{e.label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono ${e.color}`}>{e.detail}</span>
                      {e.cid && <CidLink cid={e.cid} />}
                    </div>
                  </div>
                ))}
                {agentEvents.length > 8 && (
                  <div className="text-[9px] text-text-muted">+{agentEvents.length - 8} more events</div>
                )}
              </div>
            ) : (
              <div className="text-[9px] text-text-muted">No activity recorded</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EconomyMetrics({ agents, loans, completedTasks }) {
  const balances = agents.map((a) => parseFloat(a.balance));
  const totalBalance = balances.reduce((a, b) => a + b, 0);
  const totalEarned = agents.reduce((a, ag) => a + parseFloat(ag.totalEarned), 0);
  const totalSpent = agents.reduce((a, ag) => a + parseFloat(ag.totalSpent), 0);
  const totalTasks = agents.reduce((a, ag) => a + ag.tasksCompleted, 0);

  // Gini coefficient
  const sorted = [...balances].sort((a, b) => a - b);
  const n = sorted.length;
  let giniNum = 0;
  for (let i = 0; i < n; i++) giniNum += (2 * (i + 1) - n - 1) * sorted[i];
  const gini = totalBalance > 0 ? (giniNum / (n * totalBalance)).toFixed(3) : "0";

  // Money velocity
  const velocity = totalBalance > 0 ? ((totalEarned + totalSpent) / totalBalance).toFixed(2) : "0";

  // Loan stats
  const activeLoans = loans.filter((l) => !l.repaid && !l.defaulted);
  const defaultedLoans = loans.filter((l) => l.defaulted);
  const repaidLoans = loans.filter((l) => l.repaid);
  const totalLent = loans.reduce((a, l) => a + parseFloat(l.principal), 0);

  // Agent health
  const active = agents.filter((a) => a.status === 0).length;
  const distressed = agents.filter((a) => a.status === 1).length;
  const bankrupt = agents.filter((a) => a.status === 2).length;

  // CID count (agents with real Filecoin state)
  const withCID = agents.filter((a) => a.stateCID && a.stateCID.startsWith("baf")).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Total Supply" value={`${totalBalance.toFixed(3)} FIL`} color="text-blue" />
        <StatCard label="Gini Index" value={gini} sub={parseFloat(gini) > 0.4 ? "high inequality" : "fair"} color={parseFloat(gini) > 0.4 ? "text-amber" : "text-green"} />
        <StatCard label="Money Velocity" value={`${velocity}x`} sub="vol / supply" color="text-text-primary" />
        <StatCard label="Tasks Done" value={totalTasks} sub={`${completedTasks.length} on-chain`} color="text-green" />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Active" value={active} color="text-green" />
        <StatCard label="Distressed" value={distressed} color={distressed > 0 ? "text-amber" : "text-green"} />
        <StatCard label="Bankrupt" value={bankrupt} color={bankrupt > 0 ? "text-red" : "text-green"} />
        <StatCard label="Filecoin State" value={`${withCID}/${agents.length}`} sub="agents w/ CID" color="text-blue" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Total Lent" value={`${totalLent.toFixed(3)} FIL`} sub={`${loans.length} loans`} color="text-blue" />
        <StatCard label="Repaid" value={repaidLoans.length} sub={activeLoans.length > 0 ? `${activeLoans.length} active` : "none active"} color="text-green" />
        <StatCard label="Defaulted" value={defaultedLoans.length} color={defaultedLoans.length > 0 ? "text-red" : "text-green"} />
      </div>

      {/* Wealth distribution bar */}
      <div>
        <div className="text-[9px] text-text-muted mb-1">WEALTH DISTRIBUTION</div>
        <div className="flex gap-[1px] h-4 rounded-[var(--radius-sm)] overflow-hidden">
          {agents.map((a) => {
            const pct = totalBalance > 0 ? (parseFloat(a.balance) / totalBalance) * 100 : 100 / agents.length;
            const colors = ["bg-blue", "bg-blue", "bg-blue", "bg-amber", "bg-amber", "bg-[#8b5cf6]", "bg-[#8b5cf6]"];
            return (
              <div
                key={a.id}
                className={`${colors[a.id] || "bg-blue"} ${a.status === 2 ? "opacity-20" : "opacity-70"} hover:opacity-100 transition-opacity`}
                style={{ width: `${Math.max(pct, 1)}%` }}
                title={`${AGENT_NAMES[a.id]}: ${parseFloat(a.balance).toFixed(4)} FIL (${pct.toFixed(1)}%)`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[8px] text-text-muted">Workers</span>
          <span className="text-[8px] text-text-muted">Spenders</span>
          <span className="text-[8px] text-text-muted">Arbs</span>
        </div>
      </div>
    </div>
  );
}

function FilecoinDataFlow({ agents, completedTasks }) {
  const withCID = agents.filter((a) => a.stateCID && a.stateCID.startsWith("baf"));
  const tasksWithCID = completedTasks.filter((t) => t.resultCID && t.resultCID.startsWith("baf"));

  return (
    <div className="space-y-2">
      <div className="text-[9px] font-medium text-text-muted mb-1">FILECOIN DATA FLOW</div>

      {/* Agent state CIDs */}
      {withCID.length > 0 && (
        <div>
          <div className="text-[9px] text-text-muted mb-1">Agent State (pinned to Filecoin)</div>
          {withCID.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-0.5">
              <span className="text-[10px] font-medium">{AGENT_NAMES[a.id]}</span>
              <CidLink cid={a.stateCID} />
            </div>
          ))}
        </div>
      )}

      {/* Task result CIDs */}
      {tasksWithCID.length > 0 && (
        <div className="mt-2">
          <div className="text-[9px] text-text-muted mb-1">Task Results (pinned to Filecoin)</div>
          {tasksWithCID.slice(0, 10).map((t) => (
            <div key={t.id} className="flex items-center justify-between py-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-text-secondary">#{t.id}</span>
                <span className="text-[9px] text-text-muted">{TASK_TYPE_LABELS[t.taskType]}</span>
                <span className="text-[9px] text-text-muted">by {AGENT_NAMES[t.claimedBy]}</span>
              </div>
              <CidLink cid={t.resultCID} />
            </div>
          ))}
        </div>
      )}

      {withCID.length === 0 && tasksWithCID.length === 0 && (
        <div className="text-[10px] text-text-muted font-mono py-4 text-center">
          No Filecoin CIDs stored yet. Run agents to generate data.
        </div>
      )}
    </div>
  );
}

function StoryArc({ agents, loans, auctions, completedTasks }) {
  // Derive the narrative from on-chain data
  const events = [];

  const workers = agents.filter((a) => a.agentType === 0);
  const spenders = agents.filter((a) => a.agentType === 1);
  const arbs = agents.filter((a) => a.agentType === 2);

  const totalInitial = agents.reduce((a, ag) => a + parseFloat(ag.totalEarned), 0);
  const totalTasks = agents.reduce((a, ag) => a + ag.tasksCompleted, 0);
  const withCID = agents.filter((a) => a.stateCID && a.stateCID.startsWith("baf"));
  const tasksWithCID = completedTasks.filter((t) => t.resultCID && t.resultCID.startsWith("baf"));

  // Phase 1: Genesis
  events.push({
    phase: "Genesis",
    icon: "circle",
    color: "text-blue",
    lines: [
      `${agents.length} autonomous agents deployed to Filecoin Calibration testnet.`,
      `Workers (${workers.length}) funded at ${workers[0] ? parseFloat(workers[0].totalEarned).toFixed(1) : "?"} FIL each. Spenders (${spenders.length}) at ${spenders[0] ? parseFloat(spenders[0].totalEarned).toFixed(1) : "?"} FIL. Arbitrageurs (${arbs.length}) at ${arbs[0] ? parseFloat(arbs[0].totalEarned).toFixed(1) : "?"} FIL.`,
      `Total economy seeded with ${totalInitial.toFixed(2)} FIL. Each agent has its own wallet signing transactions independently.`,
    ],
  });

  // Phase 2: Prosperity
  const workerTasks = workers.reduce((a, w) => a + w.tasksCompleted, 0);
  const spenderTasks = spenders.reduce((a, s) => a + s.tasksCompleted, 0);
  if (totalTasks > 0) {
    events.push({
      phase: "Prosperity",
      icon: "trending-up",
      color: "text-green",
      lines: [
        `Workers completed ${workerTasks} tasks, earning 0.02 FIL each. Spenders completed ${spenderTasks}.`,
        `Storage fees (0.01 FIL per interval) deducted each round, a steady drain on all agents.`,
        `Workers offset fees with earnings. Spenders and arbitrageurs could not.`,
      ],
    });
  }

  // Phase 3: Crisis — check if any spenders became distressed/bankrupt
  const distressedSpenders = spenders.filter((s) => s.status >= 1);
  const bankruptSpenders = spenders.filter((s) => s.status === 2);
  if (distressedSpenders.length > 0) {
    events.push({
      phase: "Crisis",
      icon: "alert",
      color: "text-amber",
      lines: [
        `Spenders stopped receiving task assignments. With no income and ongoing fees, balances drained.`,
        `${distressedSpenders.length} spender${distressedSpenders.length > 1 ? "s" : ""} fell below the 0.05 FIL distress threshold: ${distressedSpenders.map((s) => AGENT_NAMES[s.id]).join(", ")}.`,
        `The on-chain distress signal triggered arbitrageur attention.`,
      ],
    });
  }

  // Phase 4: Intervention — loans
  if (loans.length > 0) {
    const lenderIds = [...new Set(loans.map((l) => l.lenderId))];
    const borrowerIds = [...new Set(loans.map((l) => l.borrowerId))];
    const totalLent = loans.reduce((a, l) => a + parseFloat(l.principal), 0);

    const intelLines = [];
    for (const arbId of lenderIds) {
      const arbLoans = loans.filter((l) => l.lenderId === arbId);
      const targets = arbLoans.map((l) => AGENT_NAMES[l.borrowerId] || `#${l.borrowerId}`);
      intelLines.push(
        `${AGENT_NAMES[arbId]} paid intel fees to query ${targets.join(" and ")}, then issued ${arbLoans.length} rescue loan${arbLoans.length > 1 ? "s" : ""}.`
      );
    }

    events.push({
      phase: "Intervention",
      icon: "handshake",
      color: "text-blue",
      lines: [
        `Arbitrageurs detected distressed agents via on-chain status. Paid 0.001 FIL per intel query to inspect their state.`,
        ...intelLines,
        `Total capital deployed: ${totalLent.toFixed(4)} FIL across ${loans.length} loans at 5% fee rate.`,
        `Loans temporarily rescued borrowers back above the distress threshold.`,
      ],
    });
  }

  // Phase 5: Collapse
  const allBankrupt = agents.filter((a) => a.status === 2);
  if (allBankrupt.length > 0) {
    const workersBankrupt = allBankrupt.filter((a) => a.agentType === 0);
    const spendersBankrupt = allBankrupt.filter((a) => a.agentType === 1);
    const arbsBankrupt = allBankrupt.filter((a) => a.agentType === 2);

    const parts = [];
    if (spendersBankrupt.length > 0) parts.push(`${spendersBankrupt.length} spender${spendersBankrupt.length > 1 ? "s" : ""}`);
    if (workersBankrupt.length > 0) parts.push(`${workersBankrupt.length} worker${workersBankrupt.length > 1 ? "s" : ""}`);
    if (arbsBankrupt.length > 0) parts.push(`${arbsBankrupt.length} arbitrageur${arbsBankrupt.length > 1 ? "s" : ""}`);

    events.push({
      phase: "Collapse",
      icon: "x-circle",
      color: "text-red",
      lines: [
        `Despite rescue loans, ongoing fees overwhelmed remaining balances.`,
        `${allBankrupt.length} agents went bankrupt: ${parts.join(", ")}.`,
        loans.length > 0
          ? `The rescue loans bought time but couldn't fix the structural deficit. Agents that don't earn can't survive storage fees.`
          : `Without income to offset fees, bankruptcy was inevitable.`,
      ],
    });
  }

  // Phase 6: Liquidation
  if (auctions.length > 0) {
    const settled = auctions.filter((a) => a.settled);
    const withBids = auctions.filter((a) => parseFloat(a.highestBid) > 0);
    const totalBidValue = withBids.reduce((a, au) => a + parseFloat(au.highestBid), 0);

    events.push({
      phase: "Liquidation",
      icon: "gavel",
      color: "text-red",
      lines: [
        `${auctions.length} liquidation auction${auctions.length > 1 ? "s" : ""} created for bankrupt agents' assets.`,
        withBids.length > 0
          ? `${withBids.length} auction${withBids.length > 1 ? "s" : ""} received bids totaling ${totalBidValue.toFixed(4)} FIL. Arbitrageurs competed for undervalued assets.`
          : `Auctions awaiting bids or settlement.`,
        settled.length > 0
          ? `${settled.length} auction${settled.length > 1 ? "s" : ""} settled. Asset provenance tracked via on-chain CIDs.`
          : `Auctions in progress.`,
      ],
    });
  }

  // Phase 7: Filecoin data
  if (withCID.length > 0 || tasksWithCID.length > 0) {
    events.push({
      phase: "Filecoin Provenance",
      icon: "database",
      color: "text-blue",
      lines: [
        `${withCID.length}/${agents.length} agents have state pinned to Filecoin (real IPFS CIDs stored on-chain).`,
        tasksWithCID.length > 0
          ? `${tasksWithCID.length} task results stored as Filecoin CIDs. Verifiable computation output.`
          : null,
        `Full closed-loop: task data read from Filecoin, metrics computed, results pinned back, CIDs recorded on-chain.`,
        arbs.some((a) => a.stateCID && a.stateCID.startsWith("baf"))
          ? `Arbitrageur LLM reasoning (Llama 3.3 70B) pinned to Filecoin. Every decision auditable.`
          : null,
      ].filter(Boolean),
    });
  }

  const ICONS = {
    "circle": <circle cx="6" cy="6" r="4" fill="currentColor" />,
    "trending-up": <><polyline points="1 8 5 4 8 7 11 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></>,
    "alert": <><path d="M6 1L11 10H1L6 1Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><line x1="6" y1="4.5" x2="6" y2="6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><circle cx="6" cy="8" r="0.5" fill="currentColor" /></>,
    "handshake": <><path d="M1 7L4 4L6 5L8 3L11 6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></>,
    "x-circle": <><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" /><line x1="4" y1="4" x2="8" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><line x1="8" y1="4" x2="4" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></>,
    "gavel": <><rect x="2" y="1" width="8" height="4" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" /><line x1="6" y1="5" x2="6" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><line x1="3" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></>,
    "database": <><ellipse cx="6" cy="3" rx="5" ry="2" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M1 3v6c0 1.1 2.2 2 5 2s5-.9 5-2V3" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M1 6c0 1.1 2.2 2 5 2s5-.9 5-2" fill="none" stroke="currentColor" strokeWidth="1.2" /></>,
  };

  return (
    <div className="space-y-0">
      {events.map((event, idx) => (
        <div key={idx} className="flex gap-3">
          {/* Timeline connector */}
          <div className="flex flex-col items-center">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${event.color} bg-bg-elevated border border-border`}>
              <svg width="12" height="12" viewBox="0 0 12 12">{ICONS[event.icon]}</svg>
            </div>
            {idx < events.length - 1 && (
              <div className="w-px flex-1 bg-border min-h-[16px]" />
            )}
          </div>

          {/* Content */}
          <div className="pb-4 flex-1">
            <div className={`text-[11px] font-semibold ${event.color} mb-1`}>{event.phase}</div>
            <div className="space-y-1">
              {event.lines.map((line, i) => (
                <p key={i} className="text-[10px] text-text-secondary leading-relaxed">{line}</p>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PostMortem({ agents, loans, auctions }) {
  const [completedTasks, setCompletedTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("story");

  useEffect(() => {
    fetchCompletedTasks().then((tasks) => {
      setCompletedTasks(tasks);
      setLoading(false);
    });
  }, [agents]);

  const tabs = [
    { id: "story", label: "Story" },
    { id: "economy", label: "Economy" },
    { id: "timeline", label: "Agent Timeline" },
    { id: "filecoin", label: "Filecoin Data" },
  ];

  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h2 className="card-header">Post-Mortem Analysis</h2>
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-[var(--radius-sm)] transition-colors duration-150 ${
                tab === t.id
                  ? "bg-blue/15 text-blue"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16 rounded-[var(--radius-sm)]" />)}
        </div>
      ) : (
        <div className="max-h-[480px] overflow-y-auto pr-1">
          {tab === "story" && (
            <StoryArc agents={agents} loans={loans} auctions={auctions} completedTasks={completedTasks} />
          )}
          {tab === "economy" && (
            <EconomyMetrics agents={agents} loans={loans} completedTasks={completedTasks} />
          )}
          {tab === "timeline" && (
            <AgentTimeline agents={agents} loans={loans} auctions={auctions} completedTasks={completedTasks} />
          )}
          {tab === "filecoin" && (
            <FilecoinDataFlow agents={agents} completedTasks={completedTasks} />
          )}
        </div>
      )}
    </div>
  );
}

async function fetchCompletedTasks() {
  const tasks = [];
  try {
    const taskMarket = getTaskMarket();
    const taskCount = await taskMarket.getTaskCount();
    const max = Math.min(Number(taskCount), 50);

    for (let i = 0; i < max; i++) {
      try {
        const task = await taskMarket.getTask(i);
        if (Number(task.status) === 2) {
          tasks.push({
            id: i,
            taskType: Number(task.taskType),
            claimedBy: Number(task.claimedBy),
            resultCID: task.resultCID,
            dataCID: task.dataCID,
            reward: ethers.formatEther(task.reward),
          });
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // TaskMarket fetch failed
  }
  return tasks;
}
