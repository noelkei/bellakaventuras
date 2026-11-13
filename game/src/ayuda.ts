// V10.4 · modo ayuda y aviso de volver (W02, W03, W-D02…W-D04, W-D13…W-D21, W-D29, W-D32): solo explorando (no en actividades, diálogos,
// pausa, tutorial ni cinemáticas). Dentro de un escenario (paseos rosas incluidos, W-D29): a los 60 s sin coger patata, uno de los dos
// anfitriones (alternando, W-D13) da una pista en 2D y sale en el suelo la línea amarilla discontinua por un camino andable hasta el objetivo
// (W-D14); cada otros 60 s, otra pista más concreta (W-D15); la línea dura hasta coger esa patata o salir del escenario (W-D04). Fuera (el
// turquesa de más allá de r 42 y la plaza de salida): a los 15 s y cada 15 s el aviso de volver (W-D17, W-D19, W-D20): sin modo ayuda, un aviso
// corto que no para el juego; con modo ayuda, el 2D la primera vez de cada salida y después el aviso corto, con la línea a la entrada de la
// zona que toca. Con el final hecho no queda misión: ni modo ayuda ni aviso (W-D16, W-D20).
import * as THREE from 'three';
import type { Game } from './game';
import type { Narrativa } from './narrativa';
import { RUTA } from './narrativa';
import { PISTAS, TEXTOS, type Quien } from './textos2d';
import { d2Say } from './dialogo2d';
import { SECTOR_BY_ID, type ZoneId, TOTAL_FRIES, zoneAt } from './world/manifest';
import { toast, dialogOpen } from './ui';
import { loadNav, findPath, LineaAyuda } from './caminos';
import { VALLA_R_OUT } from './world/valla';
import * as avisos from './avisos';   // V10.6 (B5): métricas sin identificadores

const ABR: Record<string, string> = { no_me_guillo: 'NMG', nosvamosdeaqui: 'NVDA', yinyang: 'YY', tratratra: 'TT', fashion_girl: 'FG' };
type Esc = ZoneId | 'centro' | 'fuera';
interface Obj { key: string; pos: THREE.Vector3; pistas: string[]; zona: string }

export class Ayuda {
  private idle = 0; private esc: Esc | null = null; private nivel = 0; private objKey = ''; private quien: Quien = 'kroak';
  private fueraT = 0; private fuera2d = false; private linea: LineaAyuda; private obj: Obj | null = null; private pathT = 0; private showing = false;
  /** Diagnóstico (pruebas): últimas pistas dadas y si la línea está a la vista. */
  log: { t: number; id: string; quien: Quien; obj: string }[] = [];
  constructor(private g: Game, private n: Narrativa) { this.linea = new LineaAyuda(g.scene); void loadNav(); }
  get on() { const N = this.g.state.p.narr; return N.ayuda === 'si' && !this.g.state.p.finalDone && N.estado !== 'off'; }
  get disponible() { return !this.g.state.p.finalDone; }
  get lineaVisible() { return this.linea.mesh.visible; }

  /** Escenario de ANMI: zona por ángulo dentro de r 42 (paseos incluidos), centro dentro de la valla/asfalto, fuera más allá o en la plaza. */
  escenario(p = this.g.skater!.footPos): Esc {
    const r = Math.hypot(p.x, p.z); if (r > 42.3) return 'fuera'; if (r < 22) return 'centro';
    return zoneAt(p) ?? 'fuera';
  }
  /** Objetivo según el escenario (W-D04, W-D16, W-D18). */
  objetivo(esc: Esc): Obj | null {
    const g = this.g, st = g.state, m = g.park.manifest;
    if (st.total === TOTAL_FRIES && !st.p.finalDone) {   // W-D18: escalera del muro de SN y, ya arriba, el sitio de ¡BAJAR!
      const L = m.ladders.find((l) => l.id === 'sn')!, onTop = g.skater!.footPos.y > (L.top ?? 6) - 0.5;
      const drop = g.park.zones.get('sn.drop'); return onTop && drop ? { key: 'sn-drop', pos: drop.pos.clone(), pistas: ['HLP-SN-3', 'HLP-SN-4'], zona: 'SN' } : { key: 'sn-ladder', pos: L.axis.clone().setY(L.bottom ?? 0), pistas: ['HLP-SN-1', 'HLP-SN-2', 'HLP-SN-3'], zona: 'SN' };
    }
    const sig = (z: ZoneId | null): Obj | null => { if (!z) return null; const S = g.park.sector(z), p = S.P(27.5, 0); const k = ABR[z]; return { key: `sig-${z}`, pos: new THREE.Vector3(p.x, 0, p.z), pistas: [`HLP-SIG-${k}-1`, `HLP-SIG-${k}-2`], zona: k }; };
    if (esc === 'fuera' || esc === 'centro') return sig(this.n.nextZone());
    const z = esc, sec = SECTOR_BY_ID[z], me = g.skater!.footPos;
    const left = m.fries.filter((f) => f.zone === z && !st.isCollected(f.id) && (f.kind !== 'activity' || st.rewardPending(sec.activity)))
      .sort((a, b) => a.pos.distanceTo(me) - b.pos.distanceTo(me));
    if (left.length) { const f = left[0], k = ABR[z]; return { key: f.id, pos: f.pos.clone(), pistas: [`HLP-${k}-${f.kind}-1`, `HLP-${k}-${f.kind}-2`, `HLP-${k}-${f.kind}-3`], zona: k }; }
    if (!st.p.activities[sec.activity] && this.n.activityOpen(z)) { const za = g.park.zones.get(`act.${sec.activity === 'skateTutorial' ? 'skateTutorial' : sec.activity}`) ?? [...g.park.zones.entries()].find(([k]) => k.startsWith('act.') && zoneAt(g.park.zones.get(k)!.pos) === z)?.[1];
      const k = ABR[z], bh = st.p.partials.bridgeHeard, falta = z === 'tratratra' && (bh.aissa || bh.juseph);
      return za ? { key: `act-${z}`, pos: za.pos.clone(), pistas: falta ? ['HLP-TT-ACT-falta', `HLP-${k}-ACT-2`] : [`HLP-${k}-ACT-1`, `HLP-${k}-ACT-2`], zona: k } : null; }
    return sig(this.n.nextZone());   // escenario terminado: la siguiente zona del recorrido
  }

  /** Cada paso fijo. */
  update(dt: number) {
    const g = this.g, st = g.state, N = st.p.narr;
    if (N.estado === 'off' || N.estado === 'nuevo' || N.estado === 'tutorial-hecho' || st.p.finalDone) { this.hide(); return; }
    const explorando = g.mode === 'explore' && !g.paused && !dialogOpen() && !this.n.busy && !g.rewardShotOn && !g.activities.some((a: any) => a.busy || a.inAttempt || a.painting || a.seated || a.dancing >= 0);
    const esc = this.escenario();
    if (esc !== this.esc) { this.esc = esc; this.idle = 0; this.nivel = 0; this.fueraT = 0; this.fuera2d = false; this.hide(); }
    if (!explorando) return;
    this.idle += dt;
    if (esc === 'fuera') {   // aviso de volver (independiente del modo ayuda, W-D17)
      this.fueraT += dt;
      // V10.6 (H8-12): el 2D del aviso (con el modo ayuda) espera a un punto seguro; el aviso corto no para el juego y sale cuando toca
      if (this.fueraT >= 15 && (!(this.on && !this.fuera2d) || this.n.puntoSeguro())) { this.fueraT = 0; void this.avisoFuera(); }
      if (this.showing) this.refresh(dt);
      return;
    }
    if (!this.on) return;
    const lim = 60;
    // V10.6 (H8-12): la pista para el juego con un 2D: espera (sin perderse) a que ANMI esté en el suelo y casi parada; antes la congelaba en el
    // aire, en la pared del vaso o rodando a toda velocidad
    if (this.idle >= lim && this.n.puntoSeguro()) { this.idle = 0; void this.pista(esc); }
    if (this.showing) this.refresh(dt);
  }
  /** Al coger una patata (o cambiar el objetivo): el contador vuelve a 60 s y la línea se quita si era esa. */
  onCollect(id: string) { this.idle = 0; if (this.obj && (this.obj.key === id || this.obj.key.startsWith('act-'))) { this.nivel = 0; this.hide(); } }
  private async pista(esc: Esc) {
    const o = this.objetivo(esc); if (!o) return;
    if (o.key !== this.objKey) { this.objKey = o.key; this.nivel = 0; }
    const id = o.pistas[Math.min(this.nivel, o.pistas.length - 1)]; this.nivel++;
    avisos.ayuda(false);   // V10.6 (B5): primera pista de la visita
    await this.dice(id, o);
  }
  private async dice(id: string, o: Obj) {
    const P = PISTAS[id]; if (!P) return;
    this.quien = this.quien === 'kat' ? 'kroak' : 'kat';   // W-D13: uno solo, alternando
    const z = this.esc && this.esc !== 'fuera' && this.esc !== 'centro' ? SECTOR_BY_ID[this.esc].name : '';
    const bh = this.g.state.p.partials.bridgeHeard;
    const texto = P.texto.replace('{zona}', SECTOR_BY_ID[(this.n.nextZone() ?? 'no_me_guillo')]?.name ?? z).replace('{quien}', bh.aissa ? 'Juseph' : 'Aissa');
    this.log.push({ t: this.g.sim.now, id, quien: this.quien, obj: o.key });
    const g = this.g, s = g.skater!; s.vel.multiplyScalar(0); g.input.clear(); const fr = !s.frozen; s.frozen = true; if (g.mode === 'explore') g.setMode('narr');
    await d2Say({ habla: this.quien, texto, kat: this.quien === 'kat' ? 'habla' : 'espera', kroak: this.quien === 'kroak' ? 'habla' : 'espera' }, { solo: this.quien });
    if (fr) s.frozen = false; if (g.mode === 'narr' && !this.n.busy) g.setMode('explore'); g.input.clear();
    this.obj = o; this.showing = true; this.pathT = 0;
  }
  private async avisoFuera() {
    const st = this.g.state; if (st.p.finalDone) return;
    const sn = st.total === TOTAL_FRIES;
    if (this.on && !this.fuera2d) { this.fuera2d = true; const o = this.objetivo('fuera'); if (o) { await this.dice(sn ? 'HLP-FUERA-2d-SN' : (this.quien === 'kat' ? 'HLP-FUERA-2d-1' : 'HLP-FUERA-2d-2'), o); return; } }
    toast(sn ? TEXTOS.fueraToastSN : TEXTOS.fueraToast[Math.floor(this.g.sim.now / 15) % 2], 3200);
  }
  /** Pausa → Ayuda (dossier 05): la pista del objetivo actual a petición, con la línea. */
  async aPeticion() {
    // V10.6 (H8-12): igual a petición (pausa → «Dame una pista»): se espera al punto seguro, como mucho 8 s
    for (let i = 0; i < 80 && !this.n.puntoSeguro(); i++) { if (this.g.mode !== 'explore') return false; await this.g.sim.wait(0.1); }
    if (!this.n.puntoSeguro()) return false;
    avisos.ayuda(true);   // V10.6 (B5)
    const esc = this.escenario(); const o = this.objetivo(esc); if (!o) return false; if (o.key !== this.objKey) { this.objKey = o.key; this.nivel = 0; } await this.dice(o.pistas[Math.min(this.nivel, o.pistas.length - 1)], o); return true; }
  private async refresh(dt: number) {
    this.pathT -= dt; if (this.pathT > 0 || !this.obj) return; this.pathT = 0.5;
    const N = await loadNav(); if (!N || !this.obj) return;
    const fenceUp = this.g.park.vallaUp;
    const path = findPath(N, this.g.skater!.footPos, this.obj.pos, fenceUp ? (x, z) => Math.hypot(x, z) < VALLA_R_OUT + 0.3 : undefined);
    this.linea.set(path); this.lastPath = path;
  }
  /** Diagnóstico (pruebas): último camino calculado. */
  lastPath: THREE.Vector3[] | null = null;
  frame(dt: number) { this.linea.update(dt, this.g.state.p.settings.reducedMotion); }
  hide() { this.showing = false; this.obj = null; this.linea.hide(); this.lastPath = null; }
}
