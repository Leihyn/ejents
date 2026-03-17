import { useState, useEffect, useCallback } from "react";
import { getRegistry, getTaskMarket, getLendingPool, getLiquidationQueue, ethers } from "../lib/contracts";

export function useAgents(pollInterval = 15000) {
  const [agents, setAgents] = useState([]);
  const [treasury, setTreasury] = useState("0");
  const [availableTasks, setAvailableTasks] = useState(0);
  const [loans, setLoans] = useState([]);
  const [auctions, setAuctions] = useState([]);
  const [events, setEvents] = useState([]);
  const [blockNumber, setBlockNumber] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const registry = getRegistry();
      const taskMarket = getTaskMarket();
      const lendingPool = getLendingPool();
      const liquidationQueue = getLiquidationQueue();

      // Fetch agents
      const count = await registry.getAgentCount();
      const agentList = [];
      for (let i = 0; i < count; i++) {
        const a = await registry.getAgent(i);
        agentList.push({
          id: i,
          balance: ethers.formatEther(a.balance),
          balanceWei: a.balance,
          stateCID: a.stateCID,
          wallet: a.owner,
          agentType: Number(a.agentType),
          status: Number(a.status),
          lastFeeBlock: Number(a.lastFeeBlock),
          tasksCompleted: Number(a.tasksCompleted),
          totalEarned: ethers.formatEther(a.totalEarned),
          totalSpent: ethers.formatEther(a.totalSpent),
        });
      }
      setAgents(agentList);

      // Treasury & tasks
      const treasuryBal = await taskMarket.getTreasuryBalance();
      setTreasury(ethers.formatEther(treasuryBal));
      const tasks = await taskMarket.getAvailableTasks();
      setAvailableTasks(tasks.length);

      // Loans
      const loanCount = Number(await lendingPool.getLoanCount());
      const loanList = [];
      for (let i = 0; i < Math.min(loanCount, 20); i++) {
        const l = await lendingPool.getLoan(i);
        loanList.push({
          id: i,
          lenderId: Number(l.lenderId),
          borrowerId: Number(l.borrowerId),
          principal: ethers.formatEther(l.principal),
          feeRate: Number(l.feeRate),
          dueBlock: Number(l.dueBlock),
          repaid: l.repaid,
          defaulted: l.defaulted,
        });
      }
      setLoans(loanList);

      // Auctions
      const auctionCount = Number(await liquidationQueue.getAuctionCount());
      const auctionList = [];
      for (let i = 0; i < Math.min(auctionCount, 10); i++) {
        const [agentId, startBlock, endBlock, reservePrice, , highestBidderId, highestBid, settled] =
          await liquidationQueue.getAuction(i);
        auctionList.push({
          id: i,
          agentId: Number(agentId),
          startBlock: Number(startBlock),
          endBlock: Number(endBlock),
          reservePrice: ethers.formatEther(reservePrice),
          highestBidderId: Number(highestBidderId),
          highestBid: ethers.formatEther(highestBid),
          settled,
        });
      }
      setAuctions(auctionList);

      // Block number
      const block = await registry.runner.provider.getBlockNumber();
      setBlockNumber(block);

      setError(null);
      setLoading(false);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }, []);

  // Add event to feed
  const addEvent = useCallback((event) => {
    setEvents((prev) => [event, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, pollInterval);
    return () => clearInterval(interval);
  }, [fetchAll, pollInterval]);

  return { agents, treasury, availableTasks, loans, auctions, events, addEvent, blockNumber, loading, error, refetch: fetchAll };
}
