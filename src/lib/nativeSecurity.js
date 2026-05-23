import { Capacitor, registerPlugin } from "@capacitor/core";

const SecureGate = registerPlugin("InfinityXSecureGate");

export async function requireNativeSigningGate(reason = "Approve InfinityX signing") {
  if (!Capacitor.isNativePlatform()) {
    return { ok: true, native: false, reason: "web-or-desktop-dev" };
  }
  const result = await SecureGate.authenticate({ reason });
  if (!result?.ok) throw new Error(result?.message || "Native security approval failed.");
  return result;
}

export async function getNativeSecurityStatus() {
  if (!Capacitor.isNativePlatform()) {
    return { native: false, biometricAvailable: false, hardwareBackedKey: false };
  }
  return SecureGate.status();
}
