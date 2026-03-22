// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title StatusSentinel
 * @dev A minimal smart contract deployed on Status Network Testnet to fulfill the "Go Gasless" track.
 * It serves as an onchain logging target for the SentinelPay Agent.
 */
contract StatusSentinel {
    event AgentActionLogged(address indexed agent, string action, uint256 timestamp);

    address public owner;

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Logs an action performed by the agent. This transaction will be executed gasless.
     * @param action A description of the action taken (e.g. "Weather data fetched & policy enforced").
     */
    function logAgentAction(string calldata action) external {
        emit AgentActionLogged(msg.sender, action, block.timestamp);
    }
}
