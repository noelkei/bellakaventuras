// V10.5 ronda PORTADA · sonido de la portada (del prototipo `prototipos/pantalla-inicio-cozy/web/audio.js`). Nada suena hasta el primer gesto.
//  - Ambiente del parque: la misma receta sintetizada que el juego (audio.ts, V10.1 P24): rumor lejano + pájaros.
//  - Radio de ANMI: «No me guillo» (audio/nmg-cine-v104.m4a, el mismo corte que usa el juego), en bucle con fundido cruzado.
//  - Clics suaves de la interfaz.
// Contexto PROPIO (el del juego se crea al pulsar JUGAR, en game.start()): al empezar a jugar la radio se funde y el contexto se cierra.
// `nivelRadio()` = energía de graves de la música (0..1), para que los altavoces latan.
export interface PrefsSonido { sonido: boolean; musica: boolean; ambiente: boolean; volumen: number }
type Radio = { timer: number; srcs: AudioBufferSourceNode[] };

export class SonidoPortada {
  url: string; ctx: AudioContext | null = null; buf: AudioBuffer | null = null; cargando: Promise<AudioBuffer> | null = null;
  prefs: PrefsSonido = { sonido: true, musica: true, ambiente: true, volumen: 0.8 };
  radio: Radio | null = null; amb: { gain: GainNode; level: number; timer: number } | null = null;
  master!: GainNode; musicBus!: GainNode; llegada!: GainNode; private llegadaNivel = 1; analyser!: AnalyserNode; data!: Uint8Array<ArrayBuffer>;
  estado: 'en-espera' | 'activo' | 'no-disponible' | 'cerrado' = 'en-espera';
  private media: number | null = null; private tMedia = 0;
  constructor(url: string) { this.url = url; }
  get disponible() { return !!(window.AudioContext || (window as any).webkitAudioContext); }

  /** Avisa cuando el audio pasa a sonar de verdad (o deja de poder): la portada quita o pone el aviso «Toca para oír la música». */
  onEstado: (() => void) | null = null;
  /** V10.5 (pedido del usuario: «no suena nada hasta quitar y poner el sonido»): crea el contexto YA, sin esperar a un gesto. Donde el
   *  navegador deja sonar sin tocar (Chrome de ordenador en webs ya usadas, apps instaladas…) suena enseguida; donde no, queda suspendido y
   *  `desbloquear()` lo arranca DENTRO del primer toque, clic o tecla. Sesión de audio «playback» (iPhone: suena aunque esté el interruptor de
   *  silencio, como el juego). La radio se empieza a descargar ya, para que suene en cuanto se pueda. */
  preparar() {
    if (this.estado === 'cerrado' || this.ctx) return;
    if (!this.disponible) { this.estado = 'no-disponible'; return; }
    try { const as = (navigator as any).audioSession; if (as && as.type !== 'playback') as.type = 'playback'; } catch { /* */ }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    try { this.ctx = new AC() as AudioContext; } catch { this.estado = 'no-disponible'; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0;
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.55;
    // V10.5 (pedido del usuario): «llegada» = la música entra desde 0 a la vez que ANMI llega deslizándose (setLlegada desde la portada)
    this.llegada = c.createGain(); this.llegada.gain.value = this.llegadaNivel;
    this.musicBus.connect(this.analyser); this.musicBus.connect(this.llegada).connect(this.master);
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    c.addEventListener('statechange', () => { if (this.estado === 'cerrado') return; this.estado = c.state === 'running' ? 'activo' : 'en-espera'; if (c.state === 'running') this.aplicar(); this.onEstado?.(); });
    this.estado = c.state === 'running' ? 'activo' : 'en-espera';
    void this._cargar().catch(() => {});
    if (c.state === 'running') this.aplicar(); else void c.resume().catch(() => {});
    this.onEstado?.();
  }
  /** Volumen de llegada de la radio (0..1): 0 mientras ANMI no ha entrado; sube con su entrada y queda en 1. */
  setLlegada(x: number) {
    this.llegadaNivel = Math.max(0, Math.min(1, x));
    const c = this.ctx; if (!c || !this.llegada || this.estado === 'cerrado') return;
    this.llegada.gain.setTargetAtTime(this.llegadaNivel, c.currentTime, 0.04);
  }
  /** La radio va a sonar y su canción ya está descargada y lista (la entrada de ANMI la espera un poco, para llegar juntos). */
  get radioLista() { return !!this.buf; }
  /** La radio debería sonar ahora mismo (contexto en marcha, sonido y radio en «sí»). */
  get radioQuiere() { return this.sonando && this.prefs.sonido && this.prefs.musica; }
  /** El navegador ya deja sonar (contexto en marcha). */
  get sonando() { return !!this.ctx && this.ctx.state === 'running' && this.estado !== 'cerrado'; }
  /** Llamar DENTRO del gesto (síncrono: Safari de iPhone y iPad solo arranca el audio en el propio toque). Reanuda el contexto y toca un
   *  instante de silencio (desbloqueo de iOS); lo que suene lo decide `aplicar()` con las preferencias, tras el clic. */
  desbloquear() {
    if (this.estado === 'cerrado') return;
    if (!this.ctx) this.preparar();
    const c = this.ctx; if (!c || c.state === 'running') return;
    try { const as = (navigator as any).audioSession; if (as && as.type !== 'playback') as.type = 'playback'; } catch { /* */ }
    try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch { /* */ }
    void c.resume().catch(() => {});
  }

  aplicar() {
    const c = this.ctx; if (!c || this.estado === 'cerrado') return;
    const on = this.prefs.sonido;
    this.master.gain.setTargetAtTime(on ? this.prefs.volumen : 0, c.currentTime, 0.25);
    this._ambiente(on && this.prefs.ambiente ? 1 : 0);
    if (on && this.prefs.musica) void this._radioOn(); else this._radioOff();
  }

  pausar(p: boolean) { if (!this.ctx || this.estado === 'cerrado') return; if (p) void this.ctx.suspend(); else if (this.estado === 'activo') void this.ctx.resume(); }

  private async _cargar() {
    if (this.buf) return this.buf;
    if (!this.cargando) this.cargando = fetch(this.url, { priority: 'high' } as RequestInit).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
      .then((ab) => this.ctx!.decodeAudioData(ab)).then((b) => (this.buf = b)).catch((e) => { this.cargando = null; throw e; });
    return this.cargando;
  }

  private async _radioOn() {
    const c = this.ctx!;
    // con la llegada de ANMI en curso, el volumen lo lleva `llegada` (entra con él): el bus va directo a su nivel
    this.musicBus.gain.setTargetAtTime(0.55, c.currentTime, this.llegadaNivel < 1 ? 0.03 : 0.6);
    if (this.radio) return;
    const radio: Radio = { timer: 0, srcs: [] }; this.radio = radio;
    let buf: AudioBuffer; try { buf = await this._cargar(); } catch (e) { console.warn('Radio sin audio:', e); if (this.radio === radio) this.radio = null; return; }
    if (this.radio !== radio || this.estado === 'cerrado') return;   // se apagó mientras cargaba
    const X = 2.5;   // fundido cruzado del bucle (s)
    const programar = (t0: number) => {
      const s = c.createBufferSource(), g = c.createGain(); s.buffer = buf; s.connect(g).connect(this.musicBus);
      const dur = buf.duration;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + X);
      g.gain.setValueAtTime(1, t0 + dur - X); g.gain.linearRampToValueAtTime(0, t0 + dur);
      s.start(t0); s.stop(t0 + dur + 0.05);
      radio.srcs.push(s); if (radio.srcs.length > 3) radio.srcs.shift();
      const next = t0 + dur - X;
      radio.timer = window.setTimeout(() => { if (this.radio === radio) programar(next); }, Math.max(0, (next - c.currentTime - 1) * 1000));
    };
    programar(c.currentTime + 0.05);
  }
  private _radioOff(tc = 0.3) {
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, tc);
    const r = this.radio; this.radio = null;
    if (r) { clearTimeout(r.timer); setTimeout(() => r.srcs.forEach((s) => { try { s.stop(); } catch { /* */ } }), 1500); }
  }

  private _ambiente(level: number) {
    const c = this.ctx!;
    if (!this.amb) {
      if (!level) return;
      const g = c.createGain(); g.gain.value = 0; g.connect(this.master);
      const n = c.sampleRate * 4, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048; d[i] = (b0 + b1 + b2 + w * 0.02) * 0.6; }
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.4;
      const city = c.createGain(); city.gain.value = 0.22; s.connect(lp).connect(city).connect(g); s.start();
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.06; lfo.connect(lg).connect(city.gain); lfo.start();
      const amb = { gain: g, level: 0, timer: 0 }; this.amb = amb;
      const pajaros = () => {
        if (this.amb !== amb || this.estado === 'cerrado') return;
        if (amb.level > 0.05 && c.state === 'running') {
          const t0 = c.currentTime + 0.05, k = 2 + Math.floor(Math.random() * 3), base = 2600 + Math.random() * 1600;
          for (let i = 0; i < k; i++) {
            const o = c.createOscillator(), e = c.createGain(), t = t0 + i * (0.09 + Math.random() * 0.05), up = Math.random() < 0.5;
            o.type = 'sine'; o.frequency.setValueAtTime(base * (up ? 0.8 : 1.15), t); o.frequency.exponentialRampToValueAtTime(base * (up ? 1.2 : 0.75), t + 0.07);
            e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.05, t + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
            o.connect(e).connect(g); o.start(t); o.stop(t + 0.1);
          }
        }
        amb.timer = window.setTimeout(pajaros, 2500 + Math.random() * 5000);
      };
      amb.timer = window.setTimeout(pajaros, 1500);
    }
    this.amb.level = level;
    this.amb.gain.gain.setTargetAtTime(level * 0.5, c.currentTime, 0.4);
  }

  clic(tipo: 'clic' | 'jugar' = 'clic') {
    const c = this.ctx; if (!c || c.state !== 'running' || !this.prefs.sonido || this.estado === 'cerrado') return;
    const t = c.currentTime;
    const tono = (f: number, dur: number, type: OscillatorType, vol: number, when = 0, to?: number) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t + when);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + when + dur);
      g.gain.setValueAtTime(0.0001, t + when); g.gain.exponentialRampToValueAtTime(vol, t + when + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + when + dur);
      o.connect(g).connect(this.master); o.start(t + when); o.stop(t + when + dur + 0.05);
    };
    if (tipo === 'jugar') [0, 4, 7, 12].forEach((n, i) => tono(523 * 2 ** (n / 12), 0.25, 'triangle', 0.16, i * 0.08));
    else tono(740, 0.07, 'triangle', 0.1, 0, 980);
  }

  /** Energía de graves de la radio, 0..1 (0 si no suena). */
  nivelRadio() {
    const c = this.ctx;
    if (!c || !this.analyser || !this.radio || !this.prefs.sonido || !this.prefs.musica || c.state !== 'running') return 0;
    this.analyser.getByteFrequencyData(this.data);
    const hz = c.sampleRate / this.analyser.fftSize, i0 = Math.max(1, Math.round(45 / hz)), i1 = Math.round(160 / hz);
    let s = 0; for (let i = i0; i <= i1; i++) s += this.data[i];   // bombo y bajo, ~45–160 Hz
    const e = s / (i1 - i0 + 1) / 255, now = performance.now(), dt = Math.min(0.2, ((now - (this.tMedia || now)) / 1000) || 0.016);
    this.tMedia = now;
    const k = 1 - Math.exp(-dt / 0.45);   // media móvil de ~0,45 s, independiente de los fps
    this.media = this.media == null ? e : this.media + (e - this.media) * k;
    return Math.min(1, Math.max(0, (e - this.media - 0.02) * 3.6) + e * 0.05);
  }

  /** Al empezar a jugar: la radio y el ambiente se funden en ~`seg` s y después se cierra el contexto (no quedan dos motores de audio). */
  cerrar(seg = 0.45) {
    if (this.estado === 'cerrado') return;
    const c = this.ctx; this.estado = 'cerrado';
    if (!c) return;
    try { this.master.gain.cancelScheduledValues(c.currentTime); this.master.gain.setValueAtTime(this.master.gain.value, c.currentTime); this.master.gain.linearRampToValueAtTime(0, c.currentTime + seg); } catch { /* */ }
    const r = this.radio; this.radio = null; if (r) clearTimeout(r.timer);
    if (this.amb) { clearTimeout(this.amb.timer); this.amb = null; }
    setTimeout(() => { void c.close().catch(() => {}); }, seg * 1000 + 80);
  }
  /** Para las pruebas (solo ?bktest): estado del contexto, si la radio está puesta y su ganancia efectiva hasta la salida. */
  prueba() {
    const c = this.ctx;
    const st = !c ? 'none' : (c.state as string);
    const g = c && st !== 'closed' ? this.musicBus.gain.value * this.llegada.gain.value * this.master.gain.value : 0;
    return { ctx: st, radio: !!this.radio, radioGain: +g.toFixed(4) };
  }
}
