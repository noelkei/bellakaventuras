// V6 T6-04 · Escalera de FASHION GIRL con entrada real: ACCIÓN (E) al pie, W sube, soltar se queda agarrada, S baja,
// cambio de sentido, pausa, salida arriba al deck; desde arriba ACCIÓN baja y S lleva al suelo. Graba un clip de vídeo.
import { Report, runTest, launch, openGame, clickStart, sleep, place, holdKeys, recordClip, directShot } from './lib.mjs';
const R = new Report('fg-ladder');
const th = 108 * Math.PI / 180, O = [30.5 * Math.sin(th), -30.5 * Math.cos(th)], W = [Math.sin(th), -Math.cos(th)], S = [-Math.cos(th), -Math.sin(th)];
const V = (w, s, h = 0) => [O[0] + W[0] * w + S[0] * s, h, O[1] + W[1] * w + S[1] * s];
const H = (dw, ds) => Math.atan2(W[0] * dw + S[0] * ds, W[1] * dw + S[1] * ds);
const lad = async (page) => page.evaluate(() => { const g = window.__bk, s = g.skater, l = g.activities.find((a) => a.id === 'ladderClimb');
  const dx = s.footPos.x, dz = s.footPos.z; return { ph: l.phase, u: +l.u.toFixed(3), y: +s.footPos.y.toFixed(3), x: +dx.toFixed(3), z: +dz.toFixed(3), frozen: s.frozen, busy: l.busy, loco: s.loco, action: document.getElementById('btn-action')?.textContent ?? '', clip: g.visual.currentName }; });
const tap = async (page, k) => { await page.keyboard.down(k); await sleep(90); await page.keyboard.up(k); };
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(1500);
    await place(page, R, V(0, -10.9), H(0, 1), 'walk', 'pie de la escalera');
    await sleep(400);
    let q = await lad(page); R.check(/TREPAR/.test(q.action), 'al pie se ofrece TREPAR', 'input', q);
    await tap(page, 'KeyE'); await sleep(600);
    q = await lad(page); R.check(q.busy && q.frozen && q.ph === 'climb', 'ACCIÓN agarra la escalera', 'input', q);
    const y0 = q.y;
    await recordClip(page, R, 'subida', async () => {
      await holdKeys(page, ['KeyW'], 1200);
      q = await lad(page); R.check(q.y > y0 + 0.3, 'W sube', 'input', q);
      const yHold = q.y; await sleep(700); const q2 = await lad(page);
      R.check(Math.abs(q2.y - yHold) < 0.005 && q2.ph === 'climb', 'sin entrada se queda agarrada (altura fija)', 'input', { yHold, y: q2.y });
      await holdKeys(page, ['KeyS'], 900); const q3 = await lad(page);
      R.check(q3.y < yHold - 0.1, 'S baja (cambio de sentido)', 'input', q3);
      await page.keyboard.press('Escape'); await sleep(800); const qp = await lad(page); await page.keyboard.press('Escape'); await sleep(300);
      R.check(Math.abs(qp.y - q3.y) < 0.01, 'pausa: congelada en la escalera', 'input', qp);
      await page.keyboard.down('KeyW'); for (let i = 0; i < 60; i++) { await sleep(100); if (!(await lad(page)).busy) break; } await page.keyboard.up('KeyW');
    });
    await sleep(500);
    q = await lad(page);
    R.check(!q.busy && !q.frozen && q.y > 1.7 && q.loco === 'walk', 'sale arriba al deck, libre y a pie', 'input', q);
    // controles restituidos: andar por el deck
    await holdKeys(page, ['KeyW'], 600); const qm = await lad(page);
    R.check(Math.hypot(qm.x - q.x, qm.z - q.z) > 0.3, 'tras salir anda con normalidad', 'input', { moved: Math.hypot(qm.x - q.x, qm.z - q.z) });
    // bajar desde arriba
    await place(page, R, V(0, -9.5, 1.8), H(0, -1), 'walk', 'arriba, junto al hueco de la barandilla');
    await sleep(400); q = await lad(page);
    R.check(/BAJAR/.test(q.action), 'arriba se ofrece BAJAR ESCALERA', 'input', q);
    await recordClip(page, R, 'bajada', async () => {
      await tap(page, 'KeyE'); await sleep(1200);
      q = await lad(page); R.check(q.busy && q.ph === 'climb', 'entra en la escalera desde arriba', 'input', q);
      await holdKeys(page, ['KeyS'], 7000);   // R2: deck a 1,8 m
    });
    await sleep(600); q = await lad(page);
    R.check(!q.busy && !q.frozen && q.y < 0.1 && q.loco === 'walk', 'baja hasta el suelo y queda libre', 'input', q);
    const tr = await page.evaluate(() => window.__bk.activities.find((a) => a.id === 'ladderClimb').trace.map((r) => [r.ph, r.y]));
    let jumps = 0; for (let i = 1; i < tr.length; i++) if (Math.abs(tr[i][1] - tr[i - 1][1]) > 0.06) jumps++;
    R.check(jumps === 0, 'altura continua (ningún salto > 6 cm por paso)', 'input', { jumps, n: tr.length });
    await place(page, R, V(0, -10.9), H(0, 1), 'walk', 'pie (vista)'); await sleep(300);
    await tap(page, 'KeyE'); await holdKeys(page, ['KeyW'], 1100);
    await directShot(page, R, 'escalera_lado', V(2.2, -12.0, 1.6), V(0, -10.3, 1.2), 55);
    await directShot(page, R, 'escalera_atras', V(0.2, -13.6, 1.9), V(0, -10.3, 1.2), 55);
  } finally { await b.close(); }
});
