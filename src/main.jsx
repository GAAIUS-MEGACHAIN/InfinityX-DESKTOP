import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownUp,
  BadgeDollarSign,
  Bell,
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
  ShieldCheck,
  ShoppingCart,
  UserRound,
  Wallet,
  Zap
} from "lucide-react";
import "./styles.css";

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
  { name: "Solana", symbol: "SOL", kind: "SVM", rpc: "https://api.mainnet-beta.solana.com", explorer: "https://solscan.io", native: "SOL" },
  { name: "Ethereum", symbol: "ETH", kind: "EVM", rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io", native: "ETH" },
  { name: "Polygon", symbol: "POL", kind: "EVM", rpc: "https://polygon-bor-rpc.publicnode.com", explorer: "https://polygonscan.com", native: "POL" },
  { name: "BNB Chain", symbol: "BNB", kind: "EVM", rpc: "https://bsc-rpc.publicnode.com", explorer: "https://bscscan.com", native: "BNB" },
  { name: "Base", symbol: "ETH", kind: "EVM", rpc: "https://base-rpc.publicnode.com", explorer: "https://basescan.org", native: "ETH" },
  { name: "Arbitrum", symbol: "ETH", kind: "EVM", rpc: "https://arbitrum-one-rpc.publicnode.com", explorer: "https://arbiscan.io", native: "ETH" },
  { name: "Optimism", symbol: "ETH", kind: "EVM", rpc: "https://optimism-rpc.publicnode.com", explorer: "https://optimistic.etherscan.io", native: "ETH" },
  { name: "Avalanche", symbol: "AVAX", kind: "EVM", rpc: "https://avalanche-c-chain-rpc.publicnode.com", explorer: "https://snowtrace.io", native: "AVAX" },
  { name: "Fantom", symbol: "FTM", kind: "EVM", rpc: "https://fantom-rpc.publicnode.com", explorer: "https://ftmscan.com", native: "FTM" },
  { name: "Bitcoin", symbol: "BTC", kind: "UTXO", rpc: "Indexer required", explorer: "https://mempool.space", native: "BTC" },
  { name: "Cardano", symbol: "ADA", kind: "UTXO", rpc: "Indexer required", explorer: "https://cardanoscan.io", native: "ADA" },
  { name: "XRP Ledger", symbol: "XRP", kind: "Account", rpc: "wss://xrplcluster.com", explorer: "https://xrpscan.com", native: "XRP" }
];

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
  const [customToken, setCustomToken] = useState({ contract: "", symbol: "", network: "Solana" });

  const filteredCoins = useMemo(() => {
    const source = coins.length ? coins : topAssets;
    const q = query.toLowerCase().trim();
    return source.filter((coin) =>
      `${coin.name} ${coin.symbol} ${coin.network ?? ""}`.toLowerCase().includes(q)
    ).slice(0, 80);
  }, [coins, query]);

  async function loadCoins() {
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
    if (page === "services") return <ServicesPage />;
    if (page === "chains") return <ChainsPage selected={chain} setChain={setChain} />;
    if (page === "news") return <NewsPage coins={coins} loadCoins={loadCoins} status={coinStatus} />;
    return (
      <>
        <section className="account-card">
          <div className="account-row">
            <div className="avatar">IX</div>
            <div>
              <p>Main Wallet</p>
              <strong>Connect, create, or import</strong>
            </div>
            <button aria-label="Scan QR"><QrCode size={19} /></button>
          </div>

          <div className="balance">
            <span>InfinityX Wallet</span>
            <h1>Universal Web3</h1>
            <p>Non-custodial wallet, DEX, discovery, and chain hub</p>
          </div>

          <div className="actions">
            <button><Send size={20} /><span>Send</span></button>
            <button><ScanLine size={20} /><span>Receive</span></button>
            <button onClick={() => setPage("dex")}><ArrowDownUp size={20} /><span>Swap</span></button>
            <button onClick={() => setPage("chains")}><Compass size={20} /><span>Chains</span></button>
          </div>
        </section>

        <section className="ifx-card">
          <div>
            <span>InfinityX Main Coin</span>
            <strong>IFX on Solana mainnet</strong>
            <small>{IFX_MINT}</small>
          </div>
          <button onClick={copyMint}><Copy size={17} /> Copy</button>
        </section>

        <section className="search-card">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search top coins, token symbol, contract" />
          <button onClick={loadCoins}><Plus size={17} /></button>
        </section>

        <section className="token-list">
          {filteredCoins.map((token) => (
            <article className="token-row" key={`${token.symbol}-${token.name}`}>
              {token.image ? <img src={token.image} alt="" /> : <div className="token-icon">{token.symbol.slice(0, 2)}</div>}
              <div>
                <strong>{token.name}</strong>
                <span>{token.symbol} • {token.network ?? `Rank ${token.rank}`}</span>
              </div>
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

        <section className="panel">
          <div className="section-title"><Import size={20} /><strong>Add Custom Token</strong></div>
          <div className="form-grid">
            <input value={customToken.contract} onChange={(event) => setCustomToken({ ...customToken, contract: event.target.value })} placeholder="Contract or mint address" />
            <input value={customToken.symbol} onChange={(event) => setCustomToken({ ...customToken, symbol: event.target.value })} placeholder="Token symbol" />
            <select value={customToken.network} onChange={(event) => setCustomToken({ ...customToken, network: event.target.value })}>
              {chains.map((item) => <option key={item.name}>{item.name}</option>)}
            </select>
          </div>
        </section>
      </>
    );
  }

  return (
    <main className="phone-shell">
      <section className="wallet-app">
        <header className="app-top">
          <button className="icon-button" aria-label="Wallet locked"><LockKeyhole size={20} /></button>
          <button className="network-pill" onClick={() => setChainOpen(!chainOpen)}>{chain.name} <ChevronDown size={16} /></button>
          <button className="icon-button" aria-label="Notifications"><Bell size={20} /></button>
        </header>

        {chainOpen && (
          <section className="chain-menu">
            {chains.map((item) => (
              <button key={item.name} onClick={() => { setChain(item); setChainOpen(false); setPage("chains"); }}>
                <strong>{item.name}</strong><span>{item.kind} • {item.native}</span>
              </button>
            ))}
          </section>
        )}

        {renderPage()}

        <footer className="bottom-nav">
          <button className={page === "wallet" ? "active" : ""} onClick={() => setPage("wallet")}><Wallet size={20} /><span>Wallet</span></button>
          <button className={page === "dex" ? "active" : ""} onClick={() => setPage("dex")}><ArrowDownUp size={20} /><span>DEX</span></button>
          <button className={page === "services" ? "active" : ""} onClick={() => setPage("services")}><BadgeDollarSign size={20} /><span>Services</span></button>
          <button className={page === "news" ? "active" : ""} onClick={() => setPage("news")}><CircleDollarSign size={20} /><span>Markets</span></button>
        </footer>
      </section>
    </main>
  );
}

function DexPage({ status, quoteDex }) {
  return (
    <section className="page-card">
      <h2>InfinityX DEX</h2>
      <p>Live quote routing uses Jupiter on Solana. Cross-chain routes need bridge providers and audited signing before release.</p>
      <div className="swap-box"><label>From</label><strong>0.1 SOL</strong></div>
      <div className="swap-box"><label>To</label><strong>USDC</strong></div>
      <button className="primary" onClick={quoteDex}><Zap size={18} /> Get Live Quote</button>
      <p className="status">{status}</p>
      <div className="fee-note">Service fee: {SERVICE_FEE_BPS / 100}% • IFX holders pay {IFX_DISCOUNT}% less.</div>
    </section>
  );
}

function ServicesPage() {
  return (
    <section className="page-card">
      <h2>Services</h2>
      <p>Fees are intentionally small and discounted when paying or holding IFX.</p>
      <div className="service-grid">
        {services.map((service) => {
          const Icon = service.icon;
          return (
            <article key={service.name}>
              <Icon size={20} />
              <strong>{service.name}</strong>
              <span>{service.fee}</span>
              <em>IFX {service.ifx}</em>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ChainsPage({ selected, setChain }) {
  return (
    <section className="page-card">
      <h2>{selected.name}</h2>
      <p>{selected.kind} network • Native asset {selected.native}</p>
      <div className="chain-detail">
        <span>RPC</span><strong>{selected.rpc}</strong>
        <span>Explorer</span><strong>{selected.explorer}</strong>
      </div>
      <div className="chain-list-page">
        {chains.map((chain) => <button key={chain.name} onClick={() => setChain(chain)}>{chain.name}<span>{chain.kind}</span></button>)}
      </div>
    </section>
  );
}

function NewsPage({ coins, loadCoins, status }) {
  return (
    <section className="page-card">
      <h2>Markets</h2>
      <p>CoinGecko market feed for top coins. Use this as discovery, not investment advice.</p>
      <button className="primary" onClick={loadCoins}><Globe2 size={18} /> Load Top 3000</button>
      <p className="status">{status}</p>
      <div className="market-strip">
        {(coins.length ? coins.slice(0, 9) : topAssets).map((coin) => (
          <article key={`${coin.symbol}-${coin.name}`}>
            <strong>{coin.symbol}</strong>
            <span>{coin.price ? `$${Number(coin.price).toLocaleString()}` : coin.name}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
