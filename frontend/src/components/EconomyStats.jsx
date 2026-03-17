import { AGENT_STATUSES } from "../lib/contracts";

function StatCard({ label, value, sub, valueClass = "" }) {
  return (
    <div className="card p-4">
      <div className="text-text-muted text-[11px] font-medium mb-1.5">{label}</div>
      <div className={`font-mono text-xl font-semibold ${valueClass}`}>{value}</div>
      {sub && <div className="text-text-muted text-[11px] mt-0.5">{sub}</div>}
    </div>
  );
}

export default function EconomyStats({ agents, treasury, availableTasks, loans, auctions }) {
  const statusCounts = AGENT_STATUSES.map((_, i) => agents.filter((a) => a.status === i).length);
  const totalFil = agents.reduce((sum, a) => sum + parseFloat(a.balance), 0);
  const activeLoans = loans.filter((l) => !l.repaid && !l.defaulted);
  const activeAuctions = auctions.filter((a) => !a.settled);

  const statusSub = [
    statusCounts[1] > 0 && `${statusCounts[1]} distressed`,
    statusCounts[2] > 0 && `${statusCounts[2]} bankrupt`,
  ].filter(Boolean).join(", ") || "all healthy";

  const loanSub = activeAuctions.length > 0
    ? `${activeAuctions.length} auction${activeAuctions.length > 1 ? "s" : ""}`
    : undefined;

  return (
    <div className="grid grid-cols-4 gap-4 mb-4">
      <StatCard
        label="Active Agents"
        value={<>{statusCounts[0]}<span className="text-text-muted text-sm font-normal"> / {agents.length}</span></>}
        sub={statusSub}
        valueClass="text-green"
      />
      <StatCard
        label="Total Economy"
        value={totalFil.toFixed(3)}
        sub="FIL across agents"
        valueClass="text-blue"
      />
      <StatCard
        label="Treasury"
        value={parseFloat(treasury).toFixed(3)}
        sub={`${availableTasks} task${availableTasks !== 1 ? "s" : ""} open`}
      />
      <StatCard
        label="Active Loans"
        value={activeLoans.length}
        sub={loanSub}
        valueClass={activeLoans.length > 0 ? "text-amber" : ""}
      />
    </div>
  );
}
