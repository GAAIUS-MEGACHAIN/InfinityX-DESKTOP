const LIFI_QUOTE_API = "https://li.quest/v1/quote";

export const EVM_NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

export async function getLifiBridgeQuote({
  fromChain,
  toChain,
  fromToken = EVM_NATIVE_TOKEN,
  toToken = EVM_NATIVE_TOKEN,
  fromAmount,
  fromAddress,
  toAddress
}) {
  const url = new URL(LIFI_QUOTE_API);
  url.searchParams.set("fromChain", String(fromChain));
  url.searchParams.set("toChain", String(toChain));
  url.searchParams.set("fromToken", fromToken);
  url.searchParams.set("toToken", toToken);
  url.searchParams.set("fromAmount", String(fromAmount));
  url.searchParams.set("fromAddress", fromAddress);
  url.searchParams.set("toAddress", toAddress || fromAddress);
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || `LI.FI quote failed: ${response.status}`);
  }
  return payload;
}
