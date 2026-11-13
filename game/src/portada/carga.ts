// V10.5 ronda PORTADA · barra de carga con porcentaje real (PROMPT_V10_5_PORTADA §5.3 y §12).
//  · Bytes reales: `carga.json` (lo genera V10/IT7/tools/lista-carga.mjs) dice qué baja el arranque y cuánto pesa; un PerformanceObserver suma el
//    tamaño SIN comprimir (decodedBodySize: Cloudflare comprime JS y JSON) de cada archivo de esa lista que termina. Los nombres con huella de
//    la build (`bootstrap-XXXXXXXX.js`) se comparan con comodín, así la lista no caduca en cada compilación.
//  · Mientras descarga, objetivo = 90 % × bytes; de 90 a 100, las etapas de `preload` (0,9 «Preparando…» → 1). 100 solo con `terminar()`.
//  · Mostrado: nunca retrocede; avanza como mucho ~35 %/s y, si no llega nada, gotea 0,3 %/s sin pasar del tope de la etapa.
//  · Sin carga.json (o sin tamaños): la `f` de onProgress de siempre con el mismo suavizado (nunca peor que antes).
//  · #load-bar > i recibe `width: NN%` en cada número entero nuevo (f13-rend SIS-35); aria-valuenow/aria-valuetext en #load-bar.
const huella = (p: string) => p.replace(/-[A-Za-z0-9_-]{8}\.(js|css|wasm)$/, '-*.$1');
type Lista = { total: number; archivos: Record<string, number> };

export class Carga {
  private bar = document.getElementById('load-bar'); private relleno = this.bar?.firstElementChild as HTMLElement | null; private pct = document.getElementById('load-pct');
  private lista: Lista | null = null; private vistos = new Map<string, number>(); private etapa = 0; private objetivo = 0; private mostrado = 0; private entero = -1;
  private fin: (() => void) | null = null; private terminado = false; private raf = 0; private last = 0; private obs: PerformanceObserver | null = null;
  private base = new URL('./', document.baseURI).href;
  constructor() {
    try { performance.setResourceTimingBufferSize(2000); } catch { /* */ }
    try {
      this.obs = new PerformanceObserver((l) => { for (const e of l.getEntries() as PerformanceResourceTiming[]) this.anota(e); });
      this.obs.observe({ type: 'resource', buffered: true });
    } catch { this.obs = null; }
    void fetch(new URL('./carga.json', document.baseURI)).then((r) => (r.ok ? r.json() : null)).then((j: Lista | null) => {
      if (j && j.total > 0 && j.archivos) { const a: Record<string, number> = {}; for (const [k, v] of Object.entries(j.archivos)) a[huella(k)] = v; this.lista = { total: j.total, archivos: a }; this.recalcula(); }
    }).catch(() => {});
    this.pinta(0); this.raf = requestAnimationFrame(this.paso);
  }
  private anota(e: PerformanceResourceTiming) {
    if (!e.name.startsWith(this.base)) return;
    const k = huella(decodeURIComponent(e.name.slice(this.base.length).split(/[?#]/)[0]));
    if (this.vistos.has(k)) return;
    this.vistos.set(k, e.decodedBodySize || e.encodedBodySize || -1);
    this.recalcula();
  }
  private bytes() {
    const L = this.lista; if (!L) return null;
    let s = 0; for (const [k, v] of this.vistos) { const t = L.archivos[k]; if (t != null) s += v > 0 ? Math.min(v, t * 1.5) : t; }
    return Math.min(1, s / L.total);
  }
  private recalcula() {
    const b = this.bytes(), f = this.etapa;
    const t = b == null ? f : f >= 0.9 ? Math.max(f, 0.9) : Math.min(0.9, 0.9 * b);
    this.objetivo = Math.max(this.objetivo, Math.min(t, 0.995));
  }
  /** Tope del goteo: no pasa de la etapa siguiente. */
  private tope() {
    if (this.lista && this.etapa < 0.9) return 0.895;
    const ET = [0.02, 0.05, 0.15, 0.8, 0.9, 1];
    if (!this.lista && this.etapa < 0.8) { const sig = ET.find((x) => x > this.etapa + 1e-6) ?? 1; return Math.min(sig - 0.005, 0.795); }
    return 0.995;
  }
  private paso = (now: number) => {
    this.raf = 0;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0; this.last = now;
    if (this.terminado) { this.mostrado = Math.min(1, this.mostrado + 8 * dt + 0.04); }
    else if (this.mostrado < this.objetivo) this.mostrado = Math.min(this.objetivo, this.mostrado + 0.35 * dt);
    else this.mostrado = Math.max(this.mostrado, Math.min(this.tope(), this.mostrado + 0.003 * dt));
    this.pinta(this.mostrado);
    if (this.terminado && this.mostrado >= 1) { this.pinta(1); const f = this.fin; this.fin = null; f?.(); return; }
    if (!this.cerrada) this.raf = requestAnimationFrame(this.paso);
  };
  private cerrada = false;
  private pinta(x: number) {
    const n = this.terminado && x >= 1 ? 100 : Math.min(99, Math.floor(x * 100));
    if (n === this.entero) return; this.entero = n;
    if (this.relleno) this.relleno.style.width = `${n}%`;
    if (this.bar) { this.bar.setAttribute('aria-valuenow', String(n)); this.bar.setAttribute('aria-valuetext', `Cargando: ${n} %`); }
    if (this.pct) this.pct.textContent = `${n} %`;
  }
  /** V10.6 (B5): avance mostrado (0–1), para el aviso de abandono durante la carga. */
  get fraccion() { return this.mostrado; }
  /** La etapa de siempre (`setProgress(f, label)` del arranque): alimenta el objetivo. */
  progreso(f: number) { if (this.terminado) return; this.etapa = Math.max(this.etapa, Math.min(1, f)); this.recalcula(); if (!this.raf && !this.cerrada) this.raf = requestAnimationFrame(this.paso); }
  /** El juego está listo: sube a 100 (en ≤ ~0,3 s) y resuelve; solo entonces se activa JUGAR. */
  terminar(): Promise<void> {
    this.terminado = true; this.objetivo = 1;
    return new Promise((res) => { this.fin = () => { this.cierra(); res(); }; if (!this.raf) this.raf = requestAnimationFrame(this.paso); });
  }
  error() { this.cierra(); if (this.pct) this.pct.textContent = 'Error'; this.bar?.setAttribute('aria-valuetext', 'Error de carga'); document.getElementById('start')?.classList.add('pt-error'); }
  private cierra() { this.cerrada = true; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; try { this.obs?.disconnect(); } catch { /* */ } }
}

/** La barra de esta página (la crea main.ts al cargar; bootstrap le pasa las etapas). */
export let carga: Carga | null = null;
export function crearCarga() { if (!carga) carga = new Carga(); return carga; }
