/**
 * Share links carry the whole network, compressed, in the URL fragment. The
 * fragment is never sent to a server, so sharing needs no storage or account.
 */
import { parseNetwork, type Network } from "./network";

const MAX_LINK = 30_000; // characters; longer links break in chat apps and some browsers
const MAX_JSON = 5_000_000; // decompressed bytes accepted from a link

async function pump(data: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const body = new Blob([data as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("This link contains too much data.");
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export async function shareLink(net: Network): Promise<string> {
  const packed = await pump(new TextEncoder().encode(JSON.stringify(net)), new CompressionStream("deflate-raw"), MAX_JSON);
  let binary = "";
  for (const b of packed) binary += String.fromCharCode(b);
  const code = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (code.length > MAX_LINK) throw new Error("This network is too big for a link. Export it as JSON instead.");
  return `${window.location.origin}/builder#n=${code}`;
}

/** Network carried by a URL fragment, or null if the fragment holds none. */
export async function networkFromHash(hash: string): Promise<Network | null> {
  const code = /^#n=([A-Za-z0-9_-]+)$/.exec(hash)?.[1];
  if (!code) return null;
  try {
    const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = await pump(bytes, new DecompressionStream("deflate-raw"), MAX_JSON);
    return parseNetwork(JSON.parse(new TextDecoder().decode(json)));
  } catch (e) {
    throw new Error(`This share link could not be read. ${e instanceof Error && e.message.startsWith("Invalid network") ? e.message : "It may be incomplete."}`);
  }
}
