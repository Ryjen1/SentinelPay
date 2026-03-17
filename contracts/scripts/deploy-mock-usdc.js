const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Mock USDC with account:", deployer.address);

  const MockERC20Factory = await ethers.getContractFactory(
    "contracts/test/MockERC20.sol:MockERC20"
  );

  const token = await MockERC20Factory.deploy("Mock USDC", "USDC", 6);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("Mock USDC deployed to:", tokenAddress);

  const mintAmount = ethers.parseUnits("10000", 6);
  const mintTx = await token.mint(deployer.address, mintAmount);
  await mintTx.wait();
  console.log("Minted to deployer:", ethers.formatUnits(mintAmount, 6), "USDC");
  console.log("Mint tx:", mintTx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
