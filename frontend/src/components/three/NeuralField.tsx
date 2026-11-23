import { useEffect, useRef } from "react";
import * as THREE from "three";
import { prefersReducedMotion } from "../../lib/motion";

const COLS = 104;
const ROWS = 48;
const N = COLS * ROWS;
const PALETTE = ["#ff6a4d", "#f6b73c", "#22c3a6", "#8f7bf0", "#ec5fa6", "#5ea3f0"].map((c) => new THREE.Color(c));

const vertex = /* glsl */ `
  attribute vec3 tint; attribute float glow; attribute float size;
  varying vec3 vTint; varying float vGlow; varying float vFade;
  uniform float px;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position + vec3(0.0, glow * 0.35, 0.0), 1.0);
    vTint = tint; vGlow = glow; vFade = smoothstep(27.0, 10.0, -mv.z);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(px * size * (0.55 + glow * 0.75) / -mv.z, px * 0.022);
  }`;
const fragment = /* glsl */ `
  varying vec3 vTint; varying float vGlow; varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(0.75, 0.15, d);
    float a = (core * (0.34 + 0.6 * vGlow) + (1.0 - d) * vGlow * 0.35) * vFade;
    gl_FragColor = vec4(mix(vTint * 0.75, mix(vTint, vec3(1.0, 0.93, 0.84), core * 0.35), vGlow), a);
  }`;

/**
 * Hero background: a folded sheet of ~5,000 leaky integrate-and-fire neurons,
 * each connected to its eight neighbours. It is an excitable medium, so a touch
 * launches a travelling wave like those recorded in real cortex.
 */
export default function NeuralField({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
    } catch {
      return; // no WebGL: the page still works on its plain background
    }
    const still = prefersReducedMotion();
    renderer.setPixelRatio(Math.min(1.25, window.devicePixelRatio));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 60);

    const pos = new Float32Array(N * 3);
    const tint = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const glow = new Float32Array(N);
    const seeds = Array.from({ length: 34 }, (_, i) => ({ c: Math.random() * COLS, r: Math.random() * ROWS, k: i % PALETTE.length }));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const x = (c - COLS / 2) * 0.32 + (Math.random() - 0.5) * 0.24;
        const z = (r - ROWS * 0.72) * 0.42 + (Math.random() - 0.5) * 0.3;
        // Gyri and sulci.
        const y = Math.sin(x * 0.55 + Math.sin(z * 0.5) * 1.3) * 0.75 + Math.sin(z * 0.9 + x * 0.22) * 0.4 + (Math.random() - 0.5) * 0.12;
        pos.set([x, y, z], i * 3);
        let best = seeds[0], bd = Infinity;
        for (const s of seeds) {
          const d = (s.c - c) ** 2 + ((s.r - r) * 1.3) ** 2 + Math.random() * 60;
          if (d < bd) { bd = d; best = s; }
        }
        PALETTE[best.k].toArray(tint, i * 3);
        size[i] = 0.17 + Math.random() * 0.13;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("tint", new THREE.BufferAttribute(tint, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
    const glowAttr = new THREE.BufferAttribute(glow, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("glow", glowAttr);
    const mat = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { px: { value: 1 } } });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    // --- dynamics
    const v = new Float32Array(N);
    const refr = new Float32Array(N);
    const DELAY = 3;
    const inbox = Array.from({ length: DELAY + 1 }, () => new Float32Array(N));
    let tick = 0;
    const fireDisc = (cx: number, cz: number, radius: number) => {
      for (let i = 0; i < N; i++) {
        const dx = pos[i * 3] - cx, dz = pos[i * 3 + 2] - cz;
        if (dx * dx + dz * dz < radius * radius && refr[i] <= 0) v[i] = 2;
      }
    };
    const step = () => {
      const now = inbox[tick % (DELAY + 1)];
      const later = inbox[(tick + DELAY) % (DELAY + 1)];
      for (let i = 0; i < N; i++) {
        glow[i] *= 0.945;
        if (refr[i] > 0) { refr[i]--; now[i] = 0; continue; }
        v[i] = v[i] * 0.86 + now[i];
        now[i] = 0;
        if (v[i] < 1) continue;
        v[i] = 0;
        refr[i] = 85 + Math.random() * 25;
        glow[i] = 1;
        const c = i % COLS, r = (i / COLS) | 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc, rr = r + dr;
          if ((dr || dc) && cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS) later[rr * COLS + cc] += 0.55 + Math.random() * 0.15;
        }
      }
      tick++;
      if (tick % 130 === 5) fireDisc((Math.random() - 0.5) * 22, 1 - Math.random() * 10, 1.1);
    };

    // --- pointer: ray against the y = 0 plane
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();
    const look = { x: 0, y: 0 };
    const locate = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      look.x = ndc.x;
      look.y = ndc.y;
      if (Math.abs(ndc.y) > 1) return false;
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(plane, hit) !== null;
    };
    const onMove = (e: PointerEvent) => {
      if (!locate(e)) return;
      for (let i = 0; i < N; i++) {
        const dx = pos[i * 3] - hit.x, dz = pos[i * 3 + 2] - hit.z;
        if (dx * dx + dz * dz < 0.5) v[i] += 0.45;
      }
    };
    const onDown = (e: PointerEvent) => { if (locate(e)) fireDisc(hit.x, hit.z, 1.2); };

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      mat.uniforms.px.value = h * renderer.getPixelRatio();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    let raf = 0, last = performance.now(), acc = 0, camX = 0, slow = 0;
    const frame = (now: number) => {
      if (!still) raf = requestAnimationFrame(frame);
      // Weak GPU: trade resolution for smoothness, in two steps at most.
      slow = now - last > 30 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 25 && renderer.getPixelRatio() > 0.6) { renderer.setPixelRatio(renderer.getPixelRatio() * 0.75); resize(); slow = 0; }
      acc += Math.min(60, now - last);
      last = now;
      if (!visible || document.hidden) { acc = 0; return; }
      for (; acc >= 16; acc -= 16) step();
      camX += (look.x * 0.9 - camX) * 0.03;
      camera.position.set(camX, 4.6 + Math.sin(now / 5000) * 0.15, 7.4);
      camera.lookAt(camX * 0.3, 0.1, -5);
      glowAttr.needsUpdate = true;
      renderer.render(scene, camera);
    };
    if (still) {
      fireDisc(-4, -4, 1.5);
      for (let k = 0; k < 40; k++) step();
      requestAnimationFrame(frame);
    } else {
      raf = requestAnimationFrame(frame);
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className={className} aria-hidden />;
}
