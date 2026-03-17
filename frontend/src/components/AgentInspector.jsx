import { AGENT_TYPES, AGENT_STATUSES, AGENT_NAMES, ethers } from "../lib/contracts";

const STATUS_DOT = ["status-dot-active", "status-dot-distressed", "status-dot-bankrupt", "status-dot-dormant"];
const TYPE_BG = ["bg-blue/10 text-blue", "bg-amber/10 text-amber", "bg-[#8b5cf6]/10 text-[#8b5cf6]"];
const STAT_COLORS = { balance: "text-blue", earned: "text-green", spent: "text-red" };

export default function AgentInspector({ agent, loans, auctions, onClose }) {
  if (!agent) return null;

  const agentLoans = loans.filter((l) => l.lenderId === agent.id || l.borrowerId === agent.id);
  const idlePercent = parseFloat(agent.totalEarned) > 0
    ? ((parseFloat(agent.balance) / parseFloat(agent.totalEarned)) * 100).toFixed(0)
    : "0";
  const hasCID = agent.stateCID && agent.stateCID.length > 0 && agent.stateCID.startsWith("baf");

  return (
    <div className="card p-4 animate-fade-in h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="card-header">Inspector</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="w-6 h-6 flex items-center justify-center rounded-[var(--radius-sm)] text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors duration-150"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="mb-3">
        <div className="text-base font-semibold">{AGENT_NAMES[agent.id]}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`status-dot ${STATUS_DOT[agent.status]}`} />
          <span className="text-xs text-text-secondary">{AGENT_STATUSES[agent.status]}</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-[var(--radius-sm)] ${TYPE_BG[agent.agentType]}`}>
            {AGENT_TYPES[agent.agentType]}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-bg-elevated rounded-[var(--radius-sm)] p-2.5">
          <div className="text-[10px] text-text-muted mb-0.5">Balance</div>
          <div className="font-mono text-sm font-semibold text-blue">{parseFloat(agent.balance).toFixed(4)}</div>
        </div>
        <div className="bg-bg-elevated rounded-[var(--radius-sm)] p-2.5">
          <div className="text-[10px] text-text-muted mb-0.5">Earned</div>
          <div className="font-mono text-sm font-semibold text-green">{parseFloat(agent.totalEarned).toFixed(4)}</div>
        </div>
        <div className="bg-bg-elevated rounded-[var(--radius-sm)] p-2.5">
          <div className="text-[10px] text-text-muted mb-0.5">Spent</div>
          <div className="font-mono text-sm font-semibold text-red">{parseFloat(agent.totalSpent).toFixed(4)}</div>
        </div>
        <div className="bg-bg-elevated rounded-[var(--radius-sm)] p-2.5">
          <div className="text-[10px] text-text-muted mb-0.5">Tasks</div>
          <div className="font-mono text-sm font-semibold">{agent.tasksCompleted}</div>
        </div>
      </div>

      <div className="flex justify-between text-xs font-mono py-1.5 border-t border-border">
        <span className="text-text-muted">Idle Capital</span>
        <span>{idlePercent}%</span>
      </div>

      {agentLoans.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="text-[10px] text-text-muted font-medium mb-1">Loans ({agentLoans.length})</div>
          {agentLoans.map((l) => (
            <div key={l.id} className="text-xs text-text-secondary py-0.5 font-mono">
              {l.lenderId === agent.id ? "Lent" : "Borrowed"} {l.principal} FIL
              <span className={l.repaid ? " text-green" : l.defaulted ? " text-red" : " text-blue"}>
                {l.repaid ? " repaid" : l.defaulted ? " defaulted" : " active"}
              </span>
            </div>
          ))}
        </div>
      )}

      {agent.wallet && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="text-[10px] text-text-muted font-medium mb-1">Wallet</div>
          <div className="text-[10px] text-text-secondary font-mono break-all opacity-70">{agent.wallet}</div>
        </div>
      )}

      {hasCID && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="text-[10px] text-text-muted font-medium mb-1">Filecoin State</div>
          <a
            href={`https://dweb.link/ipfs/${agent.stateCID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue font-mono break-all hover:underline"
          >
            {agent.stateCID}
          </a>
        </div>
      )}
    </div>
  );
}
