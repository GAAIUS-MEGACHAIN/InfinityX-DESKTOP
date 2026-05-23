import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { unlockVault } from "./vault.js";

bitcoin.initEccLib(ecc);

const ECPair = ECPairFactory(ecc);
const SATOSHIS = 100000000;

const UTXO_CHAINS = {
  Bitcoin: {
    symbol: "BTC",
    coinType: 0,
    api: "btc",
    decimals: 8,
    dust: 546,
    feeRate: 12,
    supportsSend: true,
    network: bitcoin.networks.bitcoin
  },
  Litecoin: {
    symbol: "LTC",
    coinType: 2,
    api: "ltc",
    decimals: 8,
    dust: 1000,
    feeRate: 4,
    supportsSend: true,
    network: {
      messagePrefix: "\x19Litecoin Signed Message:\n",
      bech32: "ltc",
      bip32: { public: 0x019da462, private: 0x019d9cfe },
      pubKeyHash: 0x30,
      scriptHash: 0x32,
      wif: 0xb0
    }
  },
  Dogecoin: {
    symbol: "DOGE",
    coinType: 3,
    api: "doge",
    decimals: 8,
    dust: 1000000,
    feeRate: 100000,
    supportsSend: true,
    network: {
      messagePrefix: "\x19Dogecoin Signed Message:\n",
      bech32: "",
      bip32: { public: 0x02facafd, private: 0x02fac398 },
      pubKeyHash: 0x1e,
      scriptHash: 0x16,
      wif: 0x9e
    }
  },
  Dash: {
    symbol: "DASH",
    coinType: 5,
    api: "dash",
    decimals: 8,
    dust: 1000,
    feeRate: 2,
    supportsSend: true,
    network: {
      messagePrefix: "\x19DarkCoin Signed Message:\n",
      bech32: "",
      bip32: { public: 0x02fe52f8, private: 0x02fe52cc },
      pubKeyHash: 0x4c,
      scriptHash: 0x10,
      wif: 0xcc
    }
  }
};

export function isSupportedUtxoChain(chain) {
  return Boolean(UTXO_CHAINS[chain?.name]);
}

export function utxoSupportsSend(chain) {
  return Boolean(UTXO_CHAINS[chain?.name]?.supportsSend);
}

export async function getUtxoWalletState({ password, chain, accountIndex = 0 }) {
  const config = utxoConfig(chain);
  const { address } = await deriveUtxoAccount({ password, chain, accountIndex });
  const balance = await fetchUtxoBalance(config, address);
  return {
    address,
    balance: formatSatoshis(balance.finalBalance, config.decimals),
    symbol: config.symbol,
    raw: balance.finalBalance.toString(),
    unconfirmed: formatSatoshis(balance.unconfirmedBalance, config.decimals)
  };
}

export async function sendUtxoNative({ password, chain, to, amount, accountIndex = 0 }) {
  const config = utxoConfig(chain);
  if (!config.supportsSend) throw new Error(`${chain.name} send is not enabled yet.`);
  assertUtxoRecipient(to, config.network);
  const { keyPair, address } = await deriveUtxoAccount({ password, chain, accountIndex });
  const amountSats = parseCoinAmount(amount, config.decimals);
  const utxos = await fetchSpendableUtxos(config, address);
  const selected = [];
  let inputTotal = 0n;
  let fee = 0n;

  for (const utxo of utxos) {
    selected.push(utxo);
    inputTotal += BigInt(utxo.value);
    fee = estimateFee(selected.length, 2, config.feeRate);
    if (inputTotal >= amountSats + fee + BigInt(config.dust)) break;
  }

  if (inputTotal < amountSats + fee) throw new Error(`Insufficient ${config.symbol} balance for amount plus network fee.`);
  const change = inputTotal - amountSats - fee;
  const psbt = new bitcoin.Psbt({ network: config.network });
  for (const utxo of selected) {
    const raw = await fetchRawTransaction(config, utxo.tx_hash);
    psbt.addInput({
      hash: utxo.tx_hash,
      index: utxo.tx_output_n,
      nonWitnessUtxo: Buffer.from(raw, "hex")
    });
  }
  psbt.addOutput({ address: to.trim(), value: amountSats });
  if (change >= BigInt(config.dust)) psbt.addOutput({ address, value: change });
  psbt.signAllInputs(keyPair);
  psbt.finalizeAllInputs();
  const hex = psbt.extractTransaction().toHex();
  const hash = await broadcastRawTransaction(config, hex);
  return { hash, explorer: explorerTxUrl(chain, hash), fee: formatSatoshis(fee, config.decimals) };
}

async function deriveUtxoAccount({ password, chain, accountIndex }) {
  const config = utxoConfig(chain);
  const vault = await unlockVault(password);
  if (!vault.phrase) throw new Error("Vault does not contain a mnemonic phrase.");
  const seed = mnemonicToSeedSync(vault.phrase.trim().toLowerCase());
  const hd = HDKey.fromMasterSeed(seed);
  const child = hd.derive(`m/44'/${config.coinType}'/0'/0/${accountIndex}`);
  if (!child.privateKey) throw new Error(`Unable to derive ${chain.name} private key.`);
  const keyPair = ECPair.fromPrivateKey(Buffer.from(child.privateKey), { network: config.network });
  const payment = bitcoin.payments.p2pkh({ pubkey: Buffer.from(keyPair.publicKey), network: config.network });
  if (!payment.address) throw new Error(`Unable to derive ${chain.name} receive address.`);
  return { keyPair, address: payment.address };
}

async function fetchUtxoBalance(config, address) {
  const response = await fetch(`https://api.blockcypher.com/v1/${config.api}/main/addrs/${address}/balance`);
  if (!response.ok) throw new Error(`${config.symbol} balance API error: ${response.status}`);
  const payload = await response.json();
  return {
    finalBalance: BigInt(payload.final_balance ?? payload.balance ?? 0),
    unconfirmedBalance: BigInt(payload.unconfirmed_balance ?? 0)
  };
}

async function fetchSpendableUtxos(config, address) {
  const response = await fetch(`https://api.blockcypher.com/v1/${config.api}/main/addrs/${address}?unspentOnly=true&includeScript=true&limit=200`);
  if (!response.ok) throw new Error(`${config.symbol} UTXO API error: ${response.status}`);
  const payload = await response.json();
  return (payload.txrefs ?? [])
    .filter((utxo) => !utxo.spent && utxo.tx_output_n >= 0)
    .sort((a, b) => Number(b.value) - Number(a.value));
}

async function fetchRawTransaction(config, txHash) {
  const response = await fetch(`https://api.blockcypher.com/v1/${config.api}/main/txs/${txHash}?includeHex=true`);
  if (!response.ok) throw new Error(`${config.symbol} raw transaction API error: ${response.status}`);
  const payload = await response.json();
  if (!payload.hex) throw new Error(`${config.symbol} raw transaction was not returned by the indexer.`);
  return payload.hex;
}

async function broadcastRawTransaction(config, hex) {
  const response = await fetch(`https://api.blockcypher.com/v1/${config.api}/main/txs/push`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tx: hex })
  });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error ?? `${config.symbol} broadcast failed.`);
  return payload.tx?.hash ?? payload.hash;
}

function assertUtxoRecipient(address, network) {
  try {
    bitcoin.address.toOutputScript(address.trim(), network);
  } catch {
    throw new Error("Invalid recipient address for this UTXO network.");
  }
}

function parseCoinAmount(value, decimals) {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("Enter a valid amount.");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new Error(`Amount supports only ${decimals} decimals.`);
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

function formatSatoshis(value, decimals) {
  const raw = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = raw % base;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

function estimateFee(inputs, outputs, feeRate) {
  return BigInt(Math.ceil((10 + inputs * 148 + outputs * 34) * feeRate));
}

function explorerTxUrl(chain, hash) {
  if (!chain.explorer?.startsWith("http")) return "";
  if (chain.name === "Bitcoin") return `${chain.explorer}/tx/${hash}`;
  return `${chain.explorer.replace(/\/$/, "")}/tx/${hash}`;
}

function utxoConfig(chain) {
  const config = UTXO_CHAINS[chain?.name];
  if (!config) throw new Error(`${chain?.name ?? "This chain"} is not supported by the UTXO adapter yet.`);
  return config;
}
