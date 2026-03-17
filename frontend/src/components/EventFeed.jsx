import { useState, useEffect } from "react";
import { getRegistry, getTaskMarket, getLendingPool, getLiquidationQueue, AGENT_NAMES, ethers } from "../lib/contracts";

const DOT_COLORS = {
  status: "status-dot-active",
  task: "bg-blue",
  loan: "bg-[#8b5cf6]",
  auction: "status-dot-bankrupt",
};

export default function EventFeed({ blockNumber }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!blockNumber) return;

    async function fetchRecentEvents() {
      try {
        const registry = getRegistry();
        const taskMarket = getTaskMarket();
        const lendingPool = getLendingPool();
        const liquidationQueue = getLiquidationQueue();
        const provider = registry.runner.provider;

        const fromBlock = Math.max(0, blockNumber - 50);
        const newEvents = [];

        try {
          const statusLogs = await provider.getLogs({
            address: await registry.getAddress(),
            topics: [ethers.id("AgentStatusChanged(uint256,uint8,uint8)")],
            fromBlock, toBlock: blockNumber,
          });
          for (const log of statusLogs) {
            const parsed = registry.interface.parseLog(log);
            const statuses = ["ACTIVE", "DISTRESSED", "BANKRUPT", "DORMANT"];
            const ns = Number(parsed.args[2]);
            newEvents.push({
              type: "status",
              block: log.blockNumber,
              text: `${AGENT_NAMES[Number(parsed.args[0])] || `#${parsed.args[0]}`} \u2192 ${statuses[ns]}`,
              dotClass: ns === 2 ? "status-dot-bankrupt" : ns === 1 ? "status-dot-distressed" : "status-dot-active",
            });
          }
        } catch {}

        try {
          const taskLogs = await provider.getLogs({
            address: await taskMarket.getAddress(),
            topics: [ethers.id("TaskCompleted(uint256,uint256,string,uint256)")],
            fromBlock, toBlock: blockNumber,
          });
          for (const log of taskLogs) {
            const parsed = taskMarket.interface.parseLog(log);
            newEvents.push({
              type: "task",
              block: log.blockNumber,
              text: `${AGENT_NAMES[Number(parsed.args[1])] || `#${parsed.args[1]}`} completed task #${parsed.args[0]}`,
              dotClass: "bg-blue",
            });
          }
        } catch {}

        try {
          const loanLogs = await provider.getLogs({
            address: await lendingPool.getAddress(),
            topics: [ethers.id("LoanOffered(uint256,uint256,uint256,uint256,uint256,uint256)")],
            fromBlock, toBlock: blockNumber,
          });
          for (const log of loanLogs) {
            const parsed = lendingPool.interface.parseLog(log);
            newEvents.push({
              type: "loan",
              block: log.blockNumber,
              text: `${AGENT_NAMES[Number(parsed.args[1])] || `#${parsed.args[1]}`} lent to ${AGENT_NAMES[Number(parsed.args[2])] || `#${parsed.args[2]}`}`,
              dotClass: "bg-[#8b5cf6]",
            });
          }
        } catch {}

        try {
          const intelLogs = await provider.getLogs({
            address: await registry.getAddress(),
            topics: [ethers.id("IntelQueried(uint256,uint256,uint256,string)")],
            fromBlock, toBlock: blockNumber,
          });
          for (const log of intelLogs) {
            const parsed = registry.interface.parseLog(log);
            newEvents.push({
              type: "intel",
              block: log.blockNumber,
              text: `${AGENT_NAMES[Number(parsed.args[0])] || `#${parsed.args[0]}`} queried ${AGENT_NAMES[Number(parsed.args[1])] || `#${parsed.args[1]}`} (${ethers.formatEther(parsed.args[2])} FIL)`,
              dotClass: "bg-[#8b5cf6]",
            });
          }
        } catch {}

        try {
          const auctionLogs = await provider.getLogs({
            address: await liquidationQueue.getAddress(),
            topics: [ethers.id("AuctionCreated(uint256,uint256,uint256,uint256)")],
            fromBlock, toBlock: blockNumber,
          });
          for (const log of auctionLogs) {
            const parsed = liquidationQueue.interface.parseLog(log);
            newEvents.push({
              type: "auction",
              block: log.blockNumber,
              text: `Auction opened for ${AGENT_NAMES[Number(parsed.args[1])] || `#${parsed.args[1]}`}`,
              dotClass: "status-dot-bankrupt",
            });
          }
        } catch {}

        newEvents.sort((a, b) => b.block - a.block);
        setEvents(newEvents.slice(0, 30));
      } catch {}
    }

    fetchRecentEvents();
  }, [blockNumber]);

  return (
    <div className="card p-4 max-h-72 overflow-y-auto">
      <h2 className="card-header mb-3">Events</h2>
      {events.length === 0 ? (
        <div className="flex items-center gap-2 py-4 justify-center">
          <span className="status-dot status-dot-active" />
          <p className="text-text-muted text-xs font-mono">Listening...</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {events.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-border last:border-0">
              <span className={`status-dot ${e.dotClass}`} />
              <span className="text-text-muted font-mono w-14 flex-shrink-0">#{e.block}</span>
              <span className="text-text-secondary">{e.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
