const { ethers } = require("hardhat");
const deployed = require("../deployed-addresses.json");

async function main() {
  const [signer] = await ethers.getSigners();
  const usdc = await ethers.getContractAt("IERC20", deployed.USDC);
  const vault = await ethers.getContractAt("SentinelVault", deployed.SentinelVault);
  // Use keccak256 to match Python SDK: Web3.keccak(text=agent_id)
  const agentId = ethers.keccak256(ethers.toUtf8Bytes("weather_agent"));
  const amount = ethers.parseUnits("1", 6);
  
  console.log("Agent ID (bytes32):", agentId);
  console.log("Approving USDC...");
  const tx1 = await usdc.approve(deployed.SentinelVault, amount);
  await tx1.wait();
  console.log("Approved:", tx1.hash);
  
  console.log("Depositing USDC into SentinelVault...");
  const tx2 = await vault.deposit(agentId, amount);
  await tx2.wait();
  console.log("Deposited:", tx2.hash);
}

main().catch(console.error);
