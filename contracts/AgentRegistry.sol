// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AgentRegistry — Agent lifecycle + budget enforcement
/// @notice Each agent has its own wallet. Per-agent signing, real economic autonomy.
contract AgentRegistry {
    enum AgentType { WORKER, SPENDER, ARBITRAGEUR }
    enum AgentStatus { ACTIVE, DISTRESSED, BANKRUPT, DORMANT }

    struct Agent {
        address owner;          // Agent's own wallet address
        uint256 balance;
        string stateCID;        // Real IPFS CID (not a hash)
        AgentType agentType;
        AgentStatus status;
        uint256 lastFeeBlock;
        uint256 tasksCompleted;
        uint256 totalEarned;
        uint256 totalSpent;
    }

    // --- State ---
    mapping(uint256 => Agent) public agents;
    uint256 public nextAgentId;
    address public keeper;
    address public owner;

    // --- Config ---
    uint256 public storageFeePerInterval;
    uint256 public feeInterval;
    uint256 public distressThreshold;

    // --- Contract references ---
    address public taskMarket;
    address public lendingPool;
    address public liquidationQueue;

    // --- Intel query pricing ---
    uint256 public intelQueryFee;  // Cost to query another agent's state

    // --- Events ---
    event AgentRegistered(uint256 indexed agentId, address indexed wallet, AgentType agentType, uint256 initialBalance);
    event AgentStatusChanged(uint256 indexed agentId, AgentStatus oldStatus, AgentStatus newStatus);
    event StateCIDUpdated(uint256 indexed agentId, string oldCID, string newCID);
    event FeeDeducted(uint256 indexed agentId, uint256 amount, uint256 newBalance);
    event AgentFunded(uint256 indexed agentId, uint256 amount, uint256 newBalance);
    event BalanceSpent(uint256 indexed agentId, uint256 amount, uint256 newBalance);
    event IntelQueried(uint256 indexed queryerId, uint256 indexed targetId, uint256 fee, string targetCID);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyKeeper() {
        require(msg.sender == keeper || msg.sender == owner, "Not keeper");
        _;
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == owner ||
            msg.sender == keeper ||
            msg.sender == taskMarket ||
            msg.sender == lendingPool ||
            msg.sender == liquidationQueue,
            "Not authorized"
        );
        _;
    }

    /// @notice Agent owner or authorized contract can act on behalf of agent
    modifier onlyAgentOrAuthorized(uint256 agentId) {
        require(
            msg.sender == agents[agentId].owner ||
            msg.sender == owner ||
            msg.sender == keeper ||
            msg.sender == taskMarket ||
            msg.sender == lendingPool ||
            msg.sender == liquidationQueue,
            "Not agent owner or authorized"
        );
        _;
    }

    constructor(
        uint256 _storageFeePerInterval,
        uint256 _feeInterval,
        uint256 _distressThreshold
    ) {
        owner = msg.sender;
        keeper = msg.sender;
        storageFeePerInterval = _storageFeePerInterval;
        feeInterval = _feeInterval;
        distressThreshold = _distressThreshold;
        intelQueryFee = 0.001 ether;  // 0.001 FIL to query another agent
    }

    // --- Setup ---

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
    }

    function setContracts(
        address _taskMarket,
        address _lendingPool,
        address _liquidationQueue
    ) external onlyOwner {
        taskMarket = _taskMarket;
        lendingPool = _lendingPool;
        liquidationQueue = _liquidationQueue;
    }

    function setFeeParams(
        uint256 _storageFeePerInterval,
        uint256 _feeInterval,
        uint256 _distressThreshold
    ) external onlyOwner {
        storageFeePerInterval = _storageFeePerInterval;
        feeInterval = _feeInterval;
        distressThreshold = _distressThreshold;
    }

    function setIntelQueryFee(uint256 _fee) external onlyOwner {
        intelQueryFee = _fee;
    }

    // --- Agent Lifecycle ---

    /// @notice Register agent with a specific wallet address. Deployer funds, agent owns.
    function registerAgent(AgentType _type, address _wallet) external payable returns (uint256 agentId) {
        agentId = nextAgentId++;
        agents[agentId] = Agent({
            owner: _wallet,
            balance: msg.value,
            stateCID: "",
            agentType: _type,
            status: AgentStatus.ACTIVE,
            lastFeeBlock: block.number,
            tasksCompleted: 0,
            totalEarned: msg.value,
            totalSpent: 0
        });
        emit AgentRegistered(agentId, _wallet, _type, msg.value);
    }

    /// @notice Update agent's Filecoin state CID (real IPFS CID string)
    function updateStateCID(uint256 agentId, string calldata newCID) external onlyAgentOrAuthorized(agentId) {
        string memory oldCID = agents[agentId].stateCID;
        agents[agentId].stateCID = newCID;
        emit StateCIDUpdated(agentId, oldCID, newCID);
    }

    // --- Intel Query (paid information asymmetry) ---

    /// @notice Arbitrageurs pay to query another agent's Filecoin state CID.
    /// Creates an on-chain record of intelligence gathering.
    function queryAgentState(uint256 queryerId, uint256 targetId) external onlyAgentOrAuthorized(queryerId) returns (string memory) {
        require(queryerId != targetId, "Cannot query self");
        require(agents[queryerId].balance >= intelQueryFee, "Insufficient balance for query");

        // Deduct fee from querier
        agents[queryerId].balance -= intelQueryFee;
        agents[queryerId].totalSpent += intelQueryFee;

        // Fee goes to treasury (contract balance)
        emit IntelQueried(queryerId, targetId, intelQueryFee, agents[targetId].stateCID);
        emit BalanceSpent(queryerId, intelQueryFee, agents[queryerId].balance);

        return agents[targetId].stateCID;
    }

    // --- Budget Enforcement ---

    function processFees() external onlyKeeper {
        for (uint256 i = 0; i < nextAgentId; i++) {
            Agent storage agent = agents[i];
            if (agent.status == AgentStatus.BANKRUPT || agent.status == AgentStatus.DORMANT) {
                continue;
            }

            uint256 blocksSinceLastFee = block.number - agent.lastFeeBlock;
            if (blocksSinceLastFee < feeInterval) {
                continue;
            }

            uint256 intervals = blocksSinceLastFee / feeInterval;
            uint256 totalFee = intervals * storageFeePerInterval;

            if (totalFee >= agent.balance) {
                agent.totalSpent += agent.balance;
                agent.balance = 0;
                agent.lastFeeBlock = block.number;
                _setStatus(i, AgentStatus.BANKRUPT);
            } else {
                agent.balance -= totalFee;
                agent.totalSpent += totalFee;
                agent.lastFeeBlock = block.number;
                emit FeeDeducted(i, totalFee, agent.balance);

                if (agent.balance <= distressThreshold && agent.status == AgentStatus.ACTIVE) {
                    _setStatus(i, AgentStatus.DISTRESSED);
                } else if (agent.balance > distressThreshold && agent.status == AgentStatus.DISTRESSED) {
                    _setStatus(i, AgentStatus.ACTIVE);
                }
            }
        }
    }

    function fundAgent(uint256 agentId) external payable onlyAuthorized {
        agents[agentId].balance += msg.value;
        agents[agentId].totalEarned += msg.value;
        emit AgentFunded(agentId, msg.value, agents[agentId].balance);

        // Revive bankrupt/distressed agents if funded above threshold
        if (agents[agentId].balance > distressThreshold &&
            (agents[agentId].status == AgentStatus.DISTRESSED || agents[agentId].status == AgentStatus.BANKRUPT)) {
            _setStatus(agentId, AgentStatus.ACTIVE);
        }
    }

    function spendBalance(uint256 agentId, uint256 amount) external onlyAuthorized {
        require(agents[agentId].balance >= amount, "Insufficient balance");
        agents[agentId].balance -= amount;
        agents[agentId].totalSpent += amount;
        emit BalanceSpent(agentId, amount, agents[agentId].balance);
    }

    function incrementTasks(uint256 agentId) external onlyAuthorized {
        agents[agentId].tasksCompleted++;
    }

    // --- Views ---

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    function getAgentCount() external view returns (uint256) {
        return nextAgentId;
    }

    function getDistressedAgents() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < nextAgentId; i++) {
            if (agents[i].status == AgentStatus.DISTRESSED) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < nextAgentId; i++) {
            if (agents[i].status == AgentStatus.DISTRESSED) result[idx++] = i;
        }
        return result;
    }

    function getAgentsByStatus(AgentStatus status) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < nextAgentId; i++) {
            if (agents[i].status == status) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < nextAgentId; i++) {
            if (agents[i].status == status) result[idx++] = i;
        }
        return result;
    }

    // --- Internal ---

    function _setStatus(uint256 agentId, AgentStatus newStatus) internal {
        AgentStatus oldStatus = agents[agentId].status;
        if (oldStatus == newStatus) return;
        agents[agentId].status = newStatus;
        emit AgentStatusChanged(agentId, oldStatus, newStatus);
    }

    receive() external payable {}
}
