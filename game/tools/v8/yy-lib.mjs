// V8 · utilidades comunes de las pruebas de YINYANG: marco local (lámina v24 SIN rotar) → mundo con las MISMAS fórmulas que
// world/yy.ts (rotación de 4° una vez + quiralidad del contrato) y estado legible de la actividad y la rana.
import fs from 'node:fs';
export const KIT = JSON.parse(fs.readFileSync(new URL('../../src/world/yy_kit.json', import.meta.url)));
const D2R = Math.PI / 180;
export function rot(x, v) { const a = KIT.rotation.deg * D2R, [px, pv] = KIT.rotation.pivot, dx = x - px, dv = v - pv; return [px + dx * Math.cos(a) - dv * Math.sin(a), pv + dx * Math.sin(a) + dv * Math.cos(a)]; }
/** local (x, v, h) → mundo three [x, y, z] */
export function W(x, v, h = 0) {
  const [xr, vr0] = rot(x, v), vr = vr0 + (KIT.frame.offsetV ?? 0), th = KIT.frame.axis_deg * D2R, s = Math.sin(th), c = Math.cos(th);
  return KIT.frame.handedness === 'plan_top_view' ? [vr * s + xr * c, h, -vr * c + xr * s] : [vr * s - xr * c, h, -vr * c - xr * s];
}
export const XZ = (x, v) => { const w = W(x, v); return [w[0], w[2]]; };
export const HD = (dx, dv) => { const a = W(0, 30), b = W(dx, 30 + dv); return Math.atan2(b[0] - a[0], b[2] - a[2]); };
/** mundo → local (inversa exacta) */
export function loc(p) {
  const th = KIT.frame.axis_deg * D2R, s = Math.sin(th), c = Math.cos(th);
  let xr, vr; if (KIT.frame.handedness === 'plan_top_view') { xr = p.x * c + p.z * s; vr = p.x * s - p.z * c; } else { xr = -(p.x * c + p.z * s); vr = p.x * s - p.z * c; }
  vr -= KIT.frame.offsetV ?? 0;
  const a = -KIT.rotation.deg * D2R, [px, pv] = KIT.rotation.pivot, dx = xr - px, dv = vr - pv;
  return { x: +(px + dx * Math.cos(a) - dv * Math.sin(a)).toFixed(3), v: +(pv + dx * Math.sin(a) + dv * Math.cos(a)).toFixed(3), h: +p.y.toFixed(3) };
}
export const yy = (page) => page.evaluate(() => { const g = window.__bk, s = g.skater, a = g.activities[2];
  return { x: s.footPos.x, y: s.footPos.y, z: s.footPos.z, h: s.heading, sp: Math.hypot(s.vel.x, s.vel.z), loco: s.loco, grounded: s.grounded, mode: g.mode, respawns: s.respawns,
    col: g.state.p.collected.filter((c) => c.startsWith('yinyang')), total: g.state.total, act: g.state.p.activities.graffiti, partials: { ...g.state.p.partials },
    prompt: document.getElementById('prompt').hidden ? '' : document.getElementById('btn-action').textContent, dialog: !document.getElementById('dialog').hidden,
    dialogText: document.getElementById('dialog').hidden ? '' : (document.getElementById('dialog-text')?.textContent ?? document.getElementById('dialog').textContent),
    gfx: { busy: a.busy, phase: a.phase ?? null, painted: a.paintedCount, mask: a.maskCount, err: a.errCells ?? null, errLen: a.errLen ?? null, fails: a.fails ?? null, overlay: !document.getElementById('graffiti').hidden },
    rana: (() => { const n = g.npcs.get('rana')?.[0]; return n ? { pos: n.root.position.toArray().map((v) => +v.toFixed(2)), clip: n.current?.getClip().name ?? null, visible: n.root.visible } : null; })(),
    fry: (() => { const p = g.pickups.find((q) => q.id === 'yinyang.activity'); return p ? { available: p.available, collected: p.collected } : null; })() };
});

// ------------------------------------------------------------------ gestos con teclado real (piloto: solo lee y pulsa teclas)
import { angleDiff } from '../v4/pilot.mjs';
import { sleep } from './lib.mjs';
/** Sigue puntos locales [x, v] (a pie o en tabla). */
export async function goL(P, pts, opts = {}) { const r = await P.follow(pts.map(([x, v]) => XZ(x, v)), { tol: 0.4, maxMs: 25000, ...opts }); return r; }
/** Carrera en tabla desde la posición actual hacia `to` (local) y SALTO a `jumpAt` m del pie de la rampa `foot`. Devuelve la cota final. */
export async function ollieUp(P, page, to, foot, jumpAt = 1.15, speed = 4.5) {
  let jumped = false; const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    const s = await yy(page), l = loc(s); const a = XZ(to[0], to[1]), e = angleDiff(Math.atan2(a[0] - s.x, a[1] - s.z), s.h);
    const d = Math.hypot(l.x - foot[0], l.v - foot[1]); const k = [];
    if (!jumped) { if (s.sp < speed) k.push('KeyW'); if (Math.abs(e) > 0.05) k.push(e > 0 ? 'KeyA' : 'KeyD'); }
    await P.keys(k);
    if (!jumped && d < jumpAt) { await page.keyboard.press('Space'); jumped = true; }
    if (jumped && s.grounded && Date.now() - t0 > 900) break;
    await sleep(30);
  }
  await P.release(); await sleep(900); return loc(await yy(page));
}
/** Sale del fondo (N3) patinando: carrera por N3 → ollie R3a a N2 izq → ollie R1 a N1. Reintenta cada escalón. Devuelve el log. */
export const YY_ESC = { r3aStart: [-2.5, 28.4], r3aTo: [-2.5, 33.2], r3aFoot: [-2.5, 31.75], r1Start: [-3.0, 34.3], r1To: [-6.4, 31.0], r1Foot: [-5.33, 32.67] };
export async function escapeToN1(P, page, log = []) {
  await P.ensureRide();
  for (let k = 0; k < 4; k++) {
    await goL(P, [YY_ESC.r3aStart], { ride: true, speed: 2.5, tol: 0.5 }); await P.face(HD(0, 1)); 
    const l = await ollieUp(P, page, YY_ESC.r3aTo, YY_ESC.r3aFoot); log.push({ step: 'R3a', try: k + 1, h: l.h, at: [l.x, l.v] });
    if (l.h > -1.9) break;
  }
  for (let k = 0; k < 6; k++) {
    await goL(P, [YY_ESC.r1Start], { ride: true, speed: 2.5, tol: 0.5 }); await P.face(HD(YY_ESC.r1To[0] - YY_ESC.r1Start[0], YY_ESC.r1To[1] - YY_ESC.r1Start[1]));
    const l = await ollieUp(P, page, YY_ESC.r1To, YY_ESC.r1Foot, 1.2 + (k % 3) * 0.05); log.push({ step: 'R1', try: k + 1, h: l.h, at: [l.x, l.v] });
    if (l.h > -1.2) break;   // en N1 (−1,00) o ya sobre la escalera E1
    if (l.h < -2.2) { // cayó a N3 por R3a: repetir el primer escalón
      await goL(P, [YY_ESC.r3aStart], { ride: true, speed: 2.5, tol: 0.5 }); await P.face(HD(0, 1)); const q = await ollieUp(P, page, YY_ESC.r3aTo, YY_ESC.r3aFoot); log.push({ step: 'R3a', retry: true, h: q.h });
    }
  }
  return log;
}
