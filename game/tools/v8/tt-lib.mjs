// V7 · utilidades comunes de las pruebas de TRA TRA TRA: marco local ↔ mundo desde el contrato, piloto de teclado (el de
// V4, solo lee estado y pulsa teclas) y pasos del recorrido que reutilizan tt-routes, tt-talks y campaign-v7.
import fs from 'node:fs';
import { Pilot, angleDiff } from '../v4/pilot.mjs';
import { sleep } from './lib.mjs';
export { Pilot, angleDiff };

export const KIT = JSON.parse(fs.readFileSync(new URL('../../src/world/tt_kit.json', import.meta.url)));
// V10 (preparación; mismas fórmulas que world/tt.ts): giro de corona +9° (Bola de Oro §07): el origen (punto de MUNDO del contrato) se gira
// como punto y el yaw del marco resta 9°. Copia previa en V10/backups/pruebas/.
const CORONA = 9 * Math.PI / 180;
const [OX, OZ] = [Math.cos(CORONA) * KIT.frame.origin[0] - Math.sin(CORONA) * KIT.frame.origin[1], Math.sin(CORONA) * KIT.frame.origin[0] + Math.cos(CORONA) * KIT.frame.origin[1]];
// V7 R1: el marco puede ir girado (`frame.rotDeg`, 180° desde R1); mismas fórmulas que world/tt.ts
const ROT = (KIT.frame.rotDeg ?? 0) * Math.PI / 180 - CORONA, CR = Math.round(Math.cos(ROT) * 1e12) / 1e12, SR = Math.round(Math.sin(ROT) * 1e12) / 1e12;
const WX = (x, y) => OX + x * CR - y * SR, WZ = (x, y) => OZ - (x * SR + y * CR);
/** local (x, y, h) → mundo [x, h, z] */
export const W = (x, y, h = 0) => [WX(x, y), h, WZ(x, y)];
/** local (x, y) → mundo en planta [x, z] (formato del piloto) */
export const XZ = (x, y) => [WX(x, y), WZ(x, y)];
/** rumbo three de una dirección local (dx, dy) */
export const HD = (dx, dy) => Math.atan2(dx * CR - dy * SR, -(dx * SR + dy * CR));
/** mundo → local */
export const loc = (p) => { const dx = p.x - OX, dz = OZ - p.z; return { x: +(dx * CR + dz * SR).toFixed(3), y: +(-dx * SR + dz * CR).toFixed(3), h: +p.y.toFixed(3) }; };
export const ROOF = KIT.limo.roof;
/** Cotas derivadas del contrato (R1: las pruebas no fijan números que el contrato puede mover). */
export const HC = (KIT.rear.hole[1] + KIT.rear.hole[3]) / 2;                      // eje y de H
export const RC = (KIT.recta.bounds[1] + KIT.recta.bounds[3]) / 2;               // eje de la recta y de la recepción
export const LC = KIT.limo.center[1];                                             // centro de la limo (PT4)
/** Dónde se pone ANMI en el techo para hablar con cada NPC: dentro de su zona, 0,2–0,3 m hacia el centro de la limo. */
export const TALK_SPOT = { aissa: [KIT.limo.center[0], KIT.npcs.aissa.zone[1] + 0.3], juseph: [KIT.limo.center[0], KIT.npcs.juseph.zone[1] - 0.2] };

export const tt = (page) => page.evaluate(() => { const g = window.__bk, s = g.skater, a = g.activities;
  return { x: s.footPos.x, y: s.footPos.y, z: s.footPos.z, h: s.heading, v: s.vLong, sp: Math.hypot(s.vel.x, s.vel.z), loco: s.loco, grounded: s.grounded, mode: g.mode, respawns: s.respawns,
    col: g.state.p.collected.filter((c) => c.startsWith('tratratra')), total: g.state.total, heard: { ...g.state.p.partials.bridgeHeard }, act: g.state.p.activities.bridgeTalk,
    prompt: document.getElementById('prompt').hidden ? '' : document.getElementById('btn-action').textContent, dialog: !document.getElementById('dialog').hidden,
    ladder: { phase: a[8].phase, id: a[8].L?.id ?? null, u: a[8].u }, talking: a[3].talking,
    pt4: (() => { const p = g.pickups.find((q) => q.id === 'tratratra.activity'); return p ? { available: p.available, visible: p.group.visible, collected: p.collected } : null; })(),
    pt4count: g.pickups.filter((q) => q.id === 'tratratra.activity' && !q.collected).length };   // instancias de PT4 sin recoger (nunca más de una)
});
export const L = async (page) => { const s = await tt(page); return { ...loc(s), loco: s.loco, g: s.grounded, sp: +s.sp.toFixed(2) }; };

/** Sigue puntos locales [[x, y], …] a pie o en tabla con el piloto; devuelve el resultado y la posición local final. */
export async function go(P, pts, opts = {}) { const r = await P.follow(pts.map(([x, y]) => XZ(x, y)), { tol: 0.35, maxMs: 30000, ...opts }); return { ...r, at: r.s ? loc(r.s) : null }; }

/** Trepa una escalera de mano con entradas reales: ACCIÓN (E) al pie y W hasta desembarcar. */
export async function climb(P, page, { expectId, maxMs = 15000 } = {}) {
  const ok = await P.act(/TREPAR/, 4000); if (!ok) return { ok: false, why: 'sin oferta TREPAR', s: await tt(page) };
  await sleep(500); const s0 = await tt(page);
  if (expectId && s0.ladder.id !== expectId) return { ok: false, why: `escalera ${s0.ladder.id}`, s: s0 };
  await P.keys(['KeyW']); const t0 = Date.now(); let s = s0, minY = s0.y, maxY = s0.y;
  while (Date.now() - t0 < maxMs) { s = await tt(page); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); if (s.ladder.phase === 'off') break; await sleep(60); }
  await P.release(); await sleep(250);
  return { ok: s.ladder.phase === 'off', s: await tt(page), id: s0.ladder.id, minY, maxY };
}
/** Baja una escalera de mano desde arriba: ACCIÓN (E) en la zona superior y S hasta el pie. */
export async function descend(P, page, { maxMs = 15000 } = {}) {
  const ok = await P.act(/BAJAR ESCALERA/, 4000); if (!ok) return { ok: false, why: 'sin oferta BAJAR', s: await tt(page) };
  await sleep(500); const id = (await tt(page)).ladder.id;
  await P.keys(['KeyS']); const t0 = Date.now(); let s = null, minY = 1e9;
  while (Date.now() - t0 < maxMs) { s = await tt(page); minY = Math.min(minY, s.y); if (s.ladder.phase === 'off') break; await sleep(60); }
  await P.release(); await sleep(250);
  return { ok: s?.ladder.phase === 'off', s: await tt(page), id, minY };
}
/** Habla con el NPC ofrecido en la zona actual y cierra la frase con «Vale». `close: false` deja el diálogo abierto. */
export async function talk(P, page, { close = true } = {}) {
  const ok = await P.act(/HABLAR/, 4000); if (!ok) return { ok: false, why: 'sin oferta HABLAR', s: await tt(page) };
  await page.waitForFunction(() => !document.getElementById('dialog').hidden, { timeout: 8000 }).catch(() => {});   // R1: antes se levanta y anda hasta el techo
  const open = await tt(page); const text = await page.evaluate(() => [document.getElementById('dialog-name').textContent, document.getElementById('dialog-text').textContent]);
  if (!close) return { ok: open.dialog, open, text };
  await sleep(700); await page.click('#dialog-ok'); await sleep(500);
  return { ok: open.dialog, open, text, s: await tt(page) };
}
/** Monta la tabla (Q) si va a pie. */
export async function mount(P, page) { let s = await tt(page); if (s.loco === 'ride') return true; await page.keyboard.press('KeyQ'); await sleep(750); s = await tt(page); return s.loco === 'ride'; }
/** Carrera en tabla hacia −X desde donde esté, SALTO al llegar a `jumpAt` (x local) y freno (S) tras aterrizar. Entradas reales. */
export async function runJump(P, page, { jumpAt = 0.75, brake = true, lane = RC, maxMs = 12000 } = {}) {
  const tr = []; const t0 = Date.now(); let jumped = false, landed = null, s = null, vJump = 0, apex = 0;
  await P.keys(['KeyW']);
  while (Date.now() - t0 < maxMs) {
    s = await tt(page); const p = loc(s); tr.push({ t: Date.now() - t0, x: p.x, y: p.y, h: p.h, sp: +s.sp.toFixed(2), g: s.grounded ? 1 : 0, loco: s.loco });
    if (!jumped) {
      const e = angleDiff(HD(-1, 0) + (p.y - lane) * 0.25, s.h), k = ['KeyW']; if (Math.abs(e) > 0.05) k.push(e > 0 ? 'KeyA' : 'KeyD'); await P.keys(k);
      if (p.x <= jumpAt) { vJump = s.sp; await P.release(); await page.keyboard.press('Space'); jumped = true; }
    } else {
      apex = Math.max(apex, p.h);
      if (!landed && s.grounded && p.x < 0) { landed = { ...p, sp: +s.sp.toFixed(2), loco: s.loco }; if (brake) await P.keys(['KeyS']); }
      if (landed && s.sp < 0.15) break;
      if (p.h < 2 && s.grounded) break;   // cayó a la plaza
      if (landed && brake && s.v < 0.3) await P.release();   // S mantenida pasaría a reversa
    }
    await sleep(25);
  }
  await P.release(); await sleep(200);
  return { vJump: +vJump.toFixed(2), apex: +apex.toFixed(2), landed, end: await L(page), tr };
}
