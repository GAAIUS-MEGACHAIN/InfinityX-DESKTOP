import { deriveEvmAddress, getErc20TokenBalance, getEvmWalletState, isSupportedEvmChain, sendErc20Token, sendEvmNative } from "./evmWallet.js";
import { getSolanaWalletState, getSplTokenBalance, IFX_MINT, sendSol, sendSplToken } from "./solanaWallet.js";

export function buildNativeAsset(chain) {
  return {
    id: `native:${chain.name}`,
    symbol: chain.native || chain.symbol,
    name: `${chain.name} Native`,
    network: chain.name,
    chains: [chain.name],
    contracts: [],
    native: true,
    action: "Native"
  };
}

export function assetKey(asset) {
  return asset?.id ?? `${asset?.symbol}:${asset?.name}:${asset?.network ?? ""}`;
}

export function getAssetListForChain(registry, chain) {
  const native = buildNativeAsset(chain);
  const source = chain.name === "Main"
    ? registry
    : registry.filter((asset) => (asset.chains ?? []).includes(chain.name) || asset.network === chain.name);
  const ifx = chain.name === "Solana"
    ? [{ id: "infinityx-ifx", symbol: "IFX", name: "InfinityX", network: "Solana", chains: ["Solana"], contracts: [{ chain: "Solana", address: IFX_MINT }], mint: IFX_MINT }]
    : [];
  const seen = new Set();
  return [native, ...ifx, ...source].filter((asset) => {
    const key = assetKey(asset);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function contractForChain(token, chainName) {
  if (!token) return "";
  if (String(token.symbol).toUpperCase() === "IFX" && chainName === "Solana") return IFX_MINT;
  if (token.mint && chainName === "Solana") return token.mint;
  if (token.contract && (!token.network || token.network === chainName || token.network === "Multi-chain")) return token.contract;
  return (token.contracts ?? []).find((contract) => contract.chain === chainName)?.address ?? "";
}

export function isNativeAsset(token, chain) {
  const symbol = String(token?.symbol ?? "").toUpperCase();
  const native = String(chain?.native ?? chain?.symbol ?? "").toUpperCase();
  return Boolean(token?.native || (symbol && native && symbol === native) || (chain?.name === "Ethereum" && symbol === "ETH"));
}

export function getAssetCapability({ chain, token }) {
  const native = isNativeAsset(token, chain);
  const contract = contractForChain(token, chain.name);
  if (chain.kind === "SVM") {
    const canUse = native || Boolean(contract);
    return {
      adapter: "solana",
      native,
      contract,
      canReceive: true,
      canBalance: canUse,
      canSend: canUse,
      canStake: native,
      reason: canUse
        ? "Live Solana/SPL send, receive, and balance are enabled. Native SOL staking is enabled."
        : `${token.symbol} has no Solana mint in the bundled registry. Import the SPL mint to send it.`
    };
  }
  if (chain.kind === "EVM" && isSupportedEvmChain(chain)) {
    const canUse = native || Boolean(contract);
    return {
      adapter: "evm",
      native,
      contract,
      canReceive: true,
      canBalance: canUse,
      canSend: canUse,
      canStake: false,
      reason: canUse
        ? "Live EVM native/ERC-20 send, receive, and balance are enabled for this network."
        : `${token.symbol} has no ${chain.name} contract in the bundled registry. Import the contract to send it.`
    };
  }
  return {
    adapter: "unsupported",
    native,
    contract,
    canReceive: false,
    canBalance: false,
    canSend: false,
    canStake: false,
    reason: `${chain.name} is listed, but InfinityX still needs a production signer/RPC/indexer adapter before real transactions can be enabled for this chain.`
  };
}

export async function getAssetReceiveState({ password, chain, token }) {
  const capability = getAssetCapability({ chain, token });
  if (!capability.canReceive) throw new Error(capability.reason);
  if (capability.adapter === "solana") {
    if (capability.native) {
      const state = await getSolanaWalletState({ password, rpcUrl: chain.rpc });
      return {
        adapter: capability.adapter,
        address: state.address,
        balance: state.sol,
        symbol: chain.native,
        contract: "",
        status: "Live Solana native balance loaded."
      };
    }
    const state = await getSplTokenBalance({ password, mint: capability.contract, rpcUrl: chain.rpc });
    return {
      adapter: capability.adapter,
      address: state.address,
      tokenAccount: state.tokenAccount,
      balance: state.uiAmount,
      symbol: token.symbol,
      contract: capability.contract,
      status: "Live SPL token balance loaded."
    };
  }
  if (capability.adapter === "evm") {
    if (capability.native) {
      const state = await getEvmWalletState({ password, chain });
      return {
        adapter: capability.adapter,
        address: state.address,
        balance: state.native,
        symbol: chain.native,
        contract: "",
        status: `Live ${chain.name} native balance loaded.`
      };
    }
    const state = await getErc20TokenBalance({ password, chain, tokenAddress: capability.contract, decimals: token.decimals });
    return {
      adapter: capability.adapter,
      address: state.address,
      balance: state.uiAmount,
      symbol: token.symbol,
      contract: capability.contract,
      status: "Live ERC-20 token balance loaded."
    };
  }
  throw new Error(capability.reason);
}

export async function getReceiveAddressOnly({ password, chain }) {
  if (chain.kind === "SVM") {
    const state = await getSolanaWalletState({ password, rpcUrl: chain.rpc });
    return state.address;
  }
  if (chain.kind === "EVM" && isSupportedEvmChain(chain)) {
    return deriveEvmAddress({ password });
  }
  throw new Error(`${chain.name} does not have a receive-address adapter yet.`);
}

export async function sendUniversalAsset({ password, chain, token, recipient, amount }) {
  const capability = getAssetCapability({ chain, token });
  if (!capability.canSend) throw new Error(capability.reason);
  if (capability.adapter === "solana") {
    const result = capability.native
      ? await sendSol({ password, to: recipient, amountSol: amount, rpcUrl: chain.rpc })
      : await sendSplToken({ password, to: recipient, amount, mint: capability.contract, rpcUrl: chain.rpc });
    return { ...result, network: chain.name, adapter: capability.adapter };
  }
  if (capability.adapter === "evm") {
    const result = capability.native
      ? await sendEvmNative({ password, chain, to: recipient, amount })
      : await sendErc20Token({ password, chain, tokenAddress: capability.contract, to: recipient, amount, decimals: token.decimals });
    return { ...result, network: chain.name, adapter: capability.adapter };
  }
  throw new Error(capability.reason);
}
