/** Single-neuron models that run in the browser (the same equations as the server engine). */
export type CellKind = "lif" | "izhikevich" | "hh";

export interface Cell {
  /** Advance by dt milliseconds; returns true when a spike is emitted. */
  step(current: number, dt: number): boolean;
  v: number;
  threshold: number;
  /** Useful input range for a slider, in the model's own units. */
  max: number;
  unit: string;
}

const vtrap = (x: number, y: number) => (Math.abs(x / y) < 1e-6 ? y * (1 - x / y / 2) : x / Math.expm1(x / y));

export function makeCell(kind: CellKind): Cell {
  if (kind === "lif") {
    let ref = 0;
    return {
      v: -65, threshold: -50, max: 40, unit: "mV",
      step(i, dt) {
        if (ref > 0) { ref -= dt; this.v = -70; return false; }
        this.v += ((-(this.v + 65) + i) * dt) / 20;
        if (this.v < -50) return false;
        this.v = -70;
        ref = 2;
        return true;
      },
    };
  }
  if (kind === "izhikevich") {
    let u = -13;
    return {
      v: -65, threshold: 30, max: 20, unit: "a.u.",
      step(i, dt) {
        for (let k = 0; k < 2; k++) this.v += 0.5 * dt * (0.04 * this.v * this.v + 5 * this.v + 140 - u + i);
        u += dt * 0.02 * (0.2 * this.v - u);
        if (this.v < 30) return false;
        this.v = -65;
        u += 8;
        return true;
      },
    };
  }
  let m = 0.0529, h = 0.5961, n = 0.3177, above = false;
  return {
    v: -65, threshold: 0, max: 20, unit: "µA/cm²",
    step(i, dt) {
      const sub = Math.max(1, Math.ceil(dt / 0.025));
      const d = dt / sub;
      for (let k = 0; k < sub; k++) {
        const v = this.v;
        const gate = (x: number, a: number, b: number) => a / (a + b) + (x - a / (a + b)) * Math.exp(-d * (a + b));
        m = gate(m, 0.1 * vtrap(-(v + 40), 10), 4 * Math.exp(-(v + 65) / 18));
        h = gate(h, 0.07 * Math.exp(-(v + 65) / 20), 1 / (1 + Math.exp(-(v + 35) / 10)));
        n = gate(n, 0.01 * vtrap(-(v + 55), 10), 0.125 * Math.exp(-(v + 65) / 80));
        this.v += d * (i - 120 * m ** 3 * h * (v - 50) - 36 * n ** 4 * (v + 77) - 0.3 * (v + 54.387));
      }
      const fired = this.v >= 0 && !above;
      above = this.v >= 0;
      return fired;
    },
  };
}

