// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentRegistry.sol";

/// @title LiquidationQueue — Auctions for bankrupt agent assets
/// @notice Real IPFS CIDs stored for asset provenance
contract LiquidationQueue {
    struct Auction {
        uint256 agentId;
        string[] assetCIDs;     // Real IPFS CIDs
        uint256 startBlock;
        uint256 endBlock;
        uint256 reservePrice;
        address highestBidder;
        uint256 highestBidderId;
        uint256 highestBid;
        bool settled;
    }

    AgentRegistry public registry;
    address public owner;
    uint256 public auctionDuration;

    mapping(uint256 => Auction) internal _auctions;
    uint256 public nextAuctionId;
    mapping(uint256 => bool) public agentLiquidated;

    event AuctionCreated(uint256 indexed auctionId, uint256 indexed agentId, uint256 reservePrice, uint256 endBlock);
    event BidSubmitted(uint256 indexed auctionId, uint256 indexed bidderId, uint256 amount);
    event AuctionSettled(uint256 indexed auctionId, uint256 indexed winnerId, uint256 winningBid);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _registry, uint256 _auctionDuration) {
        registry = AgentRegistry(payable(_registry));
        owner = msg.sender;
        auctionDuration = _auctionDuration;
    }

    function setAuctionDuration(uint256 _duration) external onlyOwner {
        auctionDuration = _duration;
    }

    function triggerLiquidation(
        uint256 agentId,
        string[] calldata _assetCIDs,
        uint256 _reservePrice
    ) external returns (uint256 auctionId) {
        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        require(agent.status == AgentRegistry.AgentStatus.BANKRUPT, "Agent not bankrupt");
        require(!agentLiquidated[agentId], "Already liquidated");

        agentLiquidated[agentId] = true;
        auctionId = nextAuctionId++;

        Auction storage a = _auctions[auctionId];
        a.agentId = agentId;
        a.startBlock = block.number;
        a.endBlock = block.number + auctionDuration;
        a.reservePrice = _reservePrice;
        a.highestBidderId = type(uint256).max;
        for (uint256 i = 0; i < _assetCIDs.length; i++) {
            a.assetCIDs.push(_assetCIDs[i]);
        }

        emit AuctionCreated(auctionId, agentId, _reservePrice, block.number + auctionDuration);
    }

    /// @notice Submit bid. Must be called by bidder agent's wallet.
    function submitBid(uint256 auctionId, uint256 bidderId) external payable {
        Auction storage auction = _auctions[auctionId];
        require(!auction.settled, "Auction settled");
        require(block.number <= auction.endBlock, "Auction ended");
        require(msg.value > auction.highestBid, "Bid too low");
        require(msg.value >= auction.reservePrice, "Below reserve");

        AgentRegistry.Agent memory bidder = registry.getAgent(bidderId);
        require(msg.sender == bidder.owner, "Not bidder owner");

        if (auction.highestBidder != address(0)) {
            payable(auction.highestBidder).transfer(auction.highestBid);
        }

        auction.highestBidder = msg.sender;
        auction.highestBidderId = bidderId;
        auction.highestBid = msg.value;

        emit BidSubmitted(auctionId, bidderId, msg.value);
    }

    function settleAuction(uint256 auctionId) external {
        Auction storage auction = _auctions[auctionId];
        require(!auction.settled, "Already settled");
        require(block.number > auction.endBlock, "Auction still active");

        auction.settled = true;

        if (auction.highestBidder != address(0)) {
            if (auction.assetCIDs.length > 0) {
                registry.updateStateCID(auction.highestBidderId, auction.assetCIDs[0]);
            }
            emit AuctionSettled(auctionId, auction.highestBidderId, auction.highestBid);
        } else {
            emit AuctionSettled(auctionId, type(uint256).max, 0);
        }
    }

    // --- Views ---

    function getAuction(uint256 auctionId) external view returns (
        uint256 agentId,
        uint256 startBlock,
        uint256 endBlock,
        uint256 reservePrice,
        address highestBidder,
        uint256 highestBidderId,
        uint256 highestBid,
        bool settled
    ) {
        Auction storage a = _auctions[auctionId];
        return (a.agentId, a.startBlock, a.endBlock, a.reservePrice, a.highestBidder, a.highestBidderId, a.highestBid, a.settled);
    }

    function getAuctionAssets(uint256 auctionId) external view returns (string[] memory) {
        return _auctions[auctionId].assetCIDs;
    }

    function getAuctionCount() external view returns (uint256) {
        return nextAuctionId;
    }

    function getActiveAuctions() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < nextAuctionId; i++) {
            if (!_auctions[i].settled && block.number <= _auctions[i].endBlock) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < nextAuctionId; i++) {
            if (!_auctions[i].settled && block.number <= _auctions[i].endBlock) result[idx++] = i;
        }
        return result;
    }

    receive() external payable {}
}
