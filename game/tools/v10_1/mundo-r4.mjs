// V10.1 R4 · guardián del mundo: P17 (marcas de ruedas: aparecen rodando, ~0,4 m, se desvanecen en 4 s, nada a pie ni en el aire, también en
// rampa), R5 (marcas de los coches a su ritmo), P24 (música: 1 dentro, 0 desde r 45, monótona; aviso una vez por salida; ambiente fuera),
// P26 (los dos coches de SN con el mismo fucsia del modelo: color medido en pantalla).
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, SAVE_20 } from '../v8/lib.mjs';
const R = new Report('mundo-r4-v10-1');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(1500);
    // ---------------------------------------------------------------- P17 · marcas
    await fixture(page, R, 'P17: en tabla en la plaza de NMG, W 2 s', () => { const g = window.__bk, an = g.manifest.get('nmg.llegada'); g.skater.teleport(an.pos.clone(), an.heading, 'ride'); g.rig.snapBehind(g.skater); });
    const m0 = await page.evaluate(() => window.__bk.skid.emitted);
    await page.keyboard.down('KeyW'); await sleep(2000); await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyS'); for (let i = 0; i < 40 && await page.evaluate(() => Math.abs(window.__bk.skater.speed) > 0.3); i++) await sleep(50); await page.keyboard.up('KeyS'); await sleep(150);   // parada (sin más marcas)
    const m1 = await page.evaluate(() => { const g = window.__bk, sk = g.skid; return { n: sk.emitted, len: sk.mesh.geometry.parameters?.height ?? 0.4, born: Array.from(sk.mesh.geometry.attributes.aBorn.array).filter((t) => t > 0).length, t: g.clock }; });
    R.check(m1.n - m0 >= 8, `P17 · rodando en tabla deja marcas (${m1.n - m0} huellas en 2 s)`, 'input', m1);
    await sleep(4300);
    const fade = await page.evaluate(() => { const g = window.__bk, sk = g.skid, A = sk.mesh.geometry.attributes.aBorn.array, now = g.clock; let alive = 0; for (const t of A) if (t > 0 && now - t < 4) alive++; return { alive, now }; });
    R.check(fade.alive === 0, 'P17 · en 4 s se desvanecen del todo', 'static', fade);
    await fixture(page, R, 'P17: a pie andando 2 s', () => { const g = window.__bk, an = g.manifest.get('nmg.llegada'); g.skater.teleport(an.pos.clone(), an.heading, 'walk'); });
    const w0 = await page.evaluate(() => window.__bk.skid.emitted); await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
    const w1 = await page.evaluate(() => window.__bk.skid.emitted);
    R.check(w1 === w0, 'P17 · a pie no hay marcas', 'input', { w0, w1 });
    // en rampa: la marca se orienta a la superficie (normal de la instancia ≈ normal del suelo)
    const ramp = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, s = g.skater, an = g.manifest.get('nmg.llegada');
      // V10.2 Q15 (cambio de diseño aprobado: tira continua; copia previa en V10/backups/pruebas/V10_2-R5): dos puntos seguidos dejan un trozo
      const sk = g.skid; sk.update(g.clock, false, new T.Vector3(0, 1, 0), 0, new T.Vector3(0, 0.8, 0.6)); sk.update(g.clock, true, new T.Vector3(0, 1, 0), 0, new T.Vector3(0, 0.8, 0.6)); sk.update(g.clock, true, new T.Vector3(0, 1.48, 0.36), 0, new T.Vector3(0, 0.8, 0.6));
      const N = sk.mesh.instanceMatrix.count, M = new T.Matrix4(); sk.mesh.getMatrixAt((sk.trail.i - 1 + N) % N, M);
      const n = new T.Vector3(0, 1, 0).transformDirection(M); void s; void an; return { ny: +n.y.toFixed(2), nz: +n.z.toFixed(2) }; });
    R.check(Math.abs(ramp.ny - 0.8) < 0.05 && Math.abs(ramp.nz - 0.6) < 0.05, 'P17 · en rampa la marca se apoya en la superficie (normal del suelo)', 'unit', ramp);
    // ---------------------------------------------------------------- R5 · marcas de coches: una tanda cada 0,24 s (no el doble con dos coches)
    // V10.2 Q15 (cambio de diseño aprobado, copia previa en V10/backups/pruebas/V10_2-R5): marcas en tira, un trozo por rueda cada `step` m; el
    // criterio de R5 (cada coche a su ritmo, no el doble con dos coches) = metros de marca por rueda y segundo ≈ su velocidad
    const cars = await page.evaluate(async () => { const g = window.__bk, C = g.cars, T = C.trail ?? C['trail']; const e0 = T.length; const t0 = performance.now(); await new Promise((r) => setTimeout(r, 2400)); const dt = (performance.now() - t0) / 1000, v = Math.hypot(C.cars[0].vel.x, C.cars[0].vel.z);
      return { per: +(((T.length - e0) / 4 / dt) / v).toFixed(2) }; });
    R.check(cars.per > 0.75 && cars.per < 1.25, `R5 · cada rueda trasera deja su marca a su ritmo (${cars.per} × su velocidad; el doble sería 2)`, 'static', cars);
    // ---------------------------------------------------------------- P24 · música fuera del parque
    const mus = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, out = [];
      for (const r of [38, 41, 42.5, 43.5, 44.5, 45.5, 50, 56]) { const a = -Math.PI / 4; g.skater.teleport(new T.Vector3(Math.sin(a) * r, 0, -Math.cos(a) * r), 0, 'walk'); await new Promise((q) => setTimeout(q, 900));
        out.push({ r, f: +g.musicOutside.toFixed(3), amb: +(g.audio.ambLevel ?? 0).toFixed(3), toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent }); }
      return out; });
    R.measure('musica', mus);
    const mono = mus.every((m, i) => i === 0 || m.f <= mus[i - 1].f + 1e-6);
    R.check(mus.find((m) => m.r === 41).f === 1 && mus.find((m) => m.r === 45.5).f === 0 && mono, 'P24 · la música suena entera dentro (r ≤ 42), se apaga poco a poco y calla desde r 45', 'static', mus);
    R.check(mus.find((m) => m.r === 50).amb > 0.9 && mus.find((m) => m.r === 38).amb < 0.05, 'P24 · fuera suena el ambiente (y dentro no)', 'static', mus);
    const warns = mus.filter((m) => /Vuelve al parque/.test(m.toast)).length;
    R.check(warns >= 1, 'P24 · al salir aparece «Vuelve al parque para seguir escuchando la música»', 'static', mus.map((m) => m.toast));
    // una vez por salida: quedarse fuera no lo repite; volver dentro y salir otra vez sí
    const again = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, seen = [];
      const at = async (r) => { g.skater.teleport(new T.Vector3(Math.sin(-Math.PI / 4) * r, 0, -Math.cos(-Math.PI / 4) * r), 0, 'walk'); await new Promise((q) => setTimeout(q, 700)); };
      const watch = () => { const t = document.getElementById('toast'); return !t.hidden && /Vuelve al parque/.test(t.textContent); };
      document.getElementById('toast').hidden = true; await at(52); seen.push(watch()); document.getElementById('toast').hidden = true; await at(54); seen.push(watch()); await at(36); document.getElementById('toast').hidden = true; await at(50); seen.push(watch()); return seen; });
    R.check(again[0] === false && again[1] === false && again[2] === true, 'P24 · el aviso sale una vez por salida (fuera no se repite; al volver a salir, otra vez)', 'input', again);
    // ---------------------------------------------------------------- P26 · los dos coches del mismo fucsia, medido en pantalla
    const col = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, cam = g.rig.cam, out = [];
      // (fixture de la captura: cada coche se pone en el MISMO sitio y rumbo del coche A —misma luz— y se mide la misma vista)
      g.autoMode = true; const P0 = g.cars.cars[0].g.position.clone(), Y0 = g.cars.cars[0].g.rotation.y, saved = g.cars.cars.map((c) => [c.g.position.clone(), c.g.rotation.y, c.g.visible]);
      for (const c of g.cars.cars) { let best = { n: 0, med: null }; for (const o of g.cars.cars) o.g.visible = o === c; c.g.position.copy(P0); c.g.rotation.y = Y0; c.g.updateMatrixWorld(true);
        for (const side of [-1]) { const p = c.g.position.clone(); cam.position.copy(p).add(new T.Vector3(0, 2.2, 0)).addScaledVector(new T.Vector3(p.x, 0, p.z).normalize(), 5 * side); cam.lookAt(p.clone().add(new T.Vector3(0, 0.7, 0))); cam.updateMatrixWorld();
          g.renderer.render(g.scene, cam); const cv = document.getElementById('game'), gl = g.renderer.getContext(), W = cv.width, H = cv.height, px = new Uint8Array(4 * 40 * 40); gl.readPixels((W >> 1) - 20, (H >> 1) - 20, 40, 40, gl.RGBA, gl.UNSIGNED_BYTE, px);
          const pink = []; for (let i = 0; i < px.length; i += 4) { const r = px[i], gg = px[i + 1], bb = px[i + 2]; if (r - gg > 40 && r > 120) pink.push([r, gg, bb]); }
          pink.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]); if (pink.length > best.n) best = { n: pink.length, med: pink[pink.length >> 1], side }; }
        out.push(best); }
      g.cars.cars.forEach((c, i) => { c.g.position.copy(saved[i][0]); c.g.rotation.y = saved[i][1]; c.g.visible = saved[i][2]; });
      g.autoMode = false; return out; });
    R.measure('coches', col);
    const d = col.length === 2 && col[0].med && col[1].med ? Math.hypot(col[0].med[0] - col[1].med[0], col[0].med[1] - col[1].med[1], col[0].med[2] - col[1].med[2]) : 999;
    R.check(d < 18, `P26 · los dos coches con el mismo fucsia en pantalla (diferencia ${d.toFixed(1)} en RGB)`, 'vision', col);
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
