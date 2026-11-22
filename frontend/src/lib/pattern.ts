/**
 * Parse an uploaded spike pattern into one sorted list of spike times per neuron.
 *
 * Accepted formats:
 *  - CSV / TXT with rows `neuron,time_ms` (an optional header row is skipped)
 *  - JSON `[[t, t, ...], [t, ...], ...]` (one array per neuron)
 *  - JSON `{"spikes": [[neuron, time_ms], ...]}`
 */
export function parsePatternFile(name: string, text: string): number[][] {
  const MAX_NEURONS = 5000;
  let pairs: [number, number][] = [];

  if (name.toLowerCase().endsWith(".json")) {
    const data = JSON.parse(text);
    if (Array.isArray(data) && data.every((row) => Array.isArray(row))) {
      const rows = data as unknown[][];
      if (rows.length > MAX_NEURONS) throw new Error(`Too many neurons (max ${MAX_NEURONS})`);
      return rows.map((row) => row.map(Number).filter((t) => Number.isFinite(t) && t >= 0).sort((a, b) => a - b));
    }
    if (data && Array.isArray(data.spikes)) pairs = data.spikes.map((p: unknown[]) => [Number(p[0]), Number(p[1])]);
    else throw new Error("JSON must be [[t,...],...] or {spikes:[[neuron,t],...]}");
  } else {
    for (const line of text.split(/\r?\n/)) {
      const parts = line.split(/[,;\t ]+/).filter(Boolean);
      if (parts.length < 2) continue;
      const n = Number(parts[0]);
      const t = Number(parts[1]);
      if (!Number.isFinite(n) || !Number.isFinite(t)) continue; // header or junk
      pairs.push([n, t]);
    }
  }

  if (pairs.length === 0) throw new Error("No spikes found in file");
  const maxId = Math.max(...pairs.map((p) => p[0]));
  if (maxId >= MAX_NEURONS) throw new Error(`Neuron index ${maxId} exceeds max ${MAX_NEURONS - 1}`);
  const out: number[][] = Array.from({ length: Math.floor(maxId) + 1 }, () => []);
  for (const [n, t] of pairs) if (n >= 0 && t >= 0) out[Math.floor(n)].push(t);
  out.forEach((r) => r.sort((a, b) => a - b));
  return out;
}
