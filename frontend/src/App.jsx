import { useState, useCallback } from "react";
import { useAgents } from "./hooks/useAgents";
import Constellation from "./components/Constellation";
import EconomyStats from "./components/EconomyStats";
import Leaderboard from "./components/Leaderboard";
import EventFeed from "./components/EventFeed";
import AgentInspector from "./components/AgentInspector";
import PostMortem from "./components/PostMortem";

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-bg-base p-6">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="skeleton h-6 w-28" />
          <div className="skeleton h-4 w-40" />
        </div>
        <div className="grid grid-cols-4 gap-4 mb-4">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-[84px] rounded-[var(--radius)]" />)}
        </div>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-8 skeleton h-[380px] rounded-[var(--radius)]" />
          <div className="col-span-4 skeleton h-[380px] rounded-[var(--radius)]" />
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="text-red text-sm font-medium mb-2">Connection Failed</div>
        <p className="text-text-secondary text-sm mb-4">
          Could not reach Filecoin Calibration testnet.
        </p>
        <p className="text-text-muted text-xs font-mono mb-4 break-all">{message}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 text-sm font-medium bg-bg-surface border border-border rounded-[var(--radius-sm)] text-text-primary hover:bg-bg-elevated transition-colors duration-150"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { agents, treasury, availableTasks, loans, auctions, blockNumber, loading, error, refetch } =
    useAgents(20000);
  const [selectedId, setSelectedId] = useState(null);

  const handleSelect = useCallback((id) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const selectedAgent = selectedId !== null ? agents.find((a) => a.id === selectedId) : null;

  if (loading && agents.length === 0) return <LoadingSkeleton />;
  if (error && agents.length === 0) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <div className="min-h-screen bg-bg-base p-6">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <img src="/logo.jpg" alt="EJENTS" className="w-8 h-8 rounded-[var(--radius-sm)]" />
            <h1 className="text-lg font-bold text-text-primary tracking-tight">EJENTS</h1>
            <span className="text-[10px] font-mono font-medium text-text-muted bg-bg-elevated px-2 py-0.5 rounded-[var(--radius-sm)]">
              CALIBNET
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className={`status-dot ${error ? "status-dot-bankrupt" : "status-dot-active"}`} />
              <span>{error ? "Error" : "Live"}</span>
            </span>
            <span>Block #{blockNumber.toLocaleString()}</span>
          </div>
        </header>

        {/* Stat Cards */}
        <EconomyStats
          agents={agents}
          treasury={treasury}
          availableTasks={availableTasks}
          loans={loans}
          auctions={auctions}
        />

        {/* Main Content */}
        <div className="grid grid-cols-12 gap-4 mb-4">
          <div className="col-span-8">
            <Constellation
              agents={agents}
              loans={loans}
              onSelect={handleSelect}
              selectedId={selectedId}
            />
          </div>
          <div className="col-span-4">
            {selectedAgent ? (
              <AgentInspector
                agent={selectedAgent}
                loans={loans}
                auctions={auctions}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <div className="card p-4 h-full flex items-center justify-center">
                <p className="text-text-muted text-xs font-mono">Select an agent to inspect</p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom */}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-7">
            <Leaderboard agents={agents} loans={loans} auctions={auctions} onSelect={handleSelect} selectedId={selectedId} />
          </div>
          <div className="col-span-5">
            <EventFeed blockNumber={blockNumber} />
          </div>
        </div>

        {/* Post-Mortem Panel */}
        <div className="mt-4">
          <PostMortem agents={agents} loans={loans} auctions={auctions} />
        </div>

        {/* Footer */}
        <footer className="mt-6 pt-4 border-t border-border text-center">
          <p className="text-text-muted text-[10px] font-mono">
            EJENTS &middot; Autonomous Agent Economy on Filecoin &middot; Filecoin Pin &middot; Calibration Testnet
          </p>
        </footer>
      </div>
    </div>
  );
}
