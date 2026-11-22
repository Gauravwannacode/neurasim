"""Export helpers: spike-raster CSV and a PDF summary report of a simulation run.

The simulator is deterministic for a given network (including its seed), so
re-running the network here reproduces exactly the run shown in the browser.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from reportlab.lib import colors  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet  # noqa: E402
from reportlab.lib.units import cm  # noqa: E402
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle  # noqa: E402

from .schemas import Network  # noqa: E402

PALETTE = ["#d97706", "#0284c7", "#db2777", "#059669", "#7c3aed", "#ea580c", "#0891b2", "#c026d3", "#65a30d"]
MODEL_NAMES = {"lif": "Leaky Integrate-and-Fire", "izhikevich": "Izhikevich", "hh": "Hodgkin-Huxley"}


def raster_csv(result: dict) -> str:
    groups = result["meta"]["groups"]
    bounds = [(g["offset"] + g["count"], g["id"]) for g in groups]

    def group_of(nid: int) -> str:
        for end, gid in bounds:
            if nid < end:
                return gid
        return bounds[-1][1]

    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["time_ms", "neuron_id", "group", "local_index"])
    offsets = {g["id"]: g["offset"] for g in groups}
    for t, nid in zip(result["spikes"]["t"], result["spikes"]["id"]):
        gid = group_of(nid)
        w.writerow([t, nid, gid, nid - offsets[gid]])
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Figures

def _fig_to_image(fig, width_cm: float) -> Image:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=160, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    w, h = fig.get_size_inches()
    return Image(buf, width=width_cm * cm, height=width_cm * cm * h / w)


def _style(ax):
    ax.spines[["top", "right"]].set_visible(False)
    ax.tick_params(labelsize=7)
    ax.xaxis.label.set_size(8)
    ax.yaxis.label.set_size(8)


def _colors(groups):
    return {g["id"]: PALETTE[i % len(PALETTE)] for i, g in enumerate(groups)}


def fig_raster(result):
    groups, meta = result["meta"]["groups"], result["meta"]
    col = _colors(groups)
    t = np.array(result["spikes"]["t"])
    ids = np.array(result["spikes"]["id"], dtype=int)
    fig, ax = plt.subplots(figsize=(8, 3.6))
    for g in groups:
        m = (ids >= g["offset"]) & (ids < g["offset"] + g["count"])
        ax.scatter(t[m], ids[m], s=1.2, c=col[g["id"]], label=g["label"], linewidths=0, rasterized=True)
        ax.axhline(g["offset"] - 0.5, color="#cbd5e1", lw=0.5)
    ax.set_xlim(0, meta["duration"])
    ax.set_ylim(-1, meta["n_neurons"])
    ax.set_xlabel("time (ms)")
    ax.set_ylabel("neuron id")
    ax.legend(fontsize=6, markerscale=5, loc="upper center", bbox_to_anchor=(0.5, 1.15), ncol=min(5, len(groups)), frameon=False)
    _style(ax)
    return fig


def fig_voltages(result):
    meta, v = result["meta"], result["voltages"]
    pops = [g for g in meta["groups"] if g["kind"] == "population" and v["v"].get(g["id"])]
    if not pops:
        return None
    col = _colors(meta["groups"])
    fig, axes = plt.subplots(len(pops), 1, figsize=(8, 1.5 * len(pops)), sharex=True, squeeze=False)
    for ax, g in zip(axes[:, 0], pops):
        ax.plot(v["t"], v["v"][g["id"]][0], lw=0.7, color=col[g["id"]])
        ax.axhline(meta["thresholds"][g["id"]], color="#db2777", lw=0.6, ls="--")
        ax.set_ylabel(f"{g['label'][:18]}\n(mV)", fontsize=7)
        _style(ax)
    axes[-1, 0].set_xlabel("time (ms)")
    return fig


def fig_rates(result):
    meta = result["meta"]
    groups = meta["groups"]
    times = [(r["t0"] + r["t1"]) / 2 for r in result["rates"]]
    z = np.array([[r[g["id"]] for r in result["rates"]] for g in groups])
    fig, ax = plt.subplots(figsize=(8, 0.45 * len(groups) + 1.0))
    dt_chunk = times[1] - times[0] if len(times) > 1 else meta["duration"]
    im = ax.imshow(z, aspect="auto", cmap="magma", origin="lower",
                   extent=(0, times[-1] + dt_chunk / 2 if times else 1, -0.5, len(groups) - 0.5))
    ax.set_yticks(range(len(groups)), [g["label"][:24] for g in groups], fontsize=7)
    ax.set_xlabel("time (ms)")
    cb = fig.colorbar(im, ax=ax, pad=0.01)
    cb.set_label("firing rate (Hz)", fontsize=7)
    cb.ax.tick_params(labelsize=6)
    _style(ax)
    return fig


def fig_weights(result):
    plastic = result["meta"]["plastic"]
    if not plastic:
        return None
    label = {g["id"]: g["label"] for g in result["meta"]["groups"]}
    hist = result["summary"]["weight_histograms"]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(8, 2.6))
    ts = [w["t"] for w in result["weights"]]
    for i, p in enumerate(plastic):
        c = PALETTE[(i + 1) % len(PALETTE)]
        name = f"{label[p['source']]} → {label[p['target']]}"
        a1.plot(ts, [w[p["id"]] for w in result["weights"]], color=c, lw=1.5, label=name)
        h = hist[p["id"]]
        centers = (np.array(h["bins"][:-1]) + np.array(h["bins"][1:])) / 2
        width = (h["bins"][1] - h["bins"][0]) * 0.9
        a2.bar(centers, h["initial"], width=width, color="#cbd5e1", label="initial" if i == 0 else None)
        a2.bar(centers, h["final"], width=width, color=c, alpha=0.7, label=f"final: {name}")
    a1.set_xlabel("time (ms)")
    a1.set_ylabel("mean weight")
    a1.legend(fontsize=6, frameon=False)
    a2.set_xlabel("weight")
    a2.set_ylabel("synapses")
    a2.legend(fontsize=6, frameon=False)
    _style(a1)
    _style(a2)
    return fig


# ---------------------------------------------------------------------------

def _table(rows, col_widths=None, header=True):
    t = Table(rows, colWidths=col_widths, hAlign="LEFT")
    style = [
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.HexColor("#334155")) if header else ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold") if header else ("TOPPADDING", (0, 0), (-1, -1), 2),
    ]
    t.setStyle(TableStyle(style))
    return t


def _fmt(n: float) -> str:
    for unit, scale in (("G", 1e9), ("M", 1e6), ("k", 1e3)):
        if abs(n) >= scale:
            return f"{n / scale:.2f} {unit}"
    return f"{n:.0f}"


def pdf_report(net: Network, result: dict, user_name: str | None = None) -> bytes:
    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9, leading=12.5)
    small = ParagraphStyle("small", parent=body, fontSize=7.5, leading=10, textColor=colors.HexColor("#475569"))
    h1 = ParagraphStyle("h1", parent=styles["Title"], fontSize=18, spaceAfter=4, alignment=0)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=12, spaceBefore=10, spaceAfter=4, textColor=colors.HexColor("#0f172a"))

    meta, summary = result["meta"], result["summary"]
    energy = summary["energy"]
    story = []
    story.append(Paragraph(f"NeuraSim simulation report: {net.name}", h1))
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    story.append(Paragraph(f"Generated {stamp}" + (f" for {user_name}" if user_name else "") + " · NeuraSim spiking neural network simulator", small))
    story.append(Spacer(1, 8))
    if net.description:
        story.append(Paragraph(net.description, body))
    if net.biology:
        story.append(Spacer(1, 4))
        story.append(Paragraph(f"<b>Biological inspiration.</b> {net.biology}", body))

    story.append(Paragraph("Run summary", h2))
    ratio = f"{energy['ratio']:.1f}×" if energy["ratio"] else "n/a"
    story.append(
        _table(
            [
                ["Neurons", f"{meta['n_neurons']:,}", "Synapses", f"{meta['n_connections']:,}"],
                ["Simulated time", f"{meta['duration']} ms (dt = {meta['dt']} ms, {meta['steps']:,} steps)", "Seed", str(net.sim.seed)],
                ["Total spikes", f"{summary['total_spikes']:,}", "Wall-clock time", f"{summary['wall_time_s']:.2f} s"],
                ["SNN synaptic ops", _fmt(energy["snn_synops"]), "Equivalent ANN MACs", _fmt(energy["ann_macs"])],
                ["SNN energy (est.)", f"{energy['snn_energy_nj']:.3g} nJ", "ANN energy (est.)", f"{energy['ann_energy_nj']:.3g} nJ"],
                ["Energy advantage", ratio, "Activity (SynOps/MACs)", f"{energy['activity'] * 100:.2f} %"],
            ],
            col_widths=[3.4 * cm, 5.2 * cm, 3.8 * cm, 4.6 * cm],
            header=False,
        )
    )
    story.append(Spacer(1, 3))
    story.append(
        Paragraph(
            f"Energy model: one accumulate ({energy['e_ac_pj']} pJ) per delivered spike per synapse for the SNN versus one "
            f"multiply-accumulate ({energy['e_mac_pj']} pJ) per connection per {energy['frame_ms']:g} ms frame for an ANN with the "
            "same connectivity (Horowitz, ISSCC 2014; 45 nm, 32-bit float). Memory access is not included.",
            small,
        )
    )

    story.append(Paragraph("Firing rates", h2))
    rate_rows = [["Group", "Kind / model", "Size", "Mean rate (Hz)"]]
    for g in meta["groups"]:
        kind = "input" if g["kind"] == "input" else MODEL_NAMES.get(g["model"], g["model"])
        rate_rows.append([g["label"], kind, str(g["count"]), f"{summary['mean_rates'][g['id']]:.2f}"])
    story.append(_table(rate_rows, col_widths=[6 * cm, 5 * cm, 2 * cm, 3 * cm]))

    story.append(Paragraph("Spike raster", h2))
    story.append(_fig_to_image(fig_raster(result), 17))
    story.append(Paragraph("Population activity", h2))
    story.append(_fig_to_image(fig_rates(result), 17))
    fv = fig_voltages(result)
    if fv is not None:
        story.append(Paragraph("Membrane potential (first recorded neuron per population; dashed = threshold)", h2))
        story.append(_fig_to_image(fv, 17))
    fw = fig_weights(result)
    if fw is not None:
        story.append(Paragraph("Synaptic weight evolution (STDP)", h2))
        story.append(_fig_to_image(fw, 17))

    story.append(PageBreak())
    story.append(Paragraph("Network configuration", h2))
    pop_rows = [["Population", "Model", "N", "Parameters"]]
    for p in net.populations:
        params = ", ".join(f"{k}={v:g}" for k, v in p.params.model_dump(exclude_none=True).items() if isinstance(v, (int, float)))
        pop_rows.append([p.label or p.id, MODEL_NAMES[p.model], str(p.count), Paragraph(params, small)])
    story.append(_table(pop_rows, col_widths=[4 * cm, 3.5 * cm, 1.2 * cm, 8.3 * cm]))
    if net.inputs:
        story.append(Spacer(1, 6))
        in_rows = [["Input", "Kind", "N", "Rate / pattern", "Window (ms)"]]
        for i in net.inputs:
            rate = f"{i.rate_hz:g}" + (f"–{i.rate_max_hz:g}" if i.kind == "rate" and i.rate_max_hz is not None else "") + " Hz"
            if i.kind == "pattern":
                rate = f"{sum(len(r) for r in i.pattern or [])} spikes" + (f", period {i.period_ms:g} ms" if i.period_ms else "")
            in_rows.append([i.label or i.id, i.kind, str(i.count), rate, f"{i.start_ms:g}–{'end' if i.stop_ms is None else f'{i.stop_ms:g}'}"])
        story.append(_table(in_rows, col_widths=[4.5 * cm, 2.2 * cm, 1.2 * cm, 5.3 * cm, 3.8 * cm]))
    if net.synapses:
        story.append(Spacer(1, 6))
        name = {p.id: p.label or p.id for p in net.populations} | {i.id: i.label or i.id for i in net.inputs}
        syn_rows = [["Projection", "w", "p", "delay", "plasticity"]]
        for s in net.synapses:
            plast = "static"
            if s.plasticity == "stdp":
                st = s.stdp
                plast = f"STDP A+={st.A_plus:g} A-={st.A_minus:g} τ+={st.tau_plus:g} τ-={st.tau_minus:g} w∈[{st.w_min:g},{st.w_max:g}]"
            syn_rows.append([Paragraph(f"{name[s.source]} → {name[s.target]}", small), f"{s.weight:g}", f"{s.p_connect:g}", f"{s.delay_ms:g} ms", Paragraph(plast, small)])
        story.append(_table(syn_rows, col_widths=[5.5 * cm, 1.4 * cm, 1.2 * cm, 1.6 * cm, 7.3 * cm]))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.6 * cm, bottomMargin=1.6 * cm,
                            title=f"NeuraSim report: {net.name}", author="NeuraSim")
    doc.build(story)
    return buf.getvalue()
