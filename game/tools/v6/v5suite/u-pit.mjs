// T5-12 · U con muro de 0,625 m y hoyo (HUM-004, DT-02). Ensayo de profundidad y aceptación:
//  1. Visibilidad de la patata secreta (rayos THREE contra la escena estática, sin la patata) desde la cámara de juego en la
//     llegada (spawn) y a 5 m hacia el corazón → debe estar OCULTA; desde puntos de vista sobre el bank/plataforma y el
//     quarter → debe ser VISIBLE desde alguno (acceso «camera»).
//  2. Salida a pie desde parado (W real) y en skate desde parado y con 4 m/s (velocidad inicial declarada).
//  3. Recogida con entrada normal: a pie (bajando por la boca) 3/3 y en skate (rodando hacia dentro) 3/3.
// Más capturas: llegada, desde el bank y dentro del hoyo.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, directShot, snap, r3 } from '../lib.mjs';

const R = new Report('u-pit');
const th = 33 * Math.PI / 180, O = [33.4 * Math.sin(th), -33.4 * Math.cos(th)], X = [Math.cos(th), Math.sin(th)], Z = [-Math.sin(th), Math.cos(th)];
const V = (x, z, h = 0) => [O[0] + X[0] * x + Z[0] * z, h, O[1] + X[1] * x + Z[1] * z];
const UC = [9.6, 6.6];                                 // centro de la U (marco NMG)
const uL = (x, z, h = 0) => { // marco local de la U (= marco NMG, mismo giro): x hacia la boca
  return V(UC[0] + x, UC[1] + z, h); };
const headTo = (a, b) => Math.atan2(b[0] - a[0], b[2] - a[2]);

await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(800);
    const depth = await page.evaluate(() => window.__bk.park.manifest.fries.find((f) => f.id === 'no_me_guillo.hidden').pos.y);
    R.measure('profundidad', -depth);
    // ---------------------------------------------------------------- 1. visibilidad
    const spawnCam = await page.evaluate(() => { const g = window.__bk, m = g.park.manifest.spawn; g.skater.teleport(m.pos, m.heading, 'walk'); g.rig.snapBehind(g.skater); g.rig.update(0.016, g.skater, null); return g.rig.cam.position.toArray(); });
    const vis = await page.evaluate((views) => {
      const g = window.__bk, T = window.__bkTHREE, fry = g.pickups.find((p) => p.id === 'no_me_guillo.hidden');
      const occ = []; g.scene.traverse((o) => { if (o.isMesh && o.visible && !/Sprite/.test(o.type)) { let p = o, isFry = false; while (p) { if (p === fry.group) isFry = true; p = p.parent; } if (!isFry && !o.isSkinnedMesh) occ.push(o); } });
      const pts = [0.25, 0.1, -0.05].map((dy) => fry.base.clone().add(new T.Vector3(0, dy, 0)));   // parte alta, centro, base
      const rc = new T.Raycaster(); const out = {};
      for (const [name, eye] of Object.entries(views)) {
        const E = new T.Vector3(...eye); let seen = 0;
        for (const p of pts) { const d = p.clone().sub(E), L = d.length(); rc.set(E, d.normalize()); rc.far = L - 0.02; const h = rc.intersectObjects(occ, false)[0]; if (!h) seen++; }
        out[name] = seen;
      }
      return { fryTop: +(fry.base.y + 0.25).toFixed(3), out };
    }, {
      'llegada (cámara de juego)': spawnCam,
      'llegada a 5 m': [spawnCam[0] + X[0] * 5, spawnCam[1], spawnCam[2] + X[1] * 5],
      'bank: ANMI de pie en la plataforma (ojos)': V(2.6, 1.0, 0.6 + 1.6), 'bank: cámara de juego detrás (3,2 m)': V(0.5, -1.0, 3.2),
      'plataforma esquina U (ojos)': V(2.9, 2.0, 0.6 + 1.6),
      'quarter: deck (ojos)': V(12.5, 5.0, 1.5 + 1.6), 'cerca de la boca (ojos)': uL(3.4, 0, 1.6),
      // cámara de juego orbitada alta (pitch 45–60°, distancia 5,4) con ANMI en el borde de la plataforma/bank mirando a la U
      'bank: cámara orbitada pitch 45°': (() => { const a = V(2.6, 1.6, 0.6 + 1.15), d = 5.4, p = 45 * Math.PI / 180, dir = [V(9.6, 6.6)[0] - a[0], V(9.6, 6.6)[2] - a[2]], L = Math.hypot(...dir); return [a[0] - dir[0] / L * d * Math.cos(p), a[1] + d * Math.sin(p), a[2] - dir[1] / L * d * Math.cos(p)]; })(),
      'bank: cámara orbitada pitch 60°': (() => { const a = V(2.6, 1.6, 0.6 + 1.15), d = 5.4, p = 60 * Math.PI / 180, dir = [V(9.6, 6.6)[0] - a[0], V(9.6, 6.6)[2] - a[2]], L = Math.hypot(...dir); return [a[0] - dir[0] / L * d * Math.cos(p), a[1] + d * Math.sin(p), a[2] - dir[1] / L * d * Math.cos(p)]; })(),
    });
    R.measure('visibilidad', vis); console.log(JSON.stringify(vis));
    const v = vis.out;
    R.check(vis.fryTop < 0, `la parte alta de la patata queda bajo el nivel del suelo (${vis.fryTop})`, 'unit', vis);
    R.check(v['llegada (cámara de juego)'] === 0 && v['llegada a 5 m'] === 0, 'oculta desde la llegada (cámara de juego y a 5 m)', 'vision', v);
    R.check(Object.entries(v).some(([k, n]) => /bank|plataforma|quarter/.test(k) && n > 0), 'visible desde el bank/plataforma o el quarter (acceso «camera»)', 'vision', v);
    // ---------------------------------------------------------------- 2. salida
    const exits = [];
    for (const [loco, v0, tag] of [['walk', 0, 'a pie parado'], ['ride', 0, 'skate parado'], ['ride', 4, 'skate 4 m/s']]) {
      for (let rep = 0; rep < 2; rep++) {
        const start = uL(-0.9, 0, -(-depth) ), hd = headTo(uL(-0.9, 0), uL(3, 0));
        await fixture(page, R, `fondo del hoyo (${tag})`, (p, h, loco, v0) => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); g.skater.teleport(new T.Vector3(p[0], p[1], p[2]), h, loco); if (v0) g.skater.vel.set(Math.sin(h) * v0, 0, Math.cos(h) * v0); g.rig.snapBehind(g.skater); return {}; }, [start[0], depth, start[2]], hd, loco, v0);
        await sleep(300); await page.keyboard.down('KeyW'); await sleep(3500); await page.keyboard.up('KeyW'); await sleep(200);
        const s = await snap(page);
        const out = s.y > -0.05; exits.push({ tag, rep, out, endY: s.y });
      }
    }
    R.measure('salida', exits); console.log(JSON.stringify(exits));
    for (const tag of ['a pie parado', 'skate parado', 'skate 4 m/s']) { const e = exits.filter((x) => x.tag === tag); R.check(e.every((x) => x.out), `sale del hoyo: ${tag} (${e.filter((x) => x.out).length}/${e.length})`, 'input', e); }
    // ---------------------------------------------------------------- 3. recogida (entrada normal desde fuera, por la boca)
    const picks = [];
    for (const loco of ['walk', 'ride']) for (let rep = 0; rep < 3; rep++) {
      // la patata se repone en memoria entre intentos (fixture declarada): se reinicia la página solo si se recogió
      await page.evaluate(() => { const g = window.__bk; const p = g.pickups.find((q) => q.id === 'no_me_guillo.hidden'); if (p.collected) { p.collected = false; g.state.p.collected = g.state.p.collected.filter((x) => x !== p.id); g.scene.add(p.group); } });
      const start = uL(5.5, 0), hd = headTo(start, uL(-1, 0));
      await fixture(page, R, `fuera de la boca de la U, hacia dentro (${loco})`, (p, h, loco) => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); g.skater.teleport(new T.Vector3(p[0], 0, p[2]), h, loco); g.rig.snapBehind(g.skater); return {}; }, start, hd, loco);
      await sleep(300); await page.keyboard.down('KeyW');
      let got = false; const t0 = Date.now();
      while (Date.now() - t0 < 4000) { got = await page.evaluate(() => window.__bk.state.isCollected('no_me_guillo.hidden')); if (got) break; await sleep(50); }
      await page.keyboard.up('KeyW'); await sleep(300);
      picks.push({ loco, rep, got });
    }
    R.measure('recogida', picks); console.log(JSON.stringify(picks));
    for (const loco of ['walk', 'ride']) { const p = picks.filter((x) => x.loco === loco); R.check(p.every((x) => x.got), `recoge la patata del hoyo (${loco === 'walk' ? 'a pie' : 'en skate'}) ${p.filter((x) => x.got).length}/3`, 'input', p); }
    // ---------------------------------------------------------------- capturas
    await directShot(page, R, 'u_llegada', spawnCam, uL(0, 0, 0), 60);
    await directShot(page, R, 'u_desde_plataforma', V(2.9, 2.0, 2.2), uL(0, 0, -0.3), 55);
    await directShot(page, R, 'u_cenital', uL(2.5, 2.5, 4.5), uL(0, 0, -0.4), 60);
    await directShot(page, R, 'u_boca', uL(4.5, 1.2, 1.4), uL(0, 0, -0.3), 60);
    R.pendingHuman('Par con las referencias 01/02 (U hundida y boca) — revisión visual');
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
