// URL-safe base64 for share links (no padding). Works on bytes so any text or binary fits.

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(data: string): Uint8Array {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

export const toBase64Url = (text: string) => bytesToBase64Url(new TextEncoder().encode(text));
export const fromBase64Url = (data: string) => new TextDecoder().decode(base64UrlToBytes(data));
