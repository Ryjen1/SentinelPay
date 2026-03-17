const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  console.log("Checking policy for weather_agent...\n");

  // Load deployed addresses
  const addresses = require("../deployed-addresses.json");
  
  // Get contract instances
  const PolicyRegistry = await ethers.getContractAt(
    "PolicyRegistry",
    addresses.PolicyRegistry
  );

  // Calculate agentId the same way as Python SDK: Web3.keccak(text=agent_id)
  const agentId = ethers.keccak256(ethers.toUtf8Bytes("weather_agent"));
  
  console.log("Agent ID (bytes32):", agentId);
  console.log("PolicyRegistry address:", addresses.PolicyRegistry);
  console.log();

  // Query the policy
  const policy = await PolicyRegistry.getPolicy(agentId);
  
  console.log("Policy Details:");
  console.log("---------------");
  console.log("maxPerTx:", ethers.formatUnits(policy.maxPerTx, 6), "USDC");
  console.log("dailyCap:", ethers.formatUnits(policy.dailyCap, 6), "USDC");
  console.log("isActive:", policy.isActive);
  console.log("registeredAt:", policy.registeredAt.toString());
  console.log("whitelist length:", policy.whitelist.length);
  
  if (policy.whitelist.length > 0) {
    console.log("\nWhitelisted addresses:");
    policy.whitelist.forEach((addr, i) => {
      console.log(`  [${i}]:`, addr);
    });
  }
  
  // Check if agent is active
  const isActive = await PolicyRegistry.isAgentActive(agentId);
  console.log("\nAgent active status:", isActive);
  
  // Check if specific recipient is whitelisted
  const recipient = "0x61254AEcF84eEdb890f07dD29f7F3cd3b8Eb2CBe";
  const isWhitelisted = await PolicyRegistry.isWhitelisted(agentId, recipient);
  console.log("Recipient", recipient, "whitelisted:", isWhitelisted);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
