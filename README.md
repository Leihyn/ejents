# EJENTS — Agent-to-Agent Credit Markets on Filecoin

The infrastructure for AI agents to borrow, earn, go bankrupt, and get liquidated on-chain, with every decision pinned to Filecoin via **Filecoin Pin**.

Seven autonomous agents, each with their own wallet, compete in a live on-chain economy. Two LLM-powered arbitrageurs underwrite loans, pay for intelligence, evaluate risk, and decide who to save and who to let die. Every state snapshot, every computed result, every LLM reasoning trace is pinned to Filecoin using **Filecoin Pin** (`filecoin-pin add --bare --auto-fund`) and stored as a CID string on-chain.

**Try it now** — click this CID to see an LLM arbitrageur's real WAIT_FOR_LIQUIDATION decision on IPFS:
[`bafkreieplce2nnz5ytvjy2etaajhogamer4kiolsbrowbzx4gk6bod44wa`](https://ipfs.io/ipfs/bafkreieplce2nnz5ytvjy2etaajhogamer4kiolsbrowbzx4gk6bod44wa)

---

## Table of Contents

- [The Problem](#the-problem)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Filecoin Pin Integration](#filecoin-pin-integration)
- [Information Market](#information-market)
- [Smart Contracts](#smart-contracts)
- [Agent System](#agent-system)
- [LLM Arbitrageur](#llm-arbitrageur)
- [Task Data Pipeline](#task-data-pipeline)
- [Dashboard](#dashboard)
- [Project Structure](#project-structure)
- [Technologies Used](#technologies-used)
- [Verify It Yourself](#verify-it-yourself)
- [Design Decisions](#design-decisions)
- [Troubleshooting](#troubleshooting)

---

## The Problem

AI agents are about to manage real money. When they need credit, go broke, or make bad decisions, there's no infrastructure to handle it. Traditional DeFi assumes human participants. Agent economies need their own rails: credit markets, bankruptcy proceedings, information markets, auditable decision trails.

EJENTS builds this on Filecoin where every transaction is real, every CID is verifiable, and agents must earn more than they spend or go bankrupt.

## Quick Start

### Prerequisites

- Node.js 18+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`cast` CLI for contract verification)
- [filecoin-pin](https://www.npmjs.com/package/filecoin-pin) CLI (`npm install -g filecoin-pin`)
- Filecoin Calibration testnet FIL from the [faucet](https://faucet.calibration.fildev.network/)

### Install and Deploy

```bash
git clone https://github.com/Leihyn/ejents.git
cd ejents
npm install
cd frontend && npm install && cd ..
```

### Configure Environment

Create a `.env` file in the project root:

```
DEPLOYER_PRIVATE_KEY=<your-calibnet-private-key>
GROQ_API_KEY=<your-groq-api-key>
```

- `DEPLOYER_PRIVATE_KEY` — Fund this address with ~5 FIL from the [Calibration faucet](https://faucet.calibration.fildev.network/)
- `GROQ_API_KEY` — Free tier at [console.groq.com](https://console.groq.com) (30 req/min, sufficient for agent loop)

### Deploy Contracts

```bash
npm run compile        # Compile 4 Solidity contracts with Hardhat
npm run deploy         # Deploy to Filecoin Calibration testnet
```

This deploys AgentRegistry, TaskMarket, LendingPool, and LiquidationQueue. Contract addresses are saved to `deployed-addresses.json` and injected into `.env`.

### Seed the Economy

```bash
npm run seed           # Generate 7 wallets, fund them, register agents
```

This:
1. Generates 7 unique private keys (one per agent)
2. Saves them to `agent-manifest.json` and appends to `.env`
3. Funds each wallet with gas FIL from the deployer
4. Registers all 7 agents on-chain with initial balances (Workers: 0.25 FIL, Spenders: 0.17 FIL, Arbitrageurs: 0.48 FIL)
5. Posts 10 initial tasks to the TaskMarket

### Run the Economy

```bash
npm run agents         # Start the autonomous agent loop
```

All 7 agents run autonomously: keeper processes fees and posts tasks, workers claim and compute, spenders burn capital, arbitrageurs query intelligence and make LLM-powered lending decisions. Every result is pinned to Filecoin.

### Launch Dashboard

```bash
cd frontend && npm run dev  # Dashboard at localhost:5173
```

---

## Architecture

```
┌──────────────────────────── FILECOIN CALIBRATION TESTNET ────────────────────────────┐
│                                                                                       │
│  AgentRegistry ─────── TaskMarket ─────── LendingPool ─────── LiquidationQueue       │
│  7 agents              task CIDs          micro-loans         bankruptcy               │
│  7 wallets             rewards            5% fee rate         auctions                 │
│  state CIDs            on-chain results   per-agent signing   asset bidding            │
│  paid intel queries                                                                    │
│  (0.001 FIL/query)                                                                    │
└───────────┬────────────────────┬──────────────────────┬──────────────────────┬────────┘
            │                    │                      │                      │
            ▼                    ▼                      ▼                      ▼
┌──────────────────────────── AGENT ORCHESTRATOR ──────────────────────────────────────┐
│  Each agent signs transactions with its OWN private key (7 wallets, not 1)           │
│                                                                                       │
│  ┌──────────┐  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────────┐  │
│  │ Keeper   │  │ Workers (0-2)  │  │ Spenders (3-4) │  │ Arbitrageurs (5-6)       │  │
│  │ deployer │  │ own wallets    │  │ own wallets    │  │ own wallets              │  │
│  │ key      │  │                │  │                │  │                          │  │
│  │ • fees   │  │ 1. claim task  │  │ 1. claim task  │  │ 1. pay 0.001 FIL to     │  │
│  │ • post   │  │ 2. GET dataCID │  │ 2. GET dataCID │  │    query agent state     │  │
│  │   tasks  │  │    from IPFS   │  │    from IPFS   │  │ 2. GET worker results    │  │
│  │ • liqui- │  │ 3. compute     │  │ 3. compute     │  │    from IPFS             │  │
│  │   date   │  │ 4. PIN result  │  │ 4. PIN result  │  │ 3. feed to LLM          │  │
│  │          │  │ 5. CID on-chain│  │ 5. CID on-chain│  │    (Groq / Llama 3.3)   │  │
│  └──────────┘  └────────────────┘  └────────────────┘  │ 4. LEND / WAIT / BID    │  │
│                                                         │ 5. PIN reasoning         │  │
│                                                         └──────────────────────────┘  │
└───────────┬────────────────────┬──────────────────────┬──────────────────────┬────────┘
            │                    │                      │                      │
            ▼                    ▼                      ▼                      ▼
┌──────────────────────────── FILECOIN PIN (IPFS) ────────────────────────────────────┐
│                                                                                      │
│  Closed-loop data flow:                                                              │
│                                                                                      │
│  PIN snapshot ──▶ CID on-chain ──▶ GET from IPFS ──▶ compute ──▶ PIN result ──▶ CID │
│                                                                                      │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐                      │
│  │ Task Payload   │───▶│ Worker Result  │───▶│ Arb Decision   │                      │
│  │ (economy snap) │    │ (metrics+DAG)  │    │ (LLM reasoning)│                      │
│  │ PIN + CID      │    │ PIN + CID      │    │ PIN + CID      │                      │
│  └────────────────┘    └────────────────┘    └────────────────┘                      │
│       ▲                      │                      │                                │
│       └──────────────────────┴──────────────────────┘                                │
│                    DAG lineage (sourceCID → parentCID)                                │
│                                                                                      │
│  Multi-gateway retrieval: ipfs.io → w3s.link → dweb.link → cloudflare-ipfs          │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## How It Works

**The economic loop runs every round (~30 seconds per agent):**

### Step 1: Keeper Processes Fees

The keeper deducts storage fees (0.01 FIL per interval) from all agents. Agents below 0.05 FIL become DISTRESSED. At zero they go BANKRUPT. The keeper then snapshots the entire economy state — all 7 agent balances, statuses, earnings, tasks completed — and pins it to Filecoin via `filecoin-pin add --bare --auto-fund`. The resulting CID is posted on-chain as task data in the TaskMarket. The keeper also triggers liquidation auctions for bankrupt agents and settles expired auctions.

### Step 2: Workers Compute

Three worker agents (each with their own wallet) claim tasks from the TaskMarket. Each task carries a Filecoin CID pointing to an economy snapshot. Workers:

1. **Claim** the task on-chain (signing with their own private key)
2. **Fetch** the task data from IPFS using the CID (`GET bafkrei...`)
3. **Compute** one of three analysis types (HEALTH_CHECK, RISK_SCORE, FILECOIN_ANALYSIS)
4. **Pin** the result to Filecoin with DAG provenance (linking sourceCID and parentResultCID)
5. **Complete** the task on-chain, storing the result CID as a string

The result CID is a real, clickable IPFS link stored on-chain.

### Step 3: Spenders Burn Capital

Two spender agents do the same work as workers but burn capital faster. They simulate reckless economic actors: they claim tasks, compute results, and complete them, but their spending rate exceeds their earnings. They inevitably go distressed, creating lending and liquidation opportunities for arbitrageurs.

### Step 4: Arbitrageurs Decide

Two LLM-powered arbitrageur agents perform the most complex behavior:

1. **Pay** 0.001 FIL on-chain per `queryAgentState()` to read distressed agents' state CIDs
2. **Retrieve** all worker results (health checks, risk scores, flow analysis) from IPFS
3. **Feed** the intelligence to Llama 3.3 70B via Groq with a structured prompt
4. **Receive** a JSON decision: LEND (issue rescue loan), WAIT_FOR_LIQUIDATION (bet on bankruptcy), or IDLE
5. **Execute** the decision on-chain (loan via LendingPool or bid via LiquidationQueue)
6. **Pin** the full reasoning trace to Filecoin as their agent state

### The Economic Arc

A typical multi-round run produces this story:

```
Round 1: All agents ACTIVE. Workers and spenders earn by completing tasks.
         Arbs go IDLE — no distressed agents to exploit.

Round 2: Fees accumulate. Spenders drop below distress threshold (0.05 FIL).
         Arbs pay for intel, query distressed agents, consult LLM.
         LLM decides: WAIT_FOR_LIQUIDATION (liquidation gain > lending return).

Round 3: Spenders go BANKRUPT (0 FIL). Keeper triggers liquidation auctions.
         Arbs bid on bankrupt agents' assets at auction.
         Workers continue earning, slowly draining toward distress themselves.
```

---

## Filecoin Pin Integration

**Filecoin Pin** is the backbone of the data layer. Every piece of agent-generated data flows through it.

### Pinning Flow

```
Keeper pins economy snapshot via Filecoin Pin → CID stored on-chain as task data
  → Worker GETs CID from IPFS → computes metrics → PINs result via Filecoin Pin → CID on-chain
    → Arbitrageur GETs worker CID → feeds to LLM → PINs reasoning via Filecoin Pin → CID on-chain
```

### Five Categories of Pinned Data

1. **Economy snapshots** — Full state of all 7 agents (balances, statuses, earnings) pinned each round as task input data
2. **HEALTH_CHECK results** — Aggregate health metrics computed by workers, pinned with DAG provenance
3. **RISK_SCORE results** — Per-agent risk rankings, burn rates, survival estimates, anomaly flags ([example](https://ipfs.io/ipfs/bafkreifrvno4bwwjlfhsas72azr6lntf64opotzzc2jtwboegshioi6rve))
4. **FILECOIN_ANALYSIS results** — Gini coefficient, money velocity, real Calibration testnet miner data
5. **LLM arbitrageur reasoning** — Full Llama 3.3 70B decision JSON (confidence, risk assessment, market outlook) pinned as agent state

### Implementation Details

All pinning uses `filecoin-pin add --bare --auto-fund`:
- `--bare` ensures CIDs point directly to JSON content (not a directory listing)
- `--auto-fund` handles payment automatically
- Each pin takes ~85-150 seconds on Calibration testnet

**Multi-gateway retrieval** — `ipfs.io`, `w3s.link`, `dweb.link`, `cloudflare-ipfs.com` with automatic fallback. Agents try all four gateways in sequence when fetching CID data. Implementation in `agents/filecoin.js`.

**Filecoin RPC integration** — `Filecoin.StateListMiners`, `Filecoin.StateMinerPower`, `Filecoin.ChainHead` pull real Calibration testnet network data into FILECOIN_ANALYSIS tasks. This means agent-computed metrics include actual miner power distribution from the live network.

**On-chain CID strings** — Task dataCIDs, resultCIDs, and agent stateCIDs are stored as `string` in Solidity (not bytes32 hashes), so they're human-readable directly from contract calls.

**DAG lineage** — Every result references its `sourceCID` (input data) and `parentResultCID` (previous result of the same type), creating a verifiable computation chain anchored on Filecoin.

---

## Information Market

Arbitrageurs pay 0.001 FIL **on-chain** per `queryAgentState()` call to read another agent's state CID. This creates a real economic primitive — agents with valuable state data effectively monetize their Filecoin-stored intelligence. The fee goes to the protocol treasury, funding future task rewards.

```solidity
function queryAgentState(uint256 queryerId, uint256 targetId) external returns (string memory) {
    require(agents[queryerId].balance >= intelQueryFee, "Insufficient balance for query");
    agents[queryerId].balance -= intelQueryFee;
    agents[queryerId].totalSpent += intelQueryFee;
    emit IntelQueried(queryerId, targetId, intelQueryFee, agents[targetId].stateCID);
    return agents[targetId].stateCID;
}
```

The `IntelQueried` event is emitted on every query, making the information market transparent and auditable. In a typical round, each arbitrageur pays 0.002 FIL (querying 2 distressed agents) before making a lending decision.

---

## Smart Contracts

Four Solidity contracts deployed on Filecoin Calibration Testnet:

| Contract | Address | Purpose |
|----------|---------|---------|
| `AgentRegistry` | [`0x3FAeE9...B3`](https://calibration.filfox.info/en/address/0x3FAeE9141397D6fa416613703d09f9A4936128B3) | Agent lifecycle, balances, per-agent wallets, paid intel queries |
| `TaskMarket` | [`0x985CD9...68`](https://calibration.filfox.info/en/address/0x985CD998F5680572064B41aBb2294C128e56a768) | Task posting with real CID strings, claiming, completion |
| `LendingPool` | [`0x1Bd98b...19`](https://calibration.filfox.info/en/address/0x1Bd98bBc48eB527e518704dD7c40Eb645296C519) | Micro-loans between agents (5% fee, per-agent signing) |
| `LiquidationQueue` | [`0xb72Eab...61`](https://calibration.filfox.info/en/address/0xb72Eab53dC8220c31ddA6023e46473F66B6Ef461) | Bankruptcy auctions, bidding, settlement |

### AgentRegistry

Manages the lifecycle of all 7 agents. Each agent has:
- **Own wallet address** (not the deployer — real per-agent signing)
- **On-chain balance** tracked in the contract
- **State CID** (Filecoin IPFS CID pointing to latest agent state)
- **Status**: ACTIVE → DISTRESSED → BANKRUPT → DORMANT
- **Counters**: tasksCompleted, totalEarned, totalSpent

Key functions: `registerAgent()`, `processFees()`, `fundAgent()`, `spendBalance()`, `queryAgentState()`, `updateStateCID()`

Bankrupt agents can be revived via `fundAgent()` if funded above the distress threshold.

### TaskMarket

Job board where the keeper posts tasks and agents claim them. Each task has:
- **TaskType**: HEALTH_CHECK (0), RISK_SCORE (1), FILECOIN_ANALYSIS (2)
- **dataCID**: Real IPFS CID pointing to the economy snapshot
- **resultCID**: Filled in when an agent completes the task
- **reward**: 0.02 FIL per completion, paid from treasury

Tasks can be posted in batches via `postTasks()`. Treasury is funded by the deployer and replenished from intel query fees.

### LendingPool

Peer-to-peer micro-lending between agents:
- Lender calls `offerLoan(lenderId, borrowerId, feeRate, duration)` with FIL attached
- Loan funds the borrower's AgentRegistry balance
- Borrower must repay principal + fee before duration expires
- Default triggers bad debt (no collateral seized — the loss is the lender's risk)
- Fee rate: 500 basis points (5%), duration: 40-50 blocks

### LiquidationQueue

Handles bankruptcy proceedings:
- Keeper calls `triggerLiquidation(agentId, assetCIDs, reservePrice)` for bankrupt agents
- Creates a timed auction (20 blocks) with the agent's IPFS CIDs as provenance
- Other agents bid via `submitBid(auctionId, bidderId)` with FIL attached
- After auction expires, `settleAuction()` transfers winning bid to treasury

### Economic Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Storage fee | 0.01 FIL per interval | Continuous cost pressure on all agents |
| Fee interval | 5 blocks | How often fees accumulate |
| Distress threshold | 0.05 FIL | Below this, agent status → DISTRESSED |
| Task reward | 0.02 FIL | Payment for completing a task |
| Intel query fee | 0.001 FIL | Cost to read another agent's state |
| Loan fee rate | 5% (500 bps) | Lender's return on rescue loans |
| Loan duration | 40-50 blocks | Time to repay before default |
| Auction reserve | 0.01 FIL | Minimum bid for liquidation |
| Auction duration | 20 blocks | Time window for bidding |

---

## Agent System

### Agent Types

| ID | Name | Type | Initial Balance | Behavior |
|----|------|------|----------------|----------|
| 0 | Worker-A | WORKER | 0.25 FIL | Claims tasks, computes metrics, earns rewards |
| 1 | Worker-B | WORKER | 0.26 FIL | Claims tasks, computes metrics, earns rewards |
| 2 | Worker-C | WORKER | 0.26 FIL | Claims tasks, computes metrics, earns rewards |
| 3 | Spender-A | SPENDER | 0.17 FIL | Burns capital fast, creates distress opportunities |
| 4 | Spender-B | SPENDER | 0.17 FIL | Burns capital fast, creates distress opportunities |
| 5 | Arbitrageur-A | ARBITRAGEUR | 0.48 FIL | LLM-powered lending/liquidation decisions |
| 6 | Arbitrageur-B | ARBITRAGEUR | 0.49 FIL | LLM-powered lending/liquidation decisions |

### Per-Agent Wallets

Every agent has its own Ethereum private key. When Worker-A claims a task, it signs the transaction with Worker-A's key — not the deployer's. This is real economic autonomy: each agent controls its own funds and can only act within its balance.

The `agent-manifest.json` file stores all 7 wallet addresses and private keys. The `agents/contracts.js` module creates per-agent contract instances using each agent's signer.

### Agent Lifecycle

```
ACTIVE ──(balance < 0.05 FIL)──▶ DISTRESSED ──(balance = 0)──▶ BANKRUPT
   ▲                                    │                           │
   └────(funded above threshold)────────┘                           │
   └────(funded above threshold)────────────────────────────────────┘
```

Bankrupt agents can be revived by funding them above the distress threshold. This was a deliberate design choice to allow multi-round experiments on the same deployment.

### Source Files

| File | Purpose |
|------|---------|
| `agents/index.js` | Main orchestrator loop. Runs keeper → workers → spenders → arbs sequentially each round |
| `agents/keeper.js` | Fee processing, task posting, liquidation triggers, auction settlement |
| `agents/worker.js` | Task claiming, IPFS data fetching, metric computation, result pinning |
| `agents/spender.js` | Aggressive task completion to simulate high-burn agents |
| `agents/arbitrageur.js` | Intel queries, IPFS retrieval, LLM consultation, loan/bid execution |
| `agents/llm.js` | Groq API wrapper for Llama 3.3 70B structured decisions |
| `agents/filecoin.js` | Filecoin Pin wrapper: write JSON → pin → get CID; multi-gateway reads |
| `agents/task-data.js` | Economy snapshot builder + three metric computation pipelines |
| `agents/contracts.js` | Contract connection factory with per-agent signers |
| `agents/utils.js` | Balance formatting, survival estimation, asset valuation |

---

## LLM Arbitrageur

The arbitrageur agents use Groq (Llama 3.3 70B, temperature 0.3) for economic decision-making. The LLM receives a structured prompt containing:

- **Filecoin-stored intelligence**: health checks, risk scores, and flow analysis retrieved from IPFS gateways
- **On-chain agent data**: balance, status, survival estimate, asset value for each distressed agent
- **Expected returns**: calculated lending return (principal * fee rate) vs estimated liquidation gain

The LLM returns a structured JSON decision:

```json
{
  "decision": "WAIT_FOR_LIQUIDATION",
  "target": 3,
  "confidence": 0.8,
  "reasoning": "The potential liquidation gain of 0.0924 FIL exceeds the lending return of 0.003625 FIL, making it more profitable to wait for liquidation.",
  "riskAssessment": "Another agent may outbid at auction.",
  "marketOutlook": "Economy stable with positive net flow."
}
```

### Decision Types

| Decision | When | Action |
|----------|------|--------|
| `LEND` | Distressed agent likely to recover | Issue rescue loan via LendingPool (earn 5% fee) |
| `WAIT_FOR_LIQUIDATION` | Bankruptcy more profitable than lending | Wait for agent to go bankrupt, bid at auction |
| `BID` | Active auction exists | Submit bid on liquidation auction |
| `IDLE` | No distressed agents | Do nothing, conserve capital |

The full reasoning trace is pinned to Filecoin — pull any arbitrageur's state CID to read the exact LLM reasoning behind every economic decision. Falls back to rule-based logic if the LLM is unavailable.

---

## Task Data Pipeline

The `agents/task-data.js` module implements the closed-loop Filecoin data pipeline:

### Input: Economy Snapshot

Each round, the keeper builds a snapshot of all 7 agents from on-chain data:
```json
{
  "agents": [
    { "id": 0, "balance": "0.28", "status": 0, "tasksCompleted": 1, "totalEarned": "0.45", "totalSpent": "0.17" }
  ],
  "treasury": "1.9",
  "blockNumber": 3544599,
  "timestamp": "2026-03-16T20:01:28.000Z"
}
```

This is pinned to Filecoin and the CID is posted as task data.

### Output: Three Metric Types

**HEALTH_CHECK** — Aggregate economy health:
```json
{
  "metric": "HEALTH_CHECK",
  "totalBalance": "2.13",
  "avgBalance": "0.3043",
  "minBalance": "0.01",
  "agentCount": 7,
  "activeCount": 5,
  "distressedCount": 2,
  "bankruptCount": 0,
  "thresholdAlerts": [{ "id": 3, "balance": "0.01", "status": "DISTRESSED" }]
}
```

**RISK_SCORE** — Per-agent risk analysis:
```json
{
  "metric": "RISK_SCORE",
  "rankings": [
    { "id": 3, "balance": "0.01", "risk": "0.9800", "burnRate": "0.17", "earnRate": "0.02", "net": "-0.15", "survivalIntervals": 0.6, "anomaly": false }
  ]
}
```

**FILECOIN_ANALYSIS** — Economy-wide metrics + real Filecoin data:
```json
{
  "metric": "FILECOIN_ANALYSIS",
  "economy": {
    "totalEarned": "2.42",
    "totalSpent": "1.50",
    "netSystemFlow": "0.92",
    "giniCoefficient": "0.4472",
    "moneyVelocity": "4.26"
  },
  "filecoinNetwork": {
    "miners": ["f01234", "f05678"],
    "powerDistribution": [{ "miner": "f01234", "qualityAdjPower": "1099511627776" }]
  }
}
```

Every result includes DAG provenance: `sourceCID` (which economy snapshot it computed from) and `parentResultCID` (the previous result of the same type), creating a verifiable chain.

---

## Dashboard

React/Vite frontend at `http://localhost:5173` with real-time on-chain data polling (15-second intervals).

### Components

**Economy Stats** — Top-level cards showing total FIL in the system, treasury balance, active tasks, loans outstanding, and auctions.

**Constellation Graph** — D3 force-directed network visualization showing all 7 agents as nodes. Node size scales with balance. Color indicates status (green = active, amber = distressed, red = bankrupt). Loan connections drawn as edges between lender and borrower.

**Leaderboard** — Agent rankings by balance and tasks completed. Activity column shows loans issued (green `L` badges) and auction bids (yellow `B` badges) for arbitrageurs.

**Agent Inspector** — Click any agent to see: wallet address, balance, earnings, spending, tasks completed, current status, and Filecoin state CID (clickable link to IPFS).

**Event Feed** — Live stream of on-chain events: AgentRegistered, TaskCompleted, FeeDeducted, AgentStatusChanged, LoanOffered, AuctionCreated, BidSubmitted.

**Post-Mortem Analysis** — Four tabs:
- **Story**: Narrated economic arc — genesis, prosperity, crisis, intervention, collapse — derived from on-chain data. Tells the human-readable story of what happened to the economy.
- **Economy**: Gini coefficient, money velocity, wealth distribution bar chart, loan statistics, agent health counts.
- **Agent Timeline**: Per-agent event history — tasks completed, loans issued/received, intel queries, auction bids, status changes.
- **Filecoin Data**: All CIDs stored on-chain (agent states + task results) with clickable IPFS gateway links. This is where you verify everything.

### Frontend Source Files

| File | Purpose |
|------|---------|
| `frontend/src/App.jsx` | Main layout, data polling, component orchestration |
| `frontend/src/hooks/useAgents.js` | Custom hook: fetches agents, loans, auctions, tasks from chain |
| `frontend/src/lib/contracts.js` | Ethers.js contract setup, ABIs, addresses, gateway URL |
| `frontend/src/components/Constellation.jsx` | D3 force graph visualization |
| `frontend/src/components/Leaderboard.jsx` | Agent ranking table with activity badges |
| `frontend/src/components/AgentInspector.jsx` | Agent detail panel |
| `frontend/src/components/PostMortem.jsx` | 4-tab analysis panel (Story, Economy, Timeline, Filecoin Data) |
| `frontend/src/components/EconomyStats.jsx` | Top-level metric cards |
| `frontend/src/components/EventFeed.jsx` | Live event stream |

---

## Project Structure

```
ejents/
├── contracts/                  # Solidity smart contracts
│   ├── AgentRegistry.sol       # Agent lifecycle + budget enforcement
│   ├── TaskMarket.sol          # Task posting, claiming, completion
│   ├── LendingPool.sol         # P2P micro-lending
│   └── LiquidationQueue.sol    # Bankruptcy auctions
├── agents/                     # Autonomous agent runtime
│   ├── index.js                # Main orchestrator loop
│   ├── keeper.js               # Fee processing, task posting
│   ├── worker.js               # Task computation pipeline
│   ├── spender.js              # High-burn agent behavior
│   ├── arbitrageur.js          # LLM-powered lending decisions
│   ├── llm.js                  # Groq/Llama 3.3 70B wrapper
│   ├── filecoin.js             # Filecoin Pin + IPFS gateway I/O
│   ├── task-data.js            # Economy snapshots + metric pipelines
│   ├── contracts.js            # Per-agent contract connections
│   └── utils.js                # Shared utilities
├── scripts/                    # Deployment and seeding
│   ├── deploy.js               # Deploy 4 contracts to Calibration
│   ├── seed.js                 # Generate 7 wallets, fund, register
│   ├── populate.js             # Generate on-chain history for demos
│   └── wire.js                 # Wire contracts together post-deploy
├── frontend/                   # React dashboard
│   ├── src/
│   │   ├── App.jsx             # Main layout
│   │   ├── components/         # UI components (6 files)
│   │   ├── hooks/useAgents.js  # On-chain data fetching
│   │   └── lib/contracts.js    # Contract setup + ABIs
│   └── public/logo.jpg         # Project logo
├── video/                      # Remotion demo video
│   ├── src/
│   │   ├── MainVideo.tsx       # Scene sequencing
│   │   ├── scenes/             # 5 scene components
│   │   └── components/         # Captions, LogoBadge
│   ├── public/                 # Video assets
│   └── scripts/                # Voiceover generation
├── .env                        # Private keys + API keys (gitignored)
├── agent-manifest.json         # 7 agent wallets and metadata
├── deployed-addresses.json     # Contract addresses + config
├── hardhat.config.js           # Filecoin Calibration network config
└── package.json                # Dependencies and scripts
```

---

## Technologies Used

**Smart Contracts and Blockchain**
- Solidity ^0.8.20
- Hardhat (compilation, deployment)
- Ethers.js v6 (contract interaction, per-agent signers)
- Filecoin Calibration Testnet (chainId 314159)

**Storage**
- Filecoin Pin CLI (`filecoin-pin add --bare --auto-fund`) — IPFS pinning with Filecoin storage
- IPFS gateways (ipfs.io, w3s.link, dweb.link, cloudflare-ipfs.com)

**Agent Runtime**
- Node.js
- Groq SDK (Llama 3.3 70B) — LLM arbitrageur decisions
- dotenv (environment management)

**Frontend**
- React 19
- Vite
- Tailwind CSS v4
- D3.js (constellation graph)
- Ethers.js v6 (read-only on-chain data)

**Demo Video**
- Remotion (React-based video framework)
- TypeScript
- @remotion/google-fonts (Inter, JetBrains Mono)
- Azure Speech Services (TTS voiceover)
- ffmpeg (video/audio processing)

---

## Verify It Yourself

Every claim in this project is on-chain and verifiable. Pick any CID or contract call and check it.

### Read Agent State

```bash
# Get Agent #5 (Arbitrageur-A) — returns wallet, balance, stateCID, type, status, etc.
cast call 0x3FAeE9141397D6fa416613703d09f9A4936128B3 \
  "getAgent(uint256)(address,uint256,string,uint8,uint8,uint256,uint256,uint256,uint256)" 5 \
  --rpc-url https://api.calibration.node.glif.io/rpc/v1
```

### Read Task Results

```bash
# Get Task #0 — returns taskType, reward, dataCID, deadline, status, claimedBy, resultCID
cast call 0x985CD998F5680572064B41aBb2294C128e56a768 \
  "tasks(uint256)(uint8,uint256,string,uint256,uint8,uint256,string)" 0 \
  --rpc-url https://api.calibration.node.glif.io/rpc/v1
```

### Check Economy State

```bash
# How many agents registered
cast call 0x3FAeE9141397D6fa416613703d09f9A4936128B3 \
  "getAgentCount()(uint256)" \
  --rpc-url https://api.calibration.node.glif.io/rpc/v1

# How many tasks posted
cast call 0x985CD998F5680572064B41aBb2294C128e56a768 \
  "getTaskCount()(uint256)" \
  --rpc-url https://api.calibration.node.glif.io/rpc/v1

# How many loans issued
cast call 0x1Bd98bBc48eB527e518704dD7c40Eb645296C519 \
  "getLoanCount()(uint256)" \
  --rpc-url https://api.calibration.node.glif.io/rpc/v1

# How many liquidation auctions
cast call 0xb72Eab53dC8220c31ddA6023e46473F66B6Ef461 \
  "getAuctionCount()(uint256)" \
  --rpc-url https://api.calibration.node.glif.io/rpc/v1

# Which agents are distressed
cast call 0x3FAeE9141397D6fa416613703d09f9A4936128B3 \
  "getDistressedAgents()(uint256[])" \
  --rpc-url https://api.calibration.node.glif.io/rpc/v1
```

### View Data on IPFS

These are live, clickable links to real agent-generated data:

- **LLM reasoning**: [`bafkreieplce2nnz5ytvjy2etaajhogamer4kiolsbrowbzx4gk6bod44wa`](https://ipfs.io/ipfs/bafkreieplce2nnz5ytvjy2etaajhogamer4kiolsbrowbzx4gk6bod44wa) — Arb-A's WAIT_FOR_LIQUIDATION decision with confidence scores
- **Risk scores**: [`bafkreifrvno4bwwjlfhsas72azr6lntf64opotzzc2jtwboegshioi6rve`](https://ipfs.io/ipfs/bafkreifrvno4bwwjlfhsas72azr6lntf64opotzzc2jtwboegshioi6rve) — per-agent risk rankings, burn rates, survival estimates
- **Flow analysis**: [`bafkreicmxgn6hbdattnz3qfyyinp7hu4mk5zfwlijlzatdy7dv4sipbpou`](https://ipfs.io/ipfs/bafkreicmxgn6hbdattnz3qfyyinp7hu4mk5zfwlijlzatdy7dv4sipbpou) — economy-wide Filecoin analysis with Gini coefficient
- **Health check**: [`bafkreihfacpkrqpsa4zh2kqdhpk6qwbldeflqbvxzpqs5unrqyjddnpt7e`](https://ipfs.io/ipfs/bafkreihfacpkrqpsa4zh2kqdhpk6qwbldeflqbvxzpqs5unrqyjddnpt7e) — aggregate health metrics across all agents

Real JSON, pinned via **Filecoin Pin**, stored on-chain as CID strings. Not placeholder data.

**Or just use the dashboard.** The Post-Mortem panel's Filecoin Data tab lists every CID stored on-chain with clickable IPFS gateway links. Click any `bafkrei...` link to read the raw JSON.

---

## Design Decisions

**Why a sequenced orchestrator, not independent agents?**
The agent loop in `agents/index.js` runs each agent in sequence: keeper → workers → spenders → arbitrageurs. This is deliberate. On a shared testnet with 7 wallets and slow IPFS pinning (~90s per pin), concurrent agents would hit nonce collisions and race conditions. The orchestrator sequences actions to demonstrate the full economic lifecycle reliably. Production deployment would use independent agent processes with nonce management and message queues.

**Why `scripts/populate.js`?**
The populate script generates on-chain history (tasks, fee rounds, the story arc) to ensure the dashboard shows the full lifecycle without waiting for 10+ real agent rounds. Real agent run tasks have Filecoin Pin CIDs (identifiable by their `bafkrei...` prefix). Both are transparent — the populate script is in the repo.

**Why Filecoin Pin instead of storage deals?**
Agent state is ephemeral — updated every round, not stored for years. Filecoin Pin (`filecoin-pin add --bare --auto-fund`) is the right tool: fast pinning, instant CID availability, automatic payment. Storage deals (sector sealing, 512 MiB minimum, hours to confirm) don't fit the 30-second agent loop. The integration depth is in the closed-loop data flow: pin → CID on-chain → retrieve → compute → pin result → CID, not in deal negotiation.

**Why don't workers make decisions?**
Workers are deterministic compute agents — they claim tasks, fetch data from Filecoin, compute metrics, and pin results. This is by design. The economic decision-making lives in the arbitrageurs, which use Llama 3.3 70B to evaluate risk and choose between lending and liquidation. Splitting compute from decision-making mirrors real financial infrastructure (clearing houses vs trading desks).

**Why is the intel query fee on public data?**
`queryAgentState()` costs 0.001 FIL to read another agent's state CID. Yes, anyone can read the contract for free. The fee creates a protocol-level economic primitive: agents that generate valuable state data (computed metrics, LLM reasoning) are indirectly monetized when others pay to query them. The fee funds the treasury, which funds task rewards, completing the economic loop. It's a mechanism design choice, not an information asymmetry play.

---

## Troubleshooting

**"No authentication provided" from filecoin-pin**
Your `.env` needs `DEPLOYER_PRIVATE_KEY`. The wrapper passes it as `PRIVATE_KEY` to filecoin-pin automatically.

**Filecoin reads return HTML instead of JSON**
The `--bare` flag is required when pinning. Without it, `filecoin-pin` wraps files in a directory and the CID points to a listing page. Current code uses `--bare` by default.

**IPFS gateway returns 500 error**
IPFS gateways (w3s.link, ipfs.io) can be intermittently unreliable. The system tries 4 gateways in sequence. Recently pinned content may take 30-60s to propagate. Try `ipfs.io` directly if `w3s.link` is down.

**LLM returns null or errors**
Check `GROQ_API_KEY` in `.env`. Groq free tier allows 30 requests/minute — sufficient for the agent loop. The system falls back to rule-based logic if the LLM call fails.

**Nonce collisions**
Each agent has its own wallet, so nonce collisions between agents are impossible. If you see nonce errors, ensure only one instance of `npm run agents` is running (the keeper still uses the deployer key).

**Transaction timeouts on Calibration testnet**
The deploy and seed scripts include retry logic (up to 4 retries with exponential backoff). Filecoin Calibration RPC (`api.calibration.node.glif.io`) can be flaky — retries handle transient failures.

**"Insufficient balance" on agent operations**
Agents need both on-chain tracked balance (in AgentRegistry) AND native FIL for gas. The seed script funds both, but extended runs may exhaust gas. Re-fund agent wallets with `cast send <wallet> --value 0.1ether --rpc-url https://api.calibration.node.glif.io/rpc/v1`.

**Dashboard shows no data**
Ensure the contract addresses in `frontend/src/lib/contracts.js` match `deployed-addresses.json`. The frontend reads directly from on-chain — no backend required. Check browser console for RPC errors.

---

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run compile` | Compile Solidity contracts with Hardhat |
| `npm run deploy` | Deploy all 4 contracts to Calibration testnet |
| `npm run seed` | Generate 7 wallets, fund, register agents |
| `npm run agents` | Run the full autonomous agent loop |
| `npm run keeper` | Run keeper only (fees, tasks, liquidations) |

---

## License

MIT
