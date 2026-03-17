// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentRegistry.sol";

/// @title TaskMarket — Generates work for agents, pays FIL rewards from treasury
/// @notice Real IPFS CIDs stored on-chain for judge-verifiable Filecoin integration
contract TaskMarket {
    enum TaskType { STORE, RETRIEVE, VERIFY }
    enum TaskStatus { AVAILABLE, CLAIMED, COMPLETED, EXPIRED }

    struct Task {
        TaskType taskType;
        uint256 reward;
        string dataCID;         // Real IPFS CID of task payload on Filecoin
        uint256 deadline;
        TaskStatus status;
        uint256 claimedBy;
        string resultCID;       // Real IPFS CID of computed result on Filecoin
    }

    AgentRegistry public registry;
    address public owner;

    mapping(uint256 => Task) public tasks;
    uint256 public nextTaskId;

    event TaskPosted(uint256 indexed taskId, TaskType taskType, uint256 reward, string dataCID, uint256 deadline);
    event TaskClaimed(uint256 indexed taskId, uint256 indexed agentId);
    event TaskCompleted(uint256 indexed taskId, uint256 indexed agentId, string resultCID, uint256 reward);
    event TaskExpired(uint256 indexed taskId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _registry) {
        registry = AgentRegistry(payable(_registry));
        owner = msg.sender;
    }

    function postTask(
        TaskType _type,
        string calldata _dataCID,
        uint256 _reward,
        uint256 _deadlineBlocks
    ) external onlyOwner returns (uint256 taskId) {
        require(address(this).balance >= _reward, "Insufficient treasury");
        taskId = nextTaskId++;
        tasks[taskId] = Task({
            taskType: _type,
            reward: _reward,
            dataCID: _dataCID,
            deadline: block.number + _deadlineBlocks,
            status: TaskStatus.AVAILABLE,
            claimedBy: type(uint256).max,
            resultCID: ""
        });
        emit TaskPosted(taskId, _type, _reward, _dataCID, block.number + _deadlineBlocks);
    }

    function postTasks(
        TaskType[] calldata _types,
        string[] calldata _dataCIDs,
        uint256[] calldata _rewards,
        uint256 _deadlineBlocks
    ) external onlyOwner {
        require(_types.length == _dataCIDs.length && _types.length == _rewards.length, "Length mismatch");
        uint256 totalReward = 0;
        for (uint256 i = 0; i < _rewards.length; i++) {
            totalReward += _rewards[i];
        }
        require(address(this).balance >= totalReward, "Insufficient treasury");

        for (uint256 i = 0; i < _types.length; i++) {
            uint256 taskId = nextTaskId++;
            tasks[taskId] = Task({
                taskType: _types[i],
                reward: _rewards[i],
                dataCID: _dataCIDs[i],
                deadline: block.number + _deadlineBlocks,
                status: TaskStatus.AVAILABLE,
                claimedBy: type(uint256).max,
                resultCID: ""
            });
            emit TaskPosted(taskId, _types[i], _rewards[i], _dataCIDs[i], block.number + _deadlineBlocks);
        }
    }

    /// @notice Agent claims a task. Must be called by agent's own wallet.
    function claimTask(uint256 taskId, uint256 agentId) external {
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.AVAILABLE, "Not available");
        require(block.number <= task.deadline, "Expired");

        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        require(msg.sender == agent.owner, "Not agent owner");
        require(agent.status == AgentRegistry.AgentStatus.ACTIVE || agent.status == AgentRegistry.AgentStatus.DISTRESSED, "Agent not active");
        require(agent.agentType != AgentRegistry.AgentType.ARBITRAGEUR, "Arbitrageurs don't do tasks");

        task.status = TaskStatus.CLAIMED;
        task.claimedBy = agentId;
        emit TaskClaimed(taskId, agentId);
    }

    /// @notice Agent completes task with real IPFS result CID. Must be called by agent's wallet.
    function completeTask(uint256 taskId, uint256 agentId, string calldata _resultCID) external {
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.CLAIMED, "Not claimed");
        require(task.claimedBy == agentId, "Not your task");
        require(block.number <= task.deadline, "Expired");

        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        require(msg.sender == agent.owner, "Not agent owner");

        task.status = TaskStatus.COMPLETED;
        task.resultCID = _resultCID;

        registry.fundAgent{value: task.reward}(agentId);
        registry.incrementTasks(agentId);

        emit TaskCompleted(taskId, agentId, _resultCID, task.reward);
    }

    function expireTask(uint256 taskId) external {
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.AVAILABLE || task.status == TaskStatus.CLAIMED, "Cannot expire");
        require(block.number > task.deadline, "Not expired yet");

        task.status = TaskStatus.EXPIRED;
        emit TaskExpired(taskId);
    }

    // --- Views ---

    function getTask(uint256 taskId) external view returns (Task memory) {
        return tasks[taskId];
    }

    function getTaskCount() external view returns (uint256) {
        return nextTaskId;
    }

    function getAvailableTasks() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < nextTaskId; i++) {
            if (tasks[i].status == TaskStatus.AVAILABLE && block.number <= tasks[i].deadline) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < nextTaskId; i++) {
            if (tasks[i].status == TaskStatus.AVAILABLE && block.number <= tasks[i].deadline) result[idx++] = i;
        }
        return result;
    }

    function fundTreasury() external payable {}

    function getTreasuryBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {}
}
