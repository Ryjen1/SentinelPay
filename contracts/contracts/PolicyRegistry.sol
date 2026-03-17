// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract PolicyRegistry is Ownable {
    struct Policy {
        uint256 maxPerTx;
        uint256 dailyCap;
        address[] whitelist;
        bool isActive;
        uint256 registeredAt;
    }

    mapping(bytes32 => Policy) private policies;

    // Custom errors
    error AgentNotFound();
    error AgentAlreadyRegistered();
    error NotWhitelisted();

    // Events
    event AgentRegistered(bytes32 indexed agentId, uint256 maxPerTx, uint256 dailyCap);
    event PolicyUpdated(bytes32 indexed agentId, uint256 maxPerTx, uint256 dailyCap);
    event WhitelistUpdated(bytes32 indexed agentId, address recipient);
    event AgentPaused(bytes32 indexed agentId);
    event AgentUnpaused(bytes32 indexed agentId);

    constructor() Ownable(msg.sender) {}

    function registerAgent(
        bytes32 agentId,
        uint256 maxPerTx,
        uint256 dailyCap,
        address[] calldata whitelist
    ) external onlyOwner {
        if (policies[agentId].registeredAt != 0) {
            revert AgentAlreadyRegistered();
        }

        Policy storage policy = policies[agentId];
        policy.maxPerTx = maxPerTx;
        policy.dailyCap = dailyCap;
        policy.whitelist = whitelist;
        policy.isActive = true;
        policy.registeredAt = block.timestamp;

        emit AgentRegistered(agentId, maxPerTx, dailyCap);
    }

    function updatePolicy(
        bytes32 agentId,
        uint256 maxPerTx,
        uint256 dailyCap
    ) external onlyOwner {
        if (policies[agentId].registeredAt == 0) {
            revert AgentNotFound();
        }

        Policy storage policy = policies[agentId];
        policy.maxPerTx = maxPerTx;
        policy.dailyCap = dailyCap;

        emit PolicyUpdated(agentId, maxPerTx, dailyCap);
    }

    function addToWhitelist(bytes32 agentId, address recipient) external onlyOwner {
        if (policies[agentId].registeredAt == 0) {
            revert AgentNotFound();
        }

        policies[agentId].whitelist.push(recipient);

        emit WhitelistUpdated(agentId, recipient);
    }

    function pauseAgent(bytes32 agentId) external onlyOwner {
        if (policies[agentId].registeredAt == 0) {
            revert AgentNotFound();
        }

        policies[agentId].isActive = false;

        emit AgentPaused(agentId);
    }

    function unpauseAgent(bytes32 agentId) external onlyOwner {
        if (policies[agentId].registeredAt == 0) {
            revert AgentNotFound();
        }

        policies[agentId].isActive = true;

        emit AgentUnpaused(agentId);
    }

    function getPolicy(bytes32 agentId) external view returns (Policy memory) {
        return policies[agentId];
    }

    function isAgentActive(bytes32 agentId) external view returns (bool) {
        return policies[agentId].isActive;
    }

    function isWhitelisted(bytes32 agentId, address recipient) external view returns (bool) {
        address[] memory whitelist = policies[agentId].whitelist;
        for (uint256 i = 0; i < whitelist.length; i++) {
            if (whitelist[i] == recipient) {
                return true;
            }
        }
        return false;
    }
}
