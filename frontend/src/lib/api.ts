import { getToken } from "./auth";
import type { Network } from "./network";

export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  const token = getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return body.detail.map((d: { loc?: (string | number)[]; msg: string }) => `${(d.loc ?? []).slice(1).join(".")} ${d.msg}`.trim()).join("; ");
  } catch {
    /* not JSON */
  }
  return `${res.status} ${res.statusText}`;
}

/** fetch() that turns network failures into an actionable message. */
async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error(`Cannot reach the NeuraSim server at ${API_URL}. Is the backend running?`);
  }
}

export async function getJSON<T>(path: string): Promise<T> {
  const res = await call(`${API_URL}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await call(`${API_URL}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function postForBlob(path: string, body: unknown): Promise<Blob> {
  const res = await call(`${API_URL}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.blob();
}

export interface SSEMessage {
  event: string;
  data: string;
}

/**
 * Minimal Server-Sent Events reader over fetch (EventSource cannot POST a body).
 * Calls onMessage for every complete event until the stream ends or is aborted.
 */
export async function postSSE(
  path: string,
  body: unknown,
  onMessage: (m: SSEMessage) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await call(`${API_URL}${path}`, {
    method: "POST",
    headers: headers({ Accept: "text/event-stream" }),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(await errorMessage(res));
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value.replace(/\r\n/g, "\n");
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length) onMessage({ event, data: data.join("\n") });
    }
  }
}

export function streamSimulation(net: Network, paceMs: number, onMessage: (m: SSEMessage) => void, signal: AbortSignal) {
  return postSSE(`/simulate/stream?pace_ms=${paceMs}`, net, onMessage, signal);
}
