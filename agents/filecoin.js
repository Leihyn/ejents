/**
 * Filecoin Pin wrapper — write agent state to Filecoin, retrieve via IPFS gateway
 *
 * Closed-loop data flow:
 *   Pin JSON → get CID → store CID on-chain → retrieve by CID → parse JSON
 *
 * Uses multiple IPFS gateways for resilient retrieval.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Multiple gateways for retrieval resilience (tried in order)
const GATEWAYS = [
  "https://w3s.link/ipfs",
  "https://dweb.link/ipfs",
  "https://cloudflare-ipfs.com/ipfs",
  "https://ipfs.io/ipfs",
];

const GATEWAY_URL = GATEWAYS[0]; // Primary

/**
 * Write agent state to Filecoin via filecoin-pin CLI
 * @returns {{ cid: string, gatewayUrl: string }} or null on failure
 */
async function writeState(agentId, state) {
  const tmpFile = path.join(os.tmpdir(), `ejent-${agentId}-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
    const start = Date.now();
    const output = execSync(`filecoin-pin add ${tmpFile} --auto-fund --bare`, {
      encoding: "utf-8",
      timeout: 180000,
      env: {
        ...process.env,
        PRIVATE_KEY: process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY,
      },
    });

    const cidMatch = output.match(/Root CID[:\s]+([a-zA-Z0-9]+)/i);
    const cid = cidMatch ? cidMatch[1] : null;

    if (cid) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[filecoin] PIN ${cid.slice(0, 20)}... (${elapsed}s)`);
      return { cid, gatewayUrl: `${GATEWAY_URL}/${cid}` };
    }
    console.log(`[filecoin] Agent #${agentId}: upload succeeded but could not parse CID`);
    return null;
  } catch (e) {
    console.error(`[filecoin] Agent #${agentId}: upload failed —`, e.message.split("\n")[0]);
    return null;
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

/**
 * Retrieve agent state from Filecoin via IPFS gateway (multi-gateway fallback)
 * @returns {object|null} parsed JSON or null on failure
 */
async function readState(cid) {
  if (!cid || !cid.startsWith("baf")) return null;

  for (const gateway of GATEWAYS) {
    try {
      const url = `${gateway}/${cid}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) continue;
      const text = await response.text();
      // Guard against HTML responses (some gateways return directory listings)
      if (text.startsWith("<") || text.startsWith("<!")) continue;
      const data = JSON.parse(text);
      console.log(`[filecoin] GET ${cid.slice(0, 20)}... from ${gateway.split("//")[1].split("/")[0]}`);
      return data;
    } catch {
      // Try next gateway
    }
  }
  console.log(`[filecoin] GET FAILED ${cid.slice(0, 20)}... (all gateways)`);
  return null;
}

module.exports = { writeState, readState, GATEWAY_URL, GATEWAYS };
