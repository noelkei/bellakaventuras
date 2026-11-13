// UX-02: cámara de exploración con TECLADO REAL en recorridos (curvas del paseo interior, plataforma NMG: escalones arriba y
// bank abajo, ollie, túnel agachado, rodear el muro de YINYANG) en apaisado 900×620 y vertical 390×844. Por muestra (~50 ms):
// cabeza de ANMI visible desde la cámara (rayo contra colliders sólidos que cuentan para la cámara), cámara dentro de un
// sólido, salto de cámara frente al movimiento del objetivo y distancia mínima a la cabeza (no encuadra desde dentro).
// Además: el giro manual con teclado retrasa el seguimiento automático y la pausa no consume ese retraso.
//   node tools/v3/ux02.mjs [L|P] → captures/v3/P3/UX-02/ux02.json + capturas de entrada/salida
import path from 'node:path';
import { Report, launch, openGame, clickStart, sleep, VIEWPORTS } from './lib.mjs';

const only = (process.argv[2] ?? 'LP').toUpperCase();
const R = new Report('P3/UX-02', 'ux02', { method: 'teclado real con piloto relativo a la cámara; fixtures: posición de salida de cada recorrido; muestreo de cámara/colisiones en la página' });
const browser = await launch();
let page;
const held = new Set();
async function keys(want) { for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } }
async function goTo(tg, { tol = 1.0, vmax = 4, maxMs = 12000, extra = [], jumpAt = null } = {}) {
  const t0 = Date.now(); let o = null, jumped = false;
  while (Date.now() - t0 < maxMs) {
    o = await page.evaluate(({ tg, vmax }) => {
      const g = window.__bk, p = g.skater.footPos, f = g.rig.forward, d = { x: tg.x - p.x, z: tg.z - p.z }, L = Math.hypot(d.x, d.z), right = { x: -f.z, z: f.x };
      const combos = [['KeyW'], ['KeyW', 'KeyA'], ['KeyW', 'KeyD'], ['KeyA'], ['KeyD']].map((k) => { const y = k.includes('KeyW') ? 1 : 0, x = (k.includes('KeyD') ? 1 : 0) - (k.includes('KeyA') ? 1 : 0); const n = Math.hypot(x, y) || 1; const w = { x: (f.x * y + right.x * x) / n, z: (f.z * y + right.z * x) / n }; return { k, dot: (w.x * d.x + w.z * d.z) / (L || 1) }; }).sort((a, b) => b.dot - a.dot);
      let k = combos[0].k.slice(); const v = g.skater.speed;
      if (v > vmax + 0.5) k = ['KeyS']; else if (combos[0].dot < 0.75) { k = k.filter((x) => x !== 'KeyW'); if (!k.length) k = ['KeyA']; if (v < 0.8) k.push('KeyW'); } else if (v > vmax) k = k.filter((x) => x !== 'KeyW');
      return { L, keys: k, loco: g.skater.loco, air: !g.skater.grounded };
    }, { tg, vmax });
    if (o.L < tol) break;
    await keys(o.loco === 'bail' || o.air ? extra : [...o.keys, ...extra]);
    if (jumpAt && !jumped && o.L < jumpAt) { await page.keyboard.press('Space'); jumped = true; }
    await sleep(30);
  }
  await keys(extra); return o;
}
const startMon = () => page.evaluate(() => {
  const g = window.__bk, R = window.__bkRapier, T = window.__bkTHREE, rig = g.rig;
  const mon = window.__camMon = { rows: [], last: null };
  const ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  mon.iv = setInterval(() => {
    if (g.paused) return;
    const s = g.skater, c = rig.cam.position, head = s.visualPos.clone().add(new T.Vector3(0, s.isCrouched ? 0.95 : 1.55, 0));
    const d = head.clone().sub(c), L = d.length(); d.divideScalar(L);
    ray.origin = { x: c.x, y: c.y, z: c.z }; ray.dir = { x: d.x, y: d.y, z: d.z };
    const hit = g.world.castRay(ray, L - 0.35, true, R.QueryFilterFlags.EXCLUDE_SENSORS | R.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, s.collider, undefined, rig.ignore ?? undefined);
    let inside = 0; g.world.intersectionsWithPoint({ x: c.x, y: c.y, z: c.z }, (col) => { if (!col.isSensor() && col.handle !== s.collider.handle && (!rig.ignore || rig.ignore(col))) inside++; return true; });
    const names = []; if (inside) g.world.intersectionsWithPoint({ x: c.x, y: c.y, z: c.z }, (col) => { names.push(g.park.b.colliders.find((x) => x.c.handle === col.handle)?.name ?? '?'); return true; });
    const row = { t: performance.now(), cuts: rig.occlusionCuts, cam: [c.x, c.y, c.z], tgt: [head.x, head.y, head.z], visible: !hit, inside, names, dist: L, crouch: s.isCrouched, air: !s.grounded, mode: rig.mode, hitName: hit ? (g.park.b.colliders.find((x) => x.c.handle === hit.collider.handle)?.name ?? '?') : null };
    if (mon.last) { const a = mon.last; row.dCam = Math.hypot(c.x - a.cam[0], c.y - a.cam[1], c.z - a.cam[2]); row.dTgt = Math.hypot(head.x - a.tgt[0], head.y - a.tgt[1], head.z - a.tgt[2]); }
    mon.rows.push(row); mon.last = row;
  }, 50);
});
const stopMon = () => page.evaluate(() => { const m = window.__camMon; clearInterval(m.iv); window.__camMon = null; return m.rows; });
function judge(label, rows, kind, cuts = 0) {
  const n = rows.length, vis = rows.filter((r) => r.visible).length / Math.max(1, n);
  let run = 0, worstRun = 0; for (const r of rows) { run = r.visible ? 0 : run + 1; worstRun = Math.max(worstRun, run); }
  const inside = rows.filter((r) => r.inside > 0).length;
  // salto = la cámara se mueve más de 16 m/s por encima del objetivo entre dos muestras (independiente del ritmo del muestreo)
  const fast = (r, i) => r.dCam !== undefined && i > 0 && (r.dCam - r.dTgt) / Math.max(0.03, (r.t - rows[i - 1].t) / 1000) > 16;
  // un salto solo se admite si coincide con un corte por oclusión de la propia cámara (rig.occlusionCuts aumenta)
  const jumps = rows.filter((r, i) => fast(r, i) && r.cuts === rows[i - 1].cuts && r.cuts === (rows[i + 1]?.cuts ?? r.cuts) && (i < 2 || rows[i - 1].cuts === rows[i - 2].cuts)).length;   // ±1 muestra
  const cutN = rows.length ? rows.at(-1).cuts - rows[0].cuts : 0;
  const minDist = Math.min(...rows.map((r) => r.dist));
  const info = { n, visible: +vis.toFixed(3), worstHiddenS: +(worstRun * 0.05).toFixed(2), insideSolid: inside, jumps, occlusionCuts: cutN, minDist: +minDist.toFixed(2) };
  R.data[`bad_${label}`] = rows.filter((r) => r.inside || !r.visible || r.dist < 0.5 || (r.dCam !== undefined && r.dCam - r.dTgt > 0.6)).slice(0, 12).map((r) => ({ cam: r.cam.map((v) => +v.toFixed(2)), dist: +r.dist.toFixed(2), names: r.names, hit: r.hitName, d: r.dCam && +(r.dCam - r.dTgt).toFixed(2) }));
  R.check(n > 20 && vis >= 0.9 && worstRun * 0.05 <= 1.0 && inside === 0 && jumps === 0 && minDist >= 0.4, `${label}: ANMI visible (≥90 %, ningún tramo oculto >1 s), cámara nunca dentro de un sólido, sin saltos salvo cortes por oclusión (contados) y nunca a menos de 0,4 m de la cabeza`, kind, info);
  return info;
}

try {
  for (const [tag, vp] of [['L', { width: 900, height: 620, deviceScaleFactor: 1 }], ['P', VIEWPORTS.phone]]) {
    if (!only.includes(tag)) continue;
    const name = tag === 'L' ? '900x620' : '390x844';
    page = await openGame(browser, R, { viewport: vp, save: null });
    await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
    const shot = (n) => page.screenshot({ path: path.join(R.dir, `${name}_${n}.jpg`), type: 'jpeg', quality: 70 });
    const place = (zone, r, da, toR, toDa, loco = 'ride') => page.evaluate(({ zone, r, da, toR, toDa, loco }) => { const g = window.__bk, S = g.park.sector(zone), a = S.P(r, da), b = S.P(toR, toDa); g.skater.teleport(a, Math.atan2(b.x - a.x, b.z - a.z), loco); g.rig.snapBehind(g.skater); g.input.clear(); }, { zone, r, da, toR, toDa, loco });
    const P = (zone, r, da) => page.evaluate(({ zone, r, da }) => { const q = window.__bk.park.sector(zone).P(r, da); return { x: q.x, z: q.z }; }, { zone, r, da });

    // 1. curvas del paseo interior (r 23,5) entre NMG y NOSVAMOS
    R.fixture(`${name}: salida en el paseo interior de NMG`, 'teleport');
    await place('no_me_guillo', 23.5, 20, 23.5, 15); await sleep(300); await startMon(); await shot('paseo_entrada');
    for (const da of [10, 0, -10, -20, -30, -40, -50]) await goTo(await P('no_me_guillo', 23.5, da), { tol: 1.6, vmax: 5 });
    await shot('paseo_salida'); judge(`${name} paseo interior en curva`, await stopMon(), 'input');

    // 2. plataforma NMG: escalones arriba → plataforma → bank abajo (y un ollie en llano)
    const pl = await page.evaluate(() => { const S = window.__bk.park.sector('no_me_guillo'), p = S.pl(33, 10), y = p.yaw; const loc = (lx, lz) => ({ x: p.x + lx * Math.cos(y) + lz * Math.sin(y), z: p.z - lx * Math.sin(y) + lz * Math.cos(y) }); return { a: loc(0, -8), b: loc(0, -1), c: loc(2.5, 0), d: loc(9, 0) }; });
    R.fixture(`${name}: salida 8 m delante de los escalones de la plataforma NMG`, 'teleport');
    await page.evaluate(({ a, b }) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(a.x, 0, a.z), Math.atan2(b.x - a.x, b.z - a.z), 'ride'); g.rig.snapBehind(g.skater); g.input.clear(); }, pl);
    await sleep(300); await startMon(); await shot('plataforma_entrada');
    await goTo(pl.b, { tol: 1.0, vmax: 3.2 }); const yTop = await page.evaluate(() => window.__bk.skater.footPos.y);
    await goTo(pl.c, { tol: 1.0, vmax: 3 }); await goTo(pl.d, { tol: 1.2, vmax: 4.5 });
    await page.keyboard.press('Space'); await sleep(1200);
    const yEnd = await page.evaluate(() => window.__bk.skater.footPos.y);
    await shot('plataforma_salida');
    const plRows = await stopMon(); R.data[`plataforma_${tag}`] = { yTop, yEnd, air: plRows.filter((r) => r.air).length };
    R.check(yTop > 0.5 && yEnd < 0.2 && plRows.some((r) => r.air), `${name}: el recorrido sube a la plataforma (y ${yTop.toFixed(2)}), baja por el bank e incluye un ollie`, 'input', { yTop, yEnd });
    judge(`${name} escalones, bank y ollie`, plRows, 'input');

    // 3. túnel del circuito a pie y agachado (entra agachado, sale y se levanta)
    R.fixture(`${name}: a pie dentro del túnel del circuito, mirando a la salida interior`, 'teleport');
    await place('nosvamosdeaqui', 30.6, -2, 26, -2, 'walk'); await page.keyboard.press('KeyQ'); await sleep(400); await startMon(); await shot('tunel_dentro');
    await goTo(await P('nosvamosdeaqui', 26.4, -2), { tol: 0.8, vmax: 2 });
    await sleep(500); await shot('tunel_salida');
    const tRows = await stopMon(); await page.keyboard.press('KeyQ');
    R.check(tRows.some((r) => r.crouch) && !tRows.at(-1).crouch, `${name}: el tramo pasa agachado por el túnel y se levanta al salir`, 'input', { crouchRows: tRows.filter((r) => r.crouch).length });
    judge(`${name} túnel agachado`, tRows, 'input');   // boca del túnel: corte deliberado (si no, la cámara cruza el techo)

    // 4. rodear el muro de YINYANG hasta detrás (la patata escondida): el muro pasa entre cámara y jugador
    R.fixture(`${name}: delante del mural de YINYANG`, 'teleport');
    await place('yinyang', 30, 4, 31, 9); await sleep(300); await startMon(); await shot('muro_entrada');
    for (const [r, da] of [[31, 9], [35.5, 9.5], [36.4, 4], [36.4, 0]]) await goTo(await P('yinyang', r, da), { tol: 1.0, vmax: 2.8 });
    await sleep(1200); await shot('muro_detras');
    judge(`${name} rodear el muro`, await stopMon(), 'input');   // esquina del muro: corte deliberado

    // 5. giro manual con teclado (L) en marcha: el seguimiento espera; la pausa no consume la espera
    await place('no_me_guillo', 34, -20, 34, -25); await sleep(300);
    await keys(['KeyW']); await sleep(1500);
    await page.keyboard.down('KeyL'); await sleep(450); await page.keyboard.up('KeyL');
    const y0 = await page.evaluate(() => window.__bk.rig.yaw);
    await page.keyboard.press('Escape'); await sleep(2500); const sm = await page.evaluate(() => window.__bk.rig.sinceManual);
    await page.evaluate(() => document.getElementById('btn-resume').click());
    held.delete('KeyW'); await page.keyboard.up('KeyW'); await keys(['KeyW']);   // la pausa suelta las teclas mantenidas: se vuelve a pulsar W
    await sleep(700);
    const y1 = await page.evaluate(() => window.__bk.rig.yaw);
    await sleep(4000); const y2 = await page.evaluate(() => ({ yaw: window.__bk.rig.yaw, heading: window.__bk.skater.heading }));
    await keys([]);
    const dA = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    R.check(sm < 0.6 && dA(y1, y0) < 0.08 && dA(y2.yaw, y2.heading) < 0.25, `${name}: tras girar con L la cámara espera (también tras 2,5 s de pausa) y luego vuelve detrás del rumbo`, 'input', { sinceManualInPause: sm, y0, y1, y2 });
    await page.close();
  }
  R.note('Visibilidad = rayo cámara→cabeza contra colliders sólidos que la cámara considera (NPCs/follaje excluidos por diseño). Capturas de entrada/salida por tramo.');
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
