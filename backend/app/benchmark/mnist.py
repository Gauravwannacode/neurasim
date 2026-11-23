"""MNIST benchmark: spiking network vs. conventional ANN.

Both networks have the same 784-H-10 architecture and are trained on the same
subset of MNIST on the CPU:

* **ANN** – ReLU MLP on raw pixel intensities.
* **SNN** – pixels are Poisson rate-encoded into spike trains of ``T`` steps;
  a hidden layer of LIF neurons feeds a non-spiking leaky-integrator readout
  whose maximum membrane potential over time is the class score. It is
  trained end to end with surrogate gradients (Zenke & Ganguli 2018; Neftci,
  Mostafa & Zenke 2019). When Norse is installed its ``LIFCell``/``LICell``
  are used, otherwise an equivalent built-in implementation.

Energy is estimated per inference from operation counts with the same
Horowitz (2014) constants as the simulator (MAC 4.6 pJ, AC 0.9 pJ): the ANN
needs one MAC per weight, the SNN one AC per *delivered spike* per synapse.
Two further figures keep the comparison honest:

* the SNN's neuron-state updates (two decays, i.e. 2 MACs, per neuron per step),
  which synaptic operation counts leave out;
* an ANN that skips multiplications by zero, as sparse accelerators do. Most
  MNIST pixels are black, so this removes much of the SNN's apparent advantage.

Run ``python -m app.benchmark.mnist`` (needs ``requirements-benchmark.txt``)
to regenerate ``results.json``, which the API serves.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

from ..engine.energy import E_AC_PJ, E_MAC_PJ

RESULTS_PATH = Path(__file__).with_name("results.json")
ProgressFn = Callable[[str, float, str, dict | None], None]


def torch_available() -> bool:
    try:
        import torch  # noqa: F401
        import torchvision  # noqa: F401
    except ImportError:
        return False
    return True


def load_results() -> dict | None:
    if RESULTS_PATH.exists():
        return json.loads(RESULTS_PATH.read_text(encoding="utf-8"))
    return None


def run_benchmark(
    train_size: int = 30_000,
    test_size: int = 5_000,
    epochs: int = 5,
    hidden: int = 256,
    timesteps: int = 32,
    f_max_hz: float = 200.0,
    batch_size: int = 128,
    seed: int = 0,
    data_dir: str | None = None,
    progress: ProgressFn | None = None,
) -> dict:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torchvision import datasets, transforms

    def report(stage: str, frac: float, msg: str, extra: dict | None = None):
        if progress:
            progress(stage, frac, msg, extra)

    torch.manual_seed(seed)
    torch.set_num_threads(max(1, min(8, os.cpu_count() or 1)))
    data_dir = data_dir or os.path.join(os.path.dirname(__file__), "..", "..", "data")

    report("data", 0.0, "Loading MNIST", None)
    tf = transforms.ToTensor()
    train_ds = datasets.MNIST(data_dir, train=True, download=True, transform=tf)
    test_ds = datasets.MNIST(data_dir, train=False, download=True, transform=tf)
    g = torch.Generator().manual_seed(seed)
    tr_idx = torch.randperm(len(train_ds), generator=g)[:train_size]
    te_idx = torch.randperm(len(test_ds), generator=g)[:test_size]
    x_train = train_ds.data[tr_idx].float().div(255).view(-1, 784)
    y_train = train_ds.targets[tr_idx]
    x_test = test_ds.data[te_idx].float().div(255).view(-1, 784)
    y_test = test_ds.targets[te_idx]

    dt = 1e-3  # 1 ms per SNN step

    def encode(x: torch.Tensor, gen: torch.Generator | None = None) -> torch.Tensor:
        """Poisson rate code: [B,784] intensities -> [T,B,784] binary spikes."""
        p = (x * f_max_hz * dt).clamp(0, 1)
        r = torch.rand((timesteps, *x.shape), generator=gen)
        return (r < p).float()

    # ------------------------------------------------------------------ models
    class ANN(nn.Module):
        def __init__(self):
            super().__init__()
            self.fc1, self.fc2 = nn.Linear(784, hidden), nn.Linear(hidden, 10)

        def forward(self, x):
            return self.fc2(F.relu(self.fc1(x)))

    backend = "builtin"
    try:
        import norse.torch as norse

        backend = f"norse {getattr(__import__('norse'), '__version__', '')}".strip()
    except Exception:  # pragma: no cover - depends on optional dependency
        norse = None

    class SurrogateSpike(torch.autograd.Function):
        """Heaviside forward, SuperSpike fast-sigmoid derivative backward (Zenke & Ganguli 2018)."""

        alpha = 100.0

        @staticmethod
        def forward(ctx, x):
            ctx.save_for_backward(x)
            return (x > 0).float()

        @staticmethod
        def backward(ctx, grad):
            (x,) = ctx.saved_tensors
            return grad / (SurrogateSpike.alpha * x.abs() + 1.0) ** 2

    class SNN(nn.Module):
        def __init__(self):
            super().__init__()
            self.fc1, self.fc2 = nn.Linear(784, hidden), nn.Linear(hidden, 10)
            if norse is not None:
                self.lif = norse.LIFCell()
                self.li = norse.LICell()

        def forward(self, spikes, record: bool = False):
            T, B, _ = spikes.shape
            s_lif = s_li = None
            v_lif = torch.zeros(B, hidden)
            i_lif = torch.zeros(B, hidden)
            v_out = torch.zeros(B, 10)
            i_out = torch.zeros(B, 10)
            # Same discretisation and defaults as Norse: tau_mem = 10 ms, tau_syn = 5 ms, v_th = 1.
            a_mem, a_syn = dt / 0.01, dt / 0.005
            outs, hidden_spikes = [], []
            for t in range(T):
                z = self.fc1(spikes[t])
                if norse is not None:
                    h, s_lif = self.lif(z, s_lif)
                    v, s_li = self.li(self.fc2(h), s_li)
                else:
                    v_lif = v_lif + a_mem * (i_lif - v_lif)
                    i_lif = (1 - a_syn) * i_lif
                    h = SurrogateSpike.apply(v_lif - 1.0)
                    v_lif = v_lif * (1 - h)
                    i_lif = i_lif + z
                    v_out = v_out + a_mem * (i_out - v_out)
                    i_out = (1 - a_syn) * i_out + self.fc2(h)
                    v = v_out
                outs.append(v)
                hidden_spikes.append(h)
            out = torch.stack(outs)  # [T,B,10]
            hs = torch.stack(hidden_spikes)  # [T,B,H]
            return out.max(0).values, hs, out

    # --------------------------------------------------------------- training
    def train(model, kind: str, frac0: float, frac1: float) -> tuple[list[float], float]:
        opt = torch.optim.Adam(model.parameters(), lr=1e-3 if kind == "ann" else 2e-3)
        curve: list[float] = []
        n_batches = (train_size + batch_size - 1) // batch_size
        total = epochs * n_batches
        gen = torch.Generator().manual_seed(seed + 1)
        t0 = time.perf_counter()
        step = 0
        for epoch in range(epochs):
            perm = torch.randperm(train_size, generator=gen)
            running = 0.0
            for b in range(n_batches):
                idx = perm[b * batch_size : (b + 1) * batch_size]
                x, y = x_train[idx], y_train[idx]
                if kind == "ann":
                    logits = model(x)
                else:
                    logits, _, _ = model(encode(x, gen))
                loss = F.cross_entropy(logits, y)
                opt.zero_grad()
                loss.backward()
                opt.step()
                running += loss.item()
                step += 1
                if step % 10 == 0 or step == total:
                    curve.append(round(running / (b + 1), 4))
                    report(
                        f"train_{kind}",
                        frac0 + (frac1 - frac0) * step / total,
                        f"Training {kind.upper()} · epoch {epoch + 1}/{epochs} · loss {running / (b + 1):.3f}",
                        {"loss": running / (b + 1)},
                    )
        return curve, time.perf_counter() - t0

    EVAL_BATCH = 500

    def timed(fn) -> tuple[list, float]:
        """Run fn over the test set in equal batches; median wall time of three passes after a warm-up."""
        batches = [x_test[b : b + EVAL_BATCH] for b in range(0, test_size, EVAL_BATCH)]
        fn(batches[0])
        times, out = [], []
        for _ in range(3):
            t0 = time.perf_counter()
            out = [fn(x) for x in batches]
            times.append(time.perf_counter() - t0)
        return out, sorted(times)[1]

    def scores(pred) -> dict:
        return {
            "accuracy": (pred == y_test).float().mean().item(),
            "per_class": [
                ((pred == y_test) & (y_test == c)).sum().item() / max(1, (y_test == c).sum().item()) for c in range(10)
            ],
        }

    @torch.no_grad()
    def evaluate_ann(model):
        out, elapsed = timed(lambda x: model(x).argmax(1))
        pred = torch.cat(out)
        macs = 784 * hidden + hidden * 10
        active_hidden = F.relu(model.fc1(x_test)) > 0
        nonzero_macs = ((x_test > 0).sum().item() * hidden + active_hidden.sum().item() * 10) / test_size
        return {
            **scores(pred),
            "inference_ms_per_sample": 1000 * elapsed / test_size,
            "ops_per_sample": macs,
            "energy_nj_per_sample": macs * E_MAC_PJ / 1000,
            "nonzero_macs_per_sample": nonzero_macs,
            "energy_zero_skipping_nj_per_sample": nonzero_macs * E_MAC_PJ / 1000,
        }, pred

    @torch.no_grad()
    def evaluate_snn(model):
        gen = torch.Generator().manual_seed(seed + 2)

        def infer(x):
            s = encode(x, gen)
            logits, hs, _ = model(s)
            return logits.argmax(1), s.sum(), hs.sum()

        out, elapsed = timed(infer)
        pred = torch.cat([o[0] for o in out])
        in_spk = sum(o[1].item() for o in out) / test_size
        hid_spk = sum(o[2].item() for o in out) / test_size
        ops = in_spk * hidden + hid_spk * 10
        update_macs = 2 * (hidden + 10) * timesteps
        synaptic_nj = ops * E_AC_PJ / 1000
        return {
            **scores(pred),
            "inference_ms_per_sample": 1000 * elapsed / test_size,
            "ops_per_sample": ops,
            "energy_nj_per_sample": synaptic_nj,
            "neuron_update_macs_per_sample": update_macs,
            "energy_with_updates_nj_per_sample": synaptic_nj + update_macs * E_MAC_PJ / 1000,
            "input_spikes_per_sample": in_spk,
            "hidden_spikes_per_sample": hid_spk,
            "hidden_rate_hz": hid_spk / hidden / (timesteps * dt),
        }, pred

    report("train_ann", 0.02, "Training ANN", None)
    ann = ANN()
    ann_curve, ann_train_time = train(ann, "ann", 0.02, 0.2)
    ann_eval, ann_pred = evaluate_ann(ann)

    snn = SNN()
    snn_curve, snn_train_time = train(snn, "snn", 0.2, 0.92)
    report("eval", 0.93, "Evaluating on the test set", None)
    snn_eval, snn_pred = evaluate_snn(snn)

    # One worked example for visualisation.
    with torch.no_grad():
        i = 0
        x = x_test[i : i + 1]
        s = encode(x, torch.Generator().manual_seed(seed + 3))
        _, hs, vout = snn(s)
        t_in, id_in = s[:, 0].nonzero(as_tuple=True)
        t_h, id_h = hs[:, 0].nonzero(as_tuple=True)
        example = {
            "image": [round(v, 3) for v in x[0].tolist()],
            "label": int(y_test[i]),
            "pred_ann": int(ann_pred[i]),
            "pred_snn": int(snn_pred[i]),
            "input_spikes": {"t": t_in.tolist(), "id": id_in.tolist()},
            "hidden_spikes": {"t": t_h.tolist(), "id": id_h.tolist()},
            "output_v": [[round(v, 4) for v in row] for row in vout[:, 0].T.tolist()],
        }

    report("done", 1.0, "Finished", None)
    return {
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "snn_backend": backend,
        "config": {
            "train_size": train_size,
            "test_size": test_size,
            "epochs": epochs,
            "hidden": hidden,
            "timesteps": timesteps,
            "dt_ms": dt * 1000,
            "f_max_hz": f_max_hz,
            "batch_size": batch_size,
            "seed": seed,
            "torch": torch.__version__,
        },
        "energy_constants": {"e_mac_pj": E_MAC_PJ, "e_ac_pj": E_AC_PJ, "source": "Horowitz, ISSCC 2014 (45 nm, 32-bit float)"},
        "ann": {**ann_eval, "train_time_s": ann_train_time, "curve": ann_curve, "params": sum(p.numel() for p in ann.parameters())},
        "snn": {**snn_eval, "train_time_s": snn_train_time, "curve": snn_curve, "params": sum(p.numel() for p in snn.parameters())},
        "example": example,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Train and compare an SNN and an ANN on MNIST.")
    ap.add_argument("--train-size", type=int, default=30_000)
    ap.add_argument("--test-size", type=int, default=5_000)
    ap.add_argument("--epochs", type=int, default=5)
    ap.add_argument("--timesteps", type=int, default=32)
    ap.add_argument("--hidden", type=int, default=256)
    args = ap.parse_args()

    def show(stage, frac, msg, _extra):
        print(f"[{frac * 100:5.1f}%] {msg}", flush=True)

    res = run_benchmark(
        train_size=args.train_size, test_size=args.test_size, epochs=args.epochs,
        timesteps=args.timesteps, hidden=args.hidden, progress=show,
    )
    RESULTS_PATH.write_text(json.dumps(res), encoding="utf-8")
    a, s = res["ann"], res["snn"]
    print(f"ANN acc {a['accuracy']:.3f}  {a['energy_nj_per_sample']:.1f} nJ/sample")
    print(f"SNN acc {s['accuracy']:.3f}  {s['energy_nj_per_sample']:.1f} nJ/sample  ({res['snn_backend']})")
    print(f"wrote {RESULTS_PATH}")


if __name__ == "__main__":
    main()
