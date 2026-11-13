// Audio V3: un solo motor (AudioContext) creado en el gesto de JUGAR, buses master/sfx/música/preview, efectos
// sintetizados ligados a eventos reales del controlador (sin descargas), rodadura por superficie, freno, grind,
// motores de los coches y la música por cassette (music.ts).
// Sesión multimedia (AUD-01, D15): si existe `navigator.audioSession` (WebKit), se pide 'playback' ANTES de crear o
// reanudar el contexto, desde el gesto. Objetivo: que Ring/Silent del iPhone no silencie la música del juego,
// respetando el MUTE propio y el volumen multimedia del sistema. Sin la API no se lanza nada y se conserva Web Audio.
// No se usa audio silencioso perpetuo. Si la reanudación falla o el sistema interrumpe el contexto, la interfaz
// ofrece «Activar sonido» (distinto del botón de silencio) y se reintenta con el siguiente gesto.
// LIMITACIÓN: la salida audible en un iPhone físico en silencio NO está comprobada aquí (pendiente físico).
import { Music, MusicConfig } from './music';
/** V10.5 (O-12): los medidores de nivel (analizadores) solo los usan las pruebas: solo con ?bktest (o en desarrollo). */
const TEST = import.meta.env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('bktest'));
const THREE_CLAMP = (v: number) => Math.min(0.7, Math.max(-0.7, v));

export interface AudioConfig { masterVolume: number; music: MusicConfig }
export type Surface = 'concrete' | 'asphalt' | 'dirt' | 'wood' | 'led' | 'metal';
type Sfx = 'catch' | 'scoot' | 'manualIn' | 'getup' | 'pickup' | 'jump' | 'hop' | 'land' | 'click' | 'success' | 'fail' | 'step' | 'reward' | 'fall' | 'whoosh' | 'spray' | 'deny' | 'trick'
  | 'reveal' | 'talk' | 'push' | 'bail' | 'grindIn' | 'mount' | 'dismount' | 'arm' | 'wallIn' | 'coping';

const THREE_CLAMP01 = (v: number) => Math.min(1, Math.max(0, v));
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode; sfxBus!: GainNode;
  music: Music | null = null;
  analyser: AnalyserNode | null = null;
  /** R11 (MEZ-01): limitador de pico final (master → limitador → altavoces): identidad hasta −1,4 dBFS y curva suave que nunca pasa de
   *  0,95 (un DynamicsCompressor dejaba pasar picos de 0 dBFS por su ataque y subía +0,5 dB el nivel normal con su ganancia automática). */
  limiter: AudioNode | null = null;
  previewAnalyser: AnalyserNode | null = null;
  private noiseBuf!: AudioBuffer;
  private roll: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; scrape: GainNode } | null = null;
  private grind: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private engine: { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode; noise: AudioBufferSourceNode; ng: GainNode } | null = null;
  volume = 0.8; muted = false;
  unlockCount = 0;
  session: { supported: boolean; type: string | null; error: string | null; state: string | null } = { supported: false, type: null, error: null, state: null };
  needsGesture = false;
  onNeedsGesture: ((need: boolean) => void) | null = null;
  private wantRunning = false;
  private sfxCooldown = new Map<string, number>();
  log: string[] = [];

  constructor(public cfg: AudioConfig) { this.volume = cfg.masterVolume ?? 0.8; }

  /** Intención multimedia (solo si la API existe). Debe llamarse dentro del gesto, antes de crear/reanudar. */
  private requestPlaybackSession() {
    const as = (navigator as any).audioSession;
    this.session.supported = !!as;
    if (!as) return;
    try { if (as.type !== 'playback') as.type = 'playback'; this.session.type = as.type; this.session.state = as.state ?? null; }
    catch (e: any) { this.session.error = String(e?.message ?? e); }
    try { as.onstatechange = () => { this.session.state = as.state ?? null; this.log.push('session:' + this.session.state); if (as.state === 'interrupted') this.setNeedsGesture(true); }; } catch { /* */ }
  }

  /** Debe llamarse dentro de un gesto del usuario (JUGAR, Activar sonido, ESCUCHAR). Idempotente. */
  unlock() {
    this.requestPlaybackSession();
    if (!this.ctx) {
      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.volume;
      // R11 (MEZ-01): junto a La Pantera la suma música + emisor + efectos pasaba de 0 dBFS (recortes audibles, también al 80 %)
      const pre = c.createGain(); pre.gain.value = 0.5;   // la curva cubre ±2 (entrada) → ±1 (dominio de la curva)
      const lim = c.createWaveShaper(), N = 8193, curve = new Float32Array(N), T0 = 0.85, K = 0.1;   // identidad hasta −1,4 dBFS; asíntota 0,95 (−0,45 dBFS)
      for (let i = 0; i < N; i++) { const x = (i / (N - 1) * 2 - 1) * 2, ax = Math.abs(x); curve[i] = ax <= T0 ? x : Math.sign(x) * (T0 + K * Math.tanh((ax - T0) / K)); }
      lim.curve = curve; lim.oversample = '4x'; this.limiter = lim;
      this.master.connect(pre).connect(lim).connect(c.destination);
      if (TEST) { this.analyser = c.createAnalyser(); this.analyser.fftSize = 1024; lim.connect(this.analyser); }   // level(): lo que sale de verdad · V10.5 (O-12): medidores solo para las pruebas
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.75; this.sfxBus.connect(this.master);
      const len = c.sampleRate * 1.5;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.music = new Music(c, this.master, this.cfg.music);
      this.previewAnalyser = c.createAnalyser(); this.previewAnalyser.fftSize = 256; this.music.previewGain.connect(this.previewAnalyser);
      if (TEST) { this.musicTap = c.createAnalyser(); this.musicTap.fftSize = 2048; this.music.bus.connect(this.musicTap); }
      this.setEfficient(this.efficient);
      c.addEventListener('statechange', () => { this.log.push('ctx:' + c.state); if (this.wantRunning && c.state !== 'running') this.setNeedsGesture(true); else if (c.state === 'running') this.setNeedsGesture(false); });
      this.applyVolume();
    }
    this.unlockCount++;
    this.wantRunning = true;
    this.tryResume();
  }
  private tryResume() {
    const c = this.ctx; if (!c) return;
    if (c.state === 'running') { this.setNeedsGesture(false); return; }
    try {
      const p = c.resume();
      p?.then?.(() => this.setNeedsGesture(c.state !== 'running')).catch?.((e: any) => { this.log.push('resume-fail ' + e); this.setNeedsGesture(true); });
    } catch (e) { this.log.push('resume-throw ' + e); this.setNeedsGesture(true); }
  }
  private setNeedsGesture(v: boolean) { if (this.needsGesture !== v) { this.needsGesture = v; this.onNeedsGesture?.(v); } }
  get ready() { return !!this.ctx; }
  level() {
    if (!this.analyser) return 0;
    const b = new Float32Array(this.analyser.fftSize); this.analyser.getFloatTimeDomainData(b);
    return Math.sqrt(b.reduce((a, v) => a + v * v, 0) / b.length);
  }
  applyVolume() {
    // con el contexto parado el tiempo no avanza: un setTargetAtTime quedaría en el valor anterior al reanudar (V3: el
    // master arrancaba a 1 con el juego en silencio); entonces el valor se fija al instante
    const v = this.muted ? 0 : this.volume, c = this.ctx;
    if (this.master && c) { if (c.state === 'running') this.master.gain.setTargetAtTime(v, c.currentTime, 0.02); else { this.master.gain.cancelScheduledValues(c.currentTime); this.master.gain.setValueAtTime(v, c.currentTime); this.master.gain.value = v; } }
    this.music?.setMuted(this.muted);
  }
  setVolume(v: number) { this.volume = v; this.applyVolume(); }
  setMuted(m: boolean) { this.muted = m; this.applyVolume(); }
  /** Pausa/segundo plano: suspende sin duplicar al volver (las fuentes siguen vivas en el contexto suspendido). */
  suspend() { this.wantRunning = false; try { this.ctx?.suspend()?.catch?.(() => {}); } catch { /* */ } }
  resume() { if (!this.ctx) return; this.wantRunning = true; this.tryResume(); }
  /** V5 T5-02: preview con audio exclusivo. Al entrar: parque fuera (Music.setPreviewMode), rodadura, grind y motor a 0 y
   *  bus de efectos cerrado (corta también los efectos en curso); al salir se reabre el bus y el bucle de juego vuelve a fijar
   *  rodadura y motor en su siguiente `present()`. */
  previewMode = false;
  setPreviewMode(on: boolean) {
    this.previewMode = on;
    this.music?.setPreviewMode(on);
    const c = this.ctx; if (!c) return;
    if (on) { this.setRoll(0, false); this.setGrind(false); this.setEngine(0, 0); }
    const now = c.currentTime, g = this.sfxBus.gain;
    g.cancelScheduledValues(now);
    if (c.state === 'running') g.setTargetAtTime(on ? 0 : 0.75, now, on ? 0.03 : 0.08); else { g.setValueAtTime(on ? 0 : 0.75, now); g.value = on ? 0 : 0.75; }
  }
  // R2-G8: emisores posicionales (bucle continuo; el juego fija ganancia y paneo cada fotograma). Van al master (volumen y
  // silencio del jugador) y se callan en el preview. `musicTap`/`emitterTap`: medidores para calibrar (sin efecto audible).
  private emitters = new Map<string, { gain: GainNode; pan: StereoPannerNode; src: AudioBufferSourceNode | null; buf: AudioBuffer | null; stopT: number; level: number; error: string | null }>();
  /** V10.5 (E5-33): Modo eficiente: limitador con sobremuestreo ×2 (×4 normal). Se puede cambiar en caliente. */
  efficient = false;
  setEfficient(on: boolean) { this.efficient = on; if (this.limiter) (this.limiter as WaveShaperNode).oversample = on ? '2x' : '4x'; }
  musicTap: AnalyserNode | null = null; emitterTap: AnalyserNode | null = null;
  emitter(id: string, url: string, gain: number, pan: number) {
    const c = this.ctx; if (!c) return;
    let e = this.emitters.get(id);
    if (!e) {
      // R4: limitador suave tras la ganancia (al subir el volumen, los picos de la fuente no saturan la salida)
      const g = c.createGain(); g.gain.value = 0; const p = c.createStereoPanner(), lim = c.createDynamicsCompressor();
      lim.threshold.value = -4; lim.knee.value = 4; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.15;
      g.connect(lim).connect(p).connect(this.master);
      if (TEST) { if (!this.emitterTap) { this.emitterTap = c.createAnalyser(); this.emitterTap.fftSize = 2048; } g.connect(this.emitterTap); }
      const em = { gain: g, pan: p, src: null as AudioBufferSourceNode | null, buf: null as AudioBuffer | null, stopT: 0, level: 0, error: null as string | null }; e = em; this.emitters.set(id, em);
      fetch(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); }).then((b) => c.decodeAudioData(b)).then((buf) => {
        em.buf = buf; if (em.level > 0 || !em.src) { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(g); s.start(); em.src = s; }
      }).catch((err) => { em.error = String(err); this.log.push(`emisor ${id}: ${err}`); });
    }
    const v = this.previewMode || !Number.isFinite(gain) ? 0 : Math.max(0, gain); e.level = v;
    // V10.5 (O-12): a volumen 0 más de 2,5 s la fuente se para (sonaba siempre a 0 y gastaba en el hilo de audio); al volver, sigue
    { const em = e;
      if (v === 0) { if (em.src && !em.stopT) em.stopT = window.setTimeout(() => { em.stopT = 0; if (em.level === 0 && em.src) { try { em.src.stop(); em.src.disconnect(); } catch { /* */ } em.src = null; } }, 2500); }
      else { if (em.stopT) { clearTimeout(em.stopT); em.stopT = 0; } if (!em.src && em.buf) { const s2 = c.createBufferSource(); s2.buffer = em.buf; s2.loop = true; s2.connect(em.gain); s2.start(); em.src = s2; } } }
    e.gain.gain.setTargetAtTime(v, c.currentTime, 0.08);
    e.pan.pan.setTargetAtTime(Number.isFinite(pan) ? THREE_CLAMP(pan) : 0, c.currentTime, 0.1);
  }
  /** V10.1 P24 (D18 b, D1-…): ambiente del exterior SINTETIZADO (0 bytes): rumor lejano de ciudad (ruido rosa filtrado y lento) y pájaros
   *  (chirridos de oscilador con barridos, a intervalos al azar). `level` 0..1 lo fija el juego cada fotograma (inverso de la música). */
  private amb: { gain: GainNode; city: GainNode; nextBird: number } | null = null; ambLevel = 0;
  ambience(level: number) {
    const c = this.ctx; if (!c) return;
    if (!this.amb) {
      const g = c.createGain(); g.gain.value = 0; g.connect(this.master);
      // ruido rosa (Voss–McCartney simplificado) de 4 s en bucle, paso bajo 380 Hz y una modulación lenta: «ciudad lejana»
      const n = c.sampleRate * 4, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048; d[i] = (b0 + b1 + b2 + w * 0.02) * 0.6; }
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.4;
      const city = c.createGain(); city.gain.value = 0.22; s.connect(lp).connect(city).connect(g); s.start();
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.06; lfo.connect(lg).connect(city.gain); lfo.start();
      this.amb = { gain: g, city, nextBird: c.currentTime + 1.5 };
    }
    const v = this.previewMode || !Number.isFinite(level) ? 0 : THREE_CLAMP01(level); this.ambLevel = v;
    this.amb.gain.gain.setTargetAtTime(v * 0.5, c.currentTime, 0.4);
    if (v > 0.05 && c.currentTime >= this.amb.nextBird) {   // pájaro: 2–4 chirridos cortos con barrido descendente/ascendente
      const t0 = c.currentTime + 0.05, k = 2 + Math.floor(Math.random() * 3), base = 2600 + Math.random() * 1600;
      for (let i = 0; i < k; i++) { const o = c.createOscillator(), e = c.createGain(), t = t0 + i * (0.09 + Math.random() * 0.05), up = Math.random() < 0.5;
        o.type = 'sine'; o.frequency.setValueAtTime(base * (up ? 0.8 : 1.15), t); o.frequency.exponentialRampToValueAtTime(base * (up ? 1.2 : 0.75), t + 0.07);
        e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.05 * v, t + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        o.connect(e).connect(this.amb.gain); o.start(t); o.stop(t + 0.1); }
      this.amb.nextBird = c.currentTime + 2.5 + Math.random() * 5;
    }
  }
  emitterInfo(id: string) { const e = this.emitters.get(id); return e ? { level: e.level, loaded: !!e.buf, error: e.error } : null; }
  /** Bajar la música del mundo (diálogo/actividad) sin pararla. */
  duck(on: boolean) { this.music?.setDuck(on ? 0.45 : 1); }

  private env(g: GainNode, t: number, a: number, peak: number, dec: number) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  private noise(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1) {
    const c = this.ctx!, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    this.env(g, t, 0.002, vol, dur); s.connect(f).connect(g).connect(this.sfxBus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  private tone(f: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    this.env(g, t, 0.005, vol, dur); o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  /** Efecto puntual con enfriamiento (no se dispara en ráfaga por vibración del contacto). */
  /** Registro corto de peticiones de efecto (evento → sonó / descartado y por qué), para comprobar AUD-05. */
  sfxLog: { n: string; p: number; t: number; ok: boolean; why?: string }[] = [];
  private logSfx(n: string, p: number, ok: boolean, why?: string) { this.sfxLog.push({ n, p: +p.toFixed(2), t: +performance.now().toFixed(0), ok, ...(why ? { why } : {}) }); if (this.sfxLog.length > 400) this.sfxLog.splice(0, 100); }
  sfx(name: Sfx, p = 0) {
    if (!this.ctx || this.ctx.state !== 'running') { this.logSfx(name, p, false, this.ctx ? this.ctx.state : 'sin contexto'); return; }
    const c = this.ctx, t = c.currentTime;
    const cd = ({ land: 0.12, push: 0.2, step: 0.04, spray: 0.06, deny: 0.3, talk: 0.08, catch: 0.15, scoot: 0.2, manualIn: 0.4, getup: 0.5 } as Record<string, number>)[name] ?? 0.03;
    if (t - (this.sfxCooldown.get(name) ?? -9) < cd) { this.logSfx(name, p, false, 'enfriamiento'); return; }
    this.sfxCooldown.set(name, t); this.logSfx(name, p, true);
    switch (name) {
      case 'pickup': { const base = 880 * Math.pow(2, p / 12); this.tone(base, 0.12, 'triangle', 0.22); this.tone(base * 1.5, 0.18, 'triangle', 0.2, 0.07); this.tone(base * 2, 0.25, 'sine', 0.13, 0.14); break; }
      case 'jump': this.noise(t, 0.05, 0.42, 'bandpass', 2200, 2); this.tone(140, 0.05, 'square', 0.07); this.noise(t + 0.01, 0.12, 0.12, 'highpass', 5000); break; // pop de cola contra el suelo
      case 'hop': this.noise(t, 0.05, 0.12, 'lowpass', 900); break;
      case 'land': { const k = Math.min(1, 0.35 + p * 0.07); this.noise(t, 0.12, 0.5 * k, 'lowpass', 480); this.tone(85, 0.09, 'sine', 0.28 * k); this.noise(t, 0.05, 0.18 * k, 'highpass', 3000); break; }
      case 'push': this.noise(t, 0.09, 0.09, 'bandpass', 700, 0.8); break;   // pie que roza el suelo
      case 'click': this.tone(660, 0.05, 'square', 0.07); break;
      case 'success': [0, 4, 7, 12].forEach((n, i) => this.tone(523 * Math.pow(2, n / 12), 0.25, 'triangle', 0.18, i * 0.09)); break;
      case 'reward': [0, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(392 * Math.pow(2, n / 12), 0.3, 'triangle', 0.16, i * 0.07)); break;
      case 'fail': this.tone(220, 0.25, 'sawtooth', 0.09, 0, 140); break;
      case 'deny': this.tone(180, 0.12, 'square', 0.06, 0, 150); break;
      case 'step': this.tone(440 * Math.pow(2, p / 12), 0.1, 'square', 0.07); break;
      case 'fall': this.tone(500, 0.6, 'sine', 0.13, 0, 120); break;
      case 'bail': this.noise(t, 0.22, 0.4, 'lowpass', 600); this.noise(t + 0.08, 0.3, 0.18, 'bandpass', 1500); this.tone(110, 0.18, 'sine', 0.22); break;
      case 'whoosh': this.noise(t, 0.5, 0.26, 'bandpass', 600 + p * 400); break;
      case 'spray': this.noise(t, 0.07, 0.05, 'highpass', 3500); break;
      case 'trick': this.noise(t, 0.1, 0.16, 'bandpass', 2600); this.tone(740, 0.12, 'triangle', 0.08, 0.02); break;
      case 'reveal': [0, 3, 7, 10, 12, 15].forEach((n, i) => this.tone(220 * Math.pow(2, n / 12), 0.5, 'sawtooth', 0.05, i * 0.12)); this.noise(t, 1.6, 0.15, 'lowpass', 300); break;
      case 'talk': this.tone(300 + Math.random() * 60, 0.07, 'triangle', 0.05); break;
      case 'grindIn': this.noise(t, 0.08, 0.3, 'bandpass', 3200, 3); this.tone(1800, 0.06, 'square', 0.04); break;
      case 'mount': this.noise(t, 0.06, 0.18, 'bandpass', 1200); this.tone(120, 0.05, 'sine', 0.12, 0.03); break;
      case 'dismount': this.noise(t, 0.05, 0.12, 'bandpass', 900); this.tone(160, 0.04, 'sine', 0.08); break;
      case 'arm': this.tone(660, 0.08, 'triangle', 0.1); this.tone(990, 0.1, 'triangle', 0.1, 0.06); break;
      case 'catch': this.noise(t, 0.04, 0.3, 'bandpass', 1800, 2.5); this.tone(210, 0.04, 'sine', 0.1); break;          // pies sobre la lija
      case 'scoot': this.noise(t, 0.07, 0.06, 'bandpass', 650, 0.8); break;                                         // roce corto (más suave que push)
      case 'manualIn': this.noise(t, 0.05, 0.14, 'bandpass', 1300, 2); this.tone(90, 0.06, 'sine', 0.08); break;    // cola que toca
      // V8 R10 (pared del vaso): ruedas que entran en la curva (golpe sordo + rodadura que sube) y canto metálico del borde (clac)
      case 'wallIn': { const k = Math.min(1, 0.4 + p * 0.07); this.noise(t, 0.16, 0.32 * k, 'lowpass', 380); this.tone(70, 0.12, 'sine', 0.22 * k); this.noise(t + 0.03, 0.25, 0.1 * k, 'bandpass', 520 + p * 40, 1.2); break; }
      case 'coping': { const k = Math.min(1, 0.45 + p * 0.06); this.noise(t, 0.035, 0.42 * k, 'bandpass', 3400, 4); this.tone(920, 0.05, 'square', 0.06 * k); this.tone(140, 0.07, 'sine', 0.14 * k); break; }
      case 'getup': this.noise(t, 0.08, 0.12, 'bandpass', 900); this.noise(t + 0.18, 0.05, 0.16, 'bandpass', 1500, 2); break; // roce + tabla recogida
    }
  }

  /** Rodadura continua por velocidad y superficie; baja en el aire; raspado de freno. */
  setRoll(speed: number, grounded: boolean, surface: Surface = 'concrete', braking = false) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.roll) {
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), scrape = c.createGain(), sf = c.createBiquadFilter();
      src.buffer = this.noiseBuf; src.loop = true; f.type = 'lowpass'; f.frequency.value = 400; g.gain.value = 0;
      sf.type = 'bandpass'; sf.frequency.value = 2600; sf.Q.value = 0.7; scrape.gain.value = 0;
      src.connect(f).connect(g).connect(this.sfxBus); src.connect(sf).connect(scrape).connect(this.sfxBus); src.start();
      this.roll = { src, gain: g, filter: f, scrape };
    }
    const tone = ({ concrete: 1, asphalt: 0.75, dirt: 0.45, wood: 1.25, led: 1.4, metal: 1.8 } as Record<Surface, number>)[surface] ?? 1;
    const vol = ({ concrete: 1, asphalt: 1.15, dirt: 0.7, wood: 1.1, led: 0.9, metal: 1.2 } as Record<Surface, number>)[surface] ?? 1;
    const target = grounded ? Math.min(0.39, Math.abs(speed) * 0.054) * vol : 0;   // R11 (MEZ-02): ×3 (antes 23–31 dB bajo la música)
    this.roll.gain.gain.setTargetAtTime(target, c.currentTime, 0.06);
    this.roll.filter.frequency.setTargetAtTime((220 + Math.abs(speed) * 80) * tone, c.currentTime, 0.1);
    this.roll.scrape.gain.setTargetAtTime(braking && grounded && Math.abs(speed) > 0.8 ? 0.05 : 0, c.currentTime, 0.05);
  }
  /** Roce continuo de rail mientras dura el grind. */
  setGrind(on: boolean) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.grind) {
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.noiseBuf; src.loop = true; f.type = 'bandpass'; f.frequency.value = 3800; f.Q.value = 4; g.gain.value = 0;
      src.connect(f).connect(g).connect(this.sfxBus); src.start();
      this.grind = { src, gain: g, filter: f };
    }
    this.grind.gain.gain.setTargetAtTime(on ? 0.11 : 0, c.currentTime, 0.04);
  }

  /** Motores de los dos coches (una sola voz compartida; nivel por proximidad, se apaga en el preview). */
  setEngine(level: number, rpm: number) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.engine) {
      const osc = c.createOscillator(); osc.type = 'sawtooth'; const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 420;
      const gain = c.createGain(); gain.gain.value = 0;
      const noise = c.createBufferSource(); noise.buffer = this.noiseBuf; noise.loop = true; const ng = c.createGain(); ng.gain.value = 0;
      osc.connect(filter).connect(gain).connect(this.sfxBus); noise.connect(ng).connect(this.sfxBus); osc.start(); noise.start();
      this.engine = { osc, gain, filter, noise, ng };
    }
    const now = c.currentTime;
    this.engine.osc.frequency.setTargetAtTime(45 + rpm * 70, now, 0.1);
    // R11 (MEZ-07): +8 dB (×2,5): a 3–6 m de la pista el motor quedaba 16–21 dB bajo la música (no se oía llegar el peligro)
    this.engine.gain.gain.setTargetAtTime(Math.min(0.15, level * 0.15), now, 0.15);
    this.engine.ng.gain.setTargetAtTime(Math.min(0.0625, level * 0.0625 * rpm), now, 0.15);
  }
}
