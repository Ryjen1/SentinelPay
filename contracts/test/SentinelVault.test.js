const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("SentinelPay Smart Contracts", function () {
  let mockUSDC;
  let policyRegistry;
  let agentVault;
  let owner;
  let agentOperator;
  let recipient;
  let unauthorized;
  let agentId;

  beforeEach(async function () {
    // Get signers
    [owner, agentOperator, recipient, unauthorized] = await ethers.getSigners();

    // Define test agent ID
    agentId = ethers.encodeBytes32String("agent-001");

    // Deploy MockERC20
    const MockERC20Factory = await ethers.getContractFactory(
      "contracts/test/MockERC20.sol:MockERC20"
    );
    mockUSDC = await MockERC20Factory.deploy("Mock USDC", "USDC", 6);
    await mockUSDC.waitForDeployment();

    // Deploy PolicyRegistry
    const PolicyRegistry = await ethers.getContractFactory("PolicyRegistry");
    policyRegistry = await PolicyRegistry.deploy();
    await policyRegistry.waitForDeployment();

    // Deploy SentinelVault
    const SentinelVault = await ethers.getContractFactory("SentinelVault");
    agentVault = await SentinelVault.deploy(
      await mockUSDC.getAddress(),
      await policyRegistry.getAddress()
    );
    await agentVault.waitForDeployment();

    // Mint some tokens to owner for testing
    await mockUSDC.mint(owner.address, ethers.parseUnits("10000", 6));
  });

  describe("SentinelVault - constructor", function () {
    it("should revert when token or registry address is zero", async function () {
      const SentinelVault = await ethers.getContractFactory("SentinelVault");
      await expect(
        SentinelVault.deploy(ethers.ZeroAddress, await policyRegistry.getAddress())
      ).to.be.revertedWithCustomError(agentVault, "InvalidAddress");
      await expect(
        SentinelVault.deploy(await mockUSDC.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(agentVault, "InvalidAddress");
    });
  });

  describe("PolicyRegistry", function () {
    it("should register an agent with correct policy", async function () {
      const maxPerTx = ethers.parseUnits("100", 6);
      const dailyCap = ethers.parseUnits("500", 6);
      const whitelist = [recipient.address];

      await expect(
        policyRegistry.registerAgent(agentId, maxPerTx, dailyCap, whitelist)
      )
        .to.emit(policyRegistry, "AgentRegistered")
        .withArgs(agentId, maxPerTx, dailyCap);

      const policy = await policyRegistry.getPolicy(agentId);
      expect(policy.maxPerTx).to.equal(maxPerTx);
      expect(policy.dailyCap).to.equal(dailyCap);
      expect(policy.isActive).to.be.true;
    });

    it("should revert if non-owner tries to register agent", async function () {
      const maxPerTx = ethers.parseUnits("100", 6);
      const dailyCap = ethers.parseUnits("500", 6);
      const whitelist = [recipient.address];

      await expect(
        policyRegistry
          .connect(unauthorized)
          .registerAgent(agentId, maxPerTx, dailyCap, whitelist)
      ).to.be.revertedWithCustomError(policyRegistry, "OwnableUnauthorizedAccount");
    });

    it("should update policy correctly", async function () {
      const maxPerTx = ethers.parseUnits("100", 6);
      const dailyCap = ethers.parseUnits("500", 6);
      const whitelist = [recipient.address];

      await policyRegistry.registerAgent(agentId, maxPerTx, dailyCap, whitelist);

      const newMaxPerTx = ethers.parseUnits("200", 6);
      const newDailyCap = ethers.parseUnits("1000", 6);

      await expect(policyRegistry.updatePolicy(agentId, newMaxPerTx, newDailyCap))
        .to.emit(policyRegistry, "PolicyUpdated")
        .withArgs(agentId, newMaxPerTx, newDailyCap);

      const policy = await policyRegistry.getPolicy(agentId);
      expect(policy.maxPerTx).to.equal(newMaxPerTx);
      expect(policy.dailyCap).to.equal(newDailyCap);
    });

    it("should pause and unpause agent", async function () {
      const maxPerTx = ethers.parseUnits("100", 6);
      const dailyCap = ethers.parseUnits("500", 6);
      const whitelist = [recipient.address];

      await policyRegistry.registerAgent(agentId, maxPerTx, dailyCap, whitelist);

      await expect(policyRegistry.pauseAgent(agentId))
        .to.emit(policyRegistry, "AgentPaused")
        .withArgs(agentId);

      expect(await policyRegistry.isAgentActive(agentId)).to.be.false;

      await expect(policyRegistry.unpauseAgent(agentId))
        .to.emit(policyRegistry, "AgentUnpaused")
        .withArgs(agentId);

      expect(await policyRegistry.isAgentActive(agentId)).to.be.true;
    });

    it("should add address to whitelist", async function () {
      const maxPerTx = ethers.parseUnits("100", 6);
      const dailyCap = ethers.parseUnits("500", 6);
      const whitelist = [recipient.address];

      await policyRegistry.registerAgent(agentId, maxPerTx, dailyCap, whitelist);

      const newRecipient = unauthorized.address;
      await expect(policyRegistry.addToWhitelist(agentId, newRecipient))
        .to.emit(policyRegistry, "WhitelistUpdated")
        .withArgs(agentId, newRecipient);

      expect(await policyRegistry.isWhitelisted(agentId, newRecipient)).to.be.true;
    });
  });

  describe("SentinelVault - deposits", function () {
    it("should accept USDC deposit for agent", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);

      await mockUSDC.approve(await agentVault.getAddress(), depositAmount);

      await expect(agentVault.deposit(agentId, depositAmount))
        .to.emit(agentVault, "Deposited")
        .withArgs(agentId, depositAmount);
    });

    it("should reflect correct balance after deposit", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);

      await mockUSDC.approve(await agentVault.getAddress(), depositAmount);
      await agentVault.deposit(agentId, depositAmount);

      expect(await agentVault.getBalance(agentId)).to.equal(depositAmount);
    });

    it("should revert on zero amount deposit", async function () {
      await expect(agentVault.deposit(agentId, 0)).to.be.revertedWithCustomError(
        agentVault,
        "ZeroAmount"
      );
    });
  });

  describe("SentinelVault - executePayment", function () {
    beforeEach(async function () {
      // Register agent
      const maxPerTx = ethers.parseUnits("100", 6);
      const dailyCap = ethers.parseUnits("500", 6);
      const whitelist = [recipient.address];
      await policyRegistry.registerAgent(agentId, maxPerTx, dailyCap, whitelist);

      // Deposit funds
      const depositAmount = ethers.parseUnits("1000", 6);
      await mockUSDC.approve(await agentVault.getAddress(), depositAmount);
      await agentVault.deposit(agentId, depositAmount);
    });

    it("should execute payment within policy limits", async function () {
      const paymentAmount = ethers.parseUnits("50", 6);

      await expect(
        agentVault.executePayment(agentId, recipient.address, paymentAmount)
      )
        .to.emit(agentVault, "PaymentExecuted")
        .withArgs(agentId, recipient.address, paymentAmount, anyValue);

      expect(await mockUSDC.balanceOf(recipient.address)).to.equal(paymentAmount);
    });

    it("should revert with ExceedsPerTxLimit when amount exceeds maxPerTx", async function () {
      const paymentAmount = ethers.parseUnits("150", 6); // maxPerTx is 100

      await expect(
        agentVault.executePayment(agentId, recipient.address, paymentAmount)
      ).to.be.revertedWithCustomError(agentVault, "ExceedsPerTxLimit");
    });

    it("should revert with ExceedsDailyCap when daily cap is reached", async function () {
      const payment1 = ethers.parseUnits("100", 6);
      const payment2 = ethers.parseUnits("100", 6);
      const payment3 = ethers.parseUnits("100", 6);
      const payment4 = ethers.parseUnits("100", 6);
      const payment5 = ethers.parseUnits("100", 6);
      const payment6 = ethers.parseUnits("100", 6); // This exceeds 500 daily cap

      await agentVault.executePayment(agentId, recipient.address, payment1);
      await agentVault.executePayment(agentId, recipient.address, payment2);
      await agentVault.executePayment(agentId, recipient.address, payment3);
      await agentVault.executePayment(agentId, recipient.address, payment4);
      await agentVault.executePayment(agentId, recipient.address, payment5);

      await expect(
        agentVault.executePayment(agentId, recipient.address, payment6)
      ).to.be.revertedWithCustomError(agentVault, "ExceedsDailyCap");
    });

    it("should revert with RecipientNotWhitelisted for non-whitelisted recipient", async function () {
      const paymentAmount = ethers.parseUnits("50", 6);

      await expect(
        agentVault.executePayment(agentId, unauthorized.address, paymentAmount)
      ).to.be.revertedWithCustomError(agentVault, "RecipientNotWhitelisted");
    });

    it("should revert when recipient is zero address", async function () {
      const paymentAmount = ethers.parseUnits("10", 6);
      await expect(
        agentVault.executePayment(agentId, ethers.ZeroAddress, paymentAmount)
      ).to.be.revertedWithCustomError(agentVault, "InvalidAddress");
    });

    it("should revert when amount is zero", async function () {
      await expect(
        agentVault.executePayment(agentId, recipient.address, 0)
      ).to.be.revertedWithCustomError(agentVault, "ZeroAmount");
    });

    it("should revert with AgentNotActive when agent is paused", async function () {
      await policyRegistry.pauseAgent(agentId);

      const paymentAmount = ethers.parseUnits("50", 6);

      await expect(
        agentVault.executePayment(agentId, recipient.address, paymentAmount)
      ).to.be.revertedWithCustomError(agentVault, "AgentNotActive");
    });

    it("should revert with InsufficientBalance when vault has no funds", async function () {
      const newAgentId = ethers.encodeBytes32String("agent-002");
      const maxPerTx = ethers.parseUnits("100", 6);
      const dailyCap = ethers.parseUnits("500", 6);
      const whitelist = [recipient.address];

      await policyRegistry.registerAgent(newAgentId, maxPerTx, dailyCap, whitelist);

      const paymentAmount = ethers.parseUnits("50", 6);

      await expect(
        agentVault.executePayment(newAgentId, recipient.address, paymentAmount)
      ).to.be.revertedWithCustomError(agentVault, "InsufficientBalance");
    });
  });

  describe("SentinelVault - daily reset", function () {
    beforeEach(async function () {
      // Register agent
      const maxPerTx = ethers.parseUnits("100", 6);
      const dailyCap = ethers.parseUnits("500", 6);
      const whitelist = [recipient.address];
      await policyRegistry.registerAgent(agentId, maxPerTx, dailyCap, whitelist);

      // Deposit funds
      const depositAmount = ethers.parseUnits("2000", 6);
      await mockUSDC.approve(await agentVault.getAddress(), depositAmount);
      await agentVault.deposit(agentId, depositAmount);
    });

    it("should reset daily spend after 24 hours", async function () {
      // Make payments to reach near daily cap
      const payment = ethers.parseUnits("100", 6);
      await agentVault.executePayment(agentId, recipient.address, payment);
      await agentVault.executePayment(agentId, recipient.address, payment);
      await agentVault.executePayment(agentId, recipient.address, payment);
      await agentVault.executePayment(agentId, recipient.address, payment);
      await agentVault.executePayment(agentId, recipient.address, payment);

      // Check daily spent is at cap
      expect(await agentVault.getDailySpent(agentId)).to.equal(
        ethers.parseUnits("500", 6)
      );

      // Fast forward 24 hours + 1 second
      await ethers.provider.send("evm_increaseTime", [86401]);
      await ethers.provider.send("evm_mine");

      // Should be able to make another payment after reset
      await expect(
        agentVault.executePayment(agentId, recipient.address, payment)
      ).to.emit(agentVault, "PaymentExecuted");

      // Daily spent should reflect only the new payment
      expect(await agentVault.getDailySpent(agentId)).to.equal(payment);
    });
  });

  describe("SentinelVault - withdraw", function () {
    beforeEach(async function () {
      const maxPerTx = ethers.parseUnits("100", 6);
      const dailyCap = ethers.parseUnits("500", 6);
      const whitelist = [recipient.address];
      await policyRegistry.registerAgent(agentId, maxPerTx, dailyCap, whitelist);

      const depositAmount = ethers.parseUnits("1000", 6);
      await mockUSDC.approve(await agentVault.getAddress(), depositAmount);
      await agentVault.deposit(agentId, depositAmount);
    });

    it("should allow owner to withdraw vault funds", async function () {
      const withdrawAmount = ethers.parseUnits("250", 6);
      await expect(agentVault.withdraw(agentId, owner.address, withdrawAmount))
        .to.emit(agentVault, "Withdrawn")
        .withArgs(agentId, owner.address, withdrawAmount);

      expect(await agentVault.getBalance(agentId)).to.equal(ethers.parseUnits("750", 6));
    });

    it("should block non-owner withdrawals", async function () {
      await expect(
        agentVault.connect(unauthorized).withdraw(agentId, unauthorized.address, ethers.parseUnits("1", 6))
      ).to.be.revertedWithCustomError(agentVault, "OwnableUnauthorizedAccount");
    });

    it("should revert if withdrawing more than balance", async function () {
      await expect(
        agentVault.withdraw(agentId, owner.address, ethers.parseUnits("2000", 6))
      ).to.be.revertedWithCustomError(agentVault, "InsufficientBalance");
    });

    it("should revert on zero amount or zero recipient", async function () {
      await expect(agentVault.withdraw(agentId, owner.address, 0)).to.be.revertedWithCustomError(
        agentVault,
        "ZeroAmount"
      );
      await expect(
        agentVault.withdraw(agentId, ethers.ZeroAddress, ethers.parseUnits("1", 6))
      ).to.be.revertedWithCustomError(agentVault, "InvalidAddress");
    });
  });
});
