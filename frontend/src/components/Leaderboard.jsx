import { AGENT_STATUSES, AGENT_NAMES } from "../lib/contracts";

const STATUS_DOT = ["status-dot-active", "status-dot-distressed", "status-dot-bankrupt", "status-dot-dormant"];

function getActivity(agent, loans, auctions) {
  // Tasks for workers/spenders, loans+bids for arbs
  if (agent.agentType === 2) {
    const loansIssued = loans.filter((l) => l.lenderId === agent.id).length;
    const bidsPlaced = auctions.filter((a) => a.highestBidderId === agent.id).length;
    return { tasks: agent.tasksCompleted, loans: loansIssued, bids: bidsPlaced, isArb: true };
  }
  return { tasks: agent.tasksCompleted, loans: 0, bids: 0, isArb: false };
}

export default function Leaderboard({ agents, loans = [], auctions = [], onSelect, selectedId }) {
  const sorted = [...agents].sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance));

  return (
    <div className="card p-4">
      <h2 className="card-header mb-3">Leaderboard</h2>
      {agents.length === 0 ? (
        <p className="text-text-muted text-xs font-mono">No agents</p>
      ) : (
        <table className="w-full text-xs" role="grid">
          <thead>
            <tr className="text-text-muted text-[10px] uppercase tracking-wider font-medium">
              <th className="text-left pb-2 w-6 font-medium">#</th>
              <th className="text-left pb-2 font-medium">Agent</th>
              <th className="text-right pb-2 font-medium">Balance</th>
              <th className="text-right pb-2 font-medium">Tasks</th>
              <th className="text-right pb-2 font-medium">Activity</th>
              <th className="text-right pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((agent, rank) => {
              const act = getActivity(agent, loans, auctions);
              return (
                <tr
                  key={agent.id}
                  onClick={() => onSelect(agent.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(agent.id); } }}
                  tabIndex={0}
                  role="row"
                  aria-selected={selectedId === agent.id}
                  className={`cursor-pointer transition-colors duration-150 ease-out border-b border-border last:border-0 ${
                    selectedId === agent.id ? "bg-bg-elevated" : "hover:bg-bg-hover"
                  }`}
                >
                  <td className="py-2 pr-2 text-text-muted font-mono">{rank + 1}</td>
                  <td className="py-2 font-medium">{AGENT_NAMES[agent.id] || `Agent-${agent.id}`}</td>
                  <td className="py-2 text-right font-mono text-blue">{parseFloat(agent.balance).toFixed(3)}</td>
                  <td className="py-2 text-right font-mono text-text-secondary">{agent.tasksCompleted}</td>
                  <td className="py-2 text-right font-mono text-text-secondary">
                    {act.isArb ? (
                      <span className="inline-flex items-center gap-1.5">
                        {act.loans > 0 && <span className="text-green" title="Loans issued">{act.loans}L</span>}
                        {act.bids > 0 && <span className="text-yellow" title="Auction bids">{act.bids}B</span>}
                        {act.loans === 0 && act.bids === 0 && <span className="text-text-muted">-</span>}
                      </span>
                    ) : (
                      <span className="text-text-muted">-</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`status-dot ${STATUS_DOT[agent.status]}`} />
                      <span className="text-text-secondary text-[10px]">{AGENT_STATUSES[agent.status]}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
