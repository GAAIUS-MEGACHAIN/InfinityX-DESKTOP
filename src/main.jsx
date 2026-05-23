import React, { useMemo, useRef, useState } from "react";
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

const IFX_MINT = "4s9Bbk3AB223bbqAHhiCcqVg14C6m46ioixJFXMcunm1";
const SERVICE_FEE_BPS = 15;
const IFX_DISCOUNT = 50;

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
  { name: "QR Payments", fee: "0.10%", ifx: "0.05%", icon: QrCode },
  { name: "Portfolio", fee: "Free", ifx: "Free", icon: Wallet }
];

function App() {
  const [page, setPage] = useState("wallet");
  const [chain, setChain] = useState(chains[0]);
  const [chainOpen, setChainOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coins, setCoins] = useState([]);
  const [coinStatus, setCoinStatus] = useState("Load CoinGecko top 3000");
  const [dexStatus, setDexStatus] = useState("Ready for live Jupiter quotes");
  const [recoveryStatus, setRecoveryStatus] = useState("Choose a recovery method");
  const [customToken, setCustomToken] = useState({ contract: "", symbol: "", network: "Main" });
  const [registry, setRegistry] = useState([]);
  const [vaultStatus, setVaultStatus] = useState("No encrypted vault created yet");
  const [generatedPhrase, setGeneratedPhrase] = useState("");
  const [markets, setMarkets] = useState(null);
  const [dapps, setDapps] = useState([]);
  const [nfts, setNfts] = useState([]);
  const [metaverse, setMetaverse] = useState([]);

  const filteredCoins = useMemo(() => {
    const registrySource = registryForChain(registry, chain.name);
    const source = coins.length ? coins : (registrySource.length ? registrySource : (chainTopTokens[chain.name] ?? topAssets));
    const q = query.toLowerCase().trim();
    return source.filter((coin) => `${coin.name} ${coin.symbol} ${coin.network ?? ""}`.toLowerCase().includes(q)).slice(0, 80);
  }, [coins, query, chain.name, registry]);

  async function loadLocalRegistry() {
    setCoinStatus("Loading local top-3000 registry...");
    const response = await fetch("/registry/top-3000-tokens.json");
    if (!response.ok) {
      setCoinStatus(`Local registry error: ${response.status}`);
      return [];
    }
    const payload = await response.json();
    setRegistry(payload.assets ?? []);
    setCoinStatus(`Local top-${payload.count} registry loaded`);
    return payload.assets ?? [];
  }

  async function loadCoins() {
    const local = await loadLocalRegistry();
    if (local.length) return;
    setCoinStatus("Loading verified market list...");
    try {
      const pages = Array.from({ length: 12 }, (_, index) => index + 1);
      const results = [];
      for (const pageNumber of pages) {
        const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${pageNumber}&sparkline=false`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        results.push(...await response.json());
      }
      setCoins(results.map((coin) => ({
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        network: "Auto-detect",
        price: coin.current_price,
        rank: coin.market_cap_rank,
        image: coin.image
      })));
      setCoinStatus("Top 3000 loaded");
    } catch (error) {
      setCoinStatus(`CoinGecko error: ${error.message}`);
    }
  }

  async function quoteDex() {
    setDexStatus("Fetching live Jupiter quote...");
    try {
      const url = "https://api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000&slippageBps=50";
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const quote = await response.json();
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
    setRecoveryStatus("Passkey support detected. Native secure signing plugin is required before storing funds.");
  }

  function copyMint() {
    navigator.clipboard?.writeText(IFX_MINT);
  }

  function renderPage() {
    if (page === "dex") return <DexPage status={dexStatus} quoteDex={quoteDex} />;
    if (page === "send") return <ActionPage title="Send" icon={Send} chain={chain} body="Creates an unsigned send intent for local wallet signing." />;
    if (page === "receive") return <ActionPage title="Receive" icon={QrCode} chain={chain} body="Shows receive QR/address after wallet creation or import." />;
    if (page === "buy") return <BuyPage markets={markets} setMarkets={setMarkets} />;
    if (page === "add") return <AddTokenPage customToken={customToken} setCustomToken={setCustomToken} chain={chain} registry={registry} loadLocalRegistry={loadLocalRegistry} />;
    if (page === "profile") return <ProfilePage setPage={setPage} />;
    if (page === "notifications") return <NotificationsPage />;
    if (page === "accounts") return <AccountsPage vaultStatus={vaultStatus} setVaultStatus={setVaultStatus} generatedPhrase={generatedPhrase} setGeneratedPhrase={setGeneratedPhrase} />;
    if (page === "services") return <ServicesPage setPage={setPage} />;
    if (page === "dapps") return <RegistryPage title="dApps" path="/registry/dapps.json" field="dapps" items={dapps} setItems={setDapps} />;
    if (page === "nfts") return <RegistryPage title="NFTs" path="/registry/nfts.json" field="collections" items={nfts} setItems={setNfts} />;
    if (page === "metaverse") return <RegistryPage title="Metaverse API" path="/registry/metaverse.json" field="worlds" items={metaverse} setItems={setMetaverse} />;
    if (page === "chains") return <ChainsPage selected={chain} setChain={setChain} />;
    if (page === "news") return <NewsPage coins={coins} loadCoins={loadCoins} status={coinStatus} />;
    return <WalletPage chain={chain} filteredCoins={filteredCoins} query={query} setQuery={setQuery} loadCoins={loadCoins} copyMint={copyMint} setPage={setPage} setupPasskey={setupPasskey} recoveryStatus={recoveryStatus} setRecoveryStatus={setRecoveryStatus} coinStatus={coinStatus} />;
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
          <button className={page === "buy" ? "active" : ""} onClick={() => setPage("buy")}><ShoppingCart size={20} /><span>Buy</span></button>
          <button className={page === "services" ? "active" : ""} onClick={() => setPage("services")}><BadgeDollarSign size={20} /><span>Services</span></button>
        </footer>
      </section>
    </main>
  );
}

function WalletPage({ chain, filteredCoins, query, setQuery, loadCoins, copyMint, setPage, setupPasskey, recoveryStatus, setRecoveryStatus, coinStatus }) {
  return (
    <>
      <section className="account-card">
        <div className="account-row">
          <div className="avatar">IX</div>
          <div><p>{chain.name} Portfolio</p><strong>Account 1</strong></div>
          <button aria-label="Scan QR"><QrCode size={19} /></button>
        </div>
        <div className="balance"><span>Total Portfolio Balance</span><h1>$0.00</h1><p>{chain.name} assets and services</p></div>
        <div className="actions">
          <button onClick={() => setPage("send")}><Send size={20} /><span>Send</span></button>
          <button onClick={() => setPage("receive")}><ScanLine size={20} /><span>Receive</span></button>
          <button onClick={() => setPage("dex")}><ArrowDownUp size={20} /><span>Swap</span></button>
          <button onClick={() => setPage("buy")}><ShoppingCart size={20} /><span>Buy</span></button>
        </div>
      </section>
      <section className="ifx-card">
        <div><span>InfinityX Main Coin</span><strong>Connect, create, import, or add assets</strong><small>{IFX_MINT}</small></div>
        <button onClick={copyMint}><Copy size={17} /> Mint</button>
        <button onClick={() => setPage("add")}><Plus size={17} /> Add</button>
      </section>
      <section className="search-card"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search top coins, token symbol, contract" /><button onClick={loadCoins}><Plus size={17} /></button></section>
      <p className="status inline-status">{coinStatus}</p>
      <section className="token-list">
        {filteredCoins.map((token) => (
          <article className="token-row" key={`${token.symbol}-${token.name}`}>
            {token.image ? <img src={token.image} alt="" /> : <div className="token-icon">{token.symbol.slice(0, 2)}</div>}
            <div><strong>{token.name}</strong><span>{token.symbol} - {token.network ?? `Rank ${token.rank}`}</span></div>
            <em>{token.price ? `$${Number(token.price).toLocaleString()}` : token.action}</em>
          </article>
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

function DexPage({ status, quoteDex }) {
  return <section className="page-card"><h2>InfinityX DEX</h2><p>Live quote routing uses Jupiter on Solana. Signed execution is handled locally by the wallet.</p><div className="swap-box"><label>From</label><strong>0.1 SOL</strong></div><div className="swap-box"><label>To</label><strong>USDC</strong></div><button className="primary" onClick={quoteDex}><Zap size={18} /> Get Live Quote</button><p className="status">{status}</p><div className="fee-note">Service fee: {SERVICE_FEE_BPS / 100}% - IFX holders pay {IFX_DISCOUNT}% less.</div></section>;
}

function ServicesPage({ setPage }) {
  const quick = [
    { name: "dApps", page: "dapps", icon: Globe2 },
    { name: "NFTs", page: "nfts", icon: Compass },
    { name: "Metaverse API", page: "metaverse", icon: Layers3 }
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

function ActionPage({ title, icon: Icon, chain, body }) {
  return <section className="page-card"><h2>{title}</h2><p>{body}</p><div className="action-panel"><Icon size={28} /><strong>{chain.name}</strong><span>Status: wallet vault required before signing live funds</span></div><button className="primary"><LockKeyhole size={18} /> Create local signing intent</button></section>;
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
  const available = registryForChain(registry, chain.name).slice(0, 3000);
  return (
    <section className="page-card">
      <h2>Add Token</h2>
      <p>{chain.name === "Main" ? "Add any supported token from any connected chain." : `Add ${chain.name} tokens only.`}</p>
      <div className="form-grid">
        <button className="primary" onClick={loadLocalRegistry}><Plus size={18} /> Load local top 3000</button>
        <select value={customToken.network} onChange={(event) => setCustomToken({ ...customToken, network: event.target.value })}>
          {chains.map((item) => <option key={item.name}>{item.name}</option>)}
        </select>
        <select value={selected} onChange={(event) => setSelected(event.target.value)}>
          <option value="">Choose from local registry</option>
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

  function generatePhrase() {
    setGeneratedPhrase(createMnemonic(128));
    setVaultStatus("12-word seed generated. Store it offline before encrypting.");
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
        <button className="primary" onClick={generatePhrase}><Plus size={18} /> Generate 12-word seed</button>
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
  return <section className="page-card"><h2>Markets</h2><p>CoinGecko market feed for top coins.</p><button className="primary" onClick={loadCoins}><Globe2 size={18} /> Load Top 3000</button><p className="status">{status}</p><div className="market-strip">{(coins.length ? coins.slice(0, 9) : topAssets).map((coin) => <article key={`${coin.symbol}-${coin.name}`}><strong>{coin.symbol}</strong><span>{coin.price ? `$${Number(coin.price).toLocaleString()}` : coin.name}</span></article>)}</div></section>;
}

function registryForChain(registry, chainName) {
  if (!registry.length) return [];
  if (chainName === "Main") return registry;
  return registry.filter((asset) => (asset.chains ?? []).includes(chainName));
}

createRoot(document.getElementById("root")).render(<App />);
