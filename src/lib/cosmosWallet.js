import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice, SigningStargateClient, StargateClient } from "@cosmjs/stargate";
import { unlockVault } from "./vault.js";

const COSMOS_CHAINS = {
  "Cosmos Hub": { prefix: "cosmos", denom: "uatom", symbol: "ATOM", decimals: 6, rpc: "https://cosmos-rpc.publicnode.com", gasPrice: "0.025uatom" },
  Osmosis: { prefix: "osmo", denom: "uosmo", symbol: "OSMO", decimals: 6, rpc: "https://osmosis-rpc.publicnode.com", gasPrice: "0.025uosmo" },
  Celestia: { prefix: "celestia", denom: "utia", symbol: "TIA", decimals: 6, rpc: "https://celestia-rpc.publicnode.com", gasPrice: "0.002utia" },
  Stargaze: { prefix: "stars", denom: "ustars", symbol: "STARS", decimals: 6, rpc: "https://stargaze-rpc.publicnode.com", gasPrice: "1ustars" },
  Juno: { prefix: "juno", denom: "ujuno", symbol: "JUNO", decimals: 6, rpc: "https://juno-rpc.publicnode.com", gasPrice: "0.075ujuno" },
  Akash: { prefix: "akash", denom: "uakt", symbol: "AKT", decimals: 6, rpc: "https://akash-rpc.publicnode.com", gasPrice: "0.025uakt" },
  Kujira: { prefix: "kujira", denom: "ukuji", symbol: "KUJI", decimals: 6, rpc: "https://kujira-rpc.publicnode.com", gasPrice: "0.00125ukuji" },
  "Secret Network": { prefix: "secret", denom: "uscrt", symbol: "SCRT", decimals: 6, rpc: "https://secret-rpc.publicnode.com", gasPrice: "0.25uscrt" },
  Stride: { prefix: "stride", denom: "ustrd", symbol: "STRD", decimals: 6, rpc: "https://stride-rpc.publicnode.com", gasPrice: "0.025ustrd" },
  Evmos: { prefix: "evmos", denom: "aevmos", symbol: "EVMOS", decimals: 18, rpc: "https://evmos-rpc.publicnode.com", gasPrice: "25000000000aevmos" },
  Coreum: { prefix: "core", denom: "ucore", symbol: "COREUM", decimals: 6, rpc: "https://full-node.mainnet-1.coreum.dev:26657", gasPrice: "0.0625ucore" }
};

const COSMOS_RPC_FALLBACKS = {
  "Cosmos Hub": ["https://rpc.cosmos.directory/cosmoshub"],
  Osmosis: ["https://rpc.cosmos.directory/osmosis"],
  Celestia: ["https://rpc.cosmos.directory/celestia"],
  Stargaze: ["https://rpc.cosmos.directory/stargaze"],
  Juno: ["https://rpc.cosmos.directory/juno"],
  Akash: ["https://rpc.cosmos.directory/akash"],
  Kujira: ["https://rpc.cosmos.directory/kujira"],
  "Secret Network": ["https://rpc.cosmos.directory/secretnetwork"],
  Stride: ["https://rpc.cosmos.directory/stride"],
  Evmos: ["https://rpc.cosmos.directory/evmos"],
  Coreum: ["https://rpc.cosmos.directory/coreum"]
};

export function isSupportedCosmosChain(chain) {
  return Boolean(COSMOS_CHAINS[chain?.name]);
}

export async function getCosmosWalletState({ password, chain, accountIndex = 0, denom, decimals, symbol } = {}) {
  const config = cosmosConfig(chain);
  const assetDenom = denom || config.denom;
  const assetDecimals = hasExplicitDecimals(decimals) ? Number(decimals) : config.decimals;
  const assetSymbol = symbol || config.symbol;
  const wallet = await unlockCosmosWallet({ password, chain, accountIndex });
  const [account] = await wallet.getAccounts();
  const { result: balance } = await withCosmosRpc(chain, async (rpc) => {
    const client = await StargateClient.connect(rpc);
    try {
      return await client.getBalance(account.address, assetDenom);
    } finally {
      client.disconnect();
    }
  });
  return {
    address: account.address,
    balance: formatUnits(balance.amount, assetDecimals),
    raw: balance.amount,
    symbol: assetSymbol,
    denom: assetDenom
  };
}

export async function sendCosmosNative({ password, chain, to, amount, accountIndex = 0, denom, decimals, symbol } = {}) {
  const config = cosmosConfig(chain);
  const assetDenom = denom || config.denom;
  const assetDecimals = hasExplicitDecimals(decimals) ? Number(decimals) : config.decimals;
  if (!to?.startsWith(config.prefix)) throw new Error(`Recipient must be a ${chain.name} address.`);
  const wallet = await unlockCosmosWallet({ password, chain, accountIndex });
  const [account] = await wallet.getAccounts();
  const { result } = await withCosmosRpc(chain, async (rpc) => {
    const client = await SigningStargateClient.connectWithSigner(rpc, wallet, {
      gasPrice: GasPrice.fromString(config.gasPrice)
    });
    try {
      return await client.sendTokens(
        account.address,
        to.trim(),
        [{ denom: assetDenom, amount: parseUnits(amount, assetDecimals) }],
        "auto",
        `InfinityX ${symbol || config.symbol}`
      );
    } finally {
      client.disconnect();
    }
  });
  if (result.code !== 0) throw new Error(result.rawLog || `${chain.name} transaction failed.`);
  return { hash: result.transactionHash, explorer: explorerTxUrl(chain, result.transactionHash) };
}

function hasExplicitDecimals(decimals) {
  if (decimals === undefined || decimals === null || String(decimals).trim() === "") return false;
  return Number.isFinite(Number(decimals));
}

async function unlockCosmosWallet({ password, chain, accountIndex }) {
  const config = cosmosConfig(chain);
  const vault = await unlockVault(password);
  if (!vault.phrase) throw new Error("Vault does not contain a mnemonic phrase.");
  return DirectSecp256k1HdWallet.fromMnemonic(vault.phrase.trim().toLowerCase(), {
    prefix: config.prefix,
    hdPaths: [`m/44'/118'/0'/0/${accountIndex}`]
  });
}

function cosmosConfig(chain) {
  const config = COSMOS_CHAINS[chain?.name];
  if (!config) throw new Error(`${chain?.name ?? "This chain"} is not supported by the Cosmos adapter yet.`);
  return config;
}

async function withCosmosRpc(chain, fn) {
  const config = cosmosConfig(chain);
  const errors = [];
  for (const rpc of cosmosRpcCandidates(chain, config)) {
    try {
      return { result: await fn(rpc), rpc };
    } catch (error) {
      errors.push(`${rpc}: ${error.message}`);
    }
  }
  throw new Error(`All ${chain.name} RPCs failed. ${errors.join(" | ")}`);
}

function cosmosRpcCandidates(chain, config) {
  return [...new Set([chain?.rpc, config.rpc, ...(COSMOS_RPC_FALLBACKS[chain?.name] ?? [])].filter((rpc) => typeof rpc === "string" && rpc.startsWith("http")))];
}

function parseUnits(value, decimals) {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("Enter a valid amount.");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new Error(`Amount supports only ${decimals} decimals.`);
  return (BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, "0") || "0")).toString();
}

function formatUnits(value, decimals) {
  const raw = BigInt(value || 0);
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = raw % base;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

function explorerTxUrl(chain, hash) {
  if (!chain.explorer?.startsWith("http")) return "";
  return `${chain.explorer.replace(/\/$/, "")}/tx/${hash}`;
}
