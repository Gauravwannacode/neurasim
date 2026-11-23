import { useRef, useState } from "react";
import { postForBlob } from "../../lib/api";
import { parseNetwork } from "../../lib/network";
import { useNetworkStore } from "../../lib/store";
import { useSimStore } from "../../lib/simStore";

export function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "network";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export / import the network definition as re-importable JSON. */
export function NetworkJsonButtons() {
  const network = useNetworkStore((s) => s.network);
  const setNetwork = useNetworkStore((s) => s.setNetwork);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function exportJson() {
    const blob = new Blob([JSON.stringify(network, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${slug(network.name)}.neurasim.json`);
  }

  async function importJson(file: File) {
    setError(null);
    try {
      const raw = JSON.parse(await file.text());
      // Accept either a bare network or a preset file ({ network: {...} }).
      setNetwork(parseNetwork(raw && typeof raw === "object" && "network" in raw ? raw.network : raw));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <button className="btn-ghost" onClick={() => fileRef.current?.click()} title="Load a network JSON file">
        Import
      </button>
      <button className="btn-ghost" onClick={exportJson} title="Download this network as JSON">
        Export JSON
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) importJson(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {error && (
        <span className="max-w-xs truncate text-xs text-rose-300" title={error}>
          {error}
        </span>
      )}
    </>
  );
}

/** Spike raster CSV (built client-side from the streamed run) and PDF report (rendered by the backend). */
export function RunExportButtons() {
  const status = useSimStore((s) => s.status);
  const meta = useSimStore((s) => s.meta);
  const runNetwork = useSimStore((s) => s.network);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = status === "done" && meta && runNetwork;

  function exportCsv() {
    const { spikes, meta } = useSimStore.getState();
    if (!meta) return;
    const rows: string[] = ["time_ms,neuron_id,group,local_index"];
    const all: [number, number, string, number][] = [];
    for (const g of meta.groups) {
      const s = spikes[g.id];
      for (let i = 0; i < s.t.length; i++) all.push([s.t[i], s.id[i], g.id, s.id[i] - g.offset]);
    }
    all.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const r of all) rows.push(r.join(","));
    downloadBlob(new Blob([rows.join("\n") + "\n"], { type: "text/csv" }), `${slug(meta.name)}-raster.csv`);
  }

  async function exportPdf() {
    if (!runNetwork) return;
    setBusy(true);
    setError(null);
    try {
      downloadBlob(await postForBlob("/export/pdf", runNetwork), `${slug(runNetwork.name)}-report.pdf`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn-ghost" disabled={!ready} onClick={exportCsv} title="Download every spike as CSV">
        CSV
      </button>
      <button className="btn-ghost" disabled={!ready || busy} onClick={exportPdf} title="Generate a PDF summary report">
        {busy ? "Rendering…" : "PDF report"}
      </button>
      {error && <span className="max-w-xs truncate text-xs text-rose-300" title={error}>{error}</span>}
    </>
  );
}
