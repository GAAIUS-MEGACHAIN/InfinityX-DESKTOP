import { deriveEvmAddress, getErc20TokenBalance, getEvmWalletState, isSupportedEvmChain, sendErc20Token, sendEvmNative } from "./evmWallet.js";
import { getSolanaWalletState, getSplTokenBalance, IFX_MINT, sendSol, sendSplToken } from "./solanaWallet.js";

const SUPPORTED_UTXO_CHAINS = new Set(["Bitcoin", "Litecoin", "Dogecoin", "Dash"]);
const SUPPORTED_COSMOS_CHAINS = new Set(["Cosmos Hub", "Osmosis", "Celestia", "Stargaze", "Juno", "Akash", "Kujira", "Secret Network", "Stride", "Evmos", "Coreum"]);
const SUPPORTED_TRON_CHAINS = new Set(["Tron"]);
const SUPPORTED_XRP_CHAINS = new Set(["XRP Ledger"]);
const CHAIN_ALIASES = {
  binancecoin: "bnbchain",
  core: "coreum",
  cronozkevm: "cronoszkevm",
  cronoszkevm: "cronoszkevm",
  eos: "eosevm",
  eosevm: "eosevm",
  ethereumclassic: "ethereumclassic",
  etherlink: "etherlinkmainnet",
  evmos: "evmos",
  flarenetwork: "flare",
  harmonyshard0: "harmony",
  hyperliquid: "hyperevm",
  hyperevm: "hyperevm",
  klaytoken: "kaia",
  kcc: "kccmainnet",
  kccmainnet: "kccmainnet",
  kucoincommunitychain: "kccmainnet",
  megaeth: "megaethmainnet",
  metall2: "metall2",
  monad: "monad",
  tron: "tron",
  tronnetwork: "tron",
  sei2: "seievm",
  seiv2: "seievm",
  shido: "shidonetwork",
  soneium: "soneium",
  wemixnetwork: "wemix",
  xdcnetwork: "xdcnetwork",
  xrp: "xrpledger",
  xrpl: "xrpledger",
  xrpledger: "xrpledger",
  xlayer: "xlayermainnet",
  xdai: "gnosis"
};

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
  const normalizedChain = canonicalChain(chain.name);
  const source = chain.name === "Main"
    ? registry
    : registry.filter((asset) =>
      (asset.chains ?? []).some((item) => canonicalChain(item) === normalizedChain) ||
      canonicalChain(asset.network) === normalizedChain ||
      (asset.contracts ?? []).some((contract) => canonicalChain(contract.chain ?? contract.platform) === normalizedChain)
    );
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
  if (token.contract && (!token.network || canonicalChain(token.network) === canonicalChain(chainName) || token.network === "Multi-chain")) return token.contract;
  return (token.contracts ?? []).find((contract) => canonicalChain(contract.chain ?? contract.platform) === canonicalChain(chainName))?.address ?? "";
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
  if ((chain.kind === "UTXO" || chain.kind === "UTXO/EVM") && SUPPORTED_UTXO_CHAINS.has(chain.name)) {
    const canUse = native;
    const canSend = canUse;
    return {
      adapter: "utxo",
      native,
      contract,
      canReceive: canUse,
      canBalance: canUse,
      canSend,
      canStake: false,
      reason: canUse
        ? `Live ${chain.name} native receive, balance, and UTXO send are enabled through the UTXO adapter.`
        : `${chain.name} supports native UTXO coins only in this adapter.`
    };
  }
  if ((chain.kind === "Cosmos" || chain.kind === "Cosmos/EVM") && SUPPORTED_COSMOS_CHAINS.has(chain.name)) {
    const canUse = native || Boolean(contract);
    return {
      adapter: "cosmos",
      native,
      contract,
      canReceive: canUse,
      canBalance: canUse,
      canSend: canUse,
      canStake: false,
      reason: canUse
        ? `Live ${chain.name} bank-token receive, balance, and send are enabled through the Cosmos adapter.`
        : `${token.symbol} has no ${chain.name} denom in the bundled registry.`
    };
  }
  if (SUPPORTED_TRON_CHAINS.has(chain.name)) {
    const canUse = native || Boolean(contract);
    return {
      adapter: "tron",
      native,
      contract,
      canReceive: canUse,
      canBalance: canUse,
      canSend: canUse,
      canStake: false,
      reason: canUse
        ? "Live TRON native/TRC-20 send, receive, and balance are enabled."
        : `${token.symbol} has no TRON TRC-20 contract in the bundled registry. Import the TRC-20 contract to send it.`
    };
  }
  if (SUPPORTED_XRP_CHAINS.has(chain.name)) {
    const canUse = native || Boolean(contract);
    return {
      adapter: "xrpl",
      native,
      contract,
      canReceive: canUse,
      canBalance: canUse,
      canSend: canUse,
      canStake: false,
      reason: canUse
        ? "Live XRP Ledger native/issued-token send, receive, and balance are enabled."
        : `${token.symbol} has no XRP Ledger issued-token id in the bundled registry. Import currency.issuer to send it.`
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
  if (capability.adapter === "utxo") {
    const { getUtxoWalletState } = await import("./utxoWallet.js");
    const state = await getUtxoWalletState({ password, chain });
    return {
      adapter: capability.adapter,
      address: state.address,
      balance: state.balance,
      symbol: state.symbol,
      contract: "",
      status: `Live ${chain.name} UTXO balance loaded.`
    };
  }
  if (capability.adapter === "cosmos") {
    const { getCosmosWalletState } = await import("./cosmosWallet.js");
    const state = await getCosmosWalletState({
      password,
      chain,
      denom: capability.native ? undefined : capability.contract,
      decimals: token.decimals,
      symbol: capability.native ? undefined : token.symbol
    });
    return {
      adapter: capability.adapter,
      address: state.address,
      balance: state.balance,
      symbol: state.symbol,
      contract: state.denom,
      status: `Live ${chain.name} Cosmos balance loaded.`
    };
  }
  if (capability.adapter === "tron") {
    const { getTronWalletState, getTrc20TokenBalance } = await import("./tronWallet.js");
    if (capability.native) {
      const state = await getTronWalletState({ password, chain });
      return {
        adapter: capability.adapter,
        address: state.address,
        balance: state.balance,
        symbol: state.symbol,
        contract: "",
        status: "Live TRON native balance loaded."
      };
    }
    const state = await getTrc20TokenBalance({
      password,
      chain,
      tokenAddress: capability.contract,
      decimals: token.decimals,
      symbol: token.symbol
    });
    return {
      adapter: capability.adapter,
      address: state.address,
      balance: state.uiAmount,
      symbol: state.symbol,
      contract: capability.contract,
      status: "Live TRC-20 token balance loaded."
    };
  }
  if (capability.adapter === "xrpl") {
    const { getXrpWalletState, getXrplIssuedTokenBalance } = await import("./xrpWallet.js");
    if (capability.native) {
      const state = await getXrpWalletState({ password, chain });
      return {
        adapter: capability.adapter,
        address: state.address,
        balance: state.balance,
        symbol: state.symbol,
        contract: "",
        status: "Live XRP Ledger native balance loaded."
      };
    }
    const state = await getXrplIssuedTokenBalance({
      password,
      chain,
      tokenId: capability.contract,
      symbol: token.symbol
    });
    return {
      adapter: capability.adapter,
      address: state.address,
      balance: state.balance,
      symbol: state.symbol,
      contract: capability.contract,
      status: "Live XRP Ledger issued-token balance loaded."
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
  if ((chain.kind === "UTXO" || chain.kind === "UTXO/EVM") && SUPPORTED_UTXO_CHAINS.has(chain.name)) {
    const { getUtxoWalletState } = await import("./utxoWallet.js");
    const state = await getUtxoWalletState({ password, chain });
    return state.address;
  }
  if ((chain.kind === "Cosmos" || chain.kind === "Cosmos/EVM") && SUPPORTED_COSMOS_CHAINS.has(chain.name)) {
    const { getCosmosWalletState } = await import("./cosmosWallet.js");
    const state = await getCosmosWalletState({ password, chain });
    return state.address;
  }
  if (SUPPORTED_TRON_CHAINS.has(chain.name)) {
    const { deriveTronAddress } = await import("./tronWallet.js");
    return deriveTronAddress({ password });
  }
  if (SUPPORTED_XRP_CHAINS.has(chain.name)) {
    const { deriveXrpAddress } = await import("./xrpWallet.js");
    return deriveXrpAddress({ password });
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
  if (capability.adapter === "utxo") {
    const { sendUtxoNative } = await import("./utxoWallet.js");
    const result = await sendUtxoNative({ password, chain, to: recipient, amount });
    return { ...result, network: chain.name, adapter: capability.adapter };
  }
  if (capability.adapter === "cosmos") {
    const { sendCosmosNative } = await import("./cosmosWallet.js");
    const result = await sendCosmosNative({
      password,
      chain,
      to: recipient,
      amount,
      denom: capability.native ? undefined : capability.contract,
      decimals: token.decimals,
      symbol: capability.native ? undefined : token.symbol
    });
    return { ...result, network: chain.name, adapter: capability.adapter };
  }
  if (capability.adapter === "tron") {
    const { sendTronNative, sendTrc20Token } = await import("./tronWallet.js");
    const result = capability.native
      ? await sendTronNative({ password, chain, to: recipient, amount })
      : await sendTrc20Token({ password, chain, tokenAddress: capability.contract, to: recipient, amount, decimals: token.decimals });
    return { ...result, network: chain.name, adapter: capability.adapter };
  }
  if (capability.adapter === "xrpl") {
    const { sendXrpNative, sendXrplIssuedToken } = await import("./xrpWallet.js");
    const result = capability.native
      ? await sendXrpNative({ password, chain, to: recipient, amount })
      : await sendXrplIssuedToken({ password, chain, tokenId: capability.contract, to: recipient, amount });
    return { ...result, network: chain.name, adapter: capability.adapter };
  }
  throw new Error(capability.reason);
}

function normalizeChain(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function canonicalChain(value) {
  const normalized = normalizeChain(value);
  return CHAIN_ALIASES[normalized] ?? normalized;
}
