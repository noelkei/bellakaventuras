// V10.2 · Q06 (D-06, D2-05) + Q15 + R-06a: coches a ~10,5 m/s que «culean» (derrape que oscila 13–31°, giro lento) y marcas de coches y
// tabla mejoradas: tira continua por rueda sobre su trayectoria REAL, bordes suaves (alphaMap), se desvanecen con la edad, polygonOffset; a
// toda velocidad no se reciclan antes de tiempo.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, SAVE_20 } from '../v8/lib.mjs';
const R = new Report('marcas');
await runTest(R, async () => {
  const b = await launch(); const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(1500);
  // ---- coches: velocidad y culeo (fase de la órbita, determinista) y marcas sobre la trayectoria de las ruedas traseras
  const cars = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, C = g.cars; if (!C.active) return { inactive: true };
    const speed = C.cars.map((c) => +Math.hypot(c.vel.x, c.vel.z).toFixed(3));
    const P = C.constructor; const drift = []; for (let i = 0; i < 720; i++) { const a = i / 720 * Math.PI * 2, p = P.poseAt(a); drift.push(((p.yaw - p.tangent) * 180 / Math.PI)); }
    const W = speed[0] / C.R, rate = Math.max(...drift.slice(1).map((d, i) => Math.abs(d - drift[i]) * Math.PI / 180 / (Math.PI * 2 / 720))) * W;   // (sin el salto 2π → 0: la fase del juego no da la vuelta)
    // ruedas traseras durante 4 s (cada fotograma) y las marcas que dejan
    const pts = [], up = new T.Vector3(0, 1, 0), t0 = performance.now(), mt0 = C.markT ?? 0;
    await new Promise((res) => { const loop = () => { C.cars.forEach((c, ci) => [-0.8, 0.8].forEach((sx, k) => { (pts[ci * 2 + k] ??= []).push(new T.Vector3(sx, 0, -1.35).applyAxisAngle(up, c.g.rotation.y).add(c.g.position).setY(0)); })); if (performance.now() - t0 < 4000) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    const M = C.marks, born = M.geometry.attributes.aBorn?.array, now = C.markT ?? null, m = new T.Matrix4(), q = new T.Vector3(); let far = 0, n = 0, worst = 0;
    for (let i = 0; i < M.count; i++) { if (born && now !== null && (now - born[i] > 3.8 || born[i] < mt0 + 0.1)) continue; /* solo las nacidas mientras se muestreaba */ M.getMatrixAt(i, m); q.setFromMatrixPosition(m).setY(0); n++; let best = 9; for (const L of pts) for (let j = 1; j < (L?.length ?? 0); j++) best = Math.min(best, new T.Line3(L[j - 1], L[j]).closestPointToPoint(q, true, new T.Vector3()).distanceTo(q));   /* distancia a la trayectoria (polilínea), no a los puntos */ worst = Math.max(worst, best); if (best > 0.12) { far++; const sc = new T.Vector3().setFromMatrixScale(m); (window.__t102far ??= []).push({ q: q.toArray().map((v) => +v.toFixed(2)), best: +best.toFixed(2), len: +sc.z.toFixed(2), age: born ? +(now - born[i]).toFixed(2) : null }); } }
    const mat = M.material; return { speed, dmin: Math.min(...drift), dmax: Math.max(...drift), rate, n, far, worst: +worst.toFixed(3), soft: !!mat.alphaMap, offset: !!mat.polygonOffset, aged: !!born, farList: window.__t102far ?? [] }; });
  R.measure('coches', cars);
  R.check(!cars.inactive && cars.speed.every((v) => Math.abs(v - 10.5) < 0.05), `coches a 10,5 m/s (D2-21 resuelta por el usuario → U-14 en V10.3; ${cars.speed})`, 'unit', cars.speed);
  R.check(cars.dmin >= 12 && cars.dmax <= 36 && cars.dmax - cars.dmin >= 12, `culean: derrape entre ${cars.dmin?.toFixed(1)}° y ${cars.dmax?.toFixed(1)}° (dentro de 12–36°, variación ≥ 12°)`, 'unit');
  R.check(cars.rate <= 0.6, `el culeo gira despacio (máx ${cars.rate?.toFixed(2)} rad/s, ≤ 0,6)`, 'unit');
  R.check(cars.n >= 60 && cars.far === 0, `marcas de coche sobre la trayectoria real de las ruedas (${cars.n} trozos recientes; ${cars.far} a > 12 cm, peor ${cars.worst} m)`, 'unit', cars);
  R.check(cars.soft && cars.offset && cars.aged, `marcas de coche con bordes suaves, polygonOffset y fundido por edad (${cars.soft}/${cars.offset}/${cars.aged})`, 'static');
  // ---- tabla: tira continua a toda velocidad y nada desaparece antes de 4 s
  await fixture(page, R, 'en tabla en la plaza de NMG', () => { const g = window.__bk, an = g.manifest.get('nmg.llegada'); g.skater.teleport(an.pos.clone(), an.heading, 'ride'); g.rig.snapBehind(g.skater); });
  const e0 = await page.evaluate(() => ({ e: window.__bk.skid.emitted, L: window.__bk.skid.trail?.length ?? 0, p: window.__bk.skater.footPos.toArray() }));
  await page.evaluate(() => { const s = window.__bk.skater, o = window.__t102d = { d: 0, vmax: 0, on: true }; let last = s.footPos.clone();
    const loop = () => { if (s.riding && s.grounded && Math.abs(s.speed) > 1) o.d += s.footPos.distanceTo(last); last.copy(s.footPos); o.vmax = Math.max(o.vmax, Math.abs(s.speed)); if (o.on) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  await page.keyboard.down('KeyW'); await sleep(2400); await page.keyboard.up('KeyW');
  const dist = await page.evaluate(() => { window.__t102d.on = false; return window.__t102d; });
  const sk = await page.evaluate(() => { const g = window.__bk, k = g.skid, M = k.mesh, born = M.geometry.attributes.aBorn.array, mat = M.material, now = g.clock;
    let live = 0, oldest = 0; for (let i = 0; i < M.count; i++) if (born[i] > 0 && now - born[i] < 4) { live++; oldest = Math.max(oldest, now - born[i]); }
    return { L: k.trail?.length ?? 0, e: k.emitted, n: M.count, cap: M.instanceMatrix.count, live, oldest: +oldest.toFixed(2), soft: !!mat.alphaMap, offset: !!mat.polygonOffset, step: k.trail?.o?.step ?? null }; });
  const segs = sk.e - e0.e, cover = sk.step ? (sk.L - e0.L) / 2 / Math.max(0.1, dist.d) : 0;   // longitud de tira por rueda / recorrido
  R.measure('tabla', { sk, dist, segs, cover });
  R.check(sk.step !== null && cover >= 0.85, `tabla: tira continua (los segmentos cubren el ${Math.round(cover * 100)} % de lo recorrido en tabla: ${dist.d.toFixed(1)} m a hasta ${dist.vmax.toFixed(1)} m/s)`, 'input', { segs, step: sk.step });
  R.check(sk.cap >= 2 * 12 / (sk.step ?? 0.35) * 4, `tabla: el anillo (${sk.cap}) aguanta 4 s a 12 m/s con las dos ruedas sin reciclar`, 'static', sk);
  R.check(sk.soft && sk.offset, `tabla: bordes suaves y polygonOffset (${sk.soft}/${sk.offset})`, 'static');
  await page.close(); await b.close();
}, { timeoutMs: 300000 });
