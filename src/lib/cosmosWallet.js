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

export function isSupportedCosmosChain(chain) {
  return Boolean(COSMOS_CHAINS[chain?.name]);
}

export async function getCosmosWalletState({ password, chain, accountIndex = 0 }) {
  const config = cosmosConfig(chain);
  const wallet = await unlockCosmosWallet({ password, chain, accountIndex });
  const [account] = await wallet.getAccounts();
  const client = await StargateClient.connect(config.rpc);
  const balance = await client.getBalance(account.address, config.denom);
  client.disconnect();
  return {
    address: account.address,
    balance: formatUnits(balance.amount, config.decimals),
    raw: balance.amount,
    symbol: config.symbol,
    denom: config.denom
  };
}

export async function sendCosmosNative({ password, chain, to, amount, accountIndex = 0 }) {
  const config = cosmosConfig(chain);
  if (!to?.startsWith(config.prefix)) throw new Error(`Recipient must be a ${chain.name} address.`);
  const wallet = await unlockCosmosWallet({ password, chain, accountIndex });
  const [account] = await wallet.getAccounts();
  const client = await SigningStargateClient.connectWithSigner(config.rpc, wallet, {
    gasPrice: GasPrice.fromString(config.gasPrice)
  });
  const result = await client.sendTokens(
    account.address,
    to.trim(),
    [{ denom: config.denom, amount: parseUnits(amount, config.decimals) }],
    "auto",
    "InfinityX"
  );
  client.disconnect();
  if (result.code !== 0) throw new Error(result.rawLog || `${chain.name} transaction failed.`);
  return { hash: result.transactionHash, explorer: explorerTxUrl(chain, result.transactionHash) };
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
