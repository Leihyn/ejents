/**
 * Shared utilities for agent scripts
 */
const { ethers } = require("ethers");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Estimate how many fee intervals an agent can survive
 */
function estimateSurvivalIntervals(balance, feePerInterval) {
  if (feePerInterval === 0n) return Infinity;
  return Number(balance / feePerInterval);
}

/**
 * Estimate asset value from historical agent data (fetched from Filecoin)
 * Uses totalEarned as a proxy for productive value
 */
function estimateAssetValue(agentData) {
  if (!agentData) return 0n;
  const earned = ethers.parseEther(agentData.totalEarned || "0");
  const tasks = BigInt(agentData.tasksCompleted || 0);
  // Value = 60% of total earned + bonus for task history
  const baseValue = (earned * 60n) / 100n;
  const taskBonus = tasks * ethers.parseEther("0.005");
  return baseValue + taskBonus;
}

/**
 * Convert ethers BigInt balance to human-readable string
 */
function formatBal(wei) {
  return ethers.formatEther(wei);
}

/**
 * Get a random element from an array
 */
function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = { sleep, estimateSurvivalIntervals, estimateAssetValue, formatBal, randomPick };
