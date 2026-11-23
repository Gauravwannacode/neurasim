import { useRef, useState } from "react";
import { useNetworkStore } from "../../lib/store";
import {
  DEFAULT_PARAMS,
  INPUT_KINDS,
  INPUT_LABELS,
  MODEL_LABELS,
  NEURON_MODELS,
  type InputSource,
  type NeuronModel,
  type NeuronParams,
  type Population,
  type Synapse,
} from "../../lib/network";
import { parsePatternFile } from "../../lib/pattern";
import { Field, NumberField, Section, SelectField, TextField } from "./fields";

/** Classic Izhikevich (2003) firing classes. */
const IZH_PRESETS: Record<string, Pick<NeuronParams, "a" | "b" | "c" | "d">> = {
  "Regular spiking (RS)": { a: 0.02, b: 0.2, c: -65, d: 8 },
  "Intrinsically bursting (IB)": { a: 0.02, b: 0.2, c: -55, d: 4 },
  "Chattering (CH)": { a: 0.02, b: 0.2, c: -50, d: 2 },
  "Fast spiking (FS)": { a: 0.1, b: 0.2, c: -65, d: 2 },
  "Low-threshold spiking (LTS)": { a: 0.02, b: 0.25, c: -65, d: 2 },
};

function PopulationPanel({ pop }: { pop: Population }) {
  const update = useNetworkStore((s) => s.updatePopulation);
  const setP = (patch: Partial<NeuronParams>) => update(pop.id, { params: { ...pop.params, ...patch } });
  const p = pop.params;

  return (
    <>
      <Section title="Population">
        <div className="col-span-2">
          <TextField label="Label" value={pop.label} onChange={(label) => update(pop.id, { label })} />
        </div>
        <NumberField label="Neurons" value={pop.count} min={1} max={5000} step={1} onChange={(count) => update(pop.id, { count: Math.round(count) })} />
        <SelectField<NeuronModel>
          label="Model"
          value={pop.model}
          options={NEURON_MODELS.map((m) => ({ value: m, label: MODEL_LABELS[m] }))}
          onChange={(model) => update(pop.id, { model, params: { ...DEFAULT_PARAMS[model] } })}
        />
      </Section>
      <Section title="Dynamics">
        <NumberField
          label={pop.model === "izhikevich" ? "Spike peak" : "Threshold"}
          unit="mV"
          value={p.v_th}
          onChange={(v_th) => setP({ v_th })}
          hint={pop.model === "hh" ? "Membrane potential at which an action potential is counted as a spike." : "Voltage at which the neuron emits a spike and resets."}
        />
        <NumberField label="Refractory" unit="ms" min={0} value={p.t_ref} onChange={(t_ref) => setP({ t_ref })} hint="Period after a spike during which the neuron cannot fire again." />
        <NumberField label="Synaptic τ" unit="ms" min={0.1} value={p.tau_syn} onChange={(tau_syn) => setP({ tau_syn })} hint="Decay time constant of the post-synaptic current." />
        <NumberField label="Bias current" value={p.bias} onChange={(bias) => setP({ bias })} hint="Constant input current (model units)." />
        <NumberField label="Noise σ" min={0} value={p.noise} onChange={(noise) => setP({ noise })} hint="Std. dev. of white-noise input current." />
        {pop.model === "lif" && (
          <>
            <NumberField label="τ membrane" unit="ms" min={0.1} value={p.tau_m} onChange={(tau_m) => setP({ tau_m })} />
            <NumberField label="V rest" unit="mV" value={p.v_rest} onChange={(v_rest) => setP({ v_rest })} />
            <NumberField label="V reset" unit="mV" value={p.v_reset} onChange={(v_reset) => setP({ v_reset })} />
            <NumberField label="Adaptation b" unit="mV" min={0} value={p.adapt_b} onChange={(adapt_b) => setP({ adapt_b })} hint="Spike-triggered adaptation current increment (0 = none)." />
            <NumberField label="Adaptation τ" unit="ms" min={1} value={p.tau_w} onChange={(tau_w) => setP({ tau_w })} />
          </>
        )}
        {pop.model === "izhikevich" && (
          <>
            <div className="col-span-2">
              <Field label="Firing class">
                <select
                  className="input"
                  value=""
                  onChange={(e) => e.target.value && setP(IZH_PRESETS[e.target.value])}
                >
                  <option value="">Choose a preset…</option>
                  {Object.keys(IZH_PRESETS).map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </Field>
            </div>
            <NumberField label="a" value={p.a} onChange={(a) => setP({ a })} hint="Recovery time scale" />
            <NumberField label="b" value={p.b} onChange={(b) => setP({ b })} hint="Recovery sensitivity" />
            <NumberField label="c" unit="mV" value={p.c} onChange={(c) => setP({ c })} hint="After-spike reset voltage" />
            <NumberField label="d" value={p.d} onChange={(d) => setP({ d })} hint="After-spike recovery increment" />
          </>
        )}
        {pop.model === "hh" && (
          <p className="col-span-2 text-xs leading-relaxed text-slate-400">
            Uses the original squid-axon conductances (g<sub>Na</sub>=120, g<sub>K</sub>=36, g<sub>L</sub>=0.3 mS/cm²).
            Input current is in µA/cm²; rhythmic firing starts around 6–7 µA/cm².
          </p>
        )}
      </Section>
    </>
  );
}

function InputPanel({ input }: { input: InputSource }) {
  const update = useNetworkStore((s) => s.updateInput);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(file: File) {
    try {
      const pattern = parsePatternFile(file.name, await file.text());
      update(input.id, { pattern, count: pattern.length });
      setMsg(`Loaded ${pattern.length} neurons, ${pattern.reduce((a, r) => a + r.length, 0)} spikes`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <>
      <Section title="Input layer">
        <div className="col-span-2">
          <TextField label="Label" value={input.label} onChange={(label) => update(input.id, { label })} />
        </div>
        <NumberField label="Neurons" value={input.count} min={1} max={5000} step={1} onChange={(count) => update(input.id, { count: Math.round(count) })} />
        <SelectField
          label="Spike train"
          value={input.kind}
          options={INPUT_KINDS.map((k) => ({ value: k, label: INPUT_LABELS[k] }))}
          onChange={(kind) =>
            update(input.id, {
              kind,
              rate_max_hz: kind === "rate" ? input.rate_max_hz ?? input.rate_hz * 4 : input.rate_max_hz,
              pattern: kind === "pattern" ? input.pattern ?? Array.from({ length: input.count }, (_, i) => [10 + i * 2]) : input.pattern,
            })
          }
        />
        {input.kind !== "pattern" && (
          <NumberField label={input.kind === "rate" ? "Min rate" : "Rate"} unit="Hz" min={0} value={input.rate_hz} onChange={(rate_hz) => update(input.id, { rate_hz })} />
        )}
        {input.kind === "rate" && (
          <NumberField label="Max rate" unit="Hz" min={0} value={input.rate_max_hz} onChange={(rate_max_hz) => update(input.id, { rate_max_hz })} hint="Rates are spread linearly across neurons: a rate code." />
        )}
        <NumberField label="Start" unit="ms" min={0} value={input.start_ms} onChange={(start_ms) => update(input.id, { start_ms })} />
        <NumberField label="Stop" unit="ms" min={0} value={input.stop_ms ?? undefined} onChange={(stop_ms) => update(input.id, { stop_ms })} onClear={() => update(input.id, { stop_ms: null })} hint="Leave empty to run until the end." />
      </Section>
      {input.kind === "pattern" && (
        <Section title="Custom pattern">
          <NumberField label="Repeat period" unit="ms" min={1} value={input.period_ms ?? undefined} onChange={(period_ms) => update(input.id, { period_ms })} onClear={() => update(input.id, { period_ms: null })} />
          <div className="flex items-end">
            <button className="btn-ghost w-full justify-center" onClick={() => fileRef.current?.click()}>
              Upload CSV / JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,.txt"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </div>
          <p className="col-span-2 text-xs text-slate-400">
            CSV rows <code className="text-slate-300">neuron,time_ms</code> or JSON{" "}
            <code className="text-slate-300">[[t0,t1,…], …]</code> (one list per neuron).
            {msg && <span className="mt-1 block text-sky-300">{msg}</span>}
          </p>
        </Section>
      )}
    </>
  );
}

function SynapsePanel({ syn }: { syn: Synapse }) {
  const update = useNetworkStore((s) => s.updateSynapse);
  const network = useNetworkStore((s) => s.network);
  const name = (id: string) =>
    network.populations.find((p) => p.id === id)?.label ?? network.inputs.find((i) => i.id === id)?.label ?? id;
  const setStdp = (patch: Partial<Synapse["stdp"]>) => update(syn.id, { stdp: { ...syn.stdp, ...patch } });

  return (
    <>
      <Section title="Synaptic projection">
        <p className="col-span-2 text-sm text-slate-300">
          {name(syn.source)} <span className="text-slate-500">→</span> {name(syn.target)}
        </p>
        <NumberField label="Weight" value={syn.weight} onChange={(weight) => update(syn.id, { weight })} hint="Negative = inhibitory. Units of the target model's input current." />
        <NumberField label="Weight σ" min={0} value={syn.weight_std} onChange={(weight_std) => update(syn.id, { weight_std })} hint="Gaussian jitter on initial weights." />
        <NumberField label="Connection p" min={0} max={1} step={0.01} value={syn.p_connect} onChange={(p_connect) => update(syn.id, { p_connect })} hint="Probability that any pre→post pair is connected." />
        <NumberField label="Delay" unit="ms" min={0} value={syn.delay_ms} onChange={(delay_ms) => update(syn.id, { delay_ms })} hint="Axonal + synaptic transmission delay." />
        {syn.source === syn.target && (
          <label className="col-span-2 flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={syn.allow_autapses} onChange={(e) => update(syn.id, { allow_autapses: e.target.checked })} />
            Allow self-connections (autapses)
          </label>
        )}
        <div className="col-span-2">
          <SelectField
            label="Plasticity"
            value={syn.plasticity}
            options={[
              { value: "static", label: "Static" },
              { value: "stdp", label: "STDP (spike-timing dependent)" },
            ]}
            onChange={(plasticity) => update(syn.id, { plasticity })}
          />
        </div>
      </Section>
      {syn.plasticity === "stdp" && (
        <Section title="STDP rule">
          <NumberField label="A+" min={0} value={syn.stdp.A_plus} onChange={(A_plus) => setStdp({ A_plus })} hint="Potentiation amplitude (pre before post)." />
          <NumberField label="A−" min={0} value={syn.stdp.A_minus} onChange={(A_minus) => setStdp({ A_minus })} hint="Depression amplitude (post before pre)." />
          <NumberField label="τ+" unit="ms" min={0.1} value={syn.stdp.tau_plus} onChange={(tau_plus) => setStdp({ tau_plus })} />
          <NumberField label="τ−" unit="ms" min={0.1} value={syn.stdp.tau_minus} onChange={(tau_minus) => setStdp({ tau_minus })} />
          <NumberField label="w min" value={syn.stdp.w_min} onChange={(w_min) => setStdp({ w_min })} />
          <NumberField label="w max" value={syn.stdp.w_max} onChange={(w_max) => setStdp({ w_max })} />
          <p className="col-span-2 text-xs leading-relaxed text-slate-400">
            Δw = A+·e<sup>−Δt/τ+</sup> when the presynaptic spike precedes the postsynaptic spike, and −A−·e<sup>Δt/τ−</sup> otherwise
            (Bi &amp; Poo 1998). A+ and A− are scaled by w max.
          </p>
        </Section>
      )}
    </>
  );
}

function NetworkPanel() {
  const network = useNetworkStore((s) => s.network);
  const { updateMeta, updateSim } = useNetworkStore.getState();
  const sim = network.sim;
  const steps = Math.round(sim.duration / sim.dt);
  const neurons = network.populations.reduce((a, p) => a + p.count, 0) + network.inputs.reduce((a, i) => a + i.count, 0);

  return (
    <>
      <Section title="Network">
        <div className="col-span-2">
          <TextField label="Name" value={network.name} onChange={(name) => updateMeta({ name })} />
        </div>
        <div className="col-span-2">
          <Field label="Description">
            <textarea className="input h-20 resize-y" value={network.description ?? ""} onChange={(e) => updateMeta({ description: e.target.value })} />
          </Field>
        </div>
      </Section>
      <Section title="Simulation">
        <NumberField label="Duration" unit="ms" min={1} value={sim.duration} onChange={(duration) => updateSim({ duration })} />
        <NumberField label="Time step dt" unit="ms" min={0.01} max={1} value={sim.dt} onChange={(dt) => updateSim({ dt })} hint="Hodgkin-Huxley needs dt ≤ 0.05 ms for accuracy." />
        <NumberField label="Seed" step={1} value={sim.seed} onChange={(seed) => updateSim({ seed: Math.round(seed) })} />
        <NumberField label="Traces / pop." min={0} max={50} step={1} value={sim.record_per_population} onChange={(v) => updateSim({ record_per_population: Math.round(v) })} hint="Number of neurons per population whose membrane voltage is recorded." />
        <p className="col-span-2 font-mono text-xs text-slate-400">
          {neurons} neurons · {steps.toLocaleString()} steps · {network.synapses.length} projections
        </p>
      </Section>
      <div className="px-4 py-3 text-xs leading-relaxed text-slate-400">
        <p className="mb-1 font-semibold text-slate-300">Tips</p>
        Drag from a node's right handle onto a population to create a synapse. Select a node or edge to edit it; press
        Delete to remove it.
      </div>
    </>
  );
}

export default function Inspector() {
  const selection = useNetworkStore((s) => s.selection);
  const network = useNetworkStore((s) => s.network);
  const { removeNode, removeSynapse } = useNetworkStore.getState();

  let body = <NetworkPanel />;
  if (selection?.kind === "population") {
    const pop = network.populations.find((p) => p.id === selection.id);
    if (pop) body = <PopulationPanel key={pop.id} pop={pop} />;
  } else if (selection?.kind === "input") {
    const input = network.inputs.find((i) => i.id === selection.id);
    if (input) body = <InputPanel key={input.id} input={input} />;
  } else if (selection?.kind === "synapse") {
    const syn = network.synapses.find((x) => x.id === selection.id);
    if (syn) body = <SynapsePanel key={syn.id} syn={syn} />;
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col overflow-y-auto border-l border-ink-700 bg-ink-900">
      {body}
      {selection && (
        <div className="px-4 py-3">
          <button
            className="btn-danger w-full justify-center"
            onClick={() => (selection.kind === "synapse" ? removeSynapse(selection.id) : removeNode(selection.id))}
          >
            Delete {selection.kind}
          </button>
        </div>
      )}
    </aside>
  );
}
