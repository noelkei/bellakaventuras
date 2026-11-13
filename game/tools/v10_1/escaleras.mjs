// V10.1 · P19 + R6 (guardián): las escaleras de V10 se suben y se bajan A PIE con ritmo continuo, como las de TT/YY/NMG (rampa invisible):
//  · E1 de NVDA (19 peldaños de 0,179) y NO-ST-M02 del exterior (3 de 0,267, por encima del escalón máximo 0,26: antes no se podía subir);
//  · con W real: llega arriba, ningún paso fijo sube más de 5 cm (sin «tirones» del asistente de escalón) y no hay eventos `step-up`/`step-block`;
//  · bajando (de cara, W real desde arriba): llega abajo sin caer más de 12 cm en un paso.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture } from '../v8/lib.mjs';
const R = new Report('escaleras-v10-1');
async function geo(page, name) {
  return page.evaluate((name) => { const g = window.__bk, P = g.park, out = [];
    g.world.forEachCollider((c) => { const n = P.colliderName(c.handle); if (n !== name && n !== name + '_peldano') return; const sh = c.shape; let pts = [];
      if (sh.halfExtents) { const t = c.translation(), h = sh.halfExtents, q = c.rotation(), T = window.__bkTHREE, Q = new T.Quaternion(q.x, q.y, q.z, q.w);
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const v = new T.Vector3(sx * h.x, sy * h.y, sz * h.z).applyQuaternion(Q); pts.push([t.x + v.x, t.y + v.y, t.z + v.z]); } }
      else if (sh.vertices) { const V = sh.vertices, t = c.translation(); for (let i = 0; i < V.length; i += 3) pts.push([V[i] + t.x, V[i + 1] + t.y, V[i + 2] + t.z]); }
      out.push(pts); });
    return out; }, name);
}
async function climb(page, label, start, dir, ms) {
  await fixture(page, R, `${label}: a pie, de cara a la escalera`, (p, d) => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); g.skater.teleport(new T.Vector3(p[0], p[1] ?? 0, p[2]), Math.atan2(d[0], d[1]), 'walk'); g.rig.snapBehind(g.skater); g.skater.trace.length = 0; g.skater.events.length = 0; }, start, dir);
  await sleep(300); await page.keyboard.down('KeyW'); await sleep(ms); await page.keyboard.up('KeyW'); await sleep(250);
  const tr = await page.evaluate(() => window.__bk.skater.trace.map((r) => r.y));
  const ev = await page.evaluate(() => window.__bk.skater.events.map((e) => e.e).filter((e) => /step-up|step-block/.test(e)));
  let up = 0, down = 0; for (let i = 1; i < tr.length; i++) { up = Math.max(up, tr[i] - tr[i - 1]); down = Math.max(down, tr[i - 1] - tr[i]); }
  return { label, y0: +tr[0]?.toFixed(3), yMax: +Math.max(...tr).toFixed(3), yEnd: +tr.at(-1)?.toFixed(3), maxSubida: +up.toFixed(3), maxBajada: +down.toFixed(3), eventos: ev.length, ej: ev.slice(0, 4) };
}
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(800);
    const res = [];
    // E1: dirección de subida = del peldaño más bajo al más alto (centros de las cajas visuales o de la rampa)
    for (const [name, H, back] of [['nv_e1', 3.4, 1.6], ['bola_stairs', 0.8, 1.4]]) {
      const G = await geo(page, name); const all = G.flat(); if (!all.length) { R.invalid(`${name}: sin colisión`); continue; }
      // eje: de los puntos bajos (y ≈ 0 de la arista delantera) a los altos (y ≈ H); en planta, dirección de máxima subida
      const hiP = all.filter((p) => p[1] > H - 0.05), loP = all.filter((p) => p[1] < 0.05);
      const cen = (L) => [L.reduce((s, p) => s + p[0], 0) / L.length, L.reduce((s, p) => s + p[2], 0) / L.length];
      const c = cen(all), ch = cen(hiP);
      let dx = ch[0] - c[0], dz = ch[1] - c[1]; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const us = all.map((p) => p[0] * dx + p[2] * dz), u0 = Math.min(...us), u1 = Math.max(...us), cl = c[0] * -dz + c[1] * dx;
      void loP;
      const P = (u) => [u * dx + cl * -dz, 0, u * dz + cl * dx];
      const s = P(u0 - back), runMs = Math.round((u1 - u0 + back + 0.6) / 2.2 * 1000) + 800;
      const up = await climb(page, `${name} subir`, s, [dx, dz], runMs);
      res.push(up);
      R.check(up.yMax >= H - 0.06 && up.maxSubida <= 0.05 && up.eventos === 0, `${name}: subida a pie continua hasta arriba (${up.yMax} de ${H}; máx ${up.maxSubida} m por paso; asistente de escalón ${up.eventos})`, 'input', up);
      const top = P(u1 - 0.25); top[1] = H;
      const dn = await climb(page, `${name} bajar`, top, [-dx, -dz], runMs);
      res.push(dn);
      R.check(dn.yEnd <= 0.06 && dn.maxBajada <= 0.12, `${name}: bajada a pie continua hasta abajo (final ${dn.yEnd}; máx ${dn.maxBajada} m por paso)`, 'input', dn);
    }
    R.measure('escaleras', res);
  } finally { await b.close(); }
}, { timeoutMs: 200000 });
