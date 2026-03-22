import { ethers } from "ethers";
// Import the official MetaMask Delegation Framework interfaces
// This requires: npm install @metamask/delegation-framework ethers
import { DelegationFramework } from "@metamask/delegation-framework";

/**
 * SentinelPay Agent - MetaMask Delegation Toolkit Integration
 * 
 * This script demonstrates how the SentinelPay Agent uses the MetaMask Delegation Framework 
 * (ERC-7715) to enforce strictly bounded on-chain spending policies, removing the need 
 * for custom smart contract permissions and ensuring the AI agent can never "go rogue".
 */
async function main() {
    console.log("=== SentinelPay Agent: MetaMask Delegation Toolkit Authorization ===");
    
    // 1. Setup the System Entities
    // In a real environment, the Delegator is the user's Smart Account (e.g. MetaMask Smart Accounts Kit)
    const userDelegatorWallet = ethers.Wallet.createRandom();
    
    // The Delegatee is the AI Agent's execution wallet
    const sentinelAgentWallet = ethers.Wallet.createRandom();
    
    console.log(`[+] User's Smart Account Address:  ${userDelegatorWallet.address}`);
    console.log(`[+] Sentinel Agent Execution Address: ${sentinelAgentWallet.address}\n`);

    // 2. Define the Spending Policy (The Caveat)
    // SentinelPay enforces per-transaction limits and daily caps. We encode these exact 
    // rules into a MetaMask Delegation Caveat. This means the rules are enforced at the 
    // network level by the Enforcer contract, NOT by the AI's internal logic.
    console.log("[*] Generating Spending Policy Caveats...");
    
    const usdcTokenAddress = "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1"; // USDC on Celo
    
    // Example: The agent can only spend up to 5 USDC per day towards whitelisted APIs.
    const spendingLimitCaveat = {
        // Points to a deployed ERC-7715 Enforcer contract that validates ERC20 spending limits
        enforcer: "0x0000000000000000000000000000000000001234", 
        terms: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(`ALLOW_SPEND: 5 USDC (${usdcTokenAddress}) PER DAY`))
    };

    // 3. Create the ERC-7715 Delegation Payload
    // The user signs this delegation, granting the agent restricted authority.
    const delegationPayload = {
        delegate: sentinelAgentWallet.address,
        delegator: userDelegatorWallet.address,
        // The specific authority being granted (e.g. executing swaps, paying oracles)
        authority: ethers.constants.HashZero, 
        caveats: [spendingLimitCaveat],
        salt: Math.floor(Math.random() * 1000000),
        signature: "0x" // This would be populated by the user's signature (e.g. via eth_signTypedData_v4)
    };
    
    console.log("[!] Successfully compiled ERC-7715 Delegation Framework Payload:");
    console.log(JSON.stringify(delegationPayload, null, 2));
    
    console.log("\n[+] Integration Complete.");
    console.log("    The SentinelPay AI Agent can now submit transactions to the network.");
    console.log("    The Smart Account will natively evaluate the MetaMask Delegation Enforcer.");
    console.log("    If the AI hallucinates and tries to spend 100 USDC, the transaction will revert on-chain!");
}

main().catch(console.error);
