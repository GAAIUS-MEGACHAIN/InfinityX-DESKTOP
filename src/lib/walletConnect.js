export async function initializeWalletConnect({ projectId, evmAddress, solanaAddress }) {
  if (!projectId) {
    throw new Error("Set VITE_WALLETCONNECT_PROJECT_ID from the WalletConnect dashboard first.");
  }
  const [{ Core }, { WalletKit }] = await Promise.all([
    import("@walletconnect/core"),
    import("@reown/walletkit")
  ]);
  const core = new Core({ projectId });
  const walletKit = await WalletKit.init({
    core,
    metadata: {
      name: "InfinityX Wallet",
      description: "Non-custodial InfinityX wallet for multi-chain dApps.",
      url: "https://github.com/GAAIUS-MEGACHAIN/InfinityX",
      icons: []
    }
  });
  return {
    walletKit,
    activeSessions: Object.keys(walletKit.getActiveSessions()).length,
    supportedAccounts: {
      evm: evmAddress ? [`eip155:1:${evmAddress}`, `eip155:137:${evmAddress}`, `eip155:8453:${evmAddress}`] : [],
      solana: solanaAddress ? [`solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ:${solanaAddress}`] : []
    }
  };
}
