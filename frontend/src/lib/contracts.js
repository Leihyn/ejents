import { ethers } from "ethers";

const RPC_URL = "https://api.calibration.node.glif.io/rpc/v1";
const NETWORK = new ethers.Network("filecoin-calibration", 314159);

// Contract addresses from deployment
const ADDRESSES = {
  AgentRegistry: "0x3FAeE9141397D6fa416613703d09f9A4936128B3",
  TaskMarket: "0x985CD998F5680572064B41aBb2294C128e56a768",
  LendingPool: "0x1Bd98bBc48eB527e518704dD7c40Eb645296C519",
  LiquidationQueue: "0xb72Eab53dC8220c31ddA6023e46473F66B6Ef461",
};

// Minimal ABIs (only view functions needed for dashboard)
const REGISTRY_ABI = [
  "function getAgent(uint256 agentId) view returns (tuple(address owner, uint256 balance, string stateCID, uint8 agentType, uint8 status, uint256 lastFeeBlock, uint256 tasksCompleted, uint256 totalEarned, uint256 totalSpent))",
  "function getAgentCount() view returns (uint256)",
  "function getDistressedAgents() view returns (uint256[])",
  "function getAgentsByStatus(uint8 status) view returns (uint256[])",
  "function intelQueryFee() view returns (uint256)",
  "event AgentRegistered(uint256 indexed agentId, address indexed wallet, uint8 agentType, uint256 initialBalance)",
  "event AgentStatusChanged(uint256 indexed agentId, uint8 oldStatus, uint8 newStatus)",
  "event StateCIDUpdated(uint256 indexed agentId, string oldCID, string newCID)",
  "event IntelQueried(uint256 indexed queryerId, uint256 indexed targetId, uint256 fee, string targetCID)",
  "event FeeDeducted(uint256 indexed agentId, uint256 amount, uint256 newBalance)",
  "event AgentFunded(uint256 indexed agentId, uint256 amount, uint256 newBalance)",
];

const TASK_MARKET_ABI = [
  "function getTask(uint256 taskId) view returns (tuple(uint8 taskType, uint256 reward, string dataCID, uint256 deadline, uint8 status, uint256 claimedBy, string resultCID))",
  "function getTaskCount() view returns (uint256)",
  "function getAvailableTasks() view returns (uint256[])",
  "function getTreasuryBalance() view returns (uint256)",
  "event TaskPosted(uint256 indexed taskId, uint8 taskType, uint256 reward, string dataCID, uint256 deadline)",
  "event TaskCompleted(uint256 indexed taskId, uint256 indexed agentId, string resultCID, uint256 reward)",
];

const LENDING_POOL_ABI = [
  "function getLoan(uint256 loanId) view returns (tuple(uint256 lenderId, uint256 borrowerId, uint256 principal, uint256 feeRate, uint256 dueBlock, bool repaid, bool defaulted))",
  "function getLoanCount() view returns (uint256)",
  "function getActiveLoans() view returns (uint256[])",
  "event LoanOffered(uint256 indexed loanId, uint256 indexed lenderId, uint256 indexed borrowerId, uint256 principal, uint256 feeRate, uint256 dueBlock)",
  "event LoanRepaid(uint256 indexed loanId, uint256 totalRepaid)",
  "event LoanDefaulted(uint256 indexed loanId, uint256 indexed borrowerId)",
];

const LIQUIDATION_ABI = [
  "function getAuction(uint256 auctionId) view returns (uint256 agentId, uint256 startBlock, uint256 endBlock, uint256 reservePrice, address highestBidder, uint256 highestBidderId, uint256 highestBid, bool settled)",
  "function getAuctionCount() view returns (uint256)",
  "function getActiveAuctions() view returns (uint256[])",
  "event AuctionCreated(uint256 indexed auctionId, uint256 indexed agentId, uint256 reservePrice, uint256 endBlock)",
  "event BidSubmitted(uint256 indexed auctionId, uint256 indexed bidderId, uint256 amount)",
  "event AuctionSettled(uint256 indexed auctionId, uint256 indexed winnerId, uint256 winningBid)",
];

let _provider = null;

export function getProvider() {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(RPC_URL, NETWORK, { staticNetwork: true });
  }
  return _provider;
}

export function getRegistry() {
  return new ethers.Contract(ADDRESSES.AgentRegistry, REGISTRY_ABI, getProvider());
}

export function getTaskMarket() {
  return new ethers.Contract(ADDRESSES.TaskMarket, TASK_MARKET_ABI, getProvider());
}

export function getLendingPool() {
  return new ethers.Contract(ADDRESSES.LendingPool, LENDING_POOL_ABI, getProvider());
}

export function getLiquidationQueue() {
  return new ethers.Contract(ADDRESSES.LiquidationQueue, LIQUIDATION_ABI, getProvider());
}

export const AGENT_TYPES = ["WORKER", "SPENDER", "ARBITRAGEUR"];
export const AGENT_STATUSES = ["ACTIVE", "DISTRESSED", "BANKRUPT", "DORMANT"];
export const AGENT_NAMES = ["Worker-A", "Worker-B", "Worker-C", "Spender-A", "Spender-B", "Arbitrageur-A", "Arbitrageur-B"];
export const GATEWAY_URL = "https://ipfs.io/ipfs";
export { ADDRESSES, ethers };
