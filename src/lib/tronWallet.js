import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { TronWeb } from "tronweb";
import { unlockVault } from "./vault.js";

const TRX_DECIMALS = 6;
const SUN = 1_000_000n;
const DEFAULT_FULL_HOST = "https://api.trongrid.io";
const TRC20_FEE_LIMIT = 100_000_000;

export async function getTronWalletState({ password, chain, accountIndex = 0 }) {
  const { address, tronWeb } = await unlockTronSigner({ password, chain, accountIndex });
  const balance = BigInt(await tronWeb.trx.getBalance(address));
  return {
    address,
    balance: formatUnits(balance, TRX_DECIMALS),
    raw: balance.toString(),
    symbol: "TRX"
  };
}

export async function getTrc20TokenBalance({ password, chain, tokenAddress, decimals, symbol = "TOKEN", accountIndex = 0 }) {
  const { address, tronWeb } = await unlockTronSigner({ password, chain, accountIndex });
  assertTronAddress(tronWeb, tokenAddress, "Invalid TRC-20 contract address.");
  const contract = await tronWeb.contract().at(tokenAddress);
  const tokenDecimals = hasExplicitDecimals(decimals) ? Number(decimals) : Number(await contract.decimals().call());
  const balance = toBigInt(await contract.balanceOf(address).call());
  return {
    address,
    raw: balance.toString(),
    decimals: tokenDecimals,
    uiAmount: formatUnits(balance, tokenDecimals),
    symbol
  };
}

export async function deriveTronAddress({ password, accountIndex = 0 }) {
  const { address } = await unlockTronSigner({ password, accountIndex });
  return address;
}

export async function sendTronNative({ password, chain, to, amount, accountIndex = 0 }) {
  const { privateKey, tronWeb } = await unlockTronSigner({ password, chain, accountIndex });
  assertTronAddress(tronWeb, to, "Invalid TRON recipient address.");
  const sun = parseUnits(amount, TRX_DECIMALS);
  if (sun > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("TRX amount is too large for this signer path.");
  const result = await tronWeb.trx.sendTransaction(to.trim(), Number(sun), { privateKey });
  const hash = result.txid ?? result.transaction?.txID ?? result.transaction?.txid;
  if (!result.result || !hash) throw new Error(result.message ?? "TRX broadcast failed.");
  return { hash, explorer: explorerTxUrl(chain, hash) };
}

export async function sendTrc20Token({ password, chain, tokenAddress, to, amount, decimals, accountIndex = 0 }) {
  const { privateKey, tronWeb } = await unlockTronSigner({ password, chain, accountIndex });
  assertTronAddress(tronWeb, to, "Invalid TRON recipient address.");
  assertTronAddress(tronWeb, tokenAddress, "Invalid TRC-20 contract address.");
  const contract = await tronWeb.contract().at(tokenAddress);
  const tokenDecimals = hasExplicitDecimals(decimals) ? Number(decimals) : Number(await contract.decimals().call());
  const rawAmount = parseUnits(amount, tokenDecimals);
  const hash = await contract.transfer(to.trim(), rawAmount.toString()).send({ feeLimit: TRC20_FEE_LIMIT }, privateKey);
  if (!hash) throw new Error("TRC-20 broadcast failed.");
  return { hash, explorer: explorerTxUrl(chain, hash) };
}

async function unlockTronSigner({ password, chain, accountIndex = 0 }) {
  const vault = await unlockVault(password);
  if (!vault.phrase) throw new Error("Vault does not contain a mnemonic phrase.");
  const seed = mnemonicToSeedSync(vault.phrase.trim().toLowerCase());
  const hd = HDKey.fromMasterSeed(seed);
  const child = hd.derive(`m/44'/195'/0'/0/${accountIndex}`);
  if (!child.privateKey) throw new Error("Unable to derive TRON private key.");
  const privateKey = Buffer.from(child.privateKey).toString("hex");
  const tronWeb = new TronWeb({ fullHost: tronFullHost(chain), privateKey });
  const address = tronWeb.address.fromPrivateKey(privateKey);
  if (!address) throw new Error("Unable to derive TRON receive address.");
  return { address, privateKey, tronWeb };
}

function tronFullHost(chain) {
  return chain?.rpc?.startsWith("http") ? chain.rpc : DEFAULT_FULL_HOST;
}

function assertTronAddress(tronWeb, address, message) {
  if (!tronWeb.isAddress(String(address ?? "").trim())) throw new Error(message);
}

function parseUnits(value, decimals) {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("Enter a valid amount.");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new Error(`Amount supports only ${decimals} decimals.`);
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

function formatUnits(value, decimals) {
  const raw = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = raw % base;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

function toBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  if (value?._hex) return BigInt(value._hex);
  if (value?.toString) return BigInt(value.toString());
  return 0n;
}

function hasExplicitDecimals(decimals) {
  if (decimals === undefined || decimals === null || String(decimals).trim() === "") return false;
  return Number.isFinite(Number(decimals));
}

function explorerTxUrl(chain, hash) {
  const explorer = chain?.explorer?.startsWith("http") ? chain.explorer.replace(/\/$/, "") : "https://tronscan.org/#";
  return explorer.includes("tronscan.org") ? `${explorer}/transaction/${hash}` : `${explorer}/tx/${hash}`;
}
