import { Connection, VersionedTransaction } from "@solana/web3.js";
import { deriveSolanaKeypair, unlockVault } from "./vault.js";
import { SOLANA_MAINNET_RPC } from "./solanaWallet.js";

const JUPITER_SWAP_API = "https://api.jup.ag/swap/v1";

export async function getJupiterQuote({ inputMint, outputMint, amount, slippageBps = 50 }) {
  const url = new URL(`${JUPITER_SWAP_API}/quote`);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", String(amount));
  url.searchParams.set("slippageBps", String(slippageBps));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Jupiter quote failed: ${response.status}`);
  return response.json();
}

export async function executeJupiterSwap({ password, quoteResponse, rpcUrl = SOLANA_MAINNET_RPC, accountIndex = 0 }) {
  const vault = await unlockVault(password);
  const keypair = deriveSolanaKeypair(vault.phrase, accountIndex);
  const response = await fetch(`${JUPITER_SWAP_API}/swap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true
    })
  });
  if (!response.ok) throw new Error(`Jupiter swap build failed: ${response.status}`);
  const payload = await response.json();
  if (!payload.swapTransaction) throw new Error("Jupiter did not return a swap transaction.");

  const transaction = VersionedTransaction.deserialize(base64ToBytes(payload.swapTransaction));
  transaction.sign([keypair]);
  const connection = new Connection(rpcUrl, "confirmed");
  const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
  await connection.confirmTransaction(signature, "confirmed");
  return { signature, explorer: `https://solscan.io/tx/${signature}` };
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
