import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  isAddress,
  parseAbi,
  parseEther,
  parseUnits
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { unlockVault } from "./vault.js";

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
]);

const CHAIN_IDS = {
  Ethereum: 1,
  Polygon: 137,
  "BNB Chain": 56,
  Base: 8453,
  Arbitrum: 42161,
  Optimism: 10,
  Avalanche: 43114,
  Fantom: 250
};

export async function getEvmWalletState({ password, chain, accountIndex = 0 }) {
  const { account, publicClient } = await unlockEvmSigner({ password, chain, accountIndex });
  const balance = await publicClient.getBalance({ address: account.address });
  return {
    address: account.address,
    native: formatEther(balance),
    wei: balance.toString()
  };
}

export async function deriveEvmAddress({ password, accountIndex = 0 }) {
  const vault = await unlockVault(password);
  const account = mnemonicToAccount(vault.phrase, { path: `m/44'/60'/0'/0/${accountIndex}` });
  return account.address;
}

export async function sendEvmNative({ password, chain, to, amount, accountIndex = 0 }) {
  if (!isAddress(to)) throw new Error("Invalid EVM recipient address.");
  const { account, walletClient, publicClient } = await unlockEvmSigner({ password, chain, accountIndex });
  const value = parseEther(String(amount));
  await publicClient.estimateGas({ account: account.address, to, value });
  const hash = await walletClient.sendTransaction({ account, chain: walletClient.chain, to, value });
  return { hash, explorer: `${chain.explorer}/tx/${hash}` };
}

export async function sendErc20Token({ password, chain, tokenAddress, to, amount, decimals, accountIndex = 0 }) {
  if (!isAddress(to)) throw new Error("Invalid EVM recipient address.");
  if (!isAddress(tokenAddress)) throw new Error("Invalid ERC-20 contract address.");
  const { account, walletClient, publicClient } = await unlockEvmSigner({ password, chain, accountIndex });
  const tokenDecimals = Number.isFinite(Number(decimals))
    ? Number(decimals)
    : Number(await publicClient.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "decimals" }));
  const value = parseUnits(String(amount), tokenDecimals);
  const { request } = await publicClient.simulateContract({
    account,
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [to, value]
  });
  const hash = await walletClient.writeContract(request);
  return { hash, explorer: `${chain.explorer}/tx/${hash}` };
}

export async function sendEvmTransactionRequest({ password, chain, request, accountIndex = 0 }) {
  const { account, walletClient, publicClient } = await unlockEvmSigner({ password, chain, accountIndex });
  if (!request?.to || !isAddress(request.to)) throw new Error("Bridge transaction is missing a valid target contract.");
  const tx = {
    account,
    chain: walletClient.chain,
    to: request.to,
    data: request.data,
    value: BigInt(request.value ?? 0)
  };
  await publicClient.estimateGas({ account: account.address, to: tx.to, data: tx.data, value: tx.value });
  const hash = await walletClient.sendTransaction(tx);
  return { hash, explorer: `${chain.explorer}/tx/${hash}` };
}

export function isSupportedEvmChain(chain) {
  return Boolean(chain?.rpc?.startsWith("http") && CHAIN_IDS[chain.name]);
}

async function unlockEvmSigner({ password, chain, accountIndex }) {
  if (!isSupportedEvmChain(chain)) throw new Error(`${chain.name} is not yet wired for live EVM signing.`);
  const vault = await unlockVault(password);
  if (!vault.phrase) throw new Error("Vault does not contain a mnemonic phrase.");
  const account = mnemonicToAccount(vault.phrase, { path: `m/44'/60'/0'/0/${accountIndex}` });
  const evmChain = defineChain({
    id: CHAIN_IDS[chain.name],
    name: chain.name,
    nativeCurrency: { name: chain.native, symbol: chain.native, decimals: 18 },
    rpcUrls: { default: { http: [chain.rpc] }, public: { http: [chain.rpc] } },
    blockExplorers: { default: { name: "Explorer", url: chain.explorer } }
  });
  const transport = http(chain.rpc);
  return {
    account,
    publicClient: createPublicClient({ chain: evmChain, transport }),
    walletClient: createWalletClient({ account, chain: evmChain, transport })
  };
}
