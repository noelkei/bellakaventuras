// V10.5 ronda PORTADA · pantalla de inicio viva (del prototipo aprobado `prototipos/pantalla-inicio-cozy`, PROMPT_V10_5_PORTADA).
// Vive en el archivo de entrada (main.ts): sale antes de que baje el motor (bootstrap, 6 MB). bootstrap.ts la conecta al juego (sonido, radio
// guardada, Ajustes, JUGAR) con `portada.sync()`, `listo()`, `salir()` y `recomponer()`.
//  · #portada-escena (z 6, sin toques): lienzo WebGL2 (escena.ts) o, sin WebGL2, las imágenes fijas; notas y rayitas de la radio.
//  · #start (z 7): marca, hueco de ANMI, acciones, pie y el botón invisible de la radio. Coordenadas LÓGICAS (offset*), válidas también con la
//    interfaz girada por orient.ts (rot90/rotm90).
//  · Movimiento: quieta con «reducir movimiento» (sistema o Ajustes) o con el Modo eficiente en táctil; con ?bktest, quieta y muda salvo
//    ?bktest&portada=viva (pruebas deterministas y menos GPU en la batería); ?bktest&portada=fija = sin WebGL (imágenes fijas).
//  · Al pulsar JUGAR: zoom y fundido (~0,6 s) sobre el juego, la radio se funde y, después, se libera TODO (bucle, texturas, contexto, audio).
import { Escena, type CapasMeta } from './escena';
import { SonidoPortada } from './sonido';

/** Igual que ASSET_BASE de assets.ts, sin importarlo (assets.ts trae three.js y este archivo va en la entrada ligera). */
const ASSET_BASE = new URL('./assets/', document.baseURI).href;
const BASE = ASSET_BASE + 'portada/';
const SAVE_KEY = 'bellakaventuras.remake.save';
const ANMI_W = 1010, ANMI_H = 1458, ANMI_ASPECT = ANMI_W / ANMI_H;
/** Caja de la radio y centros de los altavoces, en px de la imagen de ANMI (1010×1458). */
const RADIO = { x0: 592, y0: 832, x1: 1012, y1: 1210 };
const NOTAS = ['pt-nota-corchea', 'pt-nota-doble', 'pt-nota-negra', 'pt-nota-corchea'], COLORES = ['#f47fb4', '#fbedcc', '#e2357a', '#ffb3d4'];
const PULSO = 60 / 96;
/** V10.5 (pedido del usuario): ANMI entra por la derecha deslizándose con el patín, como una sombra, y toma su color al pararse. */
const ENTRADA_S = 1.6, ENTRADA_ESPERA = 0.35;
export interface AjustesPortada { muted?: boolean; volume?: number; radioPortada?: boolean; reducedMotion?: boolean; eficiente?: boolean }

const qs = new URLSearchParams(location.search);
const TEST = import.meta.env.DEV || qs.has('bktest');
/** Con ?bktest: quieta salvo portada=viva; portada=fija = sin WebGL. Sin ?bktest, siempre viva. */
const MODO: 'viva' | 'quieta' | 'fija' = qs.has('bktest') ? ((qs.get('portada') as any) === 'viva' ? 'viva' : qs.get('portada') === 'fija' ? 'fija' : 'quieta') : 'viva';
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

/** Posición de `el` relativa a `root` en px LÓGICOS (offset*, que no ven las transformaciones CSS). */
function rel(el: HTMLElement, root: HTMLElement) {
  let x = 0, y = 0, n: HTMLElement | null = el;
  while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

export class Portada {
  readonly modo = MODO;
  private escenaEl = $('#portada-escena'); private start = $('#start'); private canvas = $<HTMLCanvasElement>('#portada-lienzo'); private hueco = $('#start .pt-anmi-hueco');
  private btnJugar = $<HTMLButtonElement>('#btn-start'); private marco = $('#start .pt-jugar-marco'); private btnRadio = $<HTMLButtonElement>('#btn-radio');
  private capaNotas = $('#portada-escena .pt-notas'); private rayas = $('#portada-escena .pt-radio-rayas');
  private escena: Escena | null = null; private meta: CapasMeta | null = null; private orient: 'h' | 'v' = 'h';
  private sonido = new SonidoPortada(new URL('./audio/nmg-cine-v104.m4a', document.baseURI).href);
  private ajustes: AjustesPortada = {}; private reduce = matchMedia('(prefers-reduced-motion: reduce)'); private touch = matchMedia('(pointer: coarse)').matches;
  private motionLineal = 1; private escalaRend = 1; private lentos = 0; private muestras = 0; private anmiRect: [number, number, number, number] = [0, 0, 0, 0];
  private dirty = true; private raf = 0; private last = 0; private visible = !document.hidden; private preparada = false; private juegoListo = false; private saliendo = false;
  alive = true; liberado = false; radioTocada = false;
  /** El juego guarda el cambio de la radio (bootstrap); antes de que exista, se apunta en `radioTocada`. */
  onRadio: ((on: boolean) => void) | null = null;
  private par = false;
  /** Reloj de la entrada de ANMI (< 0: esperando a que se vaya el velo; ≥ ENTRADA_S: ya en su sitio; null: sin entrada). */
  private entradaT: number | null = null; private esperaRadio = 0; private esperaFluida = 0; private suaves = 0;
  private notasVivas = 0; private golpes = 0; private pulsoPrevio = -1; private nivelPrevio = 0; private ultimoGolpe = 0; private radioHover = 0;
  private ultimaLlamada = performance.now() - 3500; private ultimoDestello = performance.now(); private ultimasLineas = 0;
  private lineasJugar: SVGGElement[]; private chispas: SVGSVGElement[]; private ro: ResizeObserver | null = null; private quitar: (() => void)[] = [];

  constructor() {
    this.lineasJugar = [...this.start.querySelectorAll<SVGGElement>('.pt-destellos g')];
    this.chispas = [...this.start.querySelectorAll<SVGSVGElement>('.pt-marca .pt-chispas svg')];
    this.ajustes = Portada.leerGuardado();
    this.aplicarAjustesSonido();
    for (const [sel, src] of [['.pt-titulo-img', 'titulo-01.webp'], ['.pt-subtitulo-img', 'subtitulo-02.webp'], ['#btn-start img', 'jugar-02.webp']] as const) { const im = this.start.querySelector<HTMLImageElement>(sel); if (im) im.src = BASE + src; }
    this.setStartLabel('JUGAR');
    const on = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => { addEventListener(t, f, o); this.quitar.push(() => removeEventListener(t, f as any, o)); };
    // V10.5 (pedido del usuario): el sonido se prepara YA (suena sin tocar donde el navegador lo deja) y, si no, arranca DENTRO del primer toque,
    // clic o tecla en cualquier sitio (síncrono: Safari de iPhone y iPad solo lo acepta así; antes se hacía un instante después y en iOS no sonaba
    // nunca). Lo que suena lo deciden las preferencias tras el clic: si el primer gesto es «Sonido: no», no suena nada.
    const desbloquear = () => { if (!this.alive || this.saliendo || !this.audioPermitido || this.sonido.sonando) return; this.sonido.desbloquear(); };
    for (const t of ['pointerdown', 'mousedown', 'touchend', 'pointerup', 'click', 'keydown'] as const) on(t, desbloquear, { capture: true });   // lo antes posible: al pulsar (ordenador) o al soltar el dedo (móvil)
    this.sonido.onEstado = () => { this.marcarBloqueo(); this.pedirFotograma(); };
    if (this.movimientoActivo()) this.sonido.setLlegada(0);   // habrá entrada de ANMI: la radio espera a llegar con él
    if (this.audioPermitido) this.sonido.preparar();
    this.marcarBloqueo();
    const vis = () => { this.visible = !document.hidden; this.sonido.pausar(!this.visible); this.last = 0; if (this.visible) { this.dirty = true; this.pedirFotograma(); } else if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } };
    document.addEventListener('visibilitychange', vis); this.quitar.push(() => document.removeEventListener('visibilitychange', vis));
    const rm = () => this.pedirFotograma(); this.reduce.addEventListener?.('change', rm); this.quitar.push(() => this.reduce.removeEventListener?.('change', rm));
    let rt = 0; const alRedim = () => { cancelAnimationFrame(rt); rt = requestAnimationFrame(() => void this.componer()); };
    this.ro = new ResizeObserver(alRedim); this.ro.observe(this.start); on('resize', alRedim);
    this.btnRadio.addEventListener('click', () => this.tocarRadio());
    for (const e of ['pointerenter', 'focus']) this.btnRadio.addEventListener(e, () => { this.radioHover = 1; this.pedirFotograma(); });
    for (const e of ['pointerleave', 'blur']) this.btnRadio.addEventListener(e, () => { this.radioHover = 0; });
    this.marco.addEventListener('animationend', (e) => { if ((e as AnimationEvent).animationName === 'pt-llamada') this.marco.classList.remove('llamada'); });
    // V10.5 (pedido del usuario): con el dedo, JUGAR/CONTINUAR hace la misma animación que con el ratón encima (crece y sube, sin inclinarse,
    // como los letreros); con ratón, pulsarlo lo hunde
    this.btnJugar.addEventListener('pointerdown', (ev) => { if (this.btnJugar.disabled) return;
      const c = ev.pointerType === 'mouse' ? 'pulsado' : 'pt-toque'; this.btnJugar.classList.add(c); setTimeout(() => this.btnJugar.classList.remove(c), c === 'pulsado' ? 140 : 420); });
    if (TEST) (window as any).__bkPortada = this.ganchos();
    void this.iniciar();
  }
  /** Lo que el juego ya sabe del jugador, leído del guardado SIN escribir (antes de que exista el estado del juego). */
  static leerGuardado(): AjustesPortada {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')?.settings; if (!s || typeof s !== 'object') return {};
      return { muted: s.muted === true, volume: typeof s.volume === 'number' ? s.volume : undefined, radioPortada: s.radioPortada === false ? false : undefined, reducedMotion: s.reducedMotion === true, eficiente: s.eficiente === true };
    } catch { return {}; }
  }
  /** Si la radio de la portada está puesta (para guardar lo que se tocó antes de que existiera el estado del juego). */
  get radioEncendida() { return !this.ajustes.muted && this.ajustes.radioPortada !== false; }
  private get audioPermitido() { return this.modo === 'viva'; }
  /** El sonido está en «sí» pero el navegador aún no deja sonar (falta el primer toque): el botón de sonido lo pide («Toca para oír») y, si se
   *  pulsa, arranca el sonido en vez de quitarlo (bootstrap). */
  get bloqueado() { return this.audioPermitido && this.alive && !this.saliendo && !this.ajustes.muted && !this.sonido.sonando && this.sonido.estado !== 'no-disponible'; }
  private marcarBloqueo() { this.start.classList.toggle('pt-sin-audio', this.bloqueado); }
  private movimientoActivo() {
    return this.modo === 'viva' && !this.reduce.matches && !this.ajustes.reducedMotion && !(this.ajustes.eficiente && this.touch);
  }
  private aplicarAjustesSonido() {
    const a = this.ajustes;
    Object.assign(this.sonido.prefs, { sonido: !a.muted, musica: a.radioPortada !== false, ambiente: true, volumen: Math.max(0, Math.min(1, a.volume ?? 0.8)) });
    this.btnRadio.setAttribute('aria-pressed', String(!a.muted && a.radioPortada !== false));
    if (this.sonido.ctx) this.sonido.aplicar();
    this.marcarBloqueo();
  }
  /** El juego manda en cuanto tiene su estado (y tras cada cambio de sonido o de Ajustes). */
  sync(a: AjustesPortada) {
    if (!this.alive) return;
    const radio = this.radioTocada ? this.ajustes.radioPortada : a.radioPortada;
    this.ajustes = { ...a, radioPortada: radio === false ? false : undefined };
    this.aplicarAjustesSonido(); this.pedirFotograma();
  }
  /** Texto de JUGAR/CONTINUAR: un span oculto (el textContent exacto que leen las pruebas), el lettering y el nombre accesible. */
  setStartLabel(label: 'JUGAR' | 'CONTINUAR') {
    const vh = this.btnJugar.querySelector('.pt-vh'), im = this.btnJugar.querySelector('img');
    if (vh) vh.textContent = label;
    if (im) im.src = BASE + (label === 'CONTINUAR' ? 'continuar-02.webp' : 'jugar-02.webp');
    this.btnJugar.setAttribute('aria-label', label === 'CONTINUAR' ? 'Continuar' : 'Jugar');
    this.start.classList.toggle('pt-continuar', label === 'CONTINUAR');
  }
  /** El juego terminó de cargar: JUGAR puede «llamar» y el engranaje funciona. */
  listo() { this.juegoListo = true; this.start.classList.add('pt-listo'); this.pedirFotograma(); }
  private tocarRadio() {
    if (!this.alive || this.saliendo) return;
    const ahoraOn = !this.ajustes.muted && this.ajustes.radioPortada !== false, encender = !ahoraOn;
    this.ajustes = { ...this.ajustes, radioPortada: encender ? undefined : false };
    this.radioTocada = true;
    this.onRadio?.(encender);
    this.aplicarAjustesSonido();
    this.sonido.clic(); this.golpe(1); this.pedirFotograma();
  }
  private async iniciar() {
    try {
      this.meta = await fetch(BASE + 'capas.json').then((r) => r.json());
      if (this.modo === 'fija') throw new Error('portada=fija');
      this.escena = new Escena(this.canvas);
      this.canvas.addEventListener('webglcontextlost', () => { if (this.alive && !this.saliendo && this.escena && !this.escena.destruida) this.aFija('contexto perdido'); });
      this.escena.motion = this.motionLineal = this.movimientoActivo() ? 1 : 0;
      if (this.movimientoActivo()) { this.escena.entrada = 1; this.escena.sombra = 1; this.entradaT = -ENTRADA_ESPERA; this.sonido.setLlegada(0); }   // quieta: ANMI ya en su sitio
      await this.escena.cargarAnmi(BASE, this.meta!);
    } catch (e: any) { this.aFija(e?.message ?? String(e)); }
    this.preparada = true;
    await this.componer();
    this.escenaEl.classList.add('pt-lista');
  }
  /** Sin WebGL2 (o contexto perdido): fondo fijo y ANMI como imágenes; la interfaz no cambia. */
  private aFija(motivo: string) {
    if (this.modo !== 'fija') console.warn('Portada sin escena viva (se usan imágenes fijas):', motivo);
    try { if (this.escena) { this._framesAntes = this.escena.frames; this.escena.destruir(); } } catch { /* */ }
    this.escena = null; this.canvas.hidden = true;
    const f = this.escenaEl.querySelector('.pt-sin-webgl') as HTMLElement; f.hidden = false; this.entradaT = null; this.sonido.setLlegada(1);
    if (this.movimientoActivo() && !this.preparada) this.escenaEl.classList.add('pt-entrada');   // la misma entrada, con CSS
    (f.querySelector('.pt-sin-anmi') as HTMLImageElement).src = BASE + 'anmi.webp';
    this.fijaFrames++;
    void this.componer();
  }
  private fijaFrames = 0;
  async componer() {
    if (!this.alive) return;
    const sw = this.start.clientWidth, sh = this.start.clientHeight; if (!sw || !sh) return;
    const o: 'h' | 'v' = sw / sh >= 1 ? 'h' : 'v';
    this.orient = o; this.start.dataset.orient = o; this.escenaEl.dataset.orient = o;
    if (!this.preparada) return;
    if (this.escena) {
      if (this.escena.orient !== o) { try { await this.escena.cargarOrientacion(o, BASE, this.meta!); } catch (e: any) { if (this.alive && !this.saliendo) this.aFija(e?.message ?? String(e)); return; } if (this.orient === o && this.escena) this.escena.usar(o); }
    } else { const im = this.escenaEl.querySelector('.pt-sin-fondo') as HTMLImageElement; if (!im.src.endsWith(`${o}-quieto.webp`)) im.src = `${BASE}${o}-quieto.webp`; }
    if (!this.alive) return;
    // ANMI: contenido en su hueco y apoyado abajo (deja sitio a la sombra de contacto)
    const b = rel(this.hueco, this.start);
    const h = Math.min(b.h / 1.03, b.w / ANMI_ASPECT), w = h * ANMI_ASPECT;
    const x = b.x + (b.w - w) / 2 + (o === 'h' ? Math.min(b.w - w, 0) : 0), y = b.y + b.h - h * 1.03;
    this.anmiRect = [x, y, w, h];
    this.colocarRadio();
    if (this.escena) {
      this.escena.anmiRect = this.anmiRect;
      const techo = Math.sqrt(3.7e6 / (sw * sh));   // hasta ×2, con un techo de ~3,7 Mpx (teles 4K, iPad Pro) y escala adaptativa si va lento
      this.escena.resize(sw, sh, Math.max(0.75, Math.min(devicePixelRatio || 1, 2, techo) * this.escalaRend));
    } else Object.assign((this.escenaEl.querySelector('.pt-sin-anmi') as HTMLElement).style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    // el primer fotograma (y el de cada cambio de tamaño) se dibuja YA: una pestaña en segundo plano no da requestAnimationFrame y el lienzo quedaría negro
    if (this.escena) { this.escena.render(); this.dirty = false; } else this.dirty = true;
    this.pedirFotograma();
  }
  /** Para el juego: pantalla completa o giro cambian el tamaño. */
  recomponer() { void this.componer(); }
  private aPantalla(ix: number, iy: number): [number, number] { const r = this.anmiRect; return [r[0] + (ix / ANMI_W) * r[2], r[1] + (iy / ANMI_H) * r[3]]; }
  private colocarRadio() {
    const [x0, y0] = this.aPantalla(RADIO.x0, RADIO.y0), [x1, y1] = this.aPantalla(RADIO.x1, RADIO.y1);
    Object.assign(this.btnRadio.style, { left: x0 + 'px', top: y0 + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px' });
    const ew = (x1 - x0) * 0.32;
    Object.assign(this.rayas.style, { left: x0 - ew + 'px', top: y0 + (y1 - y0) * 0.22 + 'px', width: x1 - x0 + 2 * ew + 'px', height: (y1 - y0) * 0.78 + 'px' });
  }
  private soltarNota(fuerza: number) {
    if (this.notasVivas >= 7 || !this.anmiRect[2] || this.saliendo) return;
    const W = this.start.clientWidth, r = this.anmiRect;
    const [rx, ry] = this.aPantalla(960 + Math.random() * 40, 900 + Math.random() * 120);
    const tam = Math.max(26, r[3] * (0.075 + Math.random() * 0.03));
    const libre = Math.max(0, W - rx - tam * 0.7);
    const dx = Math.min(libre, tam * (0.6 + Math.random() * 1.6)), dy = -r[3] * (0.22 + Math.random() * 0.14);
    const sx = Math.min(rx, W - tam * 0.7), sy = ry;
    const giro = (Math.random() - 0.5) * 40, vaiven = tam * 0.35 * (Math.random() < 0.5 ? -1 : 1);
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('class', 'nota-musical'); el.setAttribute('width', String(tam)); el.setAttribute('height', String(tam));
    el.style.color = COLORES[this.golpes % COLORES.length];
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#' + NOTAS[(this.golpes + ((Math.random() * 3) | 0)) % NOTAS.length]);
    el.appendChild(use); this.capaNotas.appendChild(el); this.notasVivas++;
    const p = (f: number, sc: number, op: number) => ({ transform: `translate(${sx - tam / 2 + dx * f + vaiven * Math.sin(f * Math.PI * 2)}px, ${sy - tam / 2 + dy * f}px) rotate(${giro * f + 12 * Math.sin(f * 8)}deg) scale(${sc})`, opacity: op });
    const a = el.animate([p(0, 0.3, 0), p(0.1, 1.12 * (0.85 + fuerza * 0.2), 1), p(0.22, 1, 1), p(0.75, 0.95, 0.95), p(1, 0.8, 0)], { duration: 2400 + Math.random() * 900, easing: 'cubic-bezier(.25,.6,.45,1)' });
    a.onfinish = a.oncancel = () => { el.remove(); this.notasVivas--; };
  }
  private rayitas(fuerza: number) {
    const lados = fuerza > 0.8 ? ['.rayas-izq', '.rayas-der'] : [this.golpes % 2 ? '.rayas-izq' : '.rayas-der'];
    for (const l of lados) this.rayas.querySelector(l)?.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.12)', offset: 0.2 }, { opacity: 1, transform: 'scale(1)', offset: 0.55 }, { opacity: 0, transform: 'scale(1.25)' }], { duration: 520, easing: 'ease-out' });
  }
  /** Ritmo: con la radio sonando, los golpes de graves reales; sin sonido, un pulso propio suave (~96 ppm). */
  private ritmo(t: number, m: number, ahora: number) {
    if (m < 0.5 || this.saliendo || this.entradaT !== null) { this.nivelPrevio = 0; return 0; }
    const s = this.sonido, real = !!s.radio && s.ctx?.state === 'running' && s.prefs.sonido && s.prefs.musica;
    let nivel: number;
    if (real) { nivel = s.nivelRadio(); if (nivel > 0.42 && this.nivelPrevio <= 0.42 && ahora - this.ultimoGolpe > 190) { this.ultimoGolpe = ahora; this.golpe(Math.min(1, nivel)); } }
    else { const b = Math.floor(t / PULSO), f = t / PULSO - b, acento = b % 4 === 0 ? 1 : b % 2 === 0 ? 0.7 : 0.5; nivel = Math.exp(-f * 6) * acento * 0.6; if (b !== this.pulsoPrevio) { if (this.pulsoPrevio >= 0) this.golpe(acento); this.pulsoPrevio = b; } }
    this.nivelPrevio = nivel; return nivel;
  }
  private golpe(fuerza: number) {
    if (!this.movimientoActivo() || this.saliendo || this.entradaT !== null) return;   // durante la entrada de ANMI, ni notas ni rayitas
    this.golpes++;
    const ahora = performance.now();
    if ((fuerza >= 0.7 || this.golpes % 2 === 0) && ahora - this.ultimasLineas > 300) {
      this.ultimasLineas = ahora;
      this.lineasJugar.forEach((g, i) => { const fuera = i === 0 ? -1 : 1;
        g.animate([{ transform: 'translateX(0) scale(1)' }, { transform: `translateX(${fuera * 7 * fuerza}%) scale(${1 + 0.16 * fuerza})`, offset: 0.25 }, { transform: 'translateX(0) scale(1)' }], { duration: 460, easing: 'cubic-bezier(.3,.7,.3,1)', composite: 'replace' }); });
    }
    // JUGAR «llama» cada 7–8 s si nadie lo está tocando (solo con el juego listo)
    // (el foco que el juego pone en JUGAR al terminar de cargar NO cuenta: si no, en ordenador no llamaría nunca; con mando sí cuenta)
    const ocupado = this.btnJugar.matches(':hover, :active') || (document.body.classList.contains('pad') && document.activeElement === this.btnJugar);
    if (this.juegoListo && !this.btnJugar.disabled && ahora - this.ultimaLlamada > 7200 + Math.random() * 1000 && !ocupado) {
      this.ultimaLlamada = ahora; this.marco.classList.remove('llamada'); void this.marco.offsetWidth; this.marco.classList.add('llamada');
    }
    // un destello suelto en el título cada 9–13 s (si no está el ratón encima)
    if (ahora - this.ultimoDestello > 9000 + Math.random() * 4000 && !this.start.querySelector('.pt-marca')!.matches(':hover') && this.chispas.length) {
      this.ultimoDestello = ahora;
      const c = this.chispas[(Math.random() * this.chispas.length) | 0];
      if (!c.getAnimations().some((a) => a.playState === 'running')) c.animate([{ opacity: 0, transform: 'translate(-50%, -50%) scale(0) rotate(-40deg)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1.1) rotate(0deg)', offset: 0.35 },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(.85) rotate(20deg)', offset: 0.7 }, { opacity: 0, transform: 'translate(-50%, -50%) scale(0) rotate(45deg)' }], { duration: 1300, easing: 'ease-in-out' });
    }
    if (this.golpes % 2 === 0 || fuerza > 0.8 || this.radioHover) this.rayitas(fuerza);
    if (Math.random() < (fuerza > 0.8 || this.radioHover ? 0.9 : 0.4)) this.soltarNota(fuerza);
  }
  private pedirFotograma() { if (!this.raf && this.visible && this.escena && this.alive) this.raf = requestAnimationFrame(this.tick); }
  private tick = (now: number) => {
    this.raf = 0;
    const e = this.escena; if (!e || !this.alive) return;
    // reloj solo hacia delante: el del prototipo medía desde performance.now() al pedir el fotograma (posterior al inicio del fotograma) y
    // con la CPU ocupada (la carga del juego) salía negativo: la escena retrocedía y la entrada de ANMI no empezaba hasta acabar la carga
    const crudo = this.last ? Math.max(0, (now - this.last) / 1000) : 0, dt = Math.min(0.05, crudo); this.last = now;
    this.suaves = crudo > 0 && crudo < 0.05 ? this.suaves + 1 : 0;   // fotogramas seguidos a buen ritmo
    const target = this.movimientoActivo() ? 1 : 0, prev = e.motion;
    this.motionLineal += Math.sign(target - this.motionLineal) * Math.min(Math.abs(target - this.motionLineal), dt / 0.9);   // quieto ↔ animado en ~0,9 s
    e.motion = target === 0 && this.motionLineal < 1e-3 ? 0 : this.motionLineal * this.motionLineal * (3 - 2 * this.motionLineal);
    const m = e.motion;
    e.time += dt * m;   // al pasar a quieto, el tiempo frena hasta pararse: nada salta
    const t = e.time;
    e.breath = m * 5.2 * (0.5 - 0.5 * Math.cos((t * Math.PI * 2) / 4.6));   // respiración de ~4,6 s
    e.sway = m * 1.4 * Math.sin((t * Math.PI * 2) / 11.3 + 0.8);
    const lvl = this.ritmo(t, m, now) * m;
    e.pump += (lvl - e.pump) * (lvl > e.pump ? 0.55 : 0.18);
    e.radio = Math.pow(e.pump, 1.3) * 0.9;
    e.radioHover += ((this.radioHover ? 1 : 0) * m - e.radioHover) * Math.min(1, dt * 6);
    // entrada de ANMI: desliza desde la derecha y frena (ease-out), se inclina un poco al frenar y pasa de sombra a color al final
    let entrando = false;
    if (this.entradaT !== null) {
      if (target === 0) this.entradaT = ENTRADA_S;   // movimiento reducido a mitad de la entrada: a su sitio ya
      // si la radio va a sonar, ANMI espera (como mucho 1,5 s) a que su canción esté lista: llegan juntos
      const esperaRadio = this.entradaT < 0 && this.sonido.radioQuiere && !this.sonido.radioLista && this.esperaRadio < 1.5;
      // en el móvil, la carga del juego deja al navegador casi sin fotogramas: la entrada espera a que la animación vaya fluida (8 fotogramas
      // seguidos a ≥ 20 por segundo; como mucho 6 s) y, si a mitad hay un parón, se detiene en vez de saltar (antes, en el iPhone, el deslizamiento
      // pasaba en uno o dos fotogramas sueltos y ANMI parecía aparecer ya en su sitio)
      const fluida = this.suaves >= 8 || this.esperaFluida > 6;
      if (this.entradaT < 0 && !fluida) this.esperaFluida += crudo;
      else if (esperaRadio) this.esperaRadio += dt;
      else if (crudo < 0.08 || this.entradaT < 0) this.entradaT += dt; const k = Math.max(0, Math.min(1, this.entradaT / ENTRADA_S));
      e.entrada = Math.pow(1 - k, 3);
      const c = Math.max(0, Math.min(1, (k - 0.55) / 0.45)); e.sombra = 1 - c * c * (3 - 2 * c);
      e.sway += -12 * Math.pow(1 - k, 2) * Math.min(1, k * 6);
      this.sonido.setLlegada(k * k * (3 - 2 * k));   // la radio llega con él: de 0 a su volumen mientras entra
      entrando = true;
      if (k >= 1) { e.entrada = 0; e.sombra = 0; this.entradaT = null; this.sonido.setLlegada(1); }
    }
    const moving = m > 0 || e.pump > 0.002 || prev !== m || entrando;
    // mientras carga el juego, la escena se dibuja a la mitad de fotogramas (~30 por segundo): le deja CPU y GPU a la carga (D5-19)
    this.par = !this.par;
    if ((moving || this.dirty) && (this.juegoListo || this.par || this.dirty)) { e.render(); this.dirty = false; }
    // si los fotogramas tardan (> 28 ms de media ~2 s) se baja la resolución del lienzo; la interfaz no cambia
    if (m > 0.5 && dt > 0) { this.muestras++; if (dt > 0.028 && dt < 0.045) this.lentos++;
      if (this.muestras >= 120) { if (this.lentos > 70 && this.escalaRend > 0.6) { this.escalaRend *= 0.8; void this.componer(); } this.muestras = this.lentos = 0; } }
    this.start.classList.toggle('pt-vivo', m > 0.5);
    if (moving || this.sonido.radio) this.pedirFotograma();
  };
  /** JUGAR: zoom y fundido de la escena sobre el juego (~0,6 s), la radio se funde, y después se libera todo. */
  salir() {
    if (this.saliendo || !this.alive) return; this.saliendo = true;
    this.sonido.clic('jugar'); this.sonido.cerrar(0.45); this.start.classList.remove('pt-sin-audio');
    this.escenaEl.classList.add('pt-saliendo');
    for (const a of this.capaNotas.getAnimations({ subtree: true })) a.cancel();
    this.pedirFotograma();
    setTimeout(() => this.destruir(), 700);
  }
  destruir() {
    if (!this.alive) return; this.alive = false;
    if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0;
    for (const f of this.quitar) f(); this.quitar = [];
    this.ro?.disconnect(); this.ro = null;
    this.sonido.cerrar(0.05);
    if (this.escena) { this._framesAntes = this.escena.frames; this.escena.destruir(); this.liberado = this.escena.contextoPerdido; } else this.liberado = true;
    this.escena = null;
    this.capaNotas.replaceChildren(); this.canvas.remove();
    this.escenaEl.querySelectorAll('img').forEach((im) => im.removeAttribute('src'));
    this.escenaEl.hidden = true;
  }
  private ganchos() {
    const self = this;
    return {
      get alive() { return self.alive; }, get frames() { return (self.escena?.frames ?? 0) + self.fijaFrames + (self.framesFinal ?? 0); },
      get webgl() { return self.escena ? 'gl' : self.alive ? 'fija' : 'none'; }, get lost() { return self.escena?.lost ?? false; }, get liberado() { return self.liberado; },
      get motion() { return self.escena?.motion ?? 0; }, get entrada() { return self.escena?.entrada ?? 0; }, get sombra() { return self.escena?.sombra ?? 0; }, get time() { return self.escena?.time ?? 0; }, get orient() { return self.orient; }, get modo() { return self.modo; },
      audio: () => self.sonido.prueba(), get bloqueado() { return self.bloqueado; },
    };
  }
  private get framesFinal() { return this.escena ? 0 : this._framesAntes; }
  private _framesAntes = 0;
}

/** La portada de esta página (la crea main.ts al cargar; bootstrap la conecta). */
export let portada: Portada | null = null;
export function crearPortada() { if (!portada) portada = new Portada(); return portada; }
