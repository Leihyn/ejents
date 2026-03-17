/**
 * Contract connections — per-agent wallets, each agent signs its own transactions
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const RPC_URL = "https://api.calibration.node.glif.io/rpc/v1";
const CALIBRATION_NETWORK = new ethers.Network("filecoin-calibration", 314159);

function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URL, CALIBRATION_NETWORK, {
    staticNetwork: true,
    batchMaxCount: 1,
  });
}

function getDeployerSigner() {
  const provider = getProvider();
  return new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
}

function getAgentSigner(agentId) {
  const provider = getProvider();
  const key = process.env[`AGENT_${agentId}_KEY`];
  if (!key) {
    // Fallback: read from manifest
    const manifestPath = path.join(__dirname, "..", "agent-manifest.json");
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      const agent = manifest.find(a => a.id === agentId);
      if (agent && agent.privateKey) {
        return new ethers.Wallet(agent.privateKey, provider);
      }
    }
    throw new Error(`No private key for agent ${agentId}`);
  }
  return new ethers.Wallet(key, provider);
}

function loadABI(contractName) {
  const artifactPath = path.join(
    __dirname, "..", "artifacts", "contracts", `${contractName}.sol`, `${contractName}.json`
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  return artifact.abi;
}

let _contractsSingleton = null;

function getContracts() {
  if (_contractsSingleton) return _contractsSingleton;

  const deployerSigner = getDeployerSigner();
  const addresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployed-addresses.json"), "utf-8")
  );

  // Deployer-connected contracts (for keeper operations)
  _contractsSingleton = {
    registry: new ethers.Contract(addresses.contracts.AgentRegistry, loadABI("AgentRegistry"), deployerSigner),
    taskMarket: new ethers.Contract(addresses.contracts.TaskMarket, loadABI("TaskMarket"), deployerSigner),
    lendingPool: new ethers.Contract(addresses.contracts.LendingPool, loadABI("LendingPool"), deployerSigner),
    liquidationQueue: new ethers.Contract(addresses.contracts.LiquidationQueue, loadABI("LiquidationQueue"), deployerSigner),
    signer: deployerSigner,
    provider: deployerSigner.provider,
    addresses: addresses.contracts,
    config: addresses.config,
  };

  return _contractsSingleton;
}

/**
 * Get contracts connected to a specific agent's wallet signer.
 * Each agent signs its own transactions.
 */
function getAgentContracts(agentId) {
  const agentSigner = getAgentSigner(agentId);
  const addresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployed-addresses.json"), "utf-8")
  );

  return {
    registry: new ethers.Contract(addresses.contracts.AgentRegistry, loadABI("AgentRegistry"), agentSigner),
    taskMarket: new ethers.Contract(addresses.contracts.TaskMarket, loadABI("TaskMarket"), agentSigner),
    lendingPool: new ethers.Contract(addresses.contracts.LendingPool, loadABI("LendingPool"), agentSigner),
    liquidationQueue: new ethers.Contract(addresses.contracts.LiquidationQueue, loadABI("LiquidationQueue"), agentSigner),
    signer: agentSigner,
    provider: agentSigner.provider,
    addresses: addresses.contracts,
    config: addresses.config,
  };
}

module.exports = { getProvider, getDeployerSigner, getAgentSigner, getContracts, getAgentContracts, loadABI };
