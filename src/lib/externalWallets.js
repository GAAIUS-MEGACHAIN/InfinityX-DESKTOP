export async function connectInjectedWallet(wallet) {
  if (wallet === "phantom") {
    const provider = globalThis.phantom?.solana ?? globalThis.solana;
    if (!provider?.isPhantom) throw new Error("Phantom provider not found on this device/browser.");
    const response = await provider.connect();
    return { wallet: "Phantom", address: response.publicKey?.toString() };
  }

  const ethereumProvider = findEthereumProvider(wallet);
  if (!ethereumProvider) throw new Error(`${walletLabel(wallet)} provider not found.`);
  const accounts = await ethereumProvider.request({ method: "eth_requestAccounts" });
  return { wallet: walletLabel(wallet), address: accounts?.[0] };
}

export function walletAvailability() {
  return {
    phantom: Boolean(globalThis.phantom?.solana?.isPhantom || globalThis.solana?.isPhantom),
    metamask: Boolean(findEthereumProvider("metamask")),
    coinbase: Boolean(findEthereumProvider("coinbase")),
    trust: Boolean(findEthereumProvider("trust")),
    ethereum: Boolean(globalThis.ethereum)
  };
}

function findEthereumProvider(wallet) {
  const ethereum = globalThis.ethereum;
  const providers = ethereum?.providers ?? [ethereum].filter(Boolean);
  if (wallet === "metamask") return providers.find((provider) => provider?.isMetaMask);
  if (wallet === "coinbase") return providers.find((provider) => provider?.isCoinbaseWallet);
  if (wallet === "trust") return providers.find((provider) => provider?.isTrust || provider?.isTrustWallet);
  return providers[0];
}

function walletLabel(wallet) {
  return {
    metamask: "MetaMask",
    coinbase: "Coinbase Wallet",
    trust: "Trust Wallet",
    ethereum: "Injected EVM Wallet"
  }[wallet] ?? wallet;
}
