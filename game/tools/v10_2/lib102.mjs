// V10.2 · utilidades comunes de las pruebas nuevas (sobre game/tools/v8/lib.mjs).
import { sleep } from '../v8/lib.mjs';
/** Partida nueva declarada (versión 5, migrada). */
export const FRESH = { version: 5, migV10: 99, collected: [], activities: { pantherTalk: false, skateTutorial: false, graffiti: false, bridgeTalk: false, danceCombo: false }, bridgeReached: false, finalDone: false, finalProof: null, revealSeen: false, checkpoint: null, checkpointRevision: 7,
  partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: -1, graffitiMask: null, graffitiCheck: 0, danceRounds: 0 }, hints: ['basic'], settings: {} };
export const PHONE_V = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
export const PHONE_H = { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
/** Estado visible: modo, botón de acción, diálogo, aviso. */
export const ui = (page) => page.evaluate(() => { const g = window.__bk, b = document.getElementById('btn-action'), d = document.getElementById('dialog'), t = document.getElementById('toast');
  return { mode: g.mode, action: b && b.offsetParent !== null ? b.textContent.trim() : null, actionOff: !!b?.disabled, dialog: d.hidden ? null : { name: document.getElementById('dialog-name').textContent, text: document.getElementById('dialog-text').textContent }, toast: t && !t.hidden ? t.textContent : null }; });
/** ANMI a pie en el centro de una zona (o desplazada `off` metros en `ang`) mirando a `h`. */
export const toZone = (page, id, h = 0, off = 0, ang = 0) => page.evaluate((id, h, off, ang) => { const g = window.__bk, z = g.park.zones.get(id); g.input.clear();
  const p = z.pos.clone(); p.x += Math.sin(ang) * off; p.z += Math.cos(ang) * off;
  // suelo de verdad dentro de la ventana de altura de la zona (techo de la limo, puente…), como actividades-matriz
  const RA = window.__bkRapier; if (z.yMax !== undefined && RA) { const hit = g.world.castRay(new RA.Ray({ x: p.x, y: z.yMax + 0.3, z: p.z }, { x: 0, y: -1, z: 0 }), z.yMax - z.yMin + 1.5, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, g.skater.collider, undefined, (c) => !g.npcColliders.has(c.handle)); if (hit) p.y = z.yMax + 0.3 - hit.timeOfImpact; }
  g.skater.teleport(p, h, 'walk'); g.rig.snapBehind(g.skater); return [p.x, p.y, p.z]; }, id, h, off, ang);
export async function waitFor(page, fn, ms = 6000, every = 120, ...args) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await page.evaluate(fn, ...args); if (v) return v; await sleep(every); } return v; }
export async function waitDialog(page, ms = 6000) { const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await ui(page); if (s.dialog) return s; await sleep(120); } return s; }
/** Mando de prueba (`input.fakePad`): índice estándar (0 A, 1 B, 3 Y, 5 RB, 9 Start, 12 ↑, 13 ↓, 14 ←, 15 →). */
export async function setPad(page, idx, on) { await page.evaluate((idx, on) => { const I = window.__bk.input; if (!I.fakePad) I.fakePad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), id: 'prueba', connected: true };
  I.fakePad.buttons[idx] = { pressed: on, value: on ? 1 : 0 }; }, idx, on); }
export async function padPress(page, idx, hold = 120) { await setPad(page, idx, true); await sleep(hold); await setPad(page, idx, false); await sleep(140); }
/** Toque en el centro de un elemento visible (null si no se ve). */
export async function tapSel(page, sel) {
  const box = await page.evaluate((q) => { const e = document.querySelector(q); if (!e || e.offsetParent === null || e.closest('[hidden]')) return null; const r = e.getBoundingClientRect(); return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }, sel);
  if (!box) return false; await page.touchscreen.tap(box.x, box.y); await sleep(250); return true;
}
/** Actividad por id. */
export const act = (id) => `window.__bk.activities.find((a) => a.id === '${id}')`;
