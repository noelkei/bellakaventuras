// V5 T5-18 (HUM-A5-005, REV04-012, DT-17) · Orientación elegible y efectiva.
// Preferencia `auto | vertical | horizontal` (ajustes persistidos). Con preferencia fija y en un gesto del usuario se intenta
// lo nativo (pantalla completa + screen.orientation.lock). Si falla (iOS Safari no tiene lock, o el navegador lo rechaza) y
// la orientación del documento no coincide con la pedida, se ROTA el contenedor (canvas + #ui) 90° con ancho/alto lógicos
// intercambiados: UNA sola transformación inversa de coordenadas (`toLogical`) para el stick y la cámara, tamaño lógico para
// el render y safe-areas remapeadas (clases en <html>: rot90 / rotm90 + lay-land / lay-port).
export type OrientPref = 'auto' | 'vertical' | 'horizontal';
type Mode = 0 | 90 | -90;

class Orientation {
  pref: OrientPref = 'auto';
  mode: Mode = 0;
  locked: 'none' | 'native' | 'failed' = 'none';
  lastError = '';
  private listeners: (() => void)[] = [];
  onChange(f: () => void) { this.listeners.push(f); }

  /** Tamaño LÓGICO del juego (con el contenedor girado, ancho y alto se intercambian). */
  get width() { return this.mode ? innerHeight : innerWidth; }
  get height() { return this.mode ? innerWidth : innerHeight; }
  /** Coordenadas de pantalla → coordenadas lógicas del contenedor (girado o no). */
  toLogical(x: number, y: number) {
    if (this.mode === 90) return { x: y, y: innerWidth - x };
    if (this.mode === -90) return { x: innerHeight - y, y: x };
    return { x, y };
  }
  /** Punto relativo (0..1) dentro de un elemento, en su sistema LÓGICO (el rectángulo de pantalla de un elemento girado
   *  está girado: su ancho lógico corre a lo largo del alto de pantalla). */
  relPoint(el: Element, x: number, y: number) {
    const b = el.getBoundingClientRect();
    if (this.mode === 90) return { u: (y - b.top) / b.height, v: (b.right - x) / b.width };
    if (this.mode === -90) return { u: (b.bottom - y) / b.height, v: (x - b.left) / b.width };
    return { u: (x - b.left) / b.width, v: (y - b.top) / b.height };
  }

  /** Aplica la preferencia. `gesture` = llamada dentro de un gesto del usuario (permite pantalla completa + lock). */
  async set(pref: OrientPref, gesture: boolean) {
    this.pref = pref;
    const so: any = (screen as any).orientation;
    if (pref === 'auto') { try { so?.unlock?.(); } catch { /* */ } this.locked = 'none'; this.evaluate(); return; }
    if (gesture && so?.lock) {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' } as any);
        await so.lock(pref === 'vertical' ? 'portrait' : 'landscape');
        this.locked = 'native'; this.lastError = '';
      } catch (e: any) { this.locked = 'failed'; this.lastError = String(e?.name ?? e); }
    } else if (!so?.lock) { this.locked = 'failed'; this.lastError = 'sin screen.orientation.lock'; }
    this.evaluate();
    setTimeout(() => this.evaluate(), 400);   // el cambio nativo llega con retraso
  }
  /** Recalcula el giro de respaldo según la orientación actual del documento. */
  evaluate() {
    const land = innerWidth > innerHeight;
    let m: Mode = 0;
    if (this.pref === 'horizontal' && !land) m = 90;
    else if (this.pref === 'vertical' && land) m = -90;
    const h = document.documentElement;
    h.classList.toggle('rot90', m === 90); h.classList.toggle('rotm90', m === -90);
    const logicalLand = m ? !land : land;
    h.classList.toggle('lay-land', logicalLand); h.classList.toggle('lay-port', !logicalLand);
    // V10.5 (AM-11, E5-23): pantalla estrecha (ancho LÓGICO < 380 px): aro del joystick de 110 px y botones de la derecha apartados lo justo
    h.classList.toggle('lay-narrow', (m ? innerHeight : innerWidth) < 380);
    // V10.6 (1.7): pantalla BAJA en horizontal lógico (< 500 px de alto: móviles apaisados) y CORTA en vertical lógico (< 700 px: SE): disposición
    // compacta de la pausa y de Ajustes (style.css) para que quepan sin desplazar
    { const lh = m ? innerWidth : innerHeight; h.classList.toggle('lay-baja', logicalLand && lh < 500); h.classList.toggle('lay-corta', !logicalLand && lh < 700); }
    if (m !== this.mode) { this.mode = m; for (const f of this.listeners) f(); }
  }
  get label() { return { auto: 'Automática', vertical: 'Vertical', horizontal: 'Horizontal' }[this.pref]; }
}

export const orient = new Orientation();
addEventListener('resize', () => orient.evaluate());
if (typeof document !== 'undefined') orient.evaluate();   // V10.5: clases lay-* desde el principio (pantalla de inicio)
