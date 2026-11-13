// R11 · F14 · copia de la sonda AUD-JUG/ANIM/lib-anim.mjs (mismas comprobaciones; solo cambian rutas y nombre del informe).
// AUD-JUG/TTFG · utilidades de sondas (solo lectura del juego). Marco FG (w radial, s deck→pista) y TT (desde tt-lib).
export * from '../lib.mjs';
export { W as TW, HD as THD, loc as tloc, KIT as TKIT } from '../tt-lib.mjs';
const th = 108 * Math.PI / 180, O = [30.5 * Math.sin(th), -30.5 * Math.cos(th)], Wv = [Math.sin(th), -Math.cos(th)], Sv = [-Math.cos(th), -Math.sin(th)];
export const FV = (w, s, h = 0) => [O[0] + Wv[0] * w + Sv[0] * s, h, O[1] + Wv[1] * w + Sv[1] * s];
export const FH = (dw, ds) => Math.atan2(Wv[0] * dw + Sv[0] * ds, Wv[1] * dw + Sv[1] * ds);
export const floc = (p) => { const dx = p.x - O[0], dz = p.z - O[1]; return { w: +(dx * Wv[0] + dz * Wv[1]).toFixed(2), s: +(dx * Sv[0] + dz * Sv[1]).toFixed(2), y: +p.y.toFixed(2) }; };
/** Instala ayudantes en página: teclas sintéticas y simulación determinista. */
export async function installHelpers(page) {
  await page.evaluate(() => {
    const g = window.__bk;
    window.__K = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
    window.__sim = async (sec, each) => { g.autoMode = true; await g.simulate(sec, each); };
    window.__tap = async (code, sec = 0.05) => { window.__K(code, true); await window.__sim(sec); window.__K(code, false); await window.__sim(1 / 60); };
    window.__hold = async (codes, sec, each) => { for (const c of codes) window.__K(c, true); try { await window.__sim(sec, each); } finally { for (const c of codes) window.__K(c, false); } await window.__sim(1 / 60); };
    window.__st = () => { const s = g.skater, fd = g.activities.find((a) => a.id === 'freeDance'), lc = g.activities.find((a) => a.id === 'ladderClimb'), dc = g.activities.find((a) => a.id === 'danceCombo'), bt = g.activities.find((a) => a.id === 'bridgeTalk');
      return { x: +s.footPos.x.toFixed(3), y: +s.footPos.y.toFixed(3), z: +s.footPos.z.toFixed(3), vy: +s.vy.toFixed(2), hv: +Math.hypot(s.vel.x, s.vel.z).toFixed(2), loco: s.loco, grounded: s.grounded, crouch: s.isCrouched, frozen: s.frozen,
        mode: g.mode, paused: g.paused, clip: g.visual.currentName, override: g.visual.override ?? null, dancing: fd.dancing, menu: fd.menu, fgDancing: fd.fgDancing, lad: lc.phase, ladBusy: lc.busy, dcBusy: dc.busy, dcStage: dc.stage,
        btBusy: bt.busy, deckVis: g.visual.deck ? g.visual.deck.visible : null, backBoard: g.visual.backBoard ? g.visual.backBoard.visible : null, fdProp: !!fd.prop, dcProp: !!dc.boardProp, action: document.getElementById('btn-action')?.textContent ?? '', actionHidden: document.getElementById('btn-action')?.hidden,
        collected: [...g.state.p.collected], bails: s.bails, respawns: s.respawns, zone: g.zone }; };
  });
}
export const sim = (page, sec) => page.evaluate((s) => window.__sim(s), sec);
export const tap = (page, code, sec) => page.evaluate((c, s) => window.__tap(c, s), code, sec);
export const hold = (page, codes, sec) => page.evaluate((c, s) => window.__hold(c, s), codes, sec);
export const st = (page) => page.evaluate(() => window.__st());
