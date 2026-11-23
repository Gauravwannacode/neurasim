import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useSimStore } from "../../lib/simStore";
import { useGroupColors } from "../viz/charts";
import { prefersReducedMotion } from "../../lib/motion";

const vertex = /* glsl */ `
  attribute vec3 tint; attribute float glow;
  varying vec3 vTint; varying float vGlow;
  uniform float px;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vTint = tint; vGlow = glow;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = px * (0.2 + glow * 0.3) / -mv.z;
  }`;
const fragment = /* glsl */ `
  varying vec3 vTint; varying float vGlow;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(0.7, 0.25, d) * (0.62 + vGlow) + exp(-d * d * 4.0) * vGlow;
    gl_FragColor = vec4(mix(vTint, vec3(1.0, 0.96, 0.9), vGlow * smoothstep(0.5, 0.0, d) * 0.7), a * smoothstep(1.0, 0.8, d));
  }`;

const FADE_MS = 9;

/** 3D replay of a run: one point per neuron, laid out as in the builder, flashing when it spikes. */
export default function NetworkScene() {
  const host = useRef<HTMLDivElement>(null);
  const meta = useSimStore((s) => s.meta);
  const network = useSimStore((s) => s.network);
  const status = useSimStore((s) => s.status);
  const colors = useGroupColors();
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(80); // simulated ms per second
  const [failed, setFailed] = useState(false);
  const slider = useRef<HTMLInputElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const time = useRef(0);
  const live = useRef({ playing, speed, running: false });
  live.current = { playing, speed, running: status === "running" };
  const groups = useMemo(() => meta?.groups ?? [], [meta]);

  useEffect(() => {
    const el = host.current;
    if (!el || !meta || !network) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = !prefersReducedMotion();
    controls.autoRotateSpeed = 0.7;
    controls.enableZoom = false; // keep page scrolling natural

    // Layout: builder positions, normalised; neurons on a sunflower disc.
    const place = new Map([...network.inputs, ...network.populations].map((n) => [n.id, n.position] as const));
    const xs = groups.map((g) => place.get(g.id)?.x ?? 0);
    const ys = groups.map((g) => place.get(g.id)?.y ?? 0);
    const span = Math.max(1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const k = 13 / span;
    const mx = (Math.max(...xs) + Math.min(...xs)) / 2, my = (Math.max(...ys) + Math.min(...ys)) / 2;
    const n = meta.n_neurons;
    const pos = new Float32Array(n * 3), tint = new Float32Array(n * 3), glow = new Float32Array(n);
    const centre: Record<string, THREE.Vector3> = {};
    let reach = 4;
    groups.forEach((g, gi) => {
      const c = groups.length === 1 ? new THREE.Vector3() : new THREE.Vector3((xs[gi] - mx) * k, -(ys[gi] - my) * k * 0.75, Math.sin(gi * 2.1) * 1.4);
      centre[g.id] = c;
      const color = new THREE.Color(colors[g.id]);
      const radius = 0.16 * Math.sqrt(g.count);
      reach = Math.max(reach, c.length() + radius);
      for (let i = 0; i < g.count; i++) {
        const r = radius * Math.sqrt((i + 0.5) / g.count), a = i * 2.39996;
        pos.set([c.x + (((i * 37) % 11) / 11 - 0.5) * 0.5, c.y + r * Math.sin(a), c.z + r * Math.cos(a)], (g.offset + i) * 3);
        color.toArray(tint, (g.offset + i) * 3);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("tint", new THREE.BufferAttribute(tint, 3));
    const glowAttr = new THREE.BufferAttribute(glow, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("glow", glowAttr);
    const mat = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { px: { value: 1 } } });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    const tubes: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; source: string }[] = [];
    for (const s of network.synapses) {
      const a = centre[s.source], b = centre[s.target];
      if (!a || !b) continue;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const curve = s.source === s.target
        ? new THREE.CubicBezierCurve3(a, a.clone().add(new THREE.Vector3(1.6, 2.6, 0)), a.clone().add(new THREE.Vector3(-1.6, 2.6, 0)), b)
        : new THREE.QuadraticBezierCurve3(a, mid.add(new THREE.Vector3(0, 0, (s.weight < 0 ? -1 : 1) * 0.28 * a.distanceTo(b))), b);
      const m = new THREE.MeshBasicMaterial({ color: s.weight < 0 ? "#5ea3f0" : "#ff6a4d", transparent: true, opacity: 0.3, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.03, 6), m);
      scene.add(mesh);
      tubes.push({ mesh, mat: m, source: s.source });
    }
    camera.position.set(reach * 0.35, reach * 0.3, reach * 1.75);

    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
      mat.uniforms.px.value = el.clientHeight * renderer.getPixelRatio();
    });
    ro.observe(el);

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    time.current = 0;
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(100, now - last) / 1000;
      last = now;
      if (!visible || document.hidden) return;
      const st = useSimStore.getState();
      const l = live.current;
      const end = st.weightTimes[st.weightTimes.length - 1] ?? 0;
      if (l.running) time.current = end;
      else if (l.playing) { time.current += dt * l.speed; if (time.current > end) time.current = 0; }
      const t = time.current;

      // Glow = exponentially fading memory of the most recent spike.
      glow.fill(0);
      const heat: Record<string, number> = {};
      const from = t - FADE_MS * 4;
      for (const g of groups) {
        const s = st.spikes[g.id];
        if (!s) continue;
        let lo = 0, hi = s.t.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (s.t[m] < from) lo = m + 1; else hi = m; }
        let sum = 0;
        for (let i = lo; i < s.t.length && s.t[i] <= t; i++) {
          const e = Math.exp(-(t - s.t[i]) / FADE_MS);
          if (e > glow[s.id[i]]) glow[s.id[i]] = e;
          sum += e;
        }
        heat[g.id] = Math.min(1, (sum / g.count) * 3);
      }
      glowAttr.needsUpdate = true;
      for (const tube of tubes) tube.mat.opacity = 0.3 + 0.65 * (heat[tube.source] ?? 0);
      if (slider.current) slider.current.value = String(t);
      if (label.current) label.current.textContent = `${t.toFixed(0)} ms`;
      controls.update();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      geo.dispose();
      mat.dispose();
      tubes.forEach((x) => { x.mesh.geometry.dispose(); x.mat.dispose(); });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [meta, network, groups, colors]);

  if (failed) return <p className="p-6 text-sm text-slate-400">This browser has WebGL turned off, so the 3D view is unavailable. The raster below shows the same spikes.</p>;
  return (
    <div className="flex h-full flex-col">
      <div ref={host} className="min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing" aria-label="3D replay of the network" role="img" />
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button className="btn-ghost w-20 justify-center" disabled={status === "running"} onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
        <input ref={slider} type="range" min={0} max={meta?.duration ?? 1} step={0.5} defaultValue={0} aria-label="Time in the run" className="min-w-[8rem] flex-1" style={{ accentColor: "#ff6a4d" }} onInput={(e) => { time.current = Number(e.currentTarget.value); setPlaying(false); }} />
        <span ref={label} className="w-20 text-right font-mono text-sm text-slate-300" />
        <select className="input w-auto py-1 text-xs" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">
          <option value={25}>40× slower</option>
          <option value={80}>12× slower</option>
          <option value={250}>4× slower</option>
        </select>
      </div>
    </div>
  );
}
