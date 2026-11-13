// T5-01/T5-04 · Dirección de marcha en el MUNDO tras aterrizajes, 180/360 y revert (OPUS-002, N5-01, DT-10).
// Base: sonda S1 (08). Casos con entrada real de teclado, 3 repeticiones: ollie adelante (control), fakie-ollie,
// kickflip en fakie, spin180 (A+F), spin360 (D+F, control) y revert (fakie lento + doble toque F).
// Aserción por caso válido: |Δ dirección mundo| ≤ 10°, |v| conservada ≥ 85 % y signo de vLong coherente con el frente
// final (tras un 180 se rueda hacia atrás; tras el revert, hacia delante). Un intento cuyo truco no se completa o que no
// despega se registra como inválido. Fixture: teleport al llano (-14,0,-2) rumbo 0 en tabla.
import { Report, runTest, launch, openGame, clickStart, sleep, place, recStart, recStop, r3, wrapDeg } from '../lib.mjs';

const R = new Report('heading-contract');
const dirDeg = (r) => Math.atan2(r.vx, r.vz) * 180 / Math.PI;
const hsp = (r) => Math.hypot(r.vx, r.vz);

await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page);
    await recStart(page); await recStop(page);
    const kb = page.keyboard;
    const CASES = {
      'ollie-adelante': { expectFront: 'same', run: async () => { await kb.down('KeyW'); await sleep(1200); await kb.up('KeyW'); await kb.press('Space'); await sleep(1500); } },
      'fakie-ollie': { expectFront: 'same', run: async () => { await kb.down('KeyS'); await sleep(1900); await kb.up('KeyS'); await kb.press('Space'); await sleep(1500); } },
      'fakie-kickflip': { expectFront: 'same', run: async () => { await kb.down('KeyS'); await sleep(1900); await kb.up('KeyS'); await kb.press('Space'); await sleep(170); await kb.down('KeyA'); await kb.press('Space'); await sleep(120); await kb.up('KeyA'); await sleep(1300); } },
      spin180: { expectFront: 'flip', trick: 'spin180', run: async () => { await kb.down('KeyW'); await sleep(1400); await kb.up('KeyW'); await kb.press('Space'); await sleep(180); await kb.down('KeyA'); await kb.press('KeyF'); await sleep(250); await kb.up('KeyA'); await sleep(1300); } },
      spin360: { expectFront: 'same', trick: 'spin360', run: async () => { await kb.down('KeyW'); await sleep(1400); await kb.up('KeyW'); await kb.press('Space'); await sleep(180); await kb.down('KeyD'); await kb.press('KeyF'); await sleep(250); await kb.up('KeyD'); await sleep(1300); } },
      revert: { expectFront: 'flip', revert: true, run: async () => { await kb.down('KeyS'); await sleep(1900); await kb.up('KeyS'); await sleep(60); await kb.press('KeyF'); await sleep(90); await kb.press('KeyF'); await sleep(900); } },
    };
    const results = [];
    for (let rep = 0; rep < 3; rep++) for (const [kind, C] of Object.entries(CASES)) {
      await place(page, R, [-14, 0, -2], 0, 'ride', kind);
      await sleep(400);
      await page.evaluate(() => { window.__bk.skater.trickLog.length = 0; window.__bk.skater.events.length = 0; });
      await recStart(page);
      await C.run();
      const rows = await recStop(page);
      const ev = await page.evaluate(() => ({ tricks: window.__bk.skater.trickLog.slice(), events: window.__bk.skater.events.map((e) => e.e) }));
      let before, after;
      if (C.revert) {
        const i0 = rows.findIndex((r) => r.loco === 'revert');
        const i1 = rows.findIndex((r, i) => i > i0 && r.loco === 'ride');
        if (i0 < 1 || i1 < 0) { R.invalid(`${kind} rep ${rep}: no hubo revert`, { events: ev.events.slice(-12) }); continue; }
        // «antes» = último fotograma del revert (el revert dura 0,34 s rodando: el coast legítimo no cuenta como pérdida)
        before = rows[i1 - 1]; after = rows[Math.min(rows.length - 1, i1 + 3)];
      } else {
        const air = rows.findIndex((r) => r.g === 0);
        let land = -1; for (let i = air + 1; i < rows.length; i++) if (rows[i].g === 1) { land = i; break; }
        if (air < 1 || land < 0) { R.invalid(`${kind} rep ${rep}: sin vuelo completo`, { air, land }); continue; }
        if (C.trick && !ev.tricks.some((t) => t.kind === C.trick && t.ok)) { R.invalid(`${kind} rep ${rep}: truco no completado`, ev.tricks); continue; }
        if (kind === 'fakie-kickflip' && !ev.tricks.some((t) => t.kind === 'kickflip' && t.ok)) { R.invalid(`${kind} rep ${rep}: kickflip no completado`, ev.tricks); continue; }
        before = rows[air - 1]; after = rows[Math.min(rows.length - 1, land + 3)];
        if (rows.slice(land).some((r) => r.loco === 'bail')) { R.invalid(`${kind} rep ${rep}: caída al aterrizar`, ev.tricks); continue; }
      }
      const dDir = wrapDeg(dirDeg(after) - dirDeg(before));
      const dFront = wrapDeg((after.h - before.h) * 180 / Math.PI);
      const keep = hsp(after) / Math.max(1e-6, hsp(before));
      const signOk = C.expectFront === 'flip' ? Math.sign(after.vl) === -Math.sign(before.vl) : Math.sign(after.vl) === Math.sign(before.vl);
      const ok = Math.abs(dDir) <= 10 && keep >= 0.85 && signOk;
      const row = { kind, rep, ok, dDirDeg: r3(dDir), dFrontDeg: r3(dFront), keep: r3(keep), before: { dir: r3(dirDeg(before)), sp: r3(hsp(before)), vl: before.vl }, after: { dir: r3(dirDeg(after)), sp: r3(hsp(after)), vl: after.vl } };
      results.push(row); console.log(JSON.stringify(row));
    }
    R.measure('cases', results);
    for (const kind of Object.keys(CASES)) {
      const rs = results.filter((r) => r.kind === kind);
      if (!rs.length) { R.nonEmpty(rs, `${kind}: intentos válidos`); continue; }
      R.check(rs.every((r) => r.ok), `${kind}: marcha mundo conservada (|Δ| ≤ 10°, |v| ≥ 85 %, signo de vLong coherente) ${rs.filter((r) => r.ok).length}/${rs.length}`, 'input',
        rs.map((r) => ({ d: r.dDirDeg, keep: r.keep, vl: [r.before.vl, r.after.vl] })));
    }
  } finally { await b.close(); }
});
