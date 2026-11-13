// Música del parque emitida por los cassettes. Un corte M4A por canción (assets/derived/remake/audio → public/audio),
// procesado en WebAudio con estados de restauración: exterior 0/4 roto pero reconocible → 4/4 entendible con carácter
// de radio; centro (SECRETNOVIO antes del triple) casi ininteligible; preview limpio fuera de la cadena.
// Reglas V3 (AUD-02/03/04):
// - MÁXIMO DOS VOCES DE CANCIÓN reales, colas incluidas: antes de arrancar una tercera, la de menor prioridad se apaga
//   con un fundido corto controlado (60 ms) y se libera su ruido. El contador mide fuentes vivas, no objetivos.
// - Nivel por canción (`trims`, dB) DESPUÉS de la saturación (`post`), con margen fijo HEADROOM_DB: la curva tanh
//   normalizada se comporta como limitador, así que un recorte a la entrada solo cambiaba cuánto saturaba (V3, AUD-03).
// - V4 (HUM-A4-014): cada archivo contiene SOLO la ventana pedida de la canción (offsets 0..duración, un único dueño del
//   recorte). El buffer decodificado se comprueba contra `cuts` (muestras declaradas; error si no cuadra) y se recorta el
//   relleno del códec. Loop: costura CIRCULAR con muestras internas a la ventana (cola fundida con el comienzo), nunca
//   material anterior al inicio; el periodo de repetición (N − xfade) se registra aparte de la duración del extracto.
// - V4 (HUM-A4-011): SECRETNOVIO suena «ligeramente peor» que un exterior 0/4 y cada `flashPeriod` s de juego (reloj de
//   simulación, no de pared) sube a la calidad exacta de 2/4 durante `flashHold` s en la MISMA voz (sin voces nuevas).
// - Preview: estado idle/loading/playing/ended/error con token; cerrar invalida la carga (no suena tarde) y los factores
//   mute / volumen / duck / exclusión por preview son independientes (uno no pisa a otro).
import * as THREE from 'three';
import type { Token } from './sim';

export interface MusicConfig {
  tracks: Record<string, string>;
  radio?: Partial<RadioParams>;
  trims?: Record<string, number>;
  /** dB antes de la saturación (solo temas bajos y con mucho rango: sube RMS sin subir los picos). */
  trimsPre?: Record<string, number>;
  loops?: Record<string, { xfade: number }>;
  /** Ventana de cada archivo (V4): muestras exactas esperadas tras decodificar. */
  cuts?: Record<string, { in: number; out: number; samples: number; sampleRate: number; sha256?: string }>;
  /** Destello central (V4 AUD-01): periodo X, meseta 1 s, nivel 2/4 (r=0,5) y rampas. */
  central?: { flashPeriod: number; flashHold: number; flashLevel: number; flashRamp: number };
}
interface StateParams { hp: number; lp: number; drive: number; noise: number; dropRate: number; dropDepth: number; wobble: number; crush: number; peak: number; inGain: number }
export interface RadioParams { broken: StateParams; clean: StateParams; central: StateParams; trimMid: number }
export const RADIO_DEFAULT: RadioParams = {
  // exterior 0/4: roto pero reconocible (ID9: antes demasiado destruido)
  broken: { hp: 620, lp: 2600, drive: 0.55, noise: 0.06, dropRate: 2.2, dropDepth: 0.7, wobble: 0.028, crush: 12, peak: 6, inGain: 0.55 },
  clean: { hp: 150, lp: 7400, drive: 0.1, noise: 0.01, dropRate: 0, dropDepth: 0, wobble: 0.003, crush: 110, peak: 2, inGain: 1.0 },
  // centro antes del triple (V4 HUM-A4-011): LIGERAMENTE peor que un exterior 0/4 (antes casi ininteligible:
  // hp 1100/lp 1250/noise 0,14/drop 6,5×0,95/crush 6). Menos banda y claridad y algo más de interrupción, reconocible.
  central: { hp: 720, lp: 2250, drive: 0.62, noise: 0.075, dropRate: 2.8, dropDepth: 0.75, wobble: 0.032, crush: 11, peak: 6.5, inGain: 0.53 },
  trimMid: 0.32,
};

interface Track {
  id: string; url: string;
  raw: ArrayBuffer | null; buffer: AudioBuffer | null; previewBuf: AudioBuffer | null; loading: Promise<void> | null; lastUse: number;
  src: AudioBufferSourceNode | null; t0: number;
  pre: GainNode; in: GainNode; hp: BiquadFilterNode; lp: BiquadFilterNode; peak: BiquadFilterNode; shaper: WaveShaperNode; crush: WaveShaperNode;
  trim: GainNode; post: GainNode; gate: GainNode; noise: AudioBufferSourceNode | null; noiseGain: GainNode; noiseBp: BiquadFilterNode; pan: StereoPannerNode; out: GainNode;
  wobble: OscillatorNode | null; wobbleGain: GainNode;
  /** V10.1: salida limpia, sin la cadena de radio (SECRETNOVIO con el reto hecho suena como en la escena final). */
  clean: GainNode; isClean: boolean;
  level: number; gain: number; playing: boolean; endingUntil: number;
  error: string | null; failedAt: number;
  flash: number; curveFlash: number; st: StateParams | null;
  /** Periodo real de repetición del loop (s) tras la costura circular (≤ duración del extracto). */
  loopPeriod: number;
}
export type PreviewState = 'idle' | 'loading' | 'playing' | 'ended' | 'error';

export class Music {
  ctx: AudioContext;
  bus: GainNode;
  /** V10.1: entrada de la cadena de radio (0,9 → compresor → salida). `bus` es solo la suma para medir (radio antes del compresor, como
   *  siempre, más las pistas limpias) y no suena; las limpias salen por `cleanBus`, directas a la salida como la escena final. */
  radioBus: GainNode; cleanBus: GainNode; zoneCleanBus: GainNode;
  /** V10.1: pistas que suenan limpias (las fija el juego). */
  cleanIds = new Set<string>();
  tracks = new Map<string, Track>();
  private noiseBuf: AudioBuffer;
  private glitchTimer = 0;
  params: RadioParams;
  muted = false;
  duckGain = 1;          // charla/actividad
  /** V10.5 (usuario): bache del cambio de zona (1 = normal; casi 0 en lo más hondo). Lo lleva el juego por tiempo. */
  zoneDip = 1;
  zoneDuck = 1;          // R4: la canción baja dentro del recuadro de charla de La Pantera (lo fija el juego cada fotograma)
  /** V10.4 R19 (usuario: «que la música baje el volumen ligeramente en los diálogos»): con cualquier diálogo abierto (charla o 2D) la música baja
   *  a este factor (lo fija el juego cada fotograma); si ya está más baja (charla con La Pantera, sesiones), manda la más baja. */
  dialogDuck = 1;
  /** V10.1 P24 (usuario): fuera del parque (r > 42) la música se desvanece hasta callar a r 45 (lo fija el juego cada fotograma). */
  outside = 1;
  previewExclusion = 1;  // 0 durante el preview: el mundo calla
  previewSrc: AudioBufferSourceNode | null = null;
  previewGain: GainNode;
  previewState: PreviewState = 'idle';
  previewGen = 0;
  stats = { maxSimultaneous: 0, maxAudible: 0, decodes: 0, starts: 0, forcedStops: 0, fetches: 0 };
  readonly MAX_DECODED = 3;
  readonly MAX_VOICES = 2;

  constructor(ctx: AudioContext, dest: AudioNode, public cfg: MusicConfig) {
    this.ctx = ctx;
    this.params = mergeRadio(cfg.radio);
    this.bus = ctx.createGain(); this.bus.gain.value = 1;
    this.radioBus = ctx.createGain(); this.radioBus.gain.value = 0.9;
    this.cleanBus = ctx.createGain(); this.cleanBus.gain.value = 1;
    // limitador suave: headroom en cruces de dos temas + SFX sin clipping
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.radioBus.connect(comp).connect(dest); this.radioBus.connect(this.bus);
    this.cleanBus.connect(dest); this.cleanBus.connect(this.bus);
    // V10.4 R13: las canciones de las zonas a 4/4 (limpias, sin radio) pasan por el mismo limitador suave que la radio (sin él sonaban +2,3 dB y
    // con picos que saturaban junto a La Pantera); SECRETNOVIO sigue directo por `cleanBus`, como la escena final
    this.zoneCleanBus = ctx.createGain(); this.zoneCleanBus.gain.value = 0.9;
    const comp2 = ctx.createDynamicsCompressor(); comp2.threshold.value = -10; comp2.knee.value = 8; comp2.ratio.value = 4; comp2.attack.value = 0.005; comp2.release.value = 0.2;
    this.zoneCleanBus.connect(comp2).connect(dest); this.zoneCleanBus.connect(this.bus);
    this.previewGain = ctx.createGain(); this.previewGain.gain.value = 1; this.previewGain.connect(dest);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let crackle = 0;
    for (let i = 0; i < len; i++) { crackle = Math.random() < 0.0015 ? 1 : crackle * 0.97; d[i] = (Math.random() * 2 - 1) * 0.6 + (Math.random() < 0.5 ? -1 : 1) * crackle * 0.5; }
    for (const [id, url] of Object.entries(cfg.tracks)) this.tracks.set(id, this.makeTrack(id, url));
  }

  private makeTrack(id: string, url: string): Track {
    const c = this.ctx;
    const ch = createChain(c, this.radioBus);
    const clean = c.createGain(); clean.gain.value = 0; clean.connect(id === 'secretnovio' ? this.cleanBus : this.zoneCleanBus);
    ch.post.gain.value = dbToGain(HEADROOM_DB + (this.cfg.trims?.[id] ?? 0));
    ch.pre.gain.value = dbToGain(this.cfg.trimsPre?.[id] ?? 0);
    return { id, url, raw: null, buffer: null, previewBuf: null, loading: null, lastUse: 0, src: null, t0: c.currentTime, ...ch, clean, isClean: false, noise: null, wobble: null, level: -2, gain: 0, playing: false, endingUntil: 0, error: null, failedAt: 0,
      flash: 0, curveFlash: -1, st: null, loopPeriod: 0 };
  }

  /** Descarga (una vez) y decodifica bajo demanda; como mucho MAX_DECODED buffers vivos; los que suenan no se expulsan. */
  async ensure(id: string) {
    const t = this.tracks.get(id); if (!t) return;
    t.lastUse = this.ctx.currentTime;
    if (t.buffer || t.loading) return t.loading ?? undefined;
    if (t.error && performance.now() - t.failedAt < 8000) return;
    t.loading = (async () => {
      try {
        if (!t.raw) { this.stats.fetches++; const r = await fetch(t.url); if (!r.ok) throw new Error(`HTTP ${r.status}`); t.raw = await r.arrayBuffer(); }
        const dec0 = await this.ctx.decodeAudioData(t.raw.slice(0));
        const dec = checkWindow(this.ctx, dec0, this.cfg.cuts?.[id], id);   // lanza si el archivo servido no es la ventana declarada
        this.stats.decodes++; t.error = null;
        const lp = this.cfg.loops?.[id];
        t.buffer = lp ? bakeLoop(this.ctx, dec, lp.xfade) : dec;
        t.loopPeriod = t.buffer.duration;
        if (id === 'secretnovio') t.previewBuf = dec;
        this.evict();
      } catch (e: any) { t.error = String(e?.message ?? e); t.failedAt = performance.now(); console.warn('música no disponible', id, e); }
      finally { t.loading = null; }
    })();
    return t.loading;
  }
  private evict() {
    const busy = (t: Track) => t.playing || t.endingUntil > this.ctx.currentTime || (t.previewBuf && this.previewSrc);
    const live = [...this.tracks.values()].filter((t) => t.buffer && !busy(t)).sort((a, b) => a.lastUse - b.lastUse);
    let n = [...this.tracks.values()].filter((t) => t.buffer).length;
    for (const t of live) { if (n <= this.MAX_DECODED) break; t.buffer = null; t.previewBuf = null; n--; }
  }

  private liveVoices() { const now = this.ctx.currentTime; return [...this.tracks.values()].filter((t) => t.playing || t.endingUntil > now); }
  private start(t: Track, active: Set<string>) {
    if (t.playing || !t.buffer) return;
    // límite real de dos voces (incluidas las colas que aún suenan)
    // la nueva voz espera a que acabe la cola de la expulsada (≤ 70 ms): nunca hay tres fuentes vivas a la vez
    const voices = this.liveVoices().filter((v) => v !== t);
    if (voices.length >= this.MAX_VOICES) {
      const victim = voices.filter((v) => v.playing && !active.has(v.id)).sort((a, b) => a.gain - b.gain)[0];
      if (victim) { this.stop(victim, 0.06); this.stats.forcedStops++; }
      return;
    }
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = t.buffer; src.loop = true;
    t.isClean = this.cleanIds.has(t.id);
    src.connect(t.isClean ? t.clean : t.pre);
    const off = ((c.currentTime - t.t0) % t.buffer.duration + t.buffer.duration) % t.buffer.duration;
    t.out.gain.cancelScheduledValues(c.currentTime); t.out.gain.setValueAtTime(0, c.currentTime);
    t.clean.gain.cancelScheduledValues(c.currentTime); t.clean.gain.setValueAtTime(0, c.currentTime);
    src.start(c.currentTime + 0.01, off);
    t.src = src;
    if (t.isClean) { t.playing = true; t.endingUntil = 0; this.stats.starts++; t.level = -2; t.gain = 0; return; }   // sin temblor ni ruido de radio
    t.wobble = c.createOscillator(); t.wobble.frequency.value = 0.6 + Math.random() * 0.4;
    t.wobble.connect(t.wobbleGain).connect(src.playbackRate); t.wobble.start();
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true; n.connect(t.noiseGain); n.start(); t.noise = n;
    t.playing = true; t.endingUntil = 0; this.stats.starts++;
    t.level = -2; t.gain = 0;
  }
  /** Para una voz con fundido corto; su ruido se para con ella (no queda estática suelta). */
  private stop(t: Track, fade = 0.05) {
    if (!t.playing) return;
    const c = this.ctx, now = c.currentTime;
    t.out.gain.cancelScheduledValues(now); t.out.gain.setValueAtTime(t.out.gain.value, now); t.out.gain.linearRampToValueAtTime(0, now + fade);
    t.clean.gain.cancelScheduledValues(now); t.clean.gain.setValueAtTime(t.clean.gain.value, now); t.clean.gain.linearRampToValueAtTime(0, now + fade);
    const src = t.src, noise = t.noise, wob = t.wobble;
    try { src?.stop(now + fade + 0.005); noise?.stop(now + fade + 0.005); wob?.stop(now + fade + 0.005); } catch { /* ya parado */ }
    const disc = () => { src?.disconnect(); noise?.disconnect(); wob?.disconnect(); };
    if (src) src.onended = disc; else disc();
    t.src = null; t.noise = null; t.wobble = null; t.playing = false; t.endingUntil = now + fade + 0.01; t.gain = 0;
  }

  private applyLevel(t: Track, r: number, flash = 0) {
    if (!Number.isFinite(r) || !Number.isFinite(flash)) { this.badInput({ id: t.id, level: r, flash }); return; }
    const f = r < 0 ? THREE.MathUtils.clamp(flash, 0, 1) : 0;
    if (Math.abs(t.level - r) < 1e-3 && Math.abs(t.flash - f) < 1e-3) return;
    const fast = r < 0 && (f > 0 || t.flash > 0);   // destello: constantes cortas (llega a 2/4 en ~70 ms, no se queda a medias)
    t.level = r; t.flash = f;
    // las curvas de saturación solo se cambian al cruzar la mitad de la rampa (dos veces por destello, no cada fotograma)
    const curveF = f >= 0.5 ? 1 : 0;
    const swap = t.curveFlash !== curveF; t.curveFlash = curveF;
    t.st = setChainLevel(t, this.params, r, this.ctx.currentTime, false, f, fast ? 0.015 : undefined, swap || !fast);
  }

  /** Cortes de señal (glitch): programados a pocos ms; desaparecen a 4/4. */
  private scheduleGlitch(t: Track) {
    const st = t.st ?? stateAt(this.params, t.level, t.flash), c = this.ctx;
    const now = c.currentTime;
    if (st.dropRate > 0.05 && Math.random() < st.dropRate * 0.1) {
      const dur = 0.03 + Math.random() * 0.14 * Math.min(1, st.dropRate / 3);
      t.gate.gain.cancelScheduledValues(now);
      t.gate.gain.setValueAtTime(1, now);
      t.gate.gain.linearRampToValueAtTime(1 - st.dropDepth, now + 0.008);
      t.gate.gain.setValueAtTime(1 - st.dropDepth, now + dur);
      t.gate.gain.linearRampToValueAtTime(1, now + dur + 0.01);
      if (t.level < 0.25 && Math.random() < 0.12 && t.src) { try { t.src.playbackRate.cancelScheduledValues(now); t.src.playbackRate.setValueCurveAtTime(new Float32Array([1, 0.7, 1.3, 1]), now + 0.001, 0.09); } catch { /* */ } }
    }
  }

  /**
   * Mezcla por fotograma. `weights`: id → peso de sector. `levels`: id → restauración 0..1 (−1 = estado central).
   * `presence`: id → {prox 0..1, pan −1..1} respecto a su cassette.
   */
  update(dt: number, weights: Record<string, number>, levels: Record<string, number>, presence: Record<string, { prox: number; pan: number }>, flash: Record<string, number> = {}) {
    const c = this.ctx, now = c.currentTime;
    const ranked = Object.entries(weights).filter(([, w]) => w > 0.01).sort((a, b) => b[1] - a[1]).slice(0, this.MAX_VOICES);
    const active = new Set(ranked.map(([id]) => id));
    const world = this.muted ? 0 : Math.min(this.duckGain, this.dialogDuck) * this.previewExclusion * this.zoneDuck * this.outside * this.zoneDip;
    for (const t of this.tracks.values()) {
      const w = active.has(t.id) ? weights[t.id] : 0;
      // R5 (P24): la pista del sector se CARGA aunque la música esté en silencio (fuera del parque, preview, reto): antes solo se pedía
      // con world > 0 y, como la partida empieza fuera, al entrar o al salir del preview tardaba en sonar lo que tarda en bajarse
      if (w > 0) {
        if (!t.buffer) this.ensure(t.id);
        else if (world > 0 && !t.playing) this.start(t, active);
        t.lastUse = now;
      }
      const pr = presence[t.id] ?? { prox: 0, pan: 0 };
      let target = w * (0.62 + 0.38 * pr.prox) * world;
      // un valor no finito aquí quedaba pegado en t.gain y Web Audio lanzaba en cada fotograma: se descarta y se avisa una vez
      if (!Number.isFinite(target) || !Number.isFinite(dt) || !Number.isFinite(t.gain)) { this.badInput({ id: t.id, w, prox: pr.prox, pan: pr.pan, world, dt, gain: t.gain }); target = Number.isFinite(target) ? target : 0; if (!Number.isFinite(t.gain)) t.gain = 0; }
      // V10.1: empalme con la escena final: entra a su volumen de golpe y la canción de la escena se corta a la vez
      // V10.1: al pasar a limpia (o al revés) la voz se para con fundido y vuelve a entrar por la otra salida en el mismo punto
      if (t.playing && t.isClean !== this.cleanIds.has(t.id)) this.stop(t, 0.05);
      if ((t as any).warm && t.playing) { (t as any).warm = false; t.gain = target; const o = t.isClean ? t.clean : t.out; o.gain.cancelScheduledValues(now); o.gain.setValueAtTime(t.isClean ? cleanGain(target) : target, now + 0.01); this.stopFinal(0.06); }
      t.gain += (target - t.gain) * (1 - Math.exp(-4 * (Number.isFinite(dt) ? dt : 0)));
      if (t.playing && t.isClean) {
        // misma ganancia que la escena final (previewGain = 1) desde el sitio del reto; se aleja como las demás
        t.clean.gain.setTargetAtTime(cleanGain(t.gain) * this.cleanTrim(t.id), now, 0.05);
        const pan = THREE.MathUtils.clamp(pr.pan * 0.55 * pr.prox, -0.6, 0.6);
        t.pan.pan.setTargetAtTime(Number.isFinite(pan) ? pan : 0, now, 0.1);
        if (t.gain < 0.002 && (w === 0 || world === 0)) this.stop(t, 0.03);
      } else if (t.playing) {
        t.out.gain.setTargetAtTime(t.gain, now, 0.05);
        const pan = THREE.MathUtils.clamp(pr.pan * 0.55 * pr.prox, -0.6, 0.6);
        t.pan.pan.setTargetAtTime(Number.isFinite(pan) ? pan : 0, now, 0.1);
        this.applyLevel(t, levels[t.id] ?? 0, flash[t.id] ?? 0);
        if (this.glitchTimer <= 0) this.scheduleGlitch(t);
        if (t.gain < 0.002 && (w === 0 || world === 0)) this.stop(t, 0.03);
      }
    }
    this.glitchTimer = this.glitchTimer <= 0 ? 0.1 : this.glitchTimer - dt;
    const live = this.liveVoices();
    this.stats.maxSimultaneous = Math.max(this.stats.maxSimultaneous, live.length);
    this.stats.maxAudible = Math.max(this.stats.maxAudible, live.filter((t) => t.gain > 0.02).length);
  }

  private badReported = false;
  private badInput(info: Record<string, unknown>) { if (!this.badReported) { this.badReported = true; console.error('música: entrada no finita descartada', JSON.stringify(info)); } }
  prefetch(ids: string[]) { for (const id of ids) { const t = this.tracks.get(id); if (t && !t.buffer && !t.loading) this.ensure(id); } }
  get soundingIds() { return [...this.tracks.values()].filter((t) => t.playing && t.gain > 0.01).map((t) => t.id); }
  get liveCount() { return this.liveVoices().length; }
  levelOf(id: string) { return this.tracks.get(id)?.level ?? -2; }
  setDuck(g: number) { this.duckGain = g; }
  /** V10.4 R13: las canciones de las zonas limpias (4/4) conservan su nivel relativo (su `trims`) y la sonoridad que tenían con radio: medido
   *  con r11/f10-audio (con el mismo limitador que la radio, ver `zoneCleanBus`). SECRETNOVIO, como estaba (como la escena final). */
  private cleanTrim(id: string) { return id === 'secretnovio' ? 1 : dbToGain((this.cfg.trims?.[id] ?? 0) + CLEAN_MATCH_DB); }
  /** Durante el preview las canciones del parque callan (fundido) y no arrancan nuevas.
   *  V5 T5-02 (HUM-A5-010): la transición es EXPLÍCITA en el reloj del AudioContext, no depende de `update()` (el bucle de
   *  juego no presenta durante el preview y V4 dejaba sonar el parque). Al entrar, cada voz viva funde a 0 y se para; al
   *  salir, el siguiente `update()` vuelve a arrancar las del sector actual (con su desfase de reloj: sin duplicados). */
  setPreviewMode(on: boolean) {
    this.previewExclusion = on ? 0 : 1;
    if (on) for (const t of this.tracks.values()) { t.gain = 0; this.stop(t, 0.25); }
    else if (![...this.tracks.values()].some((t) => (t as any).warm)) this.stopPreview();   // V10.1: con empalme pendiente, la escena sigue sonando hasta que entra la pista
  }

  /**
   * Preview limpio: reproducción aparte, sin procesar. Con token: si se cierra mientras carga, al terminar la carga
   * NO suena. Devuelve 'ok' | 'error' | 'cancelled'.
   */
  async playPreview(id: string, token: Token, onEnd?: () => void): Promise<'ok' | 'error' | 'cancelled'> {
    this.stopPreview();
    const gen = ++this.previewGen;
    this.previewState = 'loading';
    await this.ensure(id);
    if (!token.alive || gen !== this.previewGen) return 'cancelled';
    const t = this.tracks.get(id); const buf = t?.previewBuf ?? t?.buffer;
    if (!buf) { this.previewState = 'error'; return 'error'; }
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(this.previewGain);
    src.onended = () => { if (this.previewSrc === src) { this.previewSrc = null; this.previewState = 'ended'; if (token.alive) onEnd?.(); } };
    this.previewGain.gain.value = this.muted ? 0 : 1;
    src.start(); this.previewSrc = src; this.previewState = 'playing';
    token.onCancel(() => { if (this.previewSrc === src) this.stopPreview(); });
    return 'ok';
  }
  stopPreview() {
    this.previewGen++;
    if (this.previewSrc) { const s = this.previewSrc; this.previewSrc = null; s.onended = null; try { s.stop(); } catch { /* */ } s.disconnect(); }
    if (this.previewState === 'playing' || this.previewState === 'loading') this.previewState = 'idle';
  }
  get previewPlaying() { return !!this.previewSrc; }
  /** V10.1 escena final: la canción de SECRETNOVIO desde el segundo 0 (archivo propio), por la salida del preview (sin efectos de radio). */
  // V10.4 R12: un búfer por archivo (también suena por aquí el corte de NO ME GUILLO de la cinemática del parque; antes se guardaba solo el primero)
  private finalBufs = new Map<string, Promise<AudioBuffer | null>>(); private finalAt: number | null = null;
  loadFinal(url: string) { let p = this.finalBufs.get(url); if (!p) { p = fetch(url).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).catch(() => null); this.finalBufs.set(url, p); } return p; }
  async playFinal(url: string) {
    const buf = await this.loadFinal(url); this.stopPreview(); if (!buf) return null;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(this.previewGain);
    const g = this.previewGain.gain, now = this.ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(this.muted ? 0 : 1, now);
    src.onended = () => { if (this.previewSrc === src) { this.previewSrc = null; this.previewState = 'ended'; } };
    src.start(); this.finalAt = this.ctx.currentTime; this.previewSrc = src; this.previewState = 'playing'; return src;
  }
  /** V10.1 (usuario: «que al acabar la animación continúe el audio»): la pista `id` del parque arrancará con su reloj puesto para que su
   *  comienzo coincida con el segundo `songSec` de la canción de la escena, a volumen pleno, y la canción de la escena se cortará en ese
   *  mismo instante (empalme sin hueco ni subida). */
  handoffFinal(id: string, songSec: number) {
    const t = this.tracks.get(id); if (!t || this.finalAt === null) return false;
    t.t0 = this.finalAt + songSec; (t as any).warm = true; void this.ensure(id); return true;
  }
  /** V10.3 (R3-10): la pista `id` vuelve a empezar desde el principio de su ventana la próxima vez que suene (SALTAR la escena → 0:32). */
  restartTrack(id: string) { const t = this.tracks.get(id); if (t && this.ctx) t.t0 = this.ctx.currentTime + 0.02; }
  stopFinal(fade = 0.5) {
    const src = this.previewSrc; if (!src) return; const g = this.previewGain.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + fade);
    setTimeout(() => { if (this.previewSrc === src) this.stopPreview(); g.cancelScheduledValues(this.ctx.currentTime); g.setValueAtTime(this.muted ? 0 : 1, this.ctx.currentTime); }, fade * 1000 + 30);
  }
  setMuted(m: boolean) { this.muted = m; const g = this.previewGain.gain, now = this.ctx.currentTime; if (this.ctx.state === 'running') g.setTargetAtTime(m ? 0 : 1, now, 0.02); else { g.cancelScheduledValues(now); g.value = m ? 0 : 1; } }
  stopAll() { for (const t of this.tracks.values()) this.stop(t, 0.02); this.stopPreview(); }
}

function mergeRadio(r?: Partial<RadioParams>): RadioParams {
  const d = RADIO_DEFAULT;
  return { broken: { ...d.broken, ...(r?.broken ?? {}) }, clean: { ...d.clean, ...(r?.clean ?? {}) }, central: { ...d.central, ...(r?.central ?? {}) }, trimMid: r?.trimMid ?? d.trimMid };
}
/** Margen fijo tras la saturación (dos temas en frontera + SFX sin recorte). */
export const HEADROOM_DB = -6;
/** V10.1: pista limpia: a 0,8 de mezcla (dentro de SECRETNOVIO) ya suena a 1, como la escena final. */
export const cleanGain = (g: number) => Math.min(1, g * 1.25);
/** V10.4 R13: igualación de sonoridad de la salida limpia de las zonas (4/4) con la de radio. */
export const CLEAN_MATCH_DB = -1.4;   // medido: con el limitador, la limpia a 4/4 daba −15,3 dB RMS frente a −16,7 con radio
export function dbToGain(db: number) { return Math.pow(10, db / 20); }

type Chain = Pick<Track, 'pre' | 'in' | 'hp' | 'lp' | 'peak' | 'shaper' | 'crush' | 'trim' | 'post' | 'gate' | 'noiseGain' | 'noiseBp' | 'pan' | 'out' | 'wobbleGain'>;

/** Cadena radio/glitch (la misma en el juego y en el render offline de comprobación). */
export function createChain(c: BaseAudioContext, dest: AudioNode): Chain {
  const t: Chain = {
    pre: c.createGain(), in: c.createGain(), hp: c.createBiquadFilter(), lp: c.createBiquadFilter(), peak: c.createBiquadFilter(),
    shaper: c.createWaveShaper(), crush: c.createWaveShaper(), trim: c.createGain(), post: c.createGain(), gate: c.createGain(), noiseGain: c.createGain(),
    noiseBp: c.createBiquadFilter(), pan: c.createStereoPanner(), out: c.createGain(), wobbleGain: c.createGain(),
  };
  t.hp.type = 'highpass'; t.lp.type = 'lowpass'; t.peak.type = 'peaking'; t.peak.frequency.value = 1800; t.peak.Q.value = 0.8;
  t.noiseBp.type = 'bandpass'; t.noiseBp.frequency.value = 2400; t.noiseBp.Q.value = 0.6;
  t.out.gain.value = 0;
  t.pre.connect(t.in).connect(t.hp).connect(t.lp).connect(t.peak).connect(t.shaper).connect(t.crush).connect(t.trim).connect(t.post).connect(t.gate).connect(t.pan).connect(t.out).connect(dest);
  t.noiseGain.connect(t.noiseBp).connect(t.post);   // el ruido de radio escala con el tema (antes se sumaba a nivel fijo)
  t.post.gain.value = dbToGain(HEADROOM_DB);
  return t;
}

/** Parámetros del estado: r ∈ [0,1] exterior (0/4 → 4/4); r < 0 = centro. `flash` ∈ [0,1] (solo centro) mezcla el
 *  preset central con la cadena EXACTA del exterior 2/4 (r = 0,5): flash 1 = calidad de dos patatas. */
export function stateAt(P: RadioParams, r: number, flash = 0): StateParams {
  if (r < 0) {
    if (flash <= 0) return P.central;
    const a = P.central, b = stateAt(P, 0.5), k = Math.min(1, flash);
    const L = (x: number, y: number) => x + (y - x) * k, G = (x: number, y: number) => x * Math.pow(y / x, k);
    return { hp: G(a.hp, b.hp), lp: G(a.lp, b.lp), drive: k >= 0.5 ? b.drive : a.drive, noise: L(a.noise, b.noise), dropRate: L(a.dropRate, b.dropRate), dropDepth: L(a.dropDepth, b.dropDepth),
      wobble: L(a.wobble, b.wobble), crush: k >= 0.5 ? b.crush : a.crush, peak: L(a.peak, b.peak), inGain: L(a.inGain, b.inGain) };
  }
  const a = P.broken, b = P.clean;
  const L = (x: number, y: number) => x + (y - x) * r;
  const G = (x: number, y: number) => x * Math.pow(y / x, r);
  return { hp: G(a.hp, b.hp), lp: G(a.lp, b.lp), drive: L(a.drive, b.drive), noise: L(a.noise, b.noise), dropRate: a.dropRate * Math.pow(1 - r, 1.4),
    dropDepth: a.dropDepth * (1 - r), wobble: L(a.wobble, b.wobble), crush: Math.round(G(a.crush, b.crush)), peak: L(a.peak, b.peak), inGain: L(a.inGain, b.inGain) };
}
export function setChainLevel(t: Chain, P: RadioParams, r: number, now: number, instant: boolean, flash = 0, tc?: number, curves = true) {
  const s = stateAt(P, r, flash);
  const set = (p: AudioParam, v: number, tcs: number) => (instant ? p.setValueAtTime(v, now) : p.setTargetAtTime(v, now, tc ?? tcs));
  set(t.hp.frequency, s.hp, 0.15); set(t.lp.frequency, s.lp, 0.15); set(t.peak.gain, s.peak, 0.15);
  if (curves) { t.shaper.curve = driveCurve(s.drive); t.crush.curve = crushCurve(s.crush); }
  set(t.noiseGain.gain, s.noise, 0.2); set(t.wobbleGain.gain, s.wobble, 0.2);
  set(t.in.gain, s.inGain, 0.2);
  // compensación de nivel: los estados intermedios saturan y suben RMS; el central entra como un 0/4 y en el destello
  // usa la compensación del 2/4 (misma cadena exacta)
  const rr = r < 0 ? 0.5 * Math.min(1, flash) : r;
  const mid = Math.pow(Math.sin(Math.PI * rr), 0.8);
  set(t.trim.gain, Math.max(0.3, 1 - P.trimMid * mid), 0.2);
  return s;
}

/** Comprueba que el buffer decodificado es la ventana declarada (muestras ±relleno de códec ≤ 4096) y recorta el relleno.
 *  Un archivo viejo, otra canción o un corte desplazado de duración distinta lanzan error (rojo), no suenan en silencio. */
export function checkWindow(c: BaseAudioContext, dec: AudioBuffer, cut: { samples: number; sampleRate: number } | undefined, id: string) {
  if (!cut) return dec;
  const want = Math.round(cut.samples * dec.sampleRate / cut.sampleRate);
  const extra = dec.length - want;
  if (extra < -Math.round(0.02 * dec.sampleRate) || extra > 4096) throw new Error(`corte ${id}: ${dec.length} muestras decodificadas, se esperaban ${want}`);
  if (extra <= 0) return dec;
  const out = c.createBuffer(dec.numberOfChannels, want, dec.sampleRate);
  for (let ch = 0; ch < dec.numberOfChannels; ch++) out.getChannelData(ch).set(dec.getChannelData(ch).subarray(0, want));
  return out;
}

/** Loop V4 con costura CIRCULAR interna: devuelve un buffer de N − X muestras cuyo comienzo [0, X) mezcla en igual
 *  potencia el comienzo de la ventana (entrando) con su cola [N − X, N) (saliendo). Solo usa muestras de la ventana; el
 *  salto del final al principio es continuo porque la cola fundida sigue a la muestra N − X − 1. */
export function bakeLoop(c: BaseAudioContext, src: AudioBuffer, xfade: number) {
  const sr = src.sampleRate, N = src.length, X = Math.min(Math.round(xfade * sr), Math.floor(N / 4));
  if (X <= 0) return src;
  const L = N - X;
  const out = c.createBuffer(src.numberOfChannels, L, sr);
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    const a = src.getChannelData(ch), o = out.getChannelData(ch);
    o.set(a.subarray(0, L));
    for (let i = 0; i < X; i++) { const k = (i + 0.5) / X; o[i] = a[i] * Math.sin(k * Math.PI / 2) + a[L + i] * Math.cos(k * Math.PI / 2); }
  }
  return out;
}

/** V3 (histórico, solo para la prueba negativa AUD-02): mezclaba la cola con [start − x, start), material ANTERIOR a la
 *  ventana. No se usa en el juego. */
export function bakeLoopV3Legacy(c: BaseAudioContext, src: AudioBuffer, start: number, end: number, xfade: number) {
  const sr = src.sampleRate, s = Math.round(start * sr), e = Math.min(src.length, Math.round(end * sr)), X = Math.min(Math.round(xfade * sr), s, e - s - 1);
  if (X <= 0 || e - s < sr) return src;
  const out = c.createBuffer(src.numberOfChannels, e - s, sr);
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    const a = src.getChannelData(ch), o = out.getChannelData(ch);
    o.set(a.subarray(s, e));
    const L = e - s;
    for (let i = 0; i < X; i++) {
      const k = i / X, fo = Math.cos(k * Math.PI / 2), fi = Math.sin(k * Math.PI / 2);
      o[L - X + i] = a[e - X + i] * fo + a[s - X + i] * fi;
    }
  }
  return out;
}

/** Render offline reproducible de un estado (mismo fragmento) para medir/escuchar sin depender del momento de juego. */
export async function renderState(buffer: AudioBuffer, P: RadioParams, r: number, offset: number, seconds: number, sampleRate = 22050, trimDb = 0, preDb = 0) {
  const c = new OfflineAudioContext(2, Math.round(seconds * sampleRate), sampleRate);
  const ch = createChain(c, c.destination);
  ch.out.gain.value = 1; ch.post.gain.value = dbToGain(HEADROOM_DB + trimDb); ch.pre.gain.value = dbToGain(preDb);
  setChainLevel(ch, P, r, 0, true);
  const src = c.createBufferSource(); src.buffer = buffer; src.connect(ch.pre);
  const wob = c.createOscillator(); wob.frequency.value = 0.8; wob.connect(ch.wobbleGain).connect(src.playbackRate); wob.start();
  const nb = c.createBuffer(1, sampleRate * 2, sampleRate); const d = nb.getChannelData(0);
  let crackle = 0, seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < d.length; i++) { crackle = rnd() < 0.0015 ? 1 : crackle * 0.97; d[i] = (rnd() * 2 - 1) * 0.6 + (rnd() < 0.5 ? -1 : 1) * crackle * 0.5; }
  const n = c.createBufferSource(); n.buffer = nb; n.loop = true; n.connect(ch.noiseGain); n.start();
  const st = stateAt(P, r);
  for (let t = 0.05; t < seconds; t += 0.1) if (st.dropRate > 0.05 && rnd() < st.dropRate * 0.1) {
    const dur = 0.03 + rnd() * 0.14 * Math.min(1, st.dropRate / 3);
    ch.gate.gain.setValueAtTime(1, t); ch.gate.gain.linearRampToValueAtTime(1 - st.dropDepth, t + 0.008);
    ch.gate.gain.setValueAtTime(1 - st.dropDepth, t + dur); ch.gate.gain.linearRampToValueAtTime(1, t + dur + 0.01);
  }
  src.loop = true; src.start(0, offset % buffer.duration);   // en bucle, como suena en el juego
  const out = await c.startRendering();
  let acc = 0, peak = 0; const L0 = out.getChannelData(0), R0 = out.getChannelData(1);
  for (let i = 0; i < L0.length; i++) { acc += (L0[i] * L0[i] + R0[i] * R0[i]) / 2; peak = Math.max(peak, Math.abs(L0[i]), Math.abs(R0[i])); }
  return { buffer: out, rms: Math.sqrt(acc / L0.length), peak };
}

function driveCurve(k: number) {
  const n = 512, curve = new Float32Array(n), a = 1 + k * 18;
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(a * x) / Math.tanh(a); }
  return curve;
}
function crushCurve(levels: number) {
  const n = 1024, curve = new Float32Array(n), L = Math.max(2, levels);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.round(x * L) / L; }
  return curve;
}
