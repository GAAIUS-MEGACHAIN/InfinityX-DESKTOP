import {
  Authorized,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  Lockup,
  PublicKey,
  StakeProgram,
  SystemProgram,
  Transaction
} from "@solana/web3.js";
import {
  AuthorityType,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToCheckedInstruction,
  createSetAuthorityInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { deriveSolanaKeypair, unlockVault } from "./vault.js";

export const SOLANA_MAINNET_RPC = "https://api.mainnet-beta.solana.com";
export const IFX_MINT = "4s9Bbk3AB223bbqAHhiCcqVg14C6m46ioixJFXMcunm1";
const SOLANA_RPC_FALLBACKS = [
  SOLANA_MAINNET_RPC,
  "https://solana-rpc.publicnode.com",
  "https://mainnet.helius-rpc.com/?api-key=public"
];

export async function getSolanaWalletState({ password, rpcUrl = SOLANA_MAINNET_RPC, accountIndex = 0 }) {
  const { keypair } = await unlockSolanaSigner({ password, accountIndex });
  const { result: lamports } = await withSolanaRpc(rpcUrl, (connection) => connection.getBalance(keypair.publicKey, "confirmed"));
  return {
    address: keypair.publicKey.toBase58(),
    sol: lamports / LAMPORTS_PER_SOL,
    lamports
  };
}

export async function getSplTokenBalance({
  password,
  mint = IFX_MINT,
  rpcUrl = SOLANA_MAINNET_RPC,
  accountIndex = 0
}) {
  const { keypair } = await unlockSolanaSigner({ password, accountIndex });
  const connection = await getHealthySolanaConnection(rpcUrl);
  const mintPubkey = parseSolanaAddress(mint);
  const mintInfo = await getMint(connection, mintPubkey, "confirmed");
  const ownerAta = await getAssociatedTokenAddress(mintPubkey, keypair.publicKey);
  try {
    const account = await getAccount(connection, ownerAta, "confirmed");
    return {
      address: keypair.publicKey.toBase58(),
      tokenAccount: ownerAta.toBase58(),
      raw: account.amount.toString(),
      decimals: mintInfo.decimals,
      uiAmount: formatTokenUnits(account.amount, mintInfo.decimals)
    };
  } catch (error) {
    if (String(error?.message ?? "").includes("TokenAccountNotFound") || String(error?.name ?? "").includes("TokenAccountNotFound")) {
      return {
        address: keypair.publicKey.toBase58(),
        tokenAccount: ownerAta.toBase58(),
        raw: "0",
        decimals: mintInfo.decimals,
        uiAmount: "0"
      };
    }
    throw error;
  }
}

export async function sendSol({ password, to, amountSol, rpcUrl = SOLANA_MAINNET_RPC, accountIndex = 0 }) {
  const { keypair } = await unlockSolanaSigner({ password, accountIndex });
  const connection = await getHealthySolanaConnection(rpcUrl);
  const recipient = parseSolanaAddress(to);
  const lamports = parseSolAmount(amountSol);
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: keypair.publicKey,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight
  }).add(SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: recipient, lamports }));

  transaction.sign(keypair);
  await assertSolanaSimulation(connection, transaction);
  const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return { signature, explorer: `https://solscan.io/tx/${signature}` };
}

export async function sendSplToken({
  password,
  to,
  amount,
  mint = IFX_MINT,
  rpcUrl = SOLANA_MAINNET_RPC,
  accountIndex = 0
}) {
  const { keypair } = await unlockSolanaSigner({ password, accountIndex });
  const connection = await getHealthySolanaConnection(rpcUrl);
  const mintPubkey = parseSolanaAddress(mint);
  const recipientOwner = parseSolanaAddress(to);
  const mintInfo = await getMint(connection, mintPubkey, "confirmed");
  const sourceAta = await getAssociatedTokenAddress(mintPubkey, keypair.publicKey);
  const destinationAta = await getAssociatedTokenAddress(mintPubkey, recipientOwner);
  await getAccount(connection, sourceAta, "confirmed");

  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: keypair.publicKey,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight
  });

  const destinationInfo = await connection.getAccountInfo(destinationAta, "confirmed");
  if (!destinationInfo) {
    transaction.add(createAssociatedTokenAccountInstruction(keypair.publicKey, destinationAta, recipientOwner, mintPubkey));
  }

  transaction.add(createTransferCheckedInstruction(
    sourceAta,
    mintPubkey,
    destinationAta,
    keypair.publicKey,
    parseTokenUnits(amount, mintInfo.decimals),
    mintInfo.decimals
  ));

  transaction.sign(keypair);
  await assertSolanaSimulation(connection, transaction);
  const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return { signature, explorer: `https://solscan.io/tx/${signature}` };
}

export async function quoteSolanaTokenCreation({ rpcUrl = SOLANA_MAINNET_RPC } = {}) {
  const connection = await getHealthySolanaConnection(rpcUrl);
  const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  const ataRent = await connection.getMinimumBalanceForRentExemption(165);
  const networkLamports = mintRent + ataRent + 10000;
  return {
    networkLamports,
    networkSol: networkLamports / LAMPORTS_PER_SOL,
    serviceFeeIfx: 25,
    serviceFeeDiscountIfx: 12.5
  };
}

export async function createSolanaSplToken({
  password,
  name,
  symbol,
  decimals = 9,
  supply,
  revokeMintAuthority = false,
  rpcUrl = SOLANA_MAINNET_RPC,
  accountIndex = 0
}) {
  if (!name?.trim() || !symbol?.trim()) throw new Error("Token name and symbol are required.");
  const tokenDecimals = Number(decimals);
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 9) throw new Error("Solana token decimals must be 0-9.");
  const { keypair } = await unlockSolanaSigner({ password, accountIndex });
  const connection = await getHealthySolanaConnection(rpcUrl);
  const mintKeypair = Keypair.generate();
  const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  const ownerAta = await getAssociatedTokenAddress(mintKeypair.publicKey, keypair.publicKey);
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: keypair.publicKey,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight
  });

  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: keypair.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID
    }),
    createInitializeMintInstruction(mintKeypair.publicKey, tokenDecimals, keypair.publicKey, null),
    createAssociatedTokenAccountInstruction(keypair.publicKey, ownerAta, keypair.publicKey, mintKeypair.publicKey),
    createMintToCheckedInstruction(
      mintKeypair.publicKey,
      ownerAta,
      keypair.publicKey,
      parseTokenUnits(supply, tokenDecimals),
      tokenDecimals
    )
  );

  if (revokeMintAuthority) {
    transaction.add(createSetAuthorityInstruction(mintKeypair.publicKey, keypair.publicKey, AuthorityType.MintTokens, null));
  }

  transaction.sign(keypair, mintKeypair);
  await assertSolanaSimulation(connection, transaction);
  const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return {
    signature,
    mint: mintKeypair.publicKey.toBase58(),
    ownerTokenAccount: ownerAta.toBase58(),
    explorer: `https://solscan.io/token/${mintKeypair.publicKey.toBase58()}`
  };
}

export async function createAndDelegateSolStake({
  password,
  amountSol,
  voteAddress,
  rpcUrl = SOLANA_MAINNET_RPC,
  accountIndex = 0
}) {
  const { keypair } = await unlockSolanaSigner({ password, accountIndex });
  const connection = await getHealthySolanaConnection(rpcUrl);
  const votePubkey = parseSolanaAddress(voteAddress);
  const stakeAccount = Keypair.generate();
  const rent = await connection.getMinimumBalanceForRentExemption(StakeProgram.space);
  const stakeLamports = parseSolAmount(amountSol);
  const latest = await connection.getLatestBlockhash("confirmed");
  const authorized = new Authorized(keypair.publicKey, keypair.publicKey);
  const lockup = new Lockup(0, 0, keypair.publicKey);
  const transaction = new Transaction({
    feePayer: keypair.publicKey,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight
  }).add(
    StakeProgram.createAccount({
      fromPubkey: keypair.publicKey,
      stakePubkey: stakeAccount.publicKey,
      authorized,
      lockup,
      lamports: stakeLamports + rent
    }),
    StakeProgram.delegate({
      stakePubkey: stakeAccount.publicKey,
      authorizedPubkey: keypair.publicKey,
      votePubkey
    })
  );

  transaction.sign(keypair, stakeAccount);
  await assertSolanaSimulation(connection, transaction);
  const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return {
    signature,
    stakeAccount: stakeAccount.publicKey.toBase58(),
    explorer: `https://solscan.io/tx/${signature}`
  };
}

export function parseSolanaAddress(value) {
  try {
    return new PublicKey(String(value).trim());
  } catch {
    throw new Error("Invalid Solana address.");
  }
}

export function parseTokenUnits(value, decimals) {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("Enter a valid token amount.");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new Error(`Token supports only ${decimals} decimals.`);
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

function formatTokenUnits(value, decimals) {
  const raw = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = raw % base;
  if (fraction === 0n) return whole.toString();
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fractionText}`;
}

async function unlockSolanaSigner({ password, accountIndex }) {
  const vault = await unlockVault(password);
  if (!vault.phrase) throw new Error("Vault does not contain a mnemonic phrase.");
  return {
    keypair: deriveSolanaKeypair(vault.phrase, accountIndex)
  };
}

async function withSolanaRpc(rpcUrl, fn) {
  const errors = [];
  for (const candidate of rpcCandidates(rpcUrl)) {
    const connection = new Connection(candidate, "confirmed");
    try {
      return { result: await fn(connection), rpcUrl: candidate };
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
    }
  }
  throw new Error(`All Solana RPCs failed. ${errors.join(" | ")}`);
}

async function getHealthySolanaConnection(rpcUrl) {
  const { result } = await withSolanaRpc(rpcUrl, async (connection) => {
    await connection.getLatestBlockhash("confirmed");
    return connection;
  });
  return result;
}

function rpcCandidates(rpcUrl) {
  return [...new Set([rpcUrl, ...SOLANA_RPC_FALLBACKS].filter(Boolean))];
}

async function assertSolanaSimulation(connection, transaction) {
  const simulation = await connection.simulateTransaction(transaction);
  if (simulation.value.err) {
    throw new Error(`Solana simulation failed: ${JSON.stringify(simulation.value.err)}`);
  }
}

function parseSolAmount(value) {
  const lamports = Number(value) * LAMPORTS_PER_SOL;
  if (!Number.isFinite(lamports) || lamports <= 0) throw new Error("Enter a valid SOL amount.");
  if (!Number.isSafeInteger(Math.round(lamports))) throw new Error("Amount is too large for this device.");
  return Math.round(lamports);
}
