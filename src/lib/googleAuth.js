const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";

export function getGoogleClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
}

export async function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return window.google;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return window.google;
}

export async function initializeGoogleSignIn(buttonElement, onCredential) {
  const clientId = getGoogleClientId();
  if (!clientId) {
    return { ok: false, reason: "Missing VITE_GOOGLE_CLIENT_ID" };
  }
  const google = await loadGoogleIdentity();
  google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => onCredential(response.credential),
    auto_select: false,
    cancel_on_tap_outside: true
  });
  google.accounts.id.renderButton(buttonElement, {
    theme: "outline",
    size: "large",
    type: "standard",
    shape: "pill",
    text: "signin_with"
  });
  return { ok: true };
}
