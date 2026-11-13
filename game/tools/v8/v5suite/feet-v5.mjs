// T5-19 · Pies y cadencia de ANMI a pie (HUM-008, OPUS-007/008), portado de la sonda P1 de 04 (feet.mjs; misma geometría:
// vértices de suela deformados, plano por PCA, yaw/pitch/roll en el marco del personaje) + métricas del plan:
//  · cadencia (inicios de apoyo por segundo, ambos pies), deslizamiento de la suela en apoyo (desplazamiento horizontal del
//    centroide mientras está apoyada, por apoyo), penetración de la suela;
//  · agachada quieta: excursión máxima de los centroides de suela en 4 s.
// Casos (entrada real): andar W (3 m/s), andar lento (stick táctil CDP ~30 %, vertical), marcha atrás (S), giro con pasos
// (solo D), reposo, agachada quieta (C), andar agachada (C+W). Muestreo por requestAnimationFrame dentro de la página.
// Objetivos del plan (propuestos, revisables): alabeo en apoyo ≤ 8°, apertura al andar ≤ 8° y en reposo ≤ 15°, suela sin
// penetrar > 1 cm, < 3 pasos/s a 3 m/s, deslizamiento en apoyo ≤ 2 cm por paso, agachada quieta ≤ 1 cm en 4 s.
import { Report, runTest, launch, openGame, clickStart, sleep, place, VIEWPORTS, r3, arg } from '../lib.mjs';
const R = new Report('feet-v5');
const CASES = arg('cases', 'andar3,lento,atras,giro,reposo,agachada_quieta,agachada_andar').split(',');
const PROBE = (dur) => new Promise((resolve) => {
  const g = window.__bk, T = window.__bkTHREE, V = g.visual, body = V.body, s = g.skater;
  const si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight, bones = body.skeleton.bones;
  const side = (i) => { let l = 0, r = 0; for (let k = 0; k < 4; k++) { const n = bones[si.getComponent(i, k)].name, w = sw.getComponent(i, k); if (/Left/.test(n)) l += w; if (/Right/.test(n)) r += w; } return l > r ? 'L' : 'R'; };
  const idx = { L: [], R: [] }; for (const i of V.soleIdx) idx[side(i)].push(i);
  const frames = []; const t0 = performance.now(); const v = new T.Vector3();
  const tick = () => {
    body.updateMatrixWorld(true);
    const hd = s.headingVis ?? s.heading; const fwd = new T.Vector3(Math.sin(hd), 0, Math.cos(hd)), right = new T.Vector3(-Math.cos(hd), 0, Math.sin(hd));
    const ground = s.lerpPos(new T.Vector3()).y;
    const fr = { t: performance.now() - t0, hv: Math.hypot(s.vel.x, s.vel.z), state: s.state, ground };
    for (const sd of ['L', 'R']) {
      const P = idx[sd].map((i) => { body.getVertexPosition(i, v); return v.clone().applyMatrix4(body.matrixWorld); });
      const c = P.reduce((a, p) => a.add(p), new T.Vector3()).multiplyScalar(1 / P.length);
      const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (const p of P) { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; for (let a = 0; a < 3; a++) for (let b2 = 0; b2 < 3; b2++) C[a][b2] += d[a] * d[b2]; }
      const pw = (M, seed) => { let x = seed; for (let k = 0; k < 60; k++) { const y = [M[0][0] * x[0] + M[0][1] * x[1] + M[0][2] * x[2], M[1][0] * x[0] + M[1][1] * x[1] + M[1][2] * x[2], M[2][0] * x[0] + M[2][1] * x[1] + M[2][2] * x[2]]; const n = Math.hypot(...y) || 1; x = y.map((q) => q / n); } return x; };
      const e1 = pw(C, [fwd.x, 0, fwd.z]); let ev1 = 0; { const y = C.map((r) => r[0] * e1[0] + r[1] * e1[1] + r[2] * e1[2]); ev1 = y[0] * e1[0] + y[1] * e1[1] + y[2] * e1[2]; }
      const C2 = C.map((r, a) => r.map((q, b2) => q - ev1 * e1[a] * e1[b2])); const e2 = pw(C2, [right.x, 0, right.z]);
      let L = new T.Vector3(...e1); if (L.dot(fwd) < 0) L.negate();
      let N = new T.Vector3().crossVectors(new T.Vector3(...e1), new T.Vector3(...e2)).normalize(); if (N.y < 0) N.negate();
      const lat = c.clone().sub(s.lerpPos(new T.Vector3())).dot(right), outward = Math.sign(lat) || (sd === 'L' ? 1 : -1);
      const yaw = Math.atan2(L.dot(right) * outward, L.dot(fwd)) * 180 / Math.PI, pitch = Math.asin(Math.max(-1, Math.min(1, L.y))) * 180 / Math.PI;
      const side3 = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), L).normalize();
      const roll = Math.asin(Math.max(-1, Math.min(1, N.dot(side3)))) * 180 / Math.PI * outward * -1;
      fr[sd] = { yaw, pitch, roll, ymin: Math.min(...P.map((p) => p.y)) - ground, cx: c.x, cz: c.z };
    }
    frames.push(fr);
    if (performance.now() - t0 < dur) requestAnimationFrame(tick); else resolve(frames);
  };
  requestAnimationFrame(tick);
});
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
function summarize(frames) {
  const out = {}; let onsets = 0; const slips = [];
  for (const sd of ['L', 'R']) {
    const st = frames.map((f) => f[sd].ymin <= 0.015);
    const stance = frames.filter((_, i) => st[i]), flat = stance.filter((f) => Math.abs(f[sd].pitch) < 8);
    // apoyos contiguos: inicio y deslizamiento horizontal del centroide
    let i = 0; while (i < frames.length) { if (st[i] && (i === 0 || !st[i - 1])) { if (i > 0) onsets++; let j = i; while (j + 1 < frames.length && st[j + 1]) j++;
      if (j > i) { const a = frames[i][sd], b = frames[j][sd]; slips.push(Math.hypot(b.cx - a.cx, b.cz - a.cz)); } i = j + 1; } else i++; }
    out[sd] = { stance: stance.length, frames: frames.length, rollFlatMed: r3(med(flat.map((f) => f[sd].roll))), yawFlatMed: r3(med(flat.map((f) => f[sd].yaw))), yawStanceMed: r3(med(stance.map((f) => f[sd].yaw))), minY: r3(Math.min(...frames.map((f) => f[sd].ymin))),
      excursion: r3(Math.max(...frames.map((f) => Math.hypot(f[sd].cx - frames[0][sd].cx, f[sd].cz - frames[0][sd].cz)))) };
  }
  // velocidad horizontal de la suela en los fotogramas APOYADOS de verdad (≤ 6 mm sobre el suelo, este y el anterior)
  const pv = []; for (const sd of ['L', 'R']) for (let i = 1; i < frames.length; i++) { const a = frames[i - 1], b = frames[i]; if (a[sd].ymin <= 0.006 && b[sd].ymin <= 0.006 && b.t > a.t) pv.push(Math.hypot(b[sd].cx - a[sd].cx, b[sd].cz - a[sd].cz) / ((b.t - a.t) / 1000)); }
  out.plantSpeedMed = r3(med(pv)); out.plantFrames = pv.length;
  const dur = (frames.at(-1).t - frames[0].t) / 1000;
  return { ...out, hv: r3(med(frames.map((f) => f.hv))), states: [...new Set(frames.map((f) => f.state))], cadence: r3(onsets / dur), slipMed: r3(med(slips)), slipMax: r3(Math.max(0, ...slips)), steps: onsets };
}
await runTest(R, async () => {
  const b = await launch();
  try {
    const res = {};
    const desk = await openGame(b, R); await clickStart(desk);
    const run = async (page, name, setup, dur = 2500, warm = 900) => { await place(page, R, [-14, 0, -2], 0, 'walk', name); await sleep(500); const stop = await setup(); await sleep(warm); const fr = await page.evaluate(PROBE, dur); await stop?.(); await sleep(300); res[name] = summarize(fr); console.log(name, JSON.stringify(res[name])); };
    const hold = (page, keys) => async () => { for (const k of keys) await page.keyboard.down(k); return async () => { for (const k of keys) await page.keyboard.up(k); }; };
    // V10.1 P02 (D02, cambio de diseño aprobado): mantener W más de 0,8 s ya no es andar sino CORRER (2,5 → 5 m/s). «andar3» mide la marcha
    // a su velocidad máxima de andar (2,5 m/s) con W mantenida: la preparación reinicia en cada fotograma el contador de carrera (sin
    // tocar el juego). La suela corriendo la cubre game/tools/v10_1/correr.mjs. Copia previa: V10/backups/pruebas/V10_1-R3/v5suite-feet-v5.mjs
    const noRun = (page) => page.evaluate(() => { const s = window.__bk.skater; const f = () => { if (!window.__noRun) return; s['runHoldT'] = 0; s.running = false; requestAnimationFrame(f); }; window.__noRun = true; f(); });
    if (CASES.includes('andar3')) await run(desk, 'andar3', async () => { await noRun(desk); const stop = await hold(desk, ['KeyW'])(); return async () => { await stop(); await desk.evaluate(() => { window.__noRun = false; }); }; });
    if (CASES.includes('atras')) await run(desk, 'atras', hold(desk, ['KeyS']), 2500, 1400);
    if (CASES.includes('giro')) await run(desk, 'giro', hold(desk, ['KeyD']));
    if (CASES.includes('reposo')) await run(desk, 'reposo', async () => null, 2500, 300);
    if (CASES.includes('agachada_quieta')) await run(desk, 'agachada_quieta', hold(desk, ['KeyC']), 4000, 800);
    if (CASES.includes('agachada_andar')) await run(desk, 'agachada_andar', hold(desk, ['KeyC', 'KeyW']));
    await desk.close();
    if (CASES.includes('lento')) {
      const ph = await openGame(b, R, { viewport: VIEWPORTS.phone }); await clickStart(ph);
      const cdp = await ph.target().createCDPSession(); const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
      const rect = await ph.evaluate(() => { const r = document.getElementById('stick-zone').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
      const ox = Math.round(rect[0] + Math.min(80, rect[2] * 0.45)), oy = Math.round(rect[1] + rect[3] - 110);
      await run(ph, 'lento', async () => { await touch('touchStart', [[ox, oy, 1]]); await sleep(40); await touch('touchMove', [[ox, oy - 26, 1]]); return async () => touch('touchEnd', []); });
      await ph.close();
    }
    R.measure('casos', res);
    const A = res;
    if (A.andar3) {
      R.note({ andar3_cadencia: A.andar3.cadence, hv: A.andar3.hv, nota: 'R2-G8: «< 3 pasos/s» era del trote T5-19 (retirado por el usuario); la marcha V4 a 3 m/s se compara en walk-compare' });
      // deslizamiento por paso ≈ velocidad del pie apoyado × duración del apoyo (≈ 0,27 s en el trote)
      R.note({ andar3_marcha_V4: true, plantSpeedMed: A.andar3.plantSpeedMed, nota: 'R2-G8: criterios de cadencia/deslizamiento del trote T5-19 retirados (sin trote); equivalencia con V4 en walk-compare' });
    }
    // R1-G8 (usuario, 12 oct): la marcha conserva la APERTURA de V4 («andaba bien, con los pies un poco hacia fuera») y solo
    // pierde el alabeo. Criterio: alabeo ≤ 8° (pie plano) y apertura ≤ 24°; andando lento (clip Walking) además ≥ 8°, el eje de
    // V4 (A medido en R1-G8/runs/feet-v5_A_*: apertura en apoyo 16,7–21,6° con alabeo 22°). Sustituye a «apertura ≤ 8°» de T5-19.
    for (const k of ['andar3', 'lento']) if (A[k]) R.check(['L', 'R'].every((s) => Math.abs(A[k][s].rollFlatMed ?? 99) <= 8 && Math.abs(A[k][s].yawFlatMed ?? 99) <= 24 && (k !== 'lento' || Math.abs(A[k][s].yawFlatMed) >= 8)), `${k}: pie plano (alabeo ≤ 8°) con la apertura de V4 (≤ 24°${k === 'lento' ? ', ≥ 8°' : ''})`, 'unit', { L: A[k].L, R: A[k].R });
    if (A.reposo) R.check(['L', 'R'].every((s) => Math.abs(A.reposo[s].yawStanceMed ?? 99) <= 15 && Math.abs(A.reposo[s].rollFlatMed ?? 99) <= 8), 'reposo: apertura ≤ 15° y alabeo ≤ 8°', 'unit', { L: A.reposo.L, R: A.reposo.R });
    for (const k of Object.keys(A)) R.check(['L', 'R'].every((s) => A[k][s].minY >= -0.01), `${k}: suela sin penetrar > 1 cm`, 'unit', { L: A[k].L.minY, R: A[k].R.minY });
    if (A.agachada_quieta) R.check(['L', 'R'].every((s) => A.agachada_quieta[s].excursion <= 0.01), `agachada quieta: excursión de pies ≤ 1 cm en 4 s (${A.agachada_quieta.L.excursion} / ${A.agachada_quieta.R.excursion})`, 'unit', A.agachada_quieta);
    if (A.giro) R.check(A.giro.steps >= 2, `giro con pasos: el ciclo de marcha avanza (${A.giro.steps} apoyos en 2,5 s a ${A.giro.hv} m/s)`, 'unit', A.giro);
    R.pendingHuman('Vídeo continuo de cada estado a pie (T5-21) y juicio visual de pies y cadencia (G8-V)');
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
