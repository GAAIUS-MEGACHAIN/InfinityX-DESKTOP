import "./polyfills.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownUp,
  BadgeDollarSign,
  Bell,
  BellRing,
  ChevronDown,
  CircleDollarSign,
  Compass,
  Copy,
  Fingerprint,
  Globe2,
  Import,
  KeyRound,
  Layers3,
  LockKeyhole,
  Plus,
  QrCode,
  ScanLine,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  UserCircle,
  UserRound,
  Users,
  Wallet,
  WalletCards,
  Zap
} from "lucide-react";
import "./styles.css";
import { createMnemonic, deriveSolanaAccount, saveVault, validateSeedPhrase } from "./lib/vault.js";
import { extraChains } from "./data/extraChains.js";
import { initializeGoogleSignIn } from "./lib/googleAuth.js";
import { getLifiBridgeQuote } from "./lib/bridge.js";
import { deriveEvmAddress, getErc20TokenBalance, getEvmWalletState, isSupportedEvmChain, sendErc20Token, sendEvmNative, sendEvmTransactionRequest } from "./lib/evmWallet.js";
import { connectInjectedWallet, walletAvailability } from "./lib/externalWallets.js";
import { executeJupiterSwap, getJupiterQuote } from "./lib/jupiter.js";
import { getNativeSecurityStatus, requireNativeSigningGate } from "./lib/nativeSecurity.js";
import { explainSendRisk } from "./lib/security.js";
import { createAndDelegateSolStake, createSolanaSplToken, getSolanaWalletState, getSplTokenBalance, IFX_MINT, quoteSolanaTokenCreation, sendSol, sendSplToken } from "./lib/solanaWallet.js";
import { approveWalletConnectProposal, initializeWalletConnect, rejectWalletConnectProposal, rejectWalletConnectRequest } from "./lib/walletConnect.js";

const SERVICE_FEE_BPS = 15;
const IFX_DISCOUNT = 50;
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_SOL_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const topAssets = [
  { symbol: "IFX", name: "InfinityX", network: "Solana", mint: IFX_MINT, action: "Open" },
  { symbol: "BTC", name: "Bitcoin", network: "Bitcoin", action: "Track" },
  { symbol: "ETH", name: "Ethereum", network: "Ethereum", action: "Add" },
  { symbol: "SOL", name: "Solana", network: "Solana", action: "Add" },
  { symbol: "BNB", name: "BNB", network: "BNB Chain", action: "Add" },
  { symbol: "XRP", name: "XRP", network: "XRP Ledger", action: "Add" },
  { symbol: "USDC", name: "USD Coin", network: "Multi-chain", action: "Add" },
  { symbol: "DOGE", name: "Dogecoin", network: "Dogecoin", action: "Track" },
  { symbol: "ADA", name: "Cardano", network: "Cardano", action: "Track" }
];

const chains = [
  { name: "Main", symbol: "IFX", kind: "InfinityX routing", rpc: "InfinityX backend registry", explorer: "InfinityX unified activity", native: "IFX" },
  { name: "Solana", symbol: "SOL", kind: "SVM", rpc: "https://api.mainnet-beta.solana.com", explorer: "https://solscan.io", native: "SOL" },
  { name: "Ethereum", symbol: "ETH", kind: "EVM", rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io", native: "ETH" },
  { name: "Polygon", symbol: "POL", kind: "EVM", rpc: "https://polygon-bor-rpc.publicnode.com", explorer: "https://polygonscan.com", native: "POL" },
  { name: "BNB Chain", symbol: "BNB", kind: "EVM", rpc: "https://bsc-rpc.publicnode.com", explorer: "https://bscscan.com", native: "BNB" },
  { name: "Base", symbol: "ETH", kind: "EVM", rpc: "https://base-rpc.publicnode.com", explorer: "https://basescan.org", native: "ETH" },
  { name: "Arbitrum", symbol: "ETH", kind: "EVM", rpc: "https://arbitrum-one-rpc.publicnode.com", explorer: "https://arbiscan.io", native: "ETH" },
  { name: "Optimism", symbol: "ETH", kind: "EVM", rpc: "https://optimism-rpc.publicnode.com", explorer: "https://optimistic.etherscan.io", native: "ETH" },
  { name: "Avalanche", symbol: "AVAX", kind: "EVM", rpc: "https://avalanche-c-chain-rpc.publicnode.com", explorer: "https://snowtrace.io", native: "AVAX" },
  { name: "Fantom", symbol: "FTM", kind: "EVM", rpc: "https://fantom-rpc.publicnode.com", explorer: "https://ftmscan.com", native: "FTM" },
  { name: "Bitcoin", symbol: "BTC", kind: "UTXO", rpc: "indexer-required", explorer: "https://mempool.space", native: "BTC" },
  { name: "Cardano", symbol: "ADA", kind: "UTXO", rpc: "indexer-required", explorer: "https://cardanoscan.io", native: "ADA" },
  { name: "XRP Ledger", symbol: "XRP", kind: "Account", rpc: "wss://xrplcluster.com", explorer: "https://xrpscan.com", native: "XRP" },
  ...extraChains
];

const chainTopTokens = {
  Main: topAssets,
  Solana: ["IFX", "SOL", "USDC", "JUP", "RAY", "PYTH", "BONK", "WIF", "ORCA", "HNT"].map((symbol) => ({ symbol, name: symbol === "IFX" ? "InfinityX" : symbol, network: "Solana", action: symbol === "SOL" ? "Native" : "Add" })),
  Ethereum: ["ETH", "USDT", "USDC", "WBTC", "LINK", "UNI", "AAVE", "MKR", "LDO", "PEPE"].map((symbol) => ({ symbol, name: symbol, network: "Ethereum", action: symbol === "ETH" ? "Native" : "Add" })),
  Polygon: ["POL", "USDC", "USDT", "WETH", "WBTC", "AAVE", "QUICK", "LINK", "SAND", "CRV"].map((symbol) => ({ symbol, name: symbol, network: "Polygon", action: symbol === "POL" ? "Native" : "Add" })),
  "BNB Chain": ["BNB", "USDT", "USDC", "CAKE", "FDUSD", "BTCB", "ETH", "XVS", "TWT", "FLOKI"].map((symbol) => ({ symbol, name: symbol, network: "BNB Chain", action: symbol === "BNB" ? "Native" : "Add" }))
};

const services = [
  { name: "Swap", fee: "0.15%", ifx: "0.075%", icon: ArrowDownUp },
  { name: "Bridge", fee: "0.20%", ifx: "0.10%", icon: Layers3 },
  { name: "DEX Routing", fee: "0.15%", ifx: "0.075%", icon: Zap },
  { name: "Buy IFX", fee: "0.25%", ifx: "0.125%", icon: ShoppingCart },
  { name: "Token Creation", fee: "0.25%", ifx: "0.125%", icon: Plus },
  { name: "Staking", fee: "0.10%", ifx: "0.05%", icon: BadgeDollarSign },
  { name: "QR Payments", fee: "0.10%", ifx: "0.05%", icon: QrCode },
  { name: "Portfolio", fee: "Free", ifx: "Free", icon: Wallet }
];

function App() {
  const [page, setPage] = useState("wallet");
  const [chain, setChain] = useState(chains[0]);
  const [chainOpen, setChainOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coins, setCoins] = useState([]);
  const [coinStatus, setCoinStatus] = useState("");
  const [dexStatus, setDexStatus] = useState("Ready for live Jupiter quotes");
  const [recoveryStatus, setRecoveryStatus] = useState("Choose a recovery method");
  const [customToken, setCustomToken] = useState({ contract: "", symbol: "", network: "Main" });
  const [selectedToken, setSelectedToken] = useState(null);
  const [registry, setRegistry] = useState([]);
  const [vaultStatus, setVaultStatus] = useState("No encrypted vault created yet");
  const [generatedPhrase, setGeneratedPhrase] = useState("");
  const [markets, setMarkets] = useState(null);
  const [dapps, setDapps] = useState([]);
  const [nfts, setNfts] = useState([]);
  const [metaverse, setMetaverse] = useState([]);
  const registryLoadedRef = useRef(false);

  const filteredCoins = useMemo(() => {
    const registrySource = registryForChain(registry, chain.name);
    const source = coins.length ? coins : (registrySource.length ? registrySource : (chainTopTokens[chain.name] ?? topAssets));
    const q = query.toLowerCase().trim();
    return source.filter((coin) => `${coin.name} ${coin.symbol} ${coin.network ?? ""}`.toLowerCase().includes(q)).slice(0, 80);
  }, [coins, query, chain.name, registry]);

  useEffect(() => {
    if (registryLoadedRef.current) return;
    registryLoadedRef.current = true;
    loadLocalRegistry({ silent: true }).catch((error) => setCoinStatus(`Local registry error: ${error.message}`));
  }, []);

  async function loadLocalRegistry({ silent = false } = {}) {
    if (!silent) setCoinStatus("Refreshing local token registry...");
    const response = await fetch("/registry/top-3000-tokens.json");
    if (!response.ok) {
      setCoinStatus(`Local registry error: ${response.status}`);
      return [];
    }
    const payload = await response.json();
    setRegistry(payload.assets ?? []);
    setCoinStatus(silent ? "" : `Local registry ready: ${payload.count} assets`);
    return payload.assets ?? [];
  }

  async function loadCoins() {
    const local = await loadLocalRegistry();
    if (local.length) return;
    setCoinStatus("Local registry is unavailable in this build.");
  }

  function openToken(token) {
    setSelectedToken(token);
    setPage("token");
  }

  async function quoteDex() {
    setDexStatus("Fetching live Jupiter quote...");
    try {
      const quote = await getJupiterQuote({ inputMint: WSOL_MINT, outputMint: USDC_SOL_MINT, amount: 100000000, slippageBps: 50 });
      setDexStatus(`0.1 SOL -> ${(Number(quote.outAmount) / 1_000_000).toFixed(4)} USDC before network fees`);
    } catch (error) {
      setDexStatus(`Quote error: ${error.message}`);
    }
  }

  async function setupPasskey() {
    if (!window.PublicKeyCredential) {
      setRecoveryStatus("Passkeys are not supported on this device/browser");
      return;
    }
    const native = await getNativeSecurityStatus();
    setRecoveryStatus(native.native ? `Native secure gate ready. Biometric available: ${native.biometricAvailable ? "yes" : "no"}. Hardware-backed key: ${native.hardwareBackedKey ? "yes" : "unknown"}.` : "Passkey support detected in browser. Android uses native biometric/keystore gate in the APK.");
  }

  function copyMint() {
    navigator.clipboard?.writeText(IFX_MINT);
  }

  function renderPage() {
    if (page === "dex") return <DexPage status={dexStatus} quoteDex={quoteDex} />;
    if (page === "send") return <SendPage chain={chain} />;
    if (page === "receive") return <ReceivePage chain={chain} />;
    if (page === "buy") return <BuyPage markets={markets} setMarkets={setMarkets} />;
    if (page === "add") return <AddTokenPage customToken={customToken} setCustomToken={setCustomToken} chain={chain} registry={registry} loadLocalRegistry={loadLocalRegistry} />;
    if (page === "create") return <CreateTokenPage />;
    if (page === "connect") return <ConnectPage setPage={setPage} />;
    if (page === "import") return <ImportPage setPage={setPage} />;
    if (page === "profile") return <ProfilePage setPage={setPage} />;
    if (page === "notifications") return <NotificationsPage />;
    if (page === "accounts") return <AccountsPage vaultStatus={vaultStatus} setVaultStatus={setVaultStatus} generatedPhrase={generatedPhrase} setGeneratedPhrase={setGeneratedPhrase} />;
    if (page === "services") return <ServicesPage setPage={setPage} />;
    if (page === "bridge") return <BridgePage />;
    if (page === "staking") return <StakingPage />;
    if (page === "dapps") return <RegistryPage title="dApps" path="/registry/dapps.json" field="dapps" items={dapps} setItems={setDapps} />;
    if (page === "nfts") return <RegistryPage title="NFTs" path="/registry/nfts.json" field="collections" items={nfts} setItems={setNfts} />;
    if (page === "metaverse") return <RegistryPage title="Metaverse API" path="/registry/metaverse.json" field="worlds" items={metaverse} setItems={setMetaverse} />;
    if (page === "walletconnect") return <WalletConnectPage />;
    if (page === "chains") return <ChainsPage selected={chain} setChain={setChain} />;
    if (page === "news") return <NewsPage coins={coins} loadCoins={loadCoins} status={coinStatus} />;
    if (page === "token") return <TokenDetailPage token={selectedToken} chain={chain} setPage={setPage} />;
    return <WalletPage chain={chain} filteredCoins={filteredCoins} query={query} setQuery={setQuery} loadCoins={loadCoins} setPage={setPage} setupPasskey={setupPasskey} recoveryStatus={recoveryStatus} setRecoveryStatus={setRecoveryStatus} coinStatus={coinStatus} openToken={openToken} />;
  }

  return (
    <main className="phone-shell">
      <section className="wallet-app">
        <header className="app-top">
          <button className="icon-button account-button" aria-label="Accounts" onClick={() => setPage("accounts")}><WalletCards size={20} /></button>
          <button className="network-pill" onClick={() => setChainOpen(!chainOpen)}>{chain.name} <ChevronDown size={16} /></button>
          <div className="top-right">
            <button className="icon-button" aria-label="Profile" onClick={() => setPage("profile")}><UserCircle size={20} /></button>
            <button className="icon-button" aria-label="Notifications" onClick={() => setPage("notifications")}><Bell size={20} /></button>
          </div>
        </header>

        {chainOpen && (
          <section className="chain-menu">
            {chains.map((item) => (
              <button key={item.name} onClick={() => { setChain(item); setChainOpen(false); setPage("wallet"); }}>
                <strong>{item.name}</strong><span>{item.kind} - {item.native}</span>
              </button>
            ))}
          </section>
        )}

        {renderPage()}

        <footer className="bottom-nav">
          <button className={page === "wallet" ? "active" : ""} onClick={() => setPage("wallet")}><Wallet size={20} /><span>Wallet</span></button>
          <button className={page === "dex" ? "active" : ""} onClick={() => setPage("dex")}><ArrowDownUp size={20} /><span>DEX</span></button>
          <button className={page === "dapps" ? "active" : ""} onClick={() => setPage("dapps")}><Globe2 size={20} /><span>dApps</span></button>
          <button className={page === "nfts" ? "active" : ""} onClick={() => setPage("nfts")}><Compass size={20} /><span>NFTs</span></button>
          <button className={page === "staking" ? "active" : ""} onClick={() => setPage("staking")}><BadgeDollarSign size={20} /><span>Stake</span></button>
          <button className={page === "services" ? "active" : ""} onClick={() => setPage("services")}><BadgeDollarSign size={20} /><span>Services</span></button>
        </footer>
      </section>
    </main>
  );
}

function WalletPage({ chain, filteredCoins, query, setQuery, loadCoins, setPage, setupPasskey, recoveryStatus, setRecoveryStatus, coinStatus, openToken }) {
  const liveChain = chain.name === "Main" ? chains.find((item) => item.name === "Solana") : chain;
  const [password, setPassword] = useState("");
  const [portfolio, setPortfolio] = useState(null);
  const [balanceStatus, setBalanceStatus] = useState("Unlock to read live on-chain balance.");

  async function unlockPortfolio() {
    setBalanceStatus(`Reading ${liveChain.name} balance...`);
    try {
      if (liveChain.kind === "SVM") {
        const state = await getSolanaWalletState({ password, rpcUrl: liveChain.rpc });
        setPortfolio({ balance: state.sol, symbol: liveChain.native, address: state.address });
        setBalanceStatus("Live Solana balance loaded.");
        return;
      }
      if (liveChain.kind === "EVM" && isSupportedEvmChain(liveChain)) {
        const state = await getEvmWalletState({ password, chain: liveChain });
        setPortfolio({ balance: state.native, symbol: liveChain.native, address: state.address });
        setBalanceStatus(`Live ${liveChain.name} balance loaded.`);
        return;
      }
      setPortfolio(null);
      setBalanceStatus(`${liveChain.name} needs its native signer/indexer adapter before live balances can be read here.`);
    } catch (error) {
      setPortfolio(null);
      setBalanceStatus(error.message);
    }
  }

  return (
    <>
      <section className="account-card">
        <div className="account-row">
          <div className="avatar">IX</div>
          <div><p>{chain.name} Portfolio</p><strong>Account 1</strong></div>
          <button aria-label="Scan QR"><QrCode size={19} /></button>
        </div>
        <div className="balance">
          <span>Live Portfolio Balance</span>
          <h1>{portfolio ? `${formatBalance(portfolio.balance)} ${portfolio.symbol}` : "--"}</h1>
          <p>{portfolio?.address ?? `${liveChain.name} assets and services`}</p>
        </div>
        <div className="balance-unlock">
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Vault password" />
          <button onClick={unlockPortfolio}>Unlock</button>
        </div>
        <p className="balance-note">{balanceStatus}</p>
        <div className="actions">
          <button onClick={() => setPage("send")}><Send size={20} /><span>Send</span></button>
          <button onClick={() => setPage("receive")}><ScanLine size={20} /><span>Receive</span></button>
          <button onClick={() => setPage("dex")}><ArrowDownUp size={20} /><span>Swap</span></button>
          <button onClick={() => setPage("buy")}><ShoppingCart size={20} /><span>Buy</span></button>
        </div>
      </section>
      <section className="quick-actions" aria-label="Wallet actions">
        <button onClick={() => setPage("create")}><Plus size={17} /><span>Create</span></button>
        <button onClick={() => setPage("connect")}><Zap size={17} /><span>Connect</span></button>
        <button onClick={() => setPage("import")}><Import size={17} /><span>Import</span></button>
        <button onClick={() => setPage("add")}><Plus size={17} /><span>Add</span></button>
      </section>
      <section className="search-card"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search local token registry" /><button aria-label="Refresh local registry" onClick={loadCoins}><Plus size={17} /></button></section>
      {coinStatus && <p className="status inline-status">{coinStatus}</p>}
      <section className="token-list">
        {filteredCoins.map((token) => (
          <button className="token-row" key={`${token.symbol}-${token.name}`} onClick={() => openToken(token)}>
            {token.image ? <img src={token.image} alt="" /> : <div className="token-icon">{token.symbol.slice(0, 2)}</div>}
            <div><strong>{token.name}</strong><span>{token.symbol} - {token.network ?? `Rank ${token.rank}`}</span></div>
            <em>{formatTokenRowMeta(token)}</em>
          </button>
        ))}
      </section>
      <section className="panel">
        <div className="section-title"><KeyRound size={20} /><strong>Recovery</strong></div>
        <div className="recovery-grid">
          <button onClick={setupPasskey}><Fingerprint size={18} /> Passkey</button>
          <button onClick={() => setRecoveryStatus("Biometrics require Android Keystore integration before live funds")}><ShieldCheck size={18} /> Biometrics</button>
          <button onClick={() => setRecoveryStatus("MPC requires audited distributed key shares and backend coordination")}><LockKeyhole size={18} /> MPC</button>
          <button onClick={() => setRecoveryStatus("Social recovery requires guardian contracts or audited recovery service")}><UserRound size={18} /> Social</button>
        </div>
        <p className="status">{recoveryStatus}</p>
      </section>
    </>
  );
}

function TokenDetailPage({ token, chain, setPage }) {
  const networks = useMemo(() => getTokenNetworks(token, chain), [token, chain]);
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [password, setPassword] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState("Unlock to read balance or enter a recipient to send.");
  const [walletState, setWalletState] = useState(null);

  useEffect(() => {
    setSelectedNetwork(networks[0] ?? chain.name);
    setWalletState(null);
    setStatus("Unlock to read balance or enter a recipient to send.");
  }, [networks, chain.name]);

  if (!token) {
    return <section className="page-card"><h2>Asset</h2><p>No asset selected.</p><button className="primary" onClick={() => setPage("wallet")}>Back to Wallet</button></section>;
  }

  const effectiveNetwork = selectedNetwork || networks[0] || chain.name;
  const selectedChain = chainByName(effectiveNetwork);
  const contract = contractForChain(token, effectiveNetwork);
  const native = isNativeAsset(token, selectedChain);
  const liveMode = liveSupportForAsset({ selectedChain, token, contract, native });
  const warnings = explainSendRisk({
    chain: selectedChain,
    assetType: native ? "native" : "token",
    recipient,
    amount,
    tokenAddress: contract
  });

  async function unlockAsset() {
    setStatus(`Reading ${token.symbol} on ${selectedChain.name}...`);
    try {
      if (selectedChain.kind === "SVM") {
        if (native) {
          const state = await getSolanaWalletState({ password, rpcUrl: selectedChain.rpc });
          setWalletState({ address: state.address, balance: state.sol, symbol: selectedChain.native });
          setStatus("Live Solana native balance loaded.");
          return;
        }
        if (!contract) throw new Error(`${token.symbol} has no Solana mint in the local registry.`);
        const state = await getSplTokenBalance({ password, mint: contract, rpcUrl: selectedChain.rpc });
        setWalletState({ address: state.address, tokenAccount: state.tokenAccount, balance: state.uiAmount, symbol: token.symbol });
        setStatus("Live SPL token balance loaded.");
        return;
      }
      if (selectedChain.kind === "EVM" && isSupportedEvmChain(selectedChain)) {
        if (native) {
          const state = await getEvmWalletState({ password, chain: selectedChain });
          setWalletState({ address: state.address, balance: state.native, symbol: selectedChain.native });
          setStatus(`Live ${selectedChain.name} native balance loaded.`);
          return;
        }
        if (!contract) throw new Error(`${token.symbol} has no ${selectedChain.name} contract in the local registry.`);
        const state = await getErc20TokenBalance({ password, chain: selectedChain, tokenAddress: contract, decimals: token.decimals });
        setWalletState({ address: state.address, balance: state.uiAmount, symbol: token.symbol });
        setStatus("Live ERC-20 token balance loaded.");
        return;
      }
      throw new Error(`${selectedChain.name} is in the registry, but live signing/indexing for this native chain is not bundled yet.`);
    } catch (error) {
      setWalletState(null);
      setStatus(error.message);
    }
  }

  async function sendAsset() {
    if (!confirmed) {
      setStatus("Tick the confirmation box after checking the recipient, chain, and amount.");
      return;
    }
    setStatus(`Signing ${token.symbol} on ${selectedChain.name}...`);
    try {
      await requireNativeSigningGate(`Approve ${token.symbol} send`);
      if (selectedChain.kind === "SVM") {
        const result = native
          ? await sendSol({ password, to: recipient, amountSol: amount, rpcUrl: selectedChain.rpc })
          : await sendSplToken({ password, to: recipient, amount, mint: contract, rpcUrl: selectedChain.rpc });
        setStatus(`Broadcast on Solana: ${result.signature}`);
        return;
      }
      if (selectedChain.kind === "EVM" && isSupportedEvmChain(selectedChain)) {
        const result = native
          ? await sendEvmNative({ password, chain: selectedChain, to: recipient, amount })
          : await sendErc20Token({ password, chain: selectedChain, tokenAddress: contract, to: recipient, amount, decimals: token.decimals });
        setStatus(`Broadcast on ${selectedChain.name}: ${result.hash}`);
        return;
      }
      throw new Error(`${selectedChain.name} needs a native signer/indexer adapter before live sends.`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  function stakeAsset() {
    if (selectedChain.name === "Solana" && native) {
      setPage("staking");
      return;
    }
    setStatus(stakingStatusFor(token, selectedChain));
  }

  return (
    <section className="page-card token-detail">
      <div className="token-detail-head">
        {token.image ? <img src={token.image} alt="" /> : <div className="token-icon">{token.symbol.slice(0, 2)}</div>}
        <div>
          <h2>{token.name}</h2>
          <p>{token.symbol} {token.rank ? `- Rank ${token.rank}` : ""}</p>
        </div>
      </div>
      <div className="token-metrics">
        <article><span>Price</span><strong>{token.priceUsd || token.price ? `$${Number(token.priceUsd ?? token.price).toLocaleString()}` : "Local registry"}</strong></article>
        <article><span>Network</span><strong>{selectedChain.name}</strong></article>
        <article><span>Balance</span><strong>{walletState ? `${formatBalance(walletState.balance)} ${walletState.symbol}` : "--"}</strong></article>
      </div>
      <div className="form-grid">
        <select value={effectiveNetwork} onChange={(event) => setSelectedNetwork(event.target.value)}>
          {networks.map((network) => <option key={network}>{network}</option>)}
        </select>
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Vault password" />
        <button className="primary" onClick={unlockAsset}><Wallet size={18} /> Show Balance / Receive</button>
      </div>
      {walletState && (
        <div className="receive-list">
          <article><strong>Receive address</strong><span>{walletState.address}</span><em>{contract ? `Contract/mint: ${contract}` : "Native asset"}</em></article>
          {walletState.tokenAccount && <article><strong>Token account</strong><span>{walletState.tokenAccount}</span></article>}
        </div>
      )}
      <div className="form-grid token-send-form">
        <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient address" />
        <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={`Amount of ${token.symbol}`} />
      </div>
      <div className="risk-box">{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>
      <label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I reviewed this real transaction.</label>
      <div className="detail-actions">
        <button className="primary danger" onClick={sendAsset}><Send size={18} /> Send</button>
        <button className="secondary" onClick={unlockAsset}><ScanLine size={18} /> Receive</button>
        <button className="secondary" onClick={stakeAsset}><BadgeDollarSign size={18} /> Stake</button>
      </div>
      <p className="status">{liveMode}</p>
      <p className="status">{status}</p>
    </section>
  );
}

function DexPage({ status, quoteDex }) {
  const [password, setPassword] = useState("");
  const [amount, setAmount] = useState("0.001");
  const [quote, setQuote] = useState(null);
  const [executionStatus, setExecutionStatus] = useState("Quote first. Execution signs locally from your encrypted vault.");
  const [confirmed, setConfirmed] = useState(false);

  async function quoteCustomSwap() {
    setExecutionStatus("Fetching executable Jupiter route...");
    try {
      const lamports = Math.round(Number(amount) * 1_000_000_000);
      if (!Number.isFinite(lamports) || lamports <= 0) throw new Error("Enter a valid SOL amount.");
      const nextQuote = await getJupiterQuote({ inputMint: WSOL_MINT, outputMint: USDC_SOL_MINT, amount: lamports, slippageBps: 50 });
      setQuote(nextQuote);
      setExecutionStatus(`${amount} SOL -> ${(Number(nextQuote.outAmount) / 1_000_000).toFixed(6)} USDC quoted`);
    } catch (error) {
      setExecutionStatus(error.message);
    }
  }

  async function executeSwap() {
    if (!quote || !confirmed) {
      setExecutionStatus("Tick the confirmation box after reviewing the quote.");
      return;
    }
    setExecutionStatus("Signing and broadcasting Jupiter swap...");
    try {
      await requireNativeSigningGate("Approve InfinityX swap signing");
      const result = await executeJupiterSwap({ password, quoteResponse: quote });
      setExecutionStatus(`Swap sent: ${result.signature}`);
    } catch (error) {
      setExecutionStatus(error.message);
    }
  }

  return (
    <section className="page-card">
      <h2>InfinityX DEX</h2>
      <p>Live quote routing uses Jupiter on Solana. Signed execution is handled locally by the wallet.</p>
      <div className="swap-box"><label>From</label><input value={amount} onChange={(event) => setAmount(event.target.value)} /><strong>SOL</strong></div>
      <div className="swap-box"><label>To</label><strong>USDC</strong></div>
      <button className="primary" onClick={quoteCustomSwap}><Zap size={18} /> Build Live Quote</button>
      <button className="secondary" onClick={quoteDex}><Globe2 size={18} /> Quick 0.1 SOL Quote</button>
      <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Vault password for swap execution" />
      <label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I reviewed the route and want to broadcast this real swap.</label>
      <button className="primary danger" onClick={executeSwap}><ArrowDownUp size={18} /> Sign and Swap</button>
      <p className="status">{executionStatus}</p>
      <p className="status">{status}</p>
      <div className="fee-note">Service fee: {SERVICE_FEE_BPS / 100}% - IFX holders pay {IFX_DISCOUNT}% less.</div>
    </section>
  );
}

function ServicesPage({ setPage }) {
  const quick = [
    { name: "Bridge", page: "bridge", icon: Layers3 },
    { name: "dApps", page: "dapps", icon: Globe2 },
    { name: "NFTs", page: "nfts", icon: Compass },
    { name: "Metaverse API", page: "metaverse", icon: Layers3 },
    { name: "WalletConnect", page: "walletconnect", icon: Zap }
  ];
  return (
    <section className="page-card">
      <h2>Services</h2>
      <p>Small service fees with IFX discounts.</p>
      <div className="service-grid">{services.map((service) => { const Icon = service.icon; return <article key={service.name}><Icon size={20} /><strong>{service.name}</strong><span>{service.fee}</span><em>IFX {service.ifx}</em></article>; })}</div>
      <div className="profile-list service-links">{quick.map(({ name, page, icon: Icon }) => <button key={name} onClick={() => setPage(page)}><Icon size={18} /> {name}</button>)}</div>
    </section>
  );
}

function ChainsPage({ selected, setChain }) {
  return <section className="page-card"><h2>{selected.name}</h2><p>{selected.kind} network - Native asset {selected.native}</p><div className="chain-detail"><span>RPC</span><strong>{selected.rpc}</strong><span>Explorer</span><strong>{selected.explorer}</strong></div><div className="chain-list-page">{chains.map((chain) => <button key={chain.name} onClick={() => setChain(chain)}>{chain.name}<span>{chain.kind}</span></button>)}</div></section>;
}

function RegistryPage({ title, path, field, items, setItems }) {
  async function load() {
    const response = await fetch(path);
    if (response.ok) {
      const payload = await response.json();
      setItems(payload[field] ?? []);
    }
  }
  return (
    <section className="page-card">
      <h2>{title}</h2>
      <p>Local registry with API-ready entries. Fees apply to routing, marketplace, or listing services where applicable.</p>
      <button className="primary" onClick={load}><Plus size={18} /> Load {title}</button>
      <div className="registry-list">
        {items.map((item) => (
          <article key={item.name}>
            <strong>{item.name}</strong>
            <span>{item.category ?? item.chain ?? item.status}</span>
            <em>{Array.isArray(item.chains) ? item.chains.join(", ") : item.assetStandard ?? item.utility ?? item.url}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function CreateTokenPage() {
  const evmChains = chains.filter(isSupportedEvmChain);
  const [network, setNetwork] = useState("Solana");
  const [form, setForm] = useState({ name: "My InfinityX Token", symbol: "MIX", decimals: "9", supply: "1000000", password: "" });
  const [revoke, setRevoke] = useState(true);
  const [quote, setQuote] = useState("Choose a chain and get a live creation quote.");
  const [status, setStatus] = useState("Solana creates a real SPL token from the local vault. EVM chains use the InfinityX factory contract after deployment.");

  async function getCreationQuote() {
    setQuote("Quoting network cost...");
    try {
      if (network === "Solana") {
        const solQuote = await quoteSolanaTokenCreation();
        setQuote(`Solana estimated network cost: ${solQuote.networkSol.toFixed(6)} SOL. InfinityX service fee: ${solQuote.serviceFeeIfx} IFX, or ${solQuote.serviceFeeDiscountIfx} IFX with IFX discount.`);
        return;
      }
      const selectedChain = evmChains.find((item) => item.name === network);
      const gasPriceHex = await rpcCall(selectedChain.rpc, "eth_gasPrice", []);
      const gasPrice = BigInt(gasPriceHex);
      const estimatedGas = 1_500_000n;
      const estimatedWei = gasPrice * estimatedGas;
      setQuote(`${network} estimated factory deploy gas: ${(Number(estimatedWei) / 1e18).toFixed(6)} ${selectedChain.native}. InfinityX service fee: 25 IFX, or 12.5 IFX with IFX discount.`);
    } catch (error) {
      setQuote(error.message);
    }
  }

  async function createToken() {
    if (network !== "Solana") {
      setStatus("EVM token creation is ready at contract/UI level, but the factory must be deployed on that chain before broadcasting.");
      return;
    }
    setStatus("Creating real Solana SPL token...");
    try {
      await requireNativeSigningGate("Approve InfinityX token creation");
      const result = await createSolanaSplToken({
        password: form.password,
        name: form.name,
        symbol: form.symbol,
        decimals: Number(form.decimals),
        supply: form.supply,
        revokeMintAuthority: revoke
      });
      setStatus(`Token created. Mint: ${result.mint}. Tx: ${result.signature}`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <section className="page-card">
      <h2>Create Token</h2>
      <p>Create tokens through InfinityX. Service fee can be paid in IFX with the holder discount.</p>
      <div className="form-grid">
        <select value={network} onChange={(event) => setNetwork(event.target.value)}>
          <option>Solana</option>
          {evmChains.map((item) => <option key={item.name}>{item.name}</option>)}
        </select>
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Token name" />
        <input value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value.toUpperCase() })} placeholder="Symbol" />
        <input value={form.decimals} onChange={(event) => setForm({ ...form, decimals: event.target.value })} placeholder="Decimals" />
        <input value={form.supply} onChange={(event) => setForm({ ...form, supply: event.target.value })} placeholder="Initial supply" />
        <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Vault password" />
        <label className="check-row"><input type="checkbox" checked={revoke} onChange={(event) => setRevoke(event.target.checked)} /> Revoke Solana mint authority after creation.</label>
        <button className="secondary" onClick={getCreationQuote}><CircleDollarSign size={18} /> Get Real Cost Quote</button>
        <button className="primary danger" onClick={createToken}><Plus size={18} /> Create Token</button>
      </div>
      <p className="status">{quote}</p>
      <p className="status">{status}</p>
    </section>
  );
}

function ConnectPage({ setPage }) {
  const [status, setStatus] = useState("Connect external wallets or use WalletConnect pairing.");
  const availability = walletAvailability();
  const wallets = [
    ["phantom", "Phantom", "Solana wallet"],
    ["metamask", "MetaMask", "EVM wallet"],
    ["coinbase", "Coinbase Wallet", "EVM wallet"],
    ["trust", "Trust Wallet", "Mobile/EVM wallet"],
    ["ethereum", "Injected Wallet", "Any browser EVM provider"]
  ];

  async function connect(wallet) {
    setStatus(`Connecting ${wallet}...`);
    try {
      const result = await connectInjectedWallet(wallet);
      setStatus(`${result.wallet} connected: ${result.address}`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <section className="page-card">
      <h2>Connect</h2>
      <p>Connect Phantom, MetaMask, WalletConnect, Coinbase Wallet, Trust Wallet, or any injected wallet.</p>
      <div className="profile-list">
        {wallets.map(([id, label, note]) => <button key={id} onClick={() => connect(id)}><Zap size={18} /> {label}<span>{availability[id] ? "Detected" : note}</span></button>)}
        <button onClick={() => setPage("walletconnect")}><Zap size={18} /> WalletConnect<span>Pair with any compatible wallet/dApp</span></button>
      </div>
      <p className="status">{status}</p>
    </section>
  );
}

function ImportPage({ setPage }) {
  return (
    <section className="page-card">
      <h2>Import</h2>
      <p>Import seed phrases into the encrypted local vault or import watched token contracts from any supported chain.</p>
      <div className="profile-list">
        <button onClick={() => setPage("accounts")}><Import size={18} /> Import seed phrase<span>Encrypted on this device</span></button>
        <button onClick={() => setPage("add")}><Plus size={18} /> Import token / coin<span>Pick chain, network, and token</span></button>
        <button onClick={() => setPage("connect")}><Zap size={18} /> Connect external wallet<span>Phantom, MetaMask, Coinbase, Trust</span></button>
      </div>
    </section>
  );
}

function StakingPage() {
  const [password, setPassword] = useState("");
  const [amount, setAmount] = useState("");
  const [voteAddress, setVoteAddress] = useState("");
  const [status, setStatus] = useState("Live staking is enabled for Solana native stake accounts. Other staking assets use provider integrations.");
  const stakeAssets = [
    { symbol: "SOL", chain: "Solana", mode: "Live native stake delegation" },
    { symbol: "ETH", chain: "Ethereum", mode: "Provider staking adapter required" },
    { symbol: "POL", chain: "Polygon", mode: "Validator/provider adapter required" },
    { symbol: "BNB", chain: "BNB Chain", mode: "Provider staking adapter required" },
    { symbol: "AVAX", chain: "Avalanche", mode: "P-chain adapter required" }
  ];

  async function stakeSol() {
    setStatus("Creating and delegating Solana stake account...");
    try {
      await requireNativeSigningGate("Approve InfinityX staking transaction");
      const result = await createAndDelegateSolStake({ password, amountSol: amount, voteAddress });
      setStatus(`Stake delegated. Stake account: ${result.stakeAccount}. Tx: ${result.signature}`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <section className="page-card">
      <h2>Staking</h2>
      <p>Stake assets that support staking. Solana native staking signs and broadcasts from your local vault.</p>
      <div className="registry-list">{stakeAssets.map((asset) => <article key={asset.symbol}><strong>{asset.symbol}</strong><span>{asset.chain}</span><em>{asset.mode}</em></article>)}</div>
      <div className="form-grid staking-form">
        <input value={voteAddress} onChange={(event) => setVoteAddress(event.target.value)} placeholder="Solana validator vote address" />
        <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="SOL amount to stake" />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Vault password" />
        <button className="primary danger" onClick={stakeSol}><BadgeDollarSign size={18} /> Create and Delegate Stake</button>
      </div>
      <p className="status">{status}</p>
    </section>
  );
}

function BridgePage() {
  const evmChains = chains.filter(isSupportedEvmChain);
  const [fromName, setFromName] = useState("Base");
  const [toName, setToName] = useState("Polygon");
  const [fromToken, setFromToken] = useState("0x0000000000000000000000000000000000000000");
  const [toToken, setToToken] = useState("0x0000000000000000000000000000000000000000");
  const [amount, setAmount] = useState("100000000000000");
  const [password, setPassword] = useState("");
  const [recipient, setRecipient] = useState("");
  const [quote, setQuote] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState("Bridge quotes use LI.FI. Amount is in smallest units.");

  const fromChain = evmChains.find((item) => item.name === fromName) ?? evmChains[0];
  const toChain = evmChains.find((item) => item.name === toName) ?? evmChains[1];

  async function quoteBridge() {
    setStatus("Fetching bridge quote...");
    try {
      const fromAddress = await deriveEvmAddress({ password });
      const nextQuote = await getLifiBridgeQuote({
        fromChain: evmChainId(fromChain),
        toChain: evmChainId(toChain),
        fromToken,
        toToken,
        fromAmount: amount,
        fromAddress,
        toAddress: recipient || fromAddress
      });
      setQuote(nextQuote);
      setStatus(`Route ready: ${nextQuote.toolDetails?.name ?? nextQuote.tool ?? "LI.FI"} to ${toChain.name}`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function executeBridge() {
    if (!quote?.transactionRequest || !confirmed) {
      setStatus("Quote first and tick confirmation before broadcasting.");
      return;
    }
    setStatus("Signing bridge transaction...");
    try {
      await requireNativeSigningGate("Approve InfinityX bridge signing");
      const result = await sendEvmTransactionRequest({ password, chain: fromChain, request: quote.transactionRequest });
      setStatus(`Bridge transaction sent: ${result.hash}`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <section className="page-card">
      <h2>Bridge</h2>
      <p>Real cross-chain route quotes and EVM transaction execution through LI.FI.</p>
      <div className="form-grid">
        <select value={fromName} onChange={(event) => setFromName(event.target.value)}>{evmChains.map((item) => <option key={item.name}>{item.name}</option>)}</select>
        <select value={toName} onChange={(event) => setToName(event.target.value)}>{evmChains.map((item) => <option key={item.name}>{item.name}</option>)}</select>
        <input value={fromToken} onChange={(event) => setFromToken(event.target.value)} placeholder="From token contract, 0x00 for native" />
        <input value={toToken} onChange={(event) => setToToken(event.target.value)} placeholder="To token contract, 0x00 for native" />
        <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount in smallest units" />
        <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Destination address, optional" />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Vault password" />
        <button className="primary" onClick={quoteBridge}><Layers3 size={18} /> Get Bridge Quote</button>
      </div>
      {quote && <div className="fee-note">Estimated receive: {quote.estimate?.toAmountMin ?? quote.estimate?.toAmount ?? "route returned"}</div>}
      <label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I reviewed the bridge route and want to broadcast this real transaction.</label>
      <button className="primary danger" onClick={executeBridge}><Send size={18} /> Sign and Bridge</button>
      <p className="status">{status}</p>
    </section>
  );
}

function WalletConnectPage() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("Requires VITE_WALLETCONNECT_PROJECT_ID from WalletConnect/Reown dashboard.");
  const [uri, setUri] = useState("");
  const [proposals, setProposals] = useState([]);
  const [requests, setRequests] = useState([]);
  const walletKitRef = useRef(null);
  const accountsRef = useRef({ evmAddress: "", solanaAddress: "" });

  async function startWalletConnect() {
    setStatus("Preparing WalletConnect client...");
    try {
      const solana = await getSolanaWalletState({ password });
      const evmAddress = await deriveEvmAddress({ password });
      accountsRef.current = { evmAddress, solanaAddress: solana.address };
      const client = await initializeWalletConnect({
        projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
        evmAddress,
        solanaAddress: solana.address,
        onProposal: (proposal) => setProposals((items) => [...items, proposal]),
        onRequest: (request) => setRequests((items) => [...items, request])
      });
      walletKitRef.current = client.walletKit;
      if (uri.trim()) await client.walletKit.pair({ uri: uri.trim() });
      setStatus(`WalletConnect ready. Active sessions: ${client.activeSessions}. Accounts: ${client.supportedAccounts.evm.length + client.supportedAccounts.solana.length}`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function approveProposal(proposal) {
    try {
      await approveWalletConnectProposal({ walletKit: walletKitRef.current, proposal, ...accountsRef.current });
      setProposals((items) => items.filter((item) => item.id !== proposal.id));
      setStatus("WalletConnect session approved.");
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function rejectProposal(proposal) {
    try {
      await rejectWalletConnectProposal({ walletKit: walletKitRef.current, proposal });
      setProposals((items) => items.filter((item) => item.id !== proposal.id));
      setStatus("WalletConnect session rejected.");
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function rejectRequest(request) {
    try {
      await rejectWalletConnectRequest({ walletKit: walletKitRef.current, request });
      setRequests((items) => items.filter((item) => item.id !== request.id));
      setStatus("WalletConnect request rejected.");
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <section className="page-card">
      <h2>WalletConnect</h2>
      <p>Connect InfinityX to dApps with WalletKit. Session requests must be reviewed before local signing.</p>
      <div className="form-grid">
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Vault password" />
        <input value={uri} onChange={(event) => setUri(event.target.value)} placeholder="wc: pairing URI from dApp" />
        <button className="primary" onClick={startWalletConnect}><Zap size={18} /> Initialize WalletConnect</button>
      </div>
      <div className="risk-box">
        <span>Requires a WalletConnect project ID.</span>
        <span>Every session and signing request must be approved here before local signing.</span>
      </div>
      <div className="registry-list">
        {proposals.map((proposal) => <article key={proposal.id}><strong>{proposal.params?.proposer?.metadata?.name ?? "Session proposal"}</strong><span>{proposal.params?.proposer?.metadata?.url ?? "WalletConnect dApp"}</span><em>Approve only if you trust this dApp.</em><button className="secondary" onClick={() => approveProposal(proposal)}>Approve Session</button><button className="secondary" onClick={() => rejectProposal(proposal)}>Reject</button></article>)}
        {requests.map((request) => <article key={request.id}><strong>{request.params?.request?.method ?? "Signing request"}</strong><span>{request.topic}</span><em>Request approval screen ready. Transaction signing adapters should decode the payload before approval.</em><button className="secondary" onClick={() => rejectRequest(request)}>Reject Request</button></article>)}
      </div>
      <p className="status">{status}</p>
    </section>
  );
}

function SendPage({ chain }) {
  const liveChain = chain.name === "Main" ? chains.find((item) => item.name === "Solana") : chain;
  const [assetType, setAssetType] = useState(chain.kind === "EVM" ? "native" : "ifx");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [tokenAddress, setTokenAddress] = useState(chain.name === "Main" || chain.name === "Solana" ? IFX_MINT : "");
  const [decimals, setDecimals] = useState("18");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("Ready. Transactions are signed only on this device.");
  const [confirmed, setConfirmed] = useState(false);

  const warnings = explainSendRisk({ chain: liveChain, assetType: assetType === "native" ? "native" : "token", recipient, amount, tokenAddress });

  async function sendLive() {
    if (!confirmed) {
      setStatus("Review the warnings and tick the confirmation box first.");
      return;
    }
    setStatus(`Signing ${assetType} transfer on ${liveChain.name}...`);
    try {
      await requireNativeSigningGate("Approve InfinityX send signing");
      let result;
      if (liveChain.kind === "SVM") {
        result = assetType === "native"
          ? await sendSol({ password, to: recipient, amountSol: amount, rpcUrl: liveChain.rpc })
          : await sendSplToken({ password, to: recipient, amount, mint: tokenAddress || IFX_MINT, rpcUrl: liveChain.rpc });
        setStatus(`Broadcast on Solana: ${result.signature}`);
      } else if (liveChain.kind === "EVM" && isSupportedEvmChain(liveChain)) {
        result = assetType === "native"
          ? await sendEvmNative({ password, chain: liveChain, to: recipient, amount })
          : await sendErc20Token({ password, chain: liveChain, tokenAddress, to: recipient, amount, decimals });
        setStatus(`Broadcast on ${liveChain.name}: ${result.hash}`);
      } else {
        throw new Error(`${liveChain.name} needs a native signer/indexer adapter before live sends.`);
      }
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <section className="page-card">
      <h2>Send</h2>
      <p>Live non-custodial send for Solana SPL/SOL and supported EVM native/ERC-20 assets.</p>
      <div className="action-panel"><Send size={28} /><strong>{liveChain.name}</strong><span>Network fees are paid by the sending wallet.</span></div>
      <div className="form-grid">
        <select value={assetType} onChange={(event) => setAssetType(event.target.value)}>
          <option value="native">Native coin ({liveChain.native})</option>
          {(liveChain.kind === "SVM" || chain.name === "Main") && <option value="ifx">InfinityX IFX token</option>}
          <option value="token">Custom token</option>
        </select>
        {assetType !== "native" && <input value={tokenAddress} onChange={(event) => setTokenAddress(event.target.value)} placeholder={liveChain.kind === "SVM" ? "SPL mint address" : "ERC-20 contract"} />}
        {liveChain.kind === "EVM" && assetType !== "native" && <input value={decimals} onChange={(event) => setDecimals(event.target.value)} placeholder="Token decimals" />}
        <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient address" />
        <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Vault password" />
      </div>
      <div className="risk-box">{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>
      <label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I reviewed the recipient, network, token, and amount.</label>
      <button className="primary danger" onClick={sendLive}><Send size={18} /> Sign and Send Real Transaction</button>
      <p className="status">{status}</p>
    </section>
  );
}

function ReceivePage({ chain }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("Unlock to show receive addresses generated from your encrypted vault.");
  const [addresses, setAddresses] = useState(null);

  async function unlockAddresses() {
    setStatus("Unlocking local vault...");
    try {
      const solana = await getSolanaWalletState({ password });
      const evm = await deriveEvmAddress({ password });
      let evmBalance = null;
      if (chain.kind === "EVM" && isSupportedEvmChain(chain)) {
        evmBalance = await getEvmWalletState({ password, chain });
      }
      setAddresses({ solana, evm, evmBalance });
      setStatus("Receive addresses are ready.");
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <section className="page-card">
      <h2>Receive</h2>
      <p>Shows live addresses from the local non-custodial vault. Never share your seed phrase.</p>
      <div className="form-grid">
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Vault password" />
        <button className="primary" onClick={unlockAddresses}><QrCode size={18} /> Show receive addresses</button>
      </div>
      {addresses && (
        <div className="receive-list">
          <article><strong>Solana / IFX</strong><span>{addresses.solana.address}</span><em>{addresses.solana.sol.toFixed(6)} SOL</em></article>
          <article><strong>EVM</strong><span>{addresses.evm}</span><em>{addresses.evmBalance ? `${Number(addresses.evmBalance.native).toFixed(6)} ${chain.native}` : "Use on supported EVM chains"}</em></article>
        </div>
      )}
      <p className="status">{status}</p>
    </section>
  );
}

function BuyPage({ markets, setMarkets }) {
  async function loadMarkets() {
    const response = await fetch("/registry/markets.json");
    if (response.ok) setMarkets(await response.json());
  }
  return (
    <section className="page-card">
      <h2>Buy IFX</h2>
      <p>IFX market routing uses existing liquidity sources where liquidity exists. Bonding-curve sales require a deployed audited sale contract.</p>
      <div className="swap-box"><label>Buy token</label><strong>IFX</strong></div>
      <div className="swap-box"><label>Payment assets</label><strong>SOL / USDC / USDT</strong></div>
      <button className="primary" onClick={loadMarkets}><ShoppingCart size={18} /> Load market pairs</button>
      <div className="market-pairs">
        {(markets?.pairs ?? []).map((pair) => <article key={pair.pair}><strong>{pair.pair}</strong><span>{pair.chain}</span><em>{pair.quoteSource}</em></article>)}
      </div>
      <div className="fee-note">No airdrop allocation. No extra minting beyond fixed supply. Service fees use IFX discount policy.</div>
    </section>
  );
}

function AddTokenPage({ customToken, setCustomToken, chain, registry, loadLocalRegistry }) {
  const [selected, setSelected] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState(chain.name === "Main" ? "Solana" : chain.name);
  const networks = chain.name === "Main" ? chains : chains.filter((item) => item.name === chain.name);
  const available = registryForChain(registry, selectedNetwork).slice(0, 3000);
  return (
    <section className="page-card">
      <h2>Add Token</h2>
      <p>{chain.name === "Main" ? "Step 1 pick a chain, Step 2 pick the blockchain/network, Step 3 pick a token or import a contract." : `This ${chain.name} page only adds ${chain.name} assets.`}</p>
      <div className="form-grid">
        <button className="primary" onClick={loadLocalRegistry}><Plus size={18} /> Refresh local registry</button>
        <select value={chain.name} disabled>
          <option>{chain.name}</option>
        </select>
        <select value={selectedNetwork} onChange={(event) => { setSelectedNetwork(event.target.value); setCustomToken({ ...customToken, network: event.target.value }); }}>
          {networks.map((item) => <option key={item.name}>{item.name}</option>)}
        </select>
        <select value={selected} onChange={(event) => setSelected(event.target.value)}>
          <option value="">Choose token/coin from {selectedNetwork}</option>
          {available.map((token) => <option key={`${token.id}-${token.symbol}`} value={token.id}>{token.symbol} - {token.name} - {(token.chains ?? []).join(", ")}</option>)}
        </select>
        <input value={customToken.contract} onChange={(event) => setCustomToken({ ...customToken, contract: event.target.value })} placeholder="Contract, mint, or asset id if not listed" />
        <input value={customToken.symbol} onChange={(event) => setCustomToken({ ...customToken, symbol: event.target.value })} placeholder="Token symbol" />
        <button className="primary"><Plus size={18} /> Validate and add</button>
      </div>
    </section>
  );
}

function AccountsPage({ vaultStatus, setVaultStatus, generatedPhrase, setGeneratedPhrase }) {
  const [password, setPassword] = useState("");
  const [importPhrase, setImportPhrase] = useState("");
  const [seedStrength, setSeedStrength] = useState(128);

  function generatePhrase() {
    setGeneratedPhrase(createMnemonic(seedStrength));
    setVaultStatus(`${seedStrength === 256 ? "24" : "12"}-word seed generated. Store it offline before encrypting.`);
  }

  async function encryptGeneratedVault() {
    if (!generatedPhrase || password.length < 8) {
      setVaultStatus("Generate a phrase and use a password with at least 8 characters.");
      return;
    }
    const account = deriveSolanaAccount(generatedPhrase, 0);
    await saveVault({ kind: "mnemonic", phrase: generatedPhrase, accounts: [account], createdAt: new Date().toISOString() }, password);
    setVaultStatus(`Encrypted vault saved. First Solana account: ${account.address}`);
  }

  async function importVault() {
    const phrase = importPhrase.trim().toLowerCase();
    if (!validateSeedPhrase(phrase)) {
      setVaultStatus("Invalid BIP39 seed phrase.");
      return;
    }
    if (password.length < 8) {
      setVaultStatus("Use a password with at least 8 characters.");
      return;
    }
    const account = deriveSolanaAccount(phrase, 0);
    await saveVault({ kind: "mnemonic", phrase, accounts: [account], importedAt: new Date().toISOString() }, password);
    setVaultStatus(`Imported and encrypted. First Solana account: ${account.address}`);
  }

  return (
    <section className="page-card">
      <h2>Accounts</h2>
      <p>Create/import encrypted non-custodial accounts. Seed phrases stay on this device.</p>
      <div className="account-list">
        {["Main", "Trading", "Vault"].map((name, index) => <article key={name}><div className={`mini-avatar c${index}`}>{name[0]}</div><strong>{name}</strong><span>Unique vault account slot</span></article>)}
      </div>
      <div className="form-grid vault-form">
        <select value={seedStrength} onChange={(event) => setSeedStrength(Number(event.target.value))}>
          <option value={128}>12-word seed phrase</option>
          <option value={256}>24-word seed phrase</option>
        </select>
        <button className="primary" onClick={generatePhrase}><Plus size={18} /> Generate seed</button>
        {generatedPhrase && <textarea readOnly value={generatedPhrase} />}
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Vault password" />
        <button className="primary" onClick={encryptGeneratedVault}><LockKeyhole size={18} /> Encrypt generated vault</button>
        <textarea value={importPhrase} onChange={(event) => setImportPhrase(event.target.value)} placeholder="Import existing seed phrase" />
        <button className="primary" onClick={importVault}><Import size={18} /> Import encrypted vault</button>
      </div>
      <p className="status">{vaultStatus}</p>
    </section>
  );
}

function ProfilePage({ setPage }) {
  const googleButton = useRef(null);
  const [googleStatus, setGoogleStatus] = useState("Google sign-in is optional and never unlocks seed phrases.");
  const items = [["Profile", UserRound], ["Settings", Settings], ["API", Globe2], ["Contacts", Users], ["Resources", Compass], ["Support", BellRing], ["Apply token listing", Plus], ["Seed phrase vault", KeyRound]];
  async function startGoogle() {
    if (!googleButton.current) return;
    const result = await initializeGoogleSignIn(googleButton.current, () => {
      setGoogleStatus("Google identity received. Server-side token verification is required before production login.");
    });
    if (!result.ok) setGoogleStatus(`${result.reason}. Create a Google OAuth Client ID first.`);
  }
  return (
    <section className="page-card">
      <h2>Profile</h2>
      <p>Manage settings, contacts, API access, support, token listing applications, and seed phrase controls.</p>
      <div className="google-card">
        <button className="primary" onClick={startGoogle}><UserCircle size={18} /> Enable Google sign-in</button>
        <div ref={googleButton} className="google-button" />
        <p className="status">{googleStatus}</p>
      </div>
      <div className="profile-list">{items.map(([label, Icon]) => <button key={label}><Icon size={18} /> {label}</button>)}</div>
      <button className="primary" onClick={() => setPage("wallet")}>Log out</button>
    </section>
  );
}

function NotificationsPage() {
  return <section className="page-card"><h2>Notifications</h2><div className="notification-list"><article><BellRing size={18} /><div><strong>IFX live</strong><span>Mainnet token created and mint authority revoked.</span></div></article><article><ShieldCheck size={18} /><div><strong>Local signing</strong><span>Transactions require local wallet approval.</span></div></article></div></section>;
}

function NewsPage({ coins, loadCoins, status }) {
  return <section className="page-card"><h2>Markets</h2><p>Offline market registry for top assets bundled with the app.</p><button className="primary" onClick={loadCoins}><Globe2 size={18} /> Refresh Local Registry</button>{status && <p className="status">{status}</p>}<div className="market-strip">{(coins.length ? coins.slice(0, 9) : topAssets).map((coin) => <article key={`${coin.symbol}-${coin.name}`}><strong>{coin.symbol}</strong><span>{coin.price ? `$${Number(coin.price).toLocaleString()}` : coin.name}</span></article>)}</div></section>;
}

function chainByName(name) {
  return chains.find((item) => item.name === name) ?? { name, symbol: "", kind: "Adapter", rpc: "indexer-required", explorer: "", native: "" };
}

function getTokenNetworks(token, currentChain) {
  if (!token) return [currentChain.name];
  const networks = [];
  if (String(token.symbol).toUpperCase() === "IFX") networks.push("Solana");
  if (currentChain.name !== "Main") networks.push(currentChain.name);
  if (Array.isArray(token.chains)) networks.push(...token.chains);
  if (token.network && !["Multi-chain", "Auto-detect"].includes(token.network)) networks.push(token.network);
  if (isNativeAsset(token, currentChain)) networks.push(currentChain.name);
  const usable = networks.filter(Boolean);
  return [...new Set(usable.length ? usable : [currentChain.name])];
}

function contractForChain(token, chainName) {
  if (!token) return "";
  if (String(token.symbol).toUpperCase() === "IFX" && chainName === "Solana") return IFX_MINT;
  if (token.mint && chainName === "Solana") return token.mint;
  if (token.contract && (!token.network || token.network === chainName || token.network === "Multi-chain")) return token.contract;
  return (token.contracts ?? []).find((contract) => contract.chain === chainName)?.address ?? "";
}

function isNativeAsset(token, chain) {
  const symbol = String(token?.symbol ?? "").toUpperCase();
  const native = String(chain?.native ?? "").toUpperCase();
  if (!symbol || !native) return false;
  if (symbol === native) return true;
  return chain?.name === "Ethereum" && symbol === "ETH";
}

function liveSupportForAsset({ selectedChain, token, contract, native }) {
  if (selectedChain.kind === "SVM" && (native || contract)) return "Live Solana send, receive, balance, and native SOL staking are enabled.";
  if (selectedChain.kind === "EVM" && isSupportedEvmChain(selectedChain) && (native || contract)) return "Live EVM send, receive, and balance are enabled for this supported network.";
  if (!contract && !native) return `${token.symbol} is tracked here, but this network has no bundled contract/mint for live sending.`;
  return `${selectedChain.name} requires a native signer/indexer adapter before live transactions can be broadcast.`;
}

function stakingStatusFor(token, selectedChain) {
  const symbol = String(token?.symbol ?? "").toUpperCase();
  if (selectedChain.name === "Ethereum" && symbol === "ETH") return "ETH staking requires a provider or validator integration before InfinityX can broadcast a real stake transaction.";
  if (["POL", "BNB", "AVAX", "FTM"].includes(symbol)) return `${symbol} staking needs the chain-specific validator/provider adapter before live staking.`;
  return `${symbol} has no verified staking adapter in this build. Send and receive still work where the chain signer is supported.`;
}

function formatBalance(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "--");
  if (number === 0) return "0";
  if (Math.abs(number) < 0.000001) return number.toExponential(4);
  return number.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatTokenRowMeta(token) {
  if (token.priceUsd || token.price) return `$${Number(token.priceUsd ?? token.price).toLocaleString()}`;
  if (Array.isArray(token.chains) && token.chains.length) return token.chains.slice(0, 2).join(", ");
  return token.action ?? "Open";
}

function registryForChain(registry, chainName) {
  if (!registry.length) return [];
  if (chainName === "Main") return registry;
  return registry.filter((asset) => (asset.chains ?? []).includes(chainName));
}

function evmChainId(chain) {
  const ids = {
    Ethereum: 1,
    Polygon: 137,
    "BNB Chain": 56,
    Base: 8453,
    Arbitrum: 42161,
    Optimism: 10,
    Avalanche: 43114,
    Fantom: 250
  };
  return ids[chain.name];
}

async function rpcCall(rpc, method, params) {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
  });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message ?? `${method} failed`);
  return payload.result;
}

const rootElement = document.getElementById("root");
globalThis.__infinityXRoot ??= createRoot(rootElement);
globalThis.__infinityXRoot.render(<App />);
