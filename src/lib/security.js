import { isAddress } from "viem";
import { parseSolanaAddress } from "./solanaWallet.js";

export function explainSendRisk({ chain, assetType, recipient, amount, tokenAddress }) {
  const warnings = [];
  if (!recipient) warnings.push("Recipient address is empty.");
  if (!amount || Number(amount) <= 0) warnings.push("Amount must be greater than zero.");

  if (chain.kind === "SVM" || chain.name === "Main") {
    try {
      if (recipient) parseSolanaAddress(recipient);
    } catch {
      warnings.push("Recipient is not a valid Solana address.");
    }
    if (assetType !== "native" && tokenAddress) {
      try {
        parseSolanaAddress(tokenAddress);
      } catch {
        warnings.push("Token mint is not a valid Solana mint address.");
      }
    }
  }

  if (chain.kind === "EVM") {
    if (recipient && !isAddress(recipient)) warnings.push("Recipient is not a valid EVM address.");
    if (assetType !== "native" && tokenAddress && !isAddress(tokenAddress)) warnings.push("Token contract is not a valid EVM address.");
  }

  if (assetType !== "native") {
    warnings.push("Token transfers depend on the token contract/mint and can fail if decimals or balance are wrong.");
  }

  return warnings.length ? warnings : ["Looks valid. The wallet will still simulate or estimate before broadcasting."];
}
