// T5-00/T5-01/T5-09 · Impactos ordinarios contra caras sólidas (D6, DT-11, SOL-004, OPUS-003, N5-03).
// Entrada real: carrerilla con W en línea recta hacia la cara, suelta W al alcanzar la velocidad objetivo y rueda hasta
// la cara. Caras (localizadas por collider, con 18 m de carrerilla libre): cajón NMG (nmg_block), muro YY (yy_wall).
// Por intento: ruta (impacto o retenido por el rayo nose/tail), cierre normal registrado (impactLog), ápice − y0, tiempo
// de vuelo, distancia al primer contacto, deslizamiento y tiempo hasta volver a andar. Intento que no llega a la cara a la
// velocidad pedida = inválido.
// Contrato V5: (1) frontal con cierre ≥ 8,5 → estrella en todos los intentos válidos (V4: aleatorio, la ruta del rayo lo
// impide); (2) D6: ápice/caída ≤ C_ref = A ±3 %; cierres > C_ref → ápice ≤ máx(A_ord) +3 %; (3) cierre < 8,5 sin estrella.
// En A guarda C_ref (máx. cierre ordinario alcanzable) y la tabla A_ord.
// Uso: --speeds 8.6,9.0,9.25 --angles 0,30 --tries 3 --faces nmg_block,yy_wall
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, findFaces, traceRead, recStart, recStop, r3, median, arg, baselineGet, baselineSet, isA } from '../lib.mjs';

const R = new Report('impact-matrix');
const SPEEDS = arg('speeds', '8.6,9.0,9.25').split(',').map(Number);
const ANGLES = arg('angles', '0,30').split(',').map(Number);
const TRIES = Number(arg('tries', '3'));
const FACES = arg('faces', 'nmg_block,yy_wall').split(',');
const RUNWAY = Number(arg('runway', '18'));
const VFIX = process.argv.includes('--vfix');   // fixture: arranca YA rodando a la velocidad objetivo a 8 m de la cara
const G = 21;

await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page);
    const faces = await findFaces(page, FACES, { runway: RUNWAY, minWidth: 1.5, minTop: 0.85, maxPer: 1 });
    R.measure('caras', faces);
    if (!R.nonEmpty(faces, 'caras con carrerilla')) return;
    const rows = [];
    for (const f of faces) for (const angle of ANGLES) for (const v of SPEEDS) for (let rep = 0; rep < TRIES; rep++) {
      const a = angle * Math.PI / 180;
      // dirección hacia la cara (−n girada `angle`) y salida a 17 m de la cara sobre esa línea
      const ux = -(f.n[0] * Math.cos(a) - f.n[1] * Math.sin(a)), uz = -(f.n[0] * Math.sin(a) + f.n[1] * Math.cos(a));
      const run = RUNWAY - 1;
      const st = [f.face[0] - ux * run, f.face[1] - uz * run];
      const st2 = VFIX ? [f.face[0] - ux * 8, f.face[1] - uz * 8] : st;
      await fixture(page, R, VFIX ? `velocidad inicial declarada ${v} m/s a 8 m de ${f.name} ${angle}°` : `carrerilla hacia ${f.name} ${angle}° objetivo ${v} m/s`, (st, h, vf) => {
        const g = window.__bk, T = window.__bkTHREE; g.input.clear();
        g.skater.teleport(new T.Vector3(st[0], 0, st[1]), h, 'ride'); g.rig.snapBehind(g.skater);
        if (vf) g.skater.vel.set(Math.sin(h) * vf, 0, Math.cos(h) * vf);
        g.skater.impactLog.length = 0; g.skater.trace.length = 0; g.skater.impactProtectUntil = -1; g.skater.events.length = 0; return { st, h, vf };
      }, st2, Math.atan2(ux, uz), VFIX ? v : 0);
      if (!VFIX) await sleep(400); await recStart(page);
      await page.keyboard.down('KeyW');
      let released = false, vRel = null; const t0 = Date.now();
      while (Date.now() - t0 < 12000) {
        const s = await page.evaluate(() => { const s = window.__bk.skater; return { v: Math.hypot(s.vel.x, s.vel.z), loco: s.loco, n: s.impactLog.length }; });
        if (!released && s.v >= v) { await page.keyboard.up('KeyW'); released = true; vRel = s.v; }
        if (s.loco === 'impact' || s.n) break;
        await sleep(16);
      }
      if (!released) await page.keyboard.up('KeyW');
      // esperar a que termine el impacto (o un rato si no hubo)
      const t1 = Date.now(); let hit = false;
      while (Date.now() - t1 < 4500) { const s = await page.evaluate(() => ({ loco: window.__bk.skater.loco, n: window.__bk.skater.impactLog.length })); if (s.n) hit = true; if (hit && s.loco === 'walk') break; if (!hit && Date.now() - t1 > 1500) break; await sleep(50); }
      const rows5 = await recStop(page);
      const tr = await traceRead(page);
      const ev = await page.evaluate(() => ({ log: window.__bk.skater.impactLog.slice(), last: window.__bk.skater.events.slice(-14).map((e) => e.e), bumps: window.__bk.skater.events.filter((e) => /^bump:/.test(e.e)).map((e) => e.e) }));
      const dn = (r) => (r.x - f.face[0]) * f.n[0] + (r.z - f.face[1]) * f.n[1];
      const minDn = Math.min(...rows5.map(dn));
      const vAt = rows5.filter((r) => dn(r) < 1.2 && r.loco === 'ride').map((r) => Math.hypot(r.vx, r.vz));
      const vFace = vAt.length ? Math.max(...vAt) : null;
      if (!ev.log.length) {
        const row = { face: f.name, angle, vTarget: v, rep, hit: false, vRel: r3(vRel), vFace: r3(vFace), minDn: r3(minDn), closingEst: vFace ? r3(vFace * Math.cos(a)) : null, bumps: ev.bumps };
        if (minDn > 0.5 || !released) { R.invalid(`${f.name} ${angle}° ${v}: no llega a la cara a la velocidad pedida`, row); continue; }
        rows.push(row); console.log(JSON.stringify(row)); continue;
      }
      const L = ev.log[0];
      const i0 = tr.findIndex((r) => r.loco === 'impact');
      if (i0 < 1) { R.invalid(`${f.name} ${angle}° ${v}: el impacto no quedó dentro de la traza registrada`, { closing: L.closing }); continue; }
      const y0 = i0 > 0 ? tr[i0 - 1].y : tr[0].y;
      // ápice SOLO del vuelo del impacto (de la salida al primer apoyo), no de lo que pase después
      const imp = []; for (let k = i0; k < tr.length && tr[k].loco === 'impact'; k++) { if (k > i0 + 2 && tr[k].g === 1) break; imp.push(tr[k]); }
      const apex = Math.max(...imp.map((r) => r.y)) - y0;
      const iLand = rows5.findIndex((r) => r.ph === 'land'), iImp = rows5.findIndex((r) => r.loco === 'impact'), iUp = rows5.findIndex((r) => r.ph === 'getup'), iWalk = rows5.findIndex((r, k) => k > iImp && r.loco === 'walk');
      const dXZ = (p, q) => (p && q ? Math.hypot(p.x - q.x, p.z - q.z) : null);
      const row = { face: f.name, angle, vTarget: v, rep, hit: true, closing: L.closing, launch: { vx: L.vx, vy: L.vy, vz: L.vz }, apex: r3(apex), vRel: r3(vRel), vFace: r3(vFace),
        flight: iLand > iImp ? r3(rows5[iLand].clock - rows5[iImp].clock) : null, dAir: r3(dXZ(rows5[iImp], rows5[iLand])), slide: r3(dXZ(rows5[iLand], rows5[iUp])),
        tToWalk: iWalk > 0 ? r3(rows5[iWalk].clock - rows5[iImp].clock) : null, src: L.src ?? null, closingRaw: L.closingRaw ?? L.closing };
      rows.push(row); console.log(JSON.stringify(row));
    }
    R.measure('intentos', rows);
    const hits = rows.filter((r) => r.hit);
    const ord = hits.filter((r) => r.closing <= (baselineGet('C_ref') ?? 99));
    // ---------------------------------------------------------------- medidas A
    if (isA(R) && hits.length) {
      const cref = Math.max(...hits.map((r) => r.closing), baselineGet('speed_vmax') ?? 0);
      baselineSet(R, 'C_ref', r3(Math.min(cref, baselineGet('speed_vmax') ?? cref)), 'cierre ordinario máximo alcanzable en V4 en llano = |v| máxima con empuje (speed-matrix); los impactos medidos no lo superan');
      baselineSet(R, 'A_ord', hits.map((r) => ({ closing: r.closing, apex: r.apex, flight: r.flight, dAir: r.dAir, slide: r.slide, tToWalk: r.tToWalk, face: r.face, angle: r.angle })), 'impactos ordinarios reales en V4');
      // modelo V4 (skater.ts:518–519 + startImpact): vy = clamp(3,2 + 0,12·c, 3,2, 6,0); ápice ≈ vy²/2g
      baselineSet(R, 'A_ord_model', { vy: 'clamp(3.2 + 0.12·c, 3.2, 6.0)', apex: 'vy²/(2·21)', check: hits.map((r) => ({ c: r.closing, apex: r.apex, modelDiscreto: r3((() => { let y = 0, vy = 3.2 + 0.12 * r.closing; for (let k = 0; k < 400 && vy > 0; k++) { vy -= G / 60; if (vy > 0) y += vy / 60; } return y; })()) })) }, 'ápice teórico frente a medido');
    }
    // ---------------------------------------------------------------- contrato
    const front = rows.filter((r) => r.angle === 0 && (r.closing ?? r.closingEst ?? 0) >= 8.5);
    R.check(front.length > 0 && front.every((r) => r.hit), `frontal con cierre ≥ 8,5 m/s → estrella en todos los intentos válidos (${front.filter((r) => r.hit).length}/${front.length})`, 'input', front.map((r) => ({ f: r.face, v: r.vFace, hit: r.hit, minDn: r.minDn })));
    // ápice DISCRETO del paso fijo (semi-implícito: vy -= g·dt antes de mover): Σ max(0, vy0 − k·g·dt)·dt, k ≥ 1 ≈ vy0²/2g − vy0·dt/2
    const apexD = (vy0) => { let y = 0, vy = vy0; for (let k = 0; k < 400 && vy > 0; k++) { vy -= G / 60; if (vy > 0) y += vy / 60; } return y; };
    const Cref = baselineGet('C_ref_cierre_medido') ?? baselineGet('C_ref'), model = (c) => apexD(Math.min(6.0, 3.2 + 0.12 * Math.min(c, Cref ?? c)));
    const d6 = hits.map((r) => ({ c: r.closing, apex: r.apex, ref: r3(model(r.closing)), ok: Math.abs(r.apex / model(r.closing) - 1) <= 0.03 }));
    R.check(hits.length > 0 && d6.every((x) => x.ok), `D6: ápice = V4(min(cierre, C_ref)) ±3 % (${d6.filter((x) => x.ok).length}/${d6.length})`, 'input', d6);
    const below = rows.filter((r) => (r.closing ?? r.closingEst ?? 99) < 8.5);
    if (below.length) R.check(below.every((r) => !r.hit), 'cierre < 8,5 sin estrella', 'input', below.map((r) => ({ c: r.closing ?? r.closingEst, hit: r.hit })));
    // D6 a alta velocidad: ningún ápice ordinario por encima del máximo de A_ord + 3 %
    const Aord = baselineGet('A_ord') ?? []; const aMax = Aord.length ? Math.max(...Aord.map((x) => x.apex)) : null;
    if (aMax && hits.some((r) => (r.vFace ?? 0) > 9.4)) R.check(hits.every((r) => r.apex <= aMax * 1.03), `D6: ningún impacto ordinario (hasta 20 m/s) supera el ápice máximo de A (${aMax}) + 3 %`, 'input', hits.map((r) => ({ v: r.vFace, c: r.closingRaw ?? r.closing, apex: r.apex })));
    // contacto intermedio (OPUS-003): cierre estimado 4,5–8,5 en la ruta que toca la cara → reacción registrada sin estrella
    const mid = rows.filter((r) => !r.hit && r.closingEst >= 5 && r.closingEst < 8.3 && r.minDn <= 0.45);
    if (mid.length && !isA(R)) R.check(mid.every((r) => r.bumps?.length), `contacto intermedio: reacción (bump) sin estrella (${mid.filter((r) => r.bumps?.length).length}/${mid.length})`, 'input', mid.map((r) => ({ c: r.closingEst, bumps: r.bumps })));
  } finally { await b.close(); }
}, { timeoutMs: 1500000 });
