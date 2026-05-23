export async function initializeWalletConnect({ projectId, evmAddress, solanaAddress, onProposal, onRequest }) {
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
  if (onProposal) walletKit.on("session_proposal", onProposal);
  if (onRequest) walletKit.on("session_request", onRequest);
  return {
    walletKit,
    activeSessions: Object.keys(walletKit.getActiveSessions()).length,
    supportedAccounts: {
      evm: evmAddress ? [`eip155:1:${evmAddress}`, `eip155:137:${evmAddress}`, `eip155:8453:${evmAddress}`] : [],
      solana: solanaAddress ? [`solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ:${solanaAddress}`] : []
    }
  };
}

export async function approveWalletConnectProposal({ walletKit, proposal, evmAddress, solanaAddress }) {
  const eip155Accounts = evmAddress ? [
    `eip155:1:${evmAddress}`,
    `eip155:137:${evmAddress}`,
    `eip155:56:${evmAddress}`,
    `eip155:8453:${evmAddress}`,
    `eip155:42161:${evmAddress}`,
    `eip155:10:${evmAddress}`,
    `eip155:43114:${evmAddress}`
  ] : [];
  const solanaAccounts = solanaAddress ? [`solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ:${solanaAddress}`] : [];
  return walletKit.approveSession({
    id: proposal.id,
    namespaces: {
      eip155: {
        accounts: eip155Accounts,
        methods: ["eth_sendTransaction", "personal_sign", "eth_signTypedData", "wallet_switchEthereumChain"],
        events: ["accountsChanged", "chainChanged"]
      },
      solana: {
        accounts: solanaAccounts,
        methods: ["solana_signTransaction", "solana_signMessage"],
        events: ["accountsChanged"]
      }
    }
  });
}

export async function rejectWalletConnectProposal({ walletKit, proposal, reason = "User rejected" }) {
  return walletKit.rejectSession({ id: proposal.id, reason: { code: 5000, message: reason } });
}

export async function rejectWalletConnectRequest({ walletKit, request, reason = "User rejected" }) {
  return walletKit.respondSessionRequest({
    topic: request.topic,
    response: {
      id: request.params?.request?.id ?? request.id,
      jsonrpc: "2.0",
      error: { code: 5000, message: reason }
    }
  });
}
