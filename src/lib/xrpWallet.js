import { Client, dropsToXrp, isValidClassicAddress, Wallet, xrpToDrops } from "xrpl";
import { unlockVault } from "./vault.js";

const DEFAULT_XRPL_RPC = "wss://xrplcluster.com";
const XRP_DERIVATION_PURPOSE = 144;

export async function getXrpWalletState({ password, chain, accountIndex = 0 }) {
  const { wallet, client } = await unlockXrpSigner({ password, chain, accountIndex });
  try {
    const balance = await client.getXrpBalance(wallet.classicAddress);
    return {
      address: wallet.classicAddress,
      balance,
      raw: xrpToDrops(balance),
      symbol: "XRP"
    };
  } finally {
    await safeDisconnect(client);
  }
}

export async function getXrplIssuedTokenBalance({ password, chain, tokenId, symbol = "TOKEN", accountIndex = 0 }) {
  const { wallet, client } = await unlockXrpSigner({ password, chain, accountIndex });
  try {
    const { currency, issuer } = parseIssuedTokenId(tokenId);
    const response = await client.request({ command: "account_lines", account: wallet.classicAddress, peer: issuer });
    const line = (response.result.lines ?? []).find((item) =>
      item.account === issuer && normalizeCurrency(item.currency) === normalizeCurrency(currency)
    );
    return {
      address: wallet.classicAddress,
      balance: line?.balance ?? "0",
      raw: line?.balance ?? "0",
      symbol,
      currency,
      issuer
    };
  } finally {
    await safeDisconnect(client);
  }
}

export async function deriveXrpAddress({ password, accountIndex = 0 }) {
  const vault = await unlockVault(password);
  const wallet = deriveWallet(vault, accountIndex);
  return wallet.classicAddress;
}

export async function sendXrpNative({ password, chain, to, amount, accountIndex = 0 }) {
  assertXrpAddress(to);
  const { wallet, client } = await unlockXrpSigner({ password, chain, accountIndex });
  try {
    const tx = await client.autofill({
      TransactionType: "Payment",
      Account: wallet.classicAddress,
      Destination: to.trim(),
      Amount: xrpToDrops(String(amount))
    });
    const signed = wallet.sign(tx);
    const result = await client.submitAndWait(signed.tx_blob);
    const hash = result.result.hash;
    return { hash, explorer: explorerTxUrl(chain, hash) };
  } finally {
    await safeDisconnect(client);
  }
}

export async function sendXrplIssuedToken({ password, chain, tokenId, to, amount, accountIndex = 0 }) {
  assertXrpAddress(to);
  const { currency, issuer } = parseIssuedTokenId(tokenId);
  const { wallet, client } = await unlockXrpSigner({ password, chain, accountIndex });
  try {
    const tx = await client.autofill({
      TransactionType: "Payment",
      Account: wallet.classicAddress,
      Destination: to.trim(),
      Amount: {
        currency,
        issuer,
        value: String(amount)
      }
    });
    const signed = wallet.sign(tx);
    const result = await client.submitAndWait(signed.tx_blob);
    const hash = result.result.hash;
    return { hash, explorer: explorerTxUrl(chain, hash) };
  } finally {
    await safeDisconnect(client);
  }
}

async function unlockXrpSigner({ password, chain, accountIndex }) {
  const vault = await unlockVault(password);
  const wallet = deriveWallet(vault, accountIndex);
  const client = new Client(xrplRpc(chain));
  await client.connect();
  return { wallet, client };
}

function deriveWallet(vault, accountIndex) {
  if (!vault.phrase) throw new Error("Vault does not contain a mnemonic phrase.");
  return Wallet.fromMnemonic(vault.phrase.trim().toLowerCase(), {
    derivationPath: `m/44'/${XRP_DERIVATION_PURPOSE}'/0'/0/${accountIndex}`
  });
}

function xrplRpc(chain) {
  return chain?.rpc?.startsWith("ws") ? chain.rpc : DEFAULT_XRPL_RPC;
}

function parseIssuedTokenId(tokenId) {
  const [currency, issuer] = String(tokenId ?? "").split(".");
  if (!currency || !issuer) throw new Error("XRPL issued token id must be currency.issuer.");
  assertXrpAddress(issuer);
  return { currency, issuer };
}

function assertXrpAddress(address) {
  if (!isValidClassicAddress(String(address ?? "").trim())) throw new Error("Invalid XRP Ledger address.");
}

function normalizeCurrency(currency) {
  return String(currency ?? "").toUpperCase().padEnd(40, "0");
}

async function safeDisconnect(client) {
  try {
    await client.disconnect();
  } catch {
    // Best effort cleanup for websocket clients.
  }
}

function explorerTxUrl(chain, hash) {
  const explorer = chain?.explorer?.startsWith("http") ? chain.explorer.replace(/\/$/, "") : "https://xrpscan.com";
  return `${explorer}/tx/${hash}`;
}
