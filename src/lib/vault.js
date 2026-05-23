import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { Keypair } from "@solana/web3.js";

const VAULT_KEY = "infinityx.encryptedVault.v1";

export function createMnemonic(strength = 128) {
  return generateMnemonic(wordlist, strength);
}

export function validateSeedPhrase(phrase) {
  return validateMnemonic(phrase.trim().toLowerCase(), wordlist);
}

export function deriveSolanaAccount(phrase, accountIndex = 0) {
  const seed = mnemonicToSeedSync(phrase.trim().toLowerCase(), `infinityx-${accountIndex}`);
  const keypair = Keypair.fromSeed(seed.slice(0, 32));
  return {
    index: accountIndex,
    address: keypair.publicKey.toBase58(),
    publicKey: keypair.publicKey.toBase58()
  };
}

export async function encryptVault(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(password, salt);
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return {
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: 250000,
    cipher: "AES-GCM",
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted))
  };
}

export async function decryptVault(encryptedVault, password) {
  const salt = fromBase64(encryptedVault.salt);
  const iv = fromBase64(encryptedVault.iv);
  const key = await passwordKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    fromBase64(encryptedVault.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function saveVault(payload, password) {
  const encrypted = await encryptVault(payload, password);
  localStorage.setItem(VAULT_KEY, JSON.stringify(encrypted));
  return encrypted;
}

export function hasVault() {
  return Boolean(localStorage.getItem(VAULT_KEY));
}

export function loadEncryptedVault() {
  const value = localStorage.getItem(VAULT_KEY);
  return value ? JSON.parse(value) : null;
}

async function passwordKey(password, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
