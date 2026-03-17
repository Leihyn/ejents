// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentRegistry.sol";

/// @title LendingPool — Micro-loans between agents for idle capital deployment
/// @notice Agent wallets sign their own loan transactions
contract LendingPool {
    struct Loan {
        uint256 lenderId;
        uint256 borrowerId;
        uint256 principal;
        uint256 feeRate;       // Basis points (e.g., 500 = 5%)
        uint256 dueBlock;
        bool repaid;
        bool defaulted;
    }

    AgentRegistry public registry;
    address public owner;

    mapping(uint256 => Loan) public loans;
    uint256 public nextLoanId;

    event LoanOffered(uint256 indexed loanId, uint256 indexed lenderId, uint256 indexed borrowerId, uint256 principal, uint256 feeRate, uint256 dueBlock);
    event LoanRepaid(uint256 indexed loanId, uint256 totalRepaid);
    event LoanDefaulted(uint256 indexed loanId, uint256 indexed borrowerId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _registry) {
        registry = AgentRegistry(payable(_registry));
        owner = msg.sender;
    }

    /// @notice Lender offers a loan. Must be called by lender agent's wallet.
    function offerLoan(
        uint256 lenderId,
        uint256 borrowerId,
        uint256 feeRate,
        uint256 durationBlocks
    ) external payable returns (uint256 loanId) {
        require(msg.value > 0, "No principal");
        require(lenderId != borrowerId, "Cannot self-lend");

        AgentRegistry.Agent memory lender = registry.getAgent(lenderId);
        AgentRegistry.Agent memory borrower = registry.getAgent(borrowerId);
        require(msg.sender == lender.owner, "Not lender owner");
        require(lender.status != AgentRegistry.AgentStatus.BANKRUPT, "Lender bankrupt");
        require(borrower.status != AgentRegistry.AgentStatus.BANKRUPT, "Borrower bankrupt");

        loanId = nextLoanId++;
        loans[loanId] = Loan({
            lenderId: lenderId,
            borrowerId: borrowerId,
            principal: msg.value,
            feeRate: feeRate,
            dueBlock: block.number + durationBlocks,
            repaid: false,
            defaulted: false
        });

        registry.fundAgent{value: msg.value}(borrowerId);

        emit LoanOffered(loanId, lenderId, borrowerId, msg.value, feeRate, block.number + durationBlocks);
    }

    function repayLoan(uint256 loanId) external payable {
        Loan storage loan = loans[loanId];
        require(!loan.repaid && !loan.defaulted, "Loan settled");

        uint256 fee = (loan.principal * loan.feeRate) / 10000;
        uint256 totalDue = loan.principal + fee;
        require(msg.value >= totalDue, "Insufficient repayment");

        loan.repaid = true;

        registry.fundAgent{value: totalDue}(loan.lenderId);

        if (msg.value > totalDue) {
            payable(msg.sender).transfer(msg.value - totalDue);
        }

        emit LoanRepaid(loanId, totalDue);
    }

    function claimDefault(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        require(!loan.repaid && !loan.defaulted, "Loan settled");

        AgentRegistry.Agent memory borrower = registry.getAgent(loan.borrowerId);
        require(
            borrower.status == AgentRegistry.AgentStatus.BANKRUPT || block.number > loan.dueBlock,
            "Cannot claim default yet"
        );

        loan.defaulted = true;
        emit LoanDefaulted(loanId, loan.borrowerId);
    }

    // --- Views ---

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function getLoanCount() external view returns (uint256) {
        return nextLoanId;
    }

    function getActiveLoans() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < nextLoanId; i++) {
            if (!loans[i].repaid && !loans[i].defaulted) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < nextLoanId; i++) {
            if (!loans[i].repaid && !loans[i].defaulted) result[idx++] = i;
        }
        return result;
    }

    receive() external payable {}
}
