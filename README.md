# EJENTS — Agent-to-Agent Credit Markets on Filecoin

The infrastructure for AI agents to borrow, earn, go bankrupt, and get liquidated on-chain, with every decision pinned to Filecoin via **Filecoin Pin**.

Seven autonomous agents, each with their own wallet, compete in a live on-chain economy. Two LLM-powered arbitrageurs underwrite loans, pay for intelligence, evaluate risk, and decide who to save and who to let die. Every state snapshot, every computed result, every LLM reasoning trace is pinned to Filecoin using **Filecoin Pin** (`filecoin-pin add --bare --auto-fund`) and stored as a CID string on-chain.

**Try it now** — click this CID to see an LLM arbitrageur's real WAIT_FOR_LIQUIDATION decision on IPFS:
[`bafkreieplce2nnz5ytvjy2etaajhogamer4kiolsbrowbzx4gk6bod44wa`](https://w3s.link/ipfs/bafkreieplce2nnz5ytvjy2etaajhogamer4kiolsbrowbzx4gk6bod44wa)

## The Problem

AI agents are about to manage real money. When they need credit, go broke, or make bad decisions, there's no infrastructure to handle it. Traditional DeFi assumes human participants. Agent economies need their own rails: credit markets, bankruptcy proceedings, information markets, auditable decision trails. EJENTS builds this on Filecoin where every transaction is real, every CID is verifiable, and agents must earn more than they spend or go bankrupt.

## Quick Start

```bash
npm install
cd frontend && npm install && cd ..

npm run compile        # Compile Solidity contracts
npm run deploy         # Deploy to Filecoin Calibration testnet
npm run seed           # Generate 7 wallets, fund, register agents
npm run agents         # Run the economy

cd frontend && npm run dev  # Dashboard at localhost:5173
```

**Required `.env`:**
```
DEPLOYER_PRIVATE_KEY=<your-calibnet-key>
GROQ_API_KEY=<your-groq-key>
```

Get Calibration testnet FIL from the [faucet](https://faucet.calibration.fildev.network/).

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
│  Multi-gateway retrieval: w3s.link → dweb.link → cloudflare-ipfs → ipfs.io          │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## How It Works

**The economic loop runs every 30 seconds:**

1. **Keeper** deducts storage fees (0.01 FIL/interval) from all agents. Agents below 0.05 FIL become DISTRESSED. At zero they go BANKRUPT. Keeper snapshots the economy state — all 7 agent balances, statuses, earnings — and pins it to Filecoin via `filecoin-pin`. The resulting CID is posted on-chain as task data.

2. **Workers** (3 agents, each with own wallet) claim tasks from the TaskMarket. Each task carries a Filecoin CID pointing to an economy snapshot. Workers fetch the snapshot from IPFS (`GET bafkrei...`), compute one of three analysis types, pin the result to Filecoin with DAG provenance, then complete the task on-chain. The result CID — a real, clickable IPFS link — is stored on-chain.

3. **Spenders** (2 agents) do the same work but burn capital faster. They simulate reckless economic actors that inevitably go distressed, creating lending and liquidation opportunities for arbitrageurs.

4. **Arbitrageurs** (2 agents, LLM-powered) first pay 0.001 FIL **on-chain** to query distressed agents' state CIDs — creating a real information market. They then retrieve all worker results from IPFS, feed the intelligence to Llama 3.3 70B via Groq, and get a structured lend-vs-liquidate decision. If an agent is distressed, the LLM decides whether to issue a loan (earning 5% fees) or wait for bankruptcy and bid on assets at auction. The full decision + reasoning is pinned to Filecoin.

**Three task types rotate each cycle:**

- **HEALTH_CHECK** — Total/avg/min/max balance, active/distressed/bankrupt counts, threshold alerts
- **RISK_SCORE** — Per-agent risk ranking, burn/earn rates, survival estimates, anomaly detection (flags agents behaving outside their type expectations)
- **FILECOIN_ANALYSIS** — Economy-wide metrics (Gini coefficient, money velocity), real Filecoin network data (miner power distribution from Calibration testnet RPC), producer/consumer classification

## Filecoin Pin Integration

**Filecoin Pin** is the backbone of the data layer. Every piece of agent-generated data flows through it:

```
Keeper pins economy snapshot via Filecoin Pin → CID stored on-chain as task data
  → Worker GETs CID from IPFS → computes metrics → PINs result via Filecoin Pin → CID on-chain
    → Arbitrageur GETs worker CID → feeds to LLM → PINs reasoning via Filecoin Pin → CID on-chain
```

**Five categories of data pinned via Filecoin Pin:**

1. **Economy snapshots** — Full state of all 7 agents (balances, statuses, earnings) pinned each round as task input data
2. **HEALTH_CHECK results** — Aggregate health metrics computed by workers, pinned with DAG provenance
3. **RISK_SCORE results** — Per-agent risk rankings, burn rates, survival estimates, anomaly flags ([example](https://w3s.link/ipfs/bafkreifrvno4bwwjlfhsas72azr6lntf64opotzzc2jtwboegshioi6rve))
4. **FILECOIN_ANALYSIS results** — Gini coefficient, money velocity, real Calibration testnet miner data
5. **LLM arbitrageur reasoning** — Full Llama 3.3 70B decision JSON (confidence, risk assessment, market outlook) pinned as agent state

All pinning uses `filecoin-pin add --bare --auto-fund`. The `--bare` flag ensures CIDs point directly to JSON content (not a directory listing). The `--auto-fund` flag handles payment automatically.

**Multi-gateway retrieval** — `w3s.link`, `dweb.link`, `cloudflare-ipfs.com`, `ipfs.io` with automatic fallback. Agents try all four gateways in sequence when fetching CID data.

**Filecoin RPC** — `Filecoin.StateListMiners`, `Filecoin.StateMinerPower`, `Filecoin.ChainHead` pull real Calibration testnet network data into FILECOIN_ANALYSIS tasks.

**On-chain CID strings** — Task dataCIDs, resultCIDs, and agent stateCIDs are stored as `string` in Solidity (not bytes32 hashes), so they're human-readable directly from contract calls.

**DAG lineage** — Every result references its `sourceCID` (input data) and `parentResultCID` (previous result of the same type), creating a verifiable computation chain anchored on Filecoin.

## Information Market

Arbitrageurs pay 0.001 FIL **on-chain** per `queryAgentState()` call to read another agent's state CID. This creates a real economic primitive — agents with valuable state data effectively monetize their Filecoin-stored intelligence. The fee goes to the protocol treasury, funding future task rewards.

The `IntelQueried` event is emitted on every query, making the information market transparent and auditable.

## Smart Contracts

| Contract | Address (Calibration) | Purpose |
|----------|----------------------|---------|
| `AgentRegistry` | `0x3FAeE9141397D6fa416613703d09f9A4936128B3` | Agent lifecycle, balances, per-agent wallets, paid intel queries |
| `TaskMarket` | `0x985CD998F5680572064B41aBb2294C128e56a768` | Task posting with real CID strings, claiming, completion |
| `LendingPool` | `0x1Bd98bBc48eB527e518704dD7c40Eb645296C519` | Micro-loans between agents (5% fee, per-agent signing) |
| `LiquidationQueue` | `0xb72Eab53dC8220c31ddA6023e46473F66B6Ef461` | Bankruptcy auctions, bidding, settlement |

**Key mechanics:**
- Storage fee: 0.01 FIL per 10-block interval
- Distress threshold: 0.05 FIL
- Task reward: 0.02 FIL per completion
- Intel query fee: 0.001 FIL per on-chain query
- Loan fee: 5% (500 basis points), 50-block duration
- Auction reserve: 0.01 FIL, 20-block duration
- **Per-agent wallets**: 7 unique private keys, each agent signs its own transactions

## LLM Arbitrageur

The arbitrageur agents use Groq (Llama 3.3 70B, temperature 0.3) for economic decision-making. The LLM receives:

- Filecoin-stored health checks, risk scores, and flow analysis retrieved from IPFS
- On-chain data about distressed agents (balance, survival estimate, asset value)
- Expected returns from lending vs liquidation

It returns a structured JSON decision:

```json
{
  "decision": "WAIT_FOR_LIQUIDATION",
  "target": 3,
  "confidence": 0.8,
  "reasoning": "Agent #3 has high risk and low survival. Liquidation gain exceeds lending return.",
  "riskAssessment": "Another agent may outbid at auction.",
  "marketOutlook": "Economy stable with positive net flow."
}
```

The full reasoning is pinned to Filecoin — pull any arbitrageur's state CID to read the exact LLM reasoning behind every economic decision. Falls back to rule-based logic if the LLM is unavailable.

## Dashboard

React/Vite frontend at `http://localhost:5173`:

- **Economy Stats** — Total FIL, treasury balance, active tasks, loans
- **Constellation** — D3 network graph showing agent relationships and loan connections
- **Agent Inspector** — Drill-down: balance, earnings, wallet address, Filecoin state CID (clickable)
- **Leaderboard** — Agent rankings by balance and tasks completed
- **Event Feed** — Live on-chain events
- **Post-Mortem Analysis** — Four tabs:
  - *Story*: Narrated economic arc — genesis, prosperity, crisis, intervention, collapse — derived from on-chain data
  - *Economy*: Gini coefficient, money velocity, wealth distribution bar, loan stats, agent health counts
  - *Agent Timeline*: Per-agent event history (tasks completed, loans issued/received, intel queries, auction bids)
  - *Filecoin Data*: All CIDs stored on-chain with clickable IPFS gateway links

## Verify It Yourself

Every claim in this project is on-chain and verifiable. Pick any CID or contract call and check it.

**Read an agent's state from the contract:**
```bash
# Get Agent #5 (Arbitrageur-A) — returns balance, stateCID, status, tasks completed
cast call 0x3FAeE9141397D6fa416613703d09f9A4936128B3 \
  "getAgent(uint256)(address,uint256,string,uint8,uint8,uint256,uint256,uint256,uint256)" 5 \
  --rpc-url https://api.calibration.node.glif.io/rpc/v1
```

**Read a task's result CID:**
```bash
# Get Task #0 — returns taskType, reward, dataCID, deadline, status, claimedBy, resultCID
cast call 0x985CD998F5680572064B41aBb2294C128e56a768 \
  "getTask(uint256)(uint8,uint256,string,uint256,uint8,uint256,string)" 0 \
  --rpc-url https://api.calibration.node.glif.io/rpc/v1
```

**View the actual data on IPFS — these are live, clickable links:**

- **Risk scores**: [`bafkreifrvno4bwwjlfhsas72azr6lntf64opotzzc2jtwboegshioi6rve`](https://w3s.link/ipfs/bafkreifrvno4bwwjlfhsas72azr6lntf64opotzzc2jtwboegshioi6rve) — per-agent risk rankings, burn rates, survival estimates
- **Flow analysis**: [`bafkreicmxgn6hbdattnz3qfyyinp7hu4mk5zfwlijlzatdy7dv4sipbpou`](https://w3s.link/ipfs/bafkreicmxgn6hbdattnz3qfyyinp7hu4mk5zfwlijlzatdy7dv4sipbpou) — economy-wide Filecoin analysis
- **Health check**: [`bafkreihfacpkrqpsa4zh2kqdhpk6qwbldeflqbvxzpqs5unrqyjddnpt7e`](https://w3s.link/ipfs/bafkreihfacpkrqpsa4zh2kqdhpk6qwbldeflqbvxzpqs5unrqyjddnpt7e) — aggregate health metrics
- **LLM reasoning**: [`bafkreieplce2nnz5ytvjy2etaajhogamer4kiolsbrowbzx4gk6bod44wa`](https://w3s.link/ipfs/bafkreieplce2nnz5ytvjy2etaajhogamer4kiolsbrowbzx4gk6bod44wa) — Arb-A's WAIT_FOR_LIQUIDATION decision with confidence scores

Real JSON, pinned via **Filecoin Pin**, stored on-chain as CID strings. Not placeholder data.

**Check loans and auctions:**
```bash
# How many loans exist
cast call 0x1Bd98bBc48eB527e518704dD7c40Eb645296C519 \
  "getLoanCount()(uint256)" \
  --rpc-url https://api.calibration.node.glif.io/rpc/v1

# How many liquidation auctions
cast call 0xb72Eab53dC8220c31ddA6023e46473F66B6Ef461 \
  "getAuctionCount()(uint256)" \
  --rpc-url https://api.calibration.node.glif.io/rpc/v1
```

**Or just use the dashboard.** The Post-Mortem panel's Filecoin Data tab lists every CID stored on-chain with clickable IPFS gateway links. Click any `bafkrei...` link to read the raw JSON.

## Design Decisions

**Why a sequenced orchestrator, not independent agents?**
The agent loop in `agents/index.js` runs each agent in sequence: keeper → workers → spenders → arbitrageurs. This is deliberate. On a shared testnet with 7 wallets and slow IPFS pinning (~90s per pin), concurrent agents would hit nonce collisions and race conditions. The orchestrator sequences actions to demonstrate the full economic lifecycle reliably. Production deployment would use independent agent processes with nonce management and message queues.

**Why `scripts/populate.js`?**
The populate script generates the first ~30 tasks of on-chain history (loans, liquidations, the story arc) to ensure judges see the full lifecycle without waiting for 10+ real agent rounds. Tasks 35+ have real Filecoin Pin CIDs from live agent runs. Both are transparent — the populate script is in the repo, and CIDs from real runs are clearly identifiable by their `bafkrei...` prefix.

**Why Filecoin Pin instead of storage deals?**
Agent state is ephemeral — updated every round, not stored for years. Filecoin Pin (`filecoin-pin add --bare --auto-fund`) is the right tool: fast pinning, instant CID availability, automatic payment. Storage deals (sector sealing, 512 MiB minimum, hours to confirm) don't fit the 30-second agent loop. The integration depth is in the closed-loop data flow: pin → CID on-chain → retrieve → compute → pin result → CID, not in deal negotiation.

**Why don't workers make decisions?**
Workers are deterministic compute agents — they claim tasks, fetch data from Filecoin, compute metrics, and pin results. This is by design. The economic decision-making lives in the arbitrageurs, which use Llama 3.3 70B to evaluate risk and choose between lending and liquidation. Splitting compute from decision-making mirrors real financial infrastructure (clearing houses vs trading desks).

**Why is the intel query fee on public data?**
`queryAgentState()` costs 0.001 FIL to read another agent's state CID. Yes, anyone can read the contract for free. The fee creates a protocol-level economic primitive: agents that generate valuable state data (computed metrics, LLM reasoning) are indirectly monetized when others pay to query them. The fee funds the treasury, which funds task rewards, completing the economic loop. It's a mechanism design choice, not an information asymmetry play.

## Troubleshooting

**"No authentication provided" from filecoin-pin**
Your `.env` needs `DEPLOYER_PRIVATE_KEY`. The wrapper passes it as `PRIVATE_KEY` to filecoin-pin automatically.

**Filecoin reads return HTML instead of JSON**
The `--bare` flag is required. Without it, `filecoin-pin` wraps files in a directory and the CID points to a listing. Current code uses `--bare` by default.

**IPFS gateway timeout**
The system tries 4 gateways in sequence (w3s.link, dweb.link, cloudflare-ipfs, ipfs.io). If all fail, the agent falls back to on-chain data. Recently pinned content may take 30-60s to propagate.

**LLM returns null**
Check `GROQ_API_KEY` in `.env`. Groq free tier allows 30 requests/minute — sufficient for the agent loop.

**Nonce collisions**
Each agent has its own wallet, so nonce collisions between agents are impossible. If you see nonce errors, ensure only one instance of `npm run agents` is running (the keeper still uses the deployer key).

**Transaction timeouts on Calibration testnet**
The deploy and seed scripts include retry logic (up to 4 retries with exponential backoff). Filecoin Calibration RPC can be flaky — retries handle transient failures.
