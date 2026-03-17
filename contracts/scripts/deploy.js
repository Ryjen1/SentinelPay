const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  try {
    const networkName = hre.network.name;
    console.log(`Starting deployment to ${networkName}...\n`);

    // Get USDC address from environment
    const usdcAddress = process.env.USDC_ADDRESS;
    if (!usdcAddress) {
      throw new Error("USDC_ADDRESS not found in environment variables");
    }

    // Deploy PolicyRegistry
    console.log("Deploying PolicyRegistry...");
    const PolicyRegistry = await hre.ethers.getContractFactory("PolicyRegistry");
    const policyRegistry = await PolicyRegistry.deploy();
    await policyRegistry.waitForDeployment();
    const policyRegistryAddress = await policyRegistry.getAddress();
    console.log(`PolicyRegistry deployed to: ${policyRegistryAddress}`);

    // Deploy SentinelVault
    console.log("\nDeploying SentinelVault...");
    const SentinelVault = await hre.ethers.getContractFactory("SentinelVault");
    const agentVault = await SentinelVault.deploy(usdcAddress, policyRegistryAddress);
    await agentVault.waitForDeployment();
    const agentVaultAddress = await agentVault.getAddress();
    console.log(`SentinelVault deployed to: ${agentVaultAddress}`);

    // Print summary
    console.log("\n=== Deployment Summary ===");
    console.log(`PolicyRegistry deployed to: ${policyRegistryAddress}`);
    console.log(`SentinelVault deployed to: ${agentVaultAddress}`);
    console.log(`USDC Token: ${usdcAddress}`);
    console.log(`Network: ${networkName}`);

    // Save deployed addresses to JSON file
    const deploymentData = {
      network: networkName,
      PolicyRegistry: policyRegistryAddress,
      SentinelVault: agentVaultAddress,
      USDC: usdcAddress,
      deployedAt: new Date().toISOString()
    };

    const outputPath = path.join(__dirname, "..", "deployed-addresses.json");
    fs.writeFileSync(outputPath, JSON.stringify(deploymentData, null, 2));
    console.log(`\nDeployment addresses saved to: deployed-addresses.json`);

  } catch (error) {
    console.error("\n❌ Deployment failed:");
    console.error(error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
