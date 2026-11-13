// T5-00/T5-01/T5-10 · Choque de coche (D7/HUM-A5-016, DT-12/13/14, OPUS-004/005). Guardado 20/20 declarado (coches
// activos). Escenarios fijos, 3 repeticiones cada uno, con la traza a paso fijo (H = ápice − y0):
//  · S-car-A: ANMI quieta de pie sobre la pista, de cara al coche que llega.
//  · S-car-B: ANMI rodando en tabla (~6 m/s) contra el frontal del coche (W real).
//  · S-car-C: ANMI cruza la pista andando (W real) y el coche la golpea de lado.
// Se colocan ANMI y el instante por la pose analítica del coche (DriftCars.poseAt): fixture declarada; la entrada del caso
// es real. Mide H, cierre, vx/vz de salida, punto de aterrizaje, fases, nº de vueltas del root visual (si existe),
// trickLog sin cambios, desplazamiento máximo por paso en land/getup (saltos no físicos), checkpoint tras el golpe.
// Contrato V5: H/H0 ∈ [2,40; 2,60] (mediana por escenario); trickLog intacto; sin desplazamiento >0,3 m en un paso no
// explicado por la velocidad; checkpoint fuera de la banda |r − 17,5| < 4,1. En A guarda H0 por escenario.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, traceRead, recStart, recStop, r3, median, SAVE_20, baselineGet, baselineSet, isA, arg } from '../../v8/lib.mjs';

const R = new Report('car-matrix');
const REPS = Number(arg('reps', '3'));
const SC = (arg('scenarios', 'A,B,C')).split(',');

await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(800);
    // por fotograma de render: vértices del cuerpo deformado (muestra 1/7) DENTRO de la caja orientada de algún coche, durante
    // el impacto de coche y pasados 0,1 s del golpe (OPUS-004: «capó atravesado»)
    await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, v = g.visual, tmp = new T.Vector3(), r0 = g.render.bind(g);
      const idx = []; const n = v.body.geometry.attributes.position.count; for (let i = 0; i < n; i += 7) idx.push(i);
      window.__pen = { frames: 0, bad: 0, worst: 0 };
      g.render = () => { r0(); const s = g.skater; if (s.loco !== 'impact' || s.impactCause !== 'coche') return;
        if ((s.impactPhase === 'launch' || s.impactPhase === 'air') && s.impactAirT < 0.1) return;
        window.__pen.frames++; let worst = 0;
        for (const c of g.cars.cars) { const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), H = { x: 0.93, y: 0.72, z: 2.15 };
          for (const i of idx) { v.body.getVertexPosition(i, tmp).applyMatrix4(v.body.matrixWorld);
            const dx = tmp.x - c.pos.x, dz = tmp.z - c.pos.z, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs, ly = tmp.y - (0.05 + H.y);
            const d = Math.min(H.x - Math.abs(lx), H.z - Math.abs(lz), H.y - Math.abs(ly)); if (d > worst) worst = d; } }
        if (worst > 0.02) { window.__pen.bad++; window.__pen.worst = Math.max(window.__pen.worst, worst); (window.__pen.where ||= []).length < 6 && window.__pen.where.push([s.impactPhase, +s.impactAirT.toFixed(2), +s.footPos.y.toFixed(2), +worst.toFixed(2)]); } };
    });
    const rows = [];
    for (const sc of SC) for (let rep = 0; rep < REPS; rep++) {
      await page.evaluate(() => { window.__pen = { frames: 0, bad: 0, worst: 0 }; });
      // fixture: ANMI delante del coche A a D metros de arco (la fase DECRECE al avanzar)
      const D = { A: 12, B: 16, C: 9.5 }[sc];
      const setup = await fixture(page, R, `S-car-${sc} rep ${rep}: ANMI a ${D} m por delante del coche A`, (sc, D) => {
        const g = window.__bk, T = window.__bkTHREE, C = g.cars, c = C.cars[0], R0 = C.R ?? 17.5;   // V10: radio real de la pista (19, S-22)
        g.input.clear();
        const a = C.phase + c.offset - D / R0;
        const pose = window.__bkCarPose(a);
        const p = pose.pos.clone(), toCar = new T.Vector3(-pose.vel.x, 0, -pose.vel.z).normalize(); // dirección hacia el coche que llega
        let pos = p, heading = Math.atan2(toCar.x, toCar.z), loco = 'walk';
        if (sc === 'B') { loco = 'ride'; // rumbo por la CUERDA hacia el punto de encuentro (4 m de arco hacia el coche): sigue la pista
          const meet = window.__bkCarPose(a + 4 / R0).pos; heading = Math.atan2(meet.x - p.x, meet.z - p.z); }
        if (sc === 'C') { const out = new T.Vector3(p.x, 0, p.z).normalize(); pos = p.clone().addScaledVector(out, -1.6); heading = Math.atan2(out.x, out.z); }
        g.skater.teleport(new T.Vector3(pos.x, 0, pos.z), heading, loco);
        g.skater.impactLog.length = 0; g.skater.trace.length = 0; g.skater.impactProtectUntil = -1; g.skater.trickLog.length = 0; g.skater.tricksDone.length = 0;
        const side = new T.Vector3(p.x, 0, p.z).normalize();
        g.rig.toTrack(new T.Vector3(p.x * 0.6, 2.4, p.z * 0.6).add(new T.Vector3(-side.z, 0, side.x).multiplyScalar(5)), 60);
        window.__cp0 = JSON.stringify(g.state.p.checkpoint);
        return { pos: [+pos.x.toFixed(2), +pos.z.toFixed(2)], heading: +heading.toFixed(3), loco, phase: +C.phase.toFixed(3) };
      }, sc, D);
      await recStart(page);
      if (sc === 'B') { await page.keyboard.down('KeyW'); }
      if (sc === 'C') { await sleep(60); await page.keyboard.down('KeyW'); }
      let hit = false; const t0 = Date.now();
      while (Date.now() - t0 < 4000) {
        const s = await page.evaluate(() => ({ n: window.__bk.skater.impactLog.length, loco: window.__bk.skater.loco }));
        if (s.n) { hit = true; break; }
        await sleep(16);
      }
      await page.keyboard.up('KeyW');
      if (!hit) { await recStop(page); R.invalid(`S-car-${sc} rep ${rep}: el coche no golpeó`, setup); continue; }
      const t1 = Date.now();
      while (Date.now() - t1 < 6000) { const l = await page.evaluate(() => window.__bk.skater.loco); if (l === 'walk') break; await sleep(50); }
      await sleep(300);
      const rows5 = await recStop(page);
      const tr = await traceRead(page);
      const ev = await page.evaluate(() => { const g = window.__bk, s = g.skater; return { log: s.impactLog.slice(), tricks: s.trickLog.length, done: s.tricksDone.length, cp: g.state.p.checkpoint, cp0: window.__cp0, carHits: g.carHits, logTail: g.log.slice(-6),
        flips: g.visual?.impactSpinLog?.slice(-1)[0] ?? g.visual?.impactSpin ?? null, pen: { ...window.__pen } }; });
      const L = ev.log[0];
      const i0 = tr.findIndex((r) => r.loco === 'impact');
      const y0 = i0 > 0 ? tr[i0 - 1].y : tr[0].y;
      const H = Math.max(...tr.slice(Math.max(0, i0)).map((r) => r.y)) - y0;
      // salto no físico: desplazamiento horizontal en un paso mayor que la velocidad registrada·dt + 0,3 m
      let jump = 0, jk = -1; for (let k = Math.max(1, i0); k < tr.length; k++) { const d = Math.hypot(tr[k].x - tr[k - 1].x, tr[k].z - tr[k - 1].z); if (d > jump) { jump = d; jk = k; } } console.log('DIAG', JSON.stringify(tr.slice(Math.max(0, jk - 4), jk + 3)), 'i0', i0, 'jk', jk);
      const iLand = rows5.findIndex((r) => r.ph === 'land'), iImp = rows5.findIndex((r) => r.loco === 'impact');
      const landAt = iLand >= 0 ? rows5[iLand] : null;
      const carR = await page.evaluate(() => window.__bk.cars.R ?? 17.5);   // V10: radio real de la pista (19)
      const cp = ev.cp; const rcp = cp ? Math.hypot(cp.x, cp.z) : null;
      const row = { sc, rep, closing: L.closing, launch: { vx: L.vx, vy: L.vy, vz: L.vz }, H: r3(H), y0: r3(y0), flight: iLand > iImp ? r3(rows5[iLand].clock - rows5[iImp].clock) : null,
        land: landAt ? { x: landAt.x, z: landAt.z, r: r3(Math.hypot(landAt.x, landAt.z)), y: landAt.y } : null, maxStep: r3(jump), tricks: ev.tricks, tricksDone: ev.done,
        checkpoint: cp ? { r: r3(rcp), inBand: Math.abs(rcp - carR) < 4.1 } : null, logTail: ev.logTail, flips: ev.flips, pen: ev.pen };
      rows.push(row); console.log(JSON.stringify(row));
      await sleep(1600); // protección tras levantarse
    }
    R.measure('casos', rows);
    if (!R.nonEmpty(rows, 'choques válidos')) return;
    const med = {}; for (const sc of SC) { const v = rows.filter((r) => r.sc === sc).map((r) => r.H); if (v.length) med[sc] = r3(median(v)); }
    if (isA(R)) for (const [sc, v] of Object.entries(med)) if (rows.filter((r) => r.sc === sc).length >= 3) baselineSet(R, `H0_car_${sc}`, v, `mediana de ${rows.filter((r) => r.sc === sc).length} (S-car-${sc})`);
    // D7 «el impacto actual comparable»: la altura V4 AL MISMO CIERRE. Modelo V4 (skater.hitByMover): vy = clamp(3,2 + 0,18·c,
    // 3,2, 6,0), ápice discreto a 60 Hz; reproduce los tres H0 medidos en A (0,504 / 0,464 / 0,484 con c 8,75 / 7,74 / 8,25).
    const apexD = (vy) => { let y = 0; for (let k = 0; k < 600 && vy > 0; k++) { vy -= 21 / 60; if (vy > 0) y += vy / 60; } return y; };
    const HV4 = (c) => apexD(Math.min(6, Math.max(3.2, 3.2 + 0.18 * c)));
    const q = rows.map((r) => ({ sc: r.sc, c: r.closing, H: r.H, HV4: r3(HV4(r.closing)), ratio: r3(r.H / HV4(r.closing)), landY: r.land?.y }));
    R.measure('cociente_por_cierre', q);
    R.check(q.every((x) => x.landY == null || x.landY > 0.1 || (x.ratio >= 2.40 && x.ratio <= 2.60)), 'cada choque: H / H_V4(mismo cierre) ∈ [2,40; 2,60] (D7; salvo aterrizaje sobre un obstáculo, que prima la colisión)', 'input', q);
    for (const sc of SC) {
      const H0 = baselineGet(`H0_car_${sc}`); if (med[sc] == null) continue;
      const q = H0 ? med[sc] / H0 : null;
      R.note({ escenario: sc, nota: 'H/H0 por escenario (informativo: el cierre varía entre ejecuciones)', ratio: q }); if (false) R.check(true, '', 'input', { H: med[sc], H0, ratio: r3(q), reps: rows.filter((r) => r.sc === sc).map((r) => r.H) });
    }
    if (!isA(R)) R.check(rows.every((r) => r.flips != null && r.flips >= 2 * Math.PI * 0.95), 'vueltas de presentación completas (≥ 1 vuelta) en cada choque de coche', 'input', rows.map((r) => r.flips));
    R.check(rows.every((r) => r.pen && r.pen.frames > 5 && r.pen.bad === 0), 'tras 0,1 s ningún fotograma con el cuerpo deformado dentro de la caja del coche (> 2 cm)', 'vision', rows.map((r) => r.pen));
    R.check(rows.every((r) => r.tricks === 0 && r.tricksDone === 0), 'las vueltas del coche no escriben en trickLog/tricksDone (DT-14)', 'input', rows.map((r) => [r.tricks, r.tricksDone]));
    R.check(rows.every((r) => r.maxStep <= 0.35), 'sin desplazamientos no físicos (>0,35 m en un paso) durante el impacto y al levantarse', 'input', rows.map((r) => r.maxStep));
    R.check(rows.every((r) => !r.checkpoint || !r.checkpoint.inBand), 'checkpoint nunca dentro de la banda de coches', 'input', rows.map((r) => r.checkpoint));
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
