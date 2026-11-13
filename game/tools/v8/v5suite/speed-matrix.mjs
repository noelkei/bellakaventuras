// T5-00/T5-01/T5-07 · Velocidad en skate (D3: 20 m/s real y usable). Recta libre de 131 m medida por barrido de cápsula
// (scan-lines, T5-00): de (−43,2; −50,0) con rumbo 39° a través del centro (antes del 20/20 no hay superrampa ni coches).
// Entrada real: W (teclado); pulgar parcial con mando EMULADO (Input.fakePad, ganchos de prueba; declarado). Medidas:
//  · aceleración desde parado: tiempo y distancia hasta 8,5/9/15/19,5/19,8/20 y máximo de |v| horizontal por fotograma;
//  · frenada desde la velocidad máxima alcanzada (distancia hasta parar);
//  · crucero con el stick a 0,25/0,5/0,75 (velocidad estable tras 7 s);
//  · giro a fondo (D) a ~9 m/s y a la máxima: velocidad angular y radio;
//  · reversa (S sostenida desde parado): velocidad estable.
// Contrato V5: ≥19,8 en ≤70 m; nunca >20,05; 0→8,5 ±10 % de A; giro a 9 m/s ±5 % de A; reversa = A; stick 0,5 ±10 % de A.
import { Report, runTest, launch, openGame, clickStart, sleep, place, recStart, recStop, r3, baselineGet, baselineSet, isA, fixture } from '../lib.mjs';

const R = new Report('speed-matrix');
// V10 (preparación): con el exterior de la Bola de Oro la recta de V5 (131 m desde (−43,2; −50) a 39°) ya no está libre. Recta nueva medida
// por barrido de la cápsula (`tools/v10/scan-rectas.mjs`, R3): 113,5 m libres desde (−30,73; −49,23) a 30°, cruzando el centro como la de V5
// V10.4 R10 (cambio de diseño aprobado: valla del centro desde el principio, W04, y carteles a +33°, D3-07; copia previa en
// V10/backups/pruebas/V10_4-R10): la recta de R4 la cortan la valla y un poste del cartel de YY. Nueva medida con scan-rectas en el mapa de
// V10.4 con los arcos de los tres giros a la derecha también libres (V10/IT6/tools/diag/rectas-giro.mjs → evidencias/rectas_giro_v104.txt):
// 90 m libres desde (−51,16; 16,2) a 81° (la prueba usa ~85 m; la de 93,5 m a 147° chocaba al girar hacia fuera).
const START = [-51.16, 0, 16.2], HEAD = 81 * Math.PI / 180;   // antes (R4): [-38.18, 0, -29.7] a 45°, 114,5 m
const hv = (r) => Math.hypot(r.vx, r.vz);

await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page);
    const kb = page.keyboard;
    // ---------------------------------------------------------------- aceleración + frenada
    const acc = [];
    for (let rep = 0; rep < 2; rep++) {
      await place(page, R, START, HEAD, 'ride', 'recta');
      await sleep(500); await recStart(page);
      // W hasta la máxima (meseta de ≥1 s o 19,8 m/s + 1 s) y frenada con S antes de que se acabe la recta
      await kb.down('KeyW');
      { const t0 = Date.now(); let tTop = null, last = 0, still = 0;
        while (Date.now() - t0 < 9500) { const v = await page.evaluate(() => Math.hypot(window.__bk.skater.vel.x, window.__bk.skater.vel.z));
          if (v >= 19.8 && tTop === null) tTop = Date.now(); if (Math.abs(v - last) < 0.02) still += 50; else still = 0; last = v;
          if ((tTop && Date.now() - tTop > 1000) || still > 1200) break; await sleep(50); } }
      await kb.up('KeyW');
      const vmaxBefore = await page.evaluate(() => Math.hypot(window.__bk.skater.vel.x, window.__bk.skater.vel.z));
      await kb.down('KeyS'); await sleep(3200); await kb.up('KeyS');
      const rows = await recStop(page);
      const i0 = rows.findIndex((r) => hv(r) > 0.05);
      if (i0 < 0) { R.invalid(`aceleración rep ${rep}: no arrancó`); continue; }
      const p0 = rows[i0];
      const dist = (r) => Math.hypot(r.x - p0.x, r.z - p0.z);
      const at = (v) => { const r = rows.find((q) => hv(q) >= v); return r ? { t: r3(r.clock - p0.clock), d: r3(dist(r)) } : null; };
      const vmax = Math.max(...rows.map(hv));
      // frenada: desde el primer fotograma con S (velocidad máxima previa) hasta |v| < 0,15
      const iS = rows.findIndex((r, i) => i > i0 && r.st === 'brake');
      const iStop = iS >= 0 ? rows.findIndex((r, i) => i > iS && hv(r) < 0.15) : -1;
      const brake = iS >= 0 && iStop > 0 ? { from: r3(hv(rows[iS])), d: r3(Math.hypot(rows[iStop].x - rows[iS].x, rows[iStop].z - rows[iS].z)), t: r3(rows[iStop].clock - rows[iS].clock) } : null;
      // ¿siguió en la recta? (sin choques: la velocidad no cae bruscamente mientras se empuja)
      const crash = rows.slice(i0, iS > 0 ? iS : undefined).some((r, k, arr) => k > 0 && hv(arr[k - 1]) - hv(r) > 1.5);
      const row = { rep, t85: at(8.5), t9: at(9), t15: at(15), t195: at(19.5), t198: at(19.8), t20: at(20), vmax: r3(vmax), vmaxBefore: r3(vmaxBefore), brake, crash, endPos: [rows.at(-1).x, rows.at(-1).z] };
      if (crash) { R.invalid(`aceleración rep ${rep}: choque en la recta`, row); continue; }
      acc.push(row); console.log(JSON.stringify(row));
    }
    R.measure('aceleracion', acc);
    // ---------------------------------------------------------------- giro a fondo a ~9 m/s (y a la máxima si es mayor)
    const turns = [];
    for (const target of [9, 14, 20]) {
      await place(page, R, START, HEAD, 'ride', `giro ${target}`);
      await sleep(400); await kb.down('KeyW');
      let reached = false; const t0 = Date.now();
      while (Date.now() - t0 < 9000) { const v = await page.evaluate(() => Math.hypot(window.__bk.skater.vel.x, window.__bk.skater.vel.z)); if (v >= target - 0.3) { reached = true; break; } await sleep(30); }
      if (!reached) { await kb.up('KeyW'); R.invalid(`giro a ${target} m/s: no alcanza la velocidad`); continue; }
      // suelta W al llegar (rueda sin empujar) y gira 0,8 s con D a fondo: misma velocidad en A y V5
      await kb.up('KeyW');
      await recStart(page); await kb.down('KeyD'); await sleep(800); await kb.up('KeyD');
      const rows = await recStop(page);
      const mid = rows.filter((r, i) => i > rows.length * 0.3 && i < rows.length * 0.9);
      if (mid.length < 4) { R.invalid(`giro a ${target}: pocos fotogramas`); continue; }
      const a = mid[0], z = mid.at(-1), dt = z.clock - a.clock;
      let dh = z.h - a.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const rate = Math.abs(dh) / dt, v = (hv(a) + hv(z)) / 2;
      turns.push({ target, v: r3(v), rate: r3(rate), radius: r3(v / rate) });
    }
    R.measure('giro', turns); console.log(JSON.stringify(turns));
    // ---------------------------------------------------------------- reversa
    await place(page, R, START, HEAD + Math.PI, 'ride', 'reversa');
    await sleep(400); await kb.down('KeyS'); await sleep(3500);
    const rev = await page.evaluate(() => window.__bk.skater.vLong); await kb.up('KeyS');
    R.measure('reversa', r3(rev));
    // ---------------------------------------------------------------- crucero con stick parcial (mando emulado)
    const thumb = [];
    for (const y of [0.25, 0.5, 0.75]) {
      await place(page, R, START, HEAD, 'ride', `stick ${y}`);
      await fixture(page, R, `mando emulado: stick izquierdo Y = −${y} (arriba) vía Input.fakePad`, (y) => {
        const g = window.__bk; g.input.fakePad = { id: 'v5-fake', connected: true, axes: [0, -y, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; return { y };
      }, y);
      await sleep(7000);
      const v = await page.evaluate(() => { const s = window.__bk.skater; const v = Math.hypot(s.vel.x, s.vel.z); window.__bk.input.fakePad = null; return v; });
      thumb.push({ y, v: r3(v) });
    }
    R.measure('pulgar', thumb); console.log(JSON.stringify(thumb));
    // ---------------------------------------------------------------- contrato
    if (!R.nonEmpty(acc, 'aceleraciones válidas')) return;
    const best = acc.reduce((p, q) => (q.vmax > p.vmax ? q : p));
    const t85 = acc.map((a) => a.t85?.t).filter((x) => x != null);
    const turn9 = turns.find((t) => t.target === 9);
    const thumb5 = thumb.find((t) => t.y === 0.5);
    if (isA(R)) {
      baselineSet(R, 'speed_t85', t85.reduce((a, b) => a + b, 0) / t85.length, 'media de 2: tiempo 0→8,5 m/s con W en la recta');
      baselineSet(R, 'speed_vmax', best.vmax, 'máximo |v| horizontal con W 9,5 s');
      if (turn9) baselineSet(R, 'turn9_rate', turn9.rate, 'rad/s con D a fondo a ~9 m/s');
      baselineSet(R, 'reverse_v', rev, 'vLong estable con S desde parado');
      if (thumb5) baselineSet(R, 'thumb05_v', thumb5.v, 'crucero con stick 0,5 (mando emulado)');
      baselineSet(R, 'brake_from_max', best.brake, 'frenada desde la máxima');
    }
    const A = { t85: baselineGet('speed_t85'), turn9: baselineGet('turn9_rate'), rev: baselineGet('reverse_v'), thumb5: baselineGet('thumb05_v') };
    R.check(best.t198 && best.t198.d <= 70, 'alcanza ≥19,8 m/s en ≤70 m (D3)', 'input', { t198: best.t198, vmax: best.vmax });
    R.check(Math.max(...acc.map((a) => a.vmax)) <= 20.05, 'nunca supera 20,05 m/s en llano', 'input', acc.map((a) => a.vmax));
    R.check(A.t85 && t85.length && Math.abs(t85[0] / A.t85 - 1) <= 0.10, 'control negativo: 0→8,5 m/s ±10 % de A', 'input', { t85, A: A.t85 });
    R.check(A.turn9 && turn9 && Math.abs(turn9.rate / A.turn9 - 1) <= 0.05, 'control negativo: giro a fondo a 9 m/s ±5 % de A', 'input', { turn9, A: A.turn9 });
    R.check(A.rev != null && Math.abs(rev - A.rev) <= 0.1, 'control negativo: reversa igual a A', 'input', { rev: r3(rev), A: A.rev });
    R.check(A.thumb5 && thumb5 && Math.abs(thumb5.v / A.thumb5 - 1) <= 0.10, 'control negativo: crucero con pulgar 0,5 ±10 % de A', 'emulation', { thumb5, A: A.thumb5 });
  } finally { await b.close(); }
});
