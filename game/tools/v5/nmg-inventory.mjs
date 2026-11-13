// T5-25 · Inventario visual NMG (HUM-A5-011, SOL-002/003, OPUS-013…017). Capturas con cámara directa declarada (HUD oculto,
// mismo render del juego) para pares con las referencias y fichas por objeto y cara:
//  · generales APROXIMADAS a las finales 01/02/03: la referencia no es proyección de la geometría actual (V4 MAP-02/NMG-02:
//    mapa compactado, cluster replanteado y espejado); azimut elegido por similitud de disposición (camsweep.mjs, RMS
//    declarado en el informe), pitch/FOV aproximados del prompt; + planta cenital (frente al mapa 05);
//  · cámara de juego real: llegada (snapBehind en el spawn) y charla con Pantera (cámara de actividad);
//  · fichas: corazón y bordillo (frente/trasera/izq/der/arriba, como la guía de pieza 01), plataforma+escalera+bank (las
//    cuatro caras, ¾ y arriba, como la pieza 02), U (exterior, boca, interior/fondo), quarter (frente, lateral, coping),
//    cajones, bordillo largo, banco, suelo y paseo de cerca, lecho y rosetas, palmera, árbol, farola, radiocasete, cartel.
// Todas las posiciones se leen del juego (anclas, slots y mallas); el marco del cluster es el de nmg.ts.
import { Report, runTest, launch, openGame, clickStart, sleep, directShot, fixture, SAVE_20 } from './lib.mjs';
const R = new Report('nmg-inventory');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { viewport: { width: 1200, height: 800 }, save: { ...SAVE_20, activities: { ...SAVE_20.activities, pantherTalk: false }, collected: SAVE_20.collected.filter((x) => x !== 'no_me_guillo.activity') } });
    await clickStart(page); await sleep(2500);
    const W = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, P = g.park, out = { slots: {}, signs: [], lamps: [], trees: [], palms: [] };
      P.root.traverse((o) => { if (/_slot$/.test(o.name)) { const p = o.getWorldPosition(new T.Vector3()); (out.slots[o.name.replace(/^nmg_|_slot$/g, '')] ??= []).push([p.x, p.y, p.z]); } });
      for (const m of P.signs) { const p = m.getWorldPosition(new T.Vector3()); out.signs.push([p.x, p.y, p.z, m.name]); }
      g.world.forEachCollider((c) => { const n = P.colliderName(c.handle), t = c.translation(); if (n === 'palm_trunk') out.palms.push([t.x, t.y, t.z]); if (/lamp/.test(n)) out.lamps.push([t.x, t.y, t.z]); if (/tree/.test(n)) out.trees.push([t.x, t.y, t.z]); });
      const a = (k) => { const v = g.manifest.get(k); return [v.pos.x, v.pos.y, v.pos.z, v.heading]; };
      out.spawn = [P.manifest.spawn.pos.x, P.manifest.spawn.pos.y, P.manifest.spawn.pos.z]; out.cassette = P.manifest.cassettes.filter((c) => c.zone === 'no_me_guillo').map((c) => [c.pos.x, c.pos.y, c.pos.z])[0];
      out.anch = { heart: a('nmg.heart'), u: a('nmg.u'), quarter: a('nmg.quarter'), platform: a('nmg.platform') };
      return out; });
    R.measure('mundo', W);
    // marco del cluster (nmg.ts: origen r 33,4 θ 33°, X = tangente horaria, Z = hacia el centro)
    const th = 33 * Math.PI / 180, X = [Math.cos(th), Math.sin(th)], Z = [-Math.sin(th), Math.cos(th)];
    const off = (p, x, z, h) => [p[0] + X[0] * x + Z[0] * z, h, p[2] + X[1] * x + Z[1] * z];
    const S = W.slots, at = (n) => S[n]?.[0];
    const near = (list, p) => list.slice().sort((a, b) => Math.hypot(a[0] - p[0], a[2] - p[2]) - Math.hypot(b[0] - p[0], b[2] - p[2]))[0];
    const plat = at('platform'), heart = at('heart'), u = at('u'), q = at('quarter'), bs = at('box_small'), bm = at('box_medium'), ll = at('ledge_long'), bench = at('bench'), cen = [17.17, 0.3, -27.94];
    const nmgSign = W.signs.length ? near(W.signs, plat) : null;
    const shots = [
      // generales aproximadas (camsweep: azimut sin espejo; RMS de disposición 01 16,4 % · 02 20,2 % · 03 21,2 %)
      ['g01_general_elevada_aprox', [2.24, 21.73, -17.18], cen, 62],
      ['g02_conjunto_aprox', [2.42, 16.36, -10.37], cen, 60],
      ['g03_llegada_aprox', [5.7, 16.36, -8.08], cen, 55],
      ['g05_planta_cenital', [22.0, 60, -30.0 + 0.02], [22.0, 0, -30.0], 70],   // norte (−z) arriba: cámara 2 cm al sur del centro del sector (r≈34, θ≈36°)
      // corazón + bordillo (frente = −X del marco, hacia la llegada)
      ['p01_corazon_frente', off(heart, -4.2, 0, 0.7), off(heart, 0, 0, 0.5), 42], ['p01_corazon_trasera', off(heart, 4.2, 0, 0.7), off(heart, 0, 0, 0.5), 42],
      ['p01_corazon_izquierda', off(heart, 0, -4.2, 0.7), off(heart, 0, 0, 0.5), 42], ['p01_corazon_derecha', off(heart, 0, 4.2, 0.7), off(heart, 0, 0, 0.5), 42],
      ['p01_corazon_arriba', off(heart, -0.01, 0, 5.5), off(heart, 0, 0, 0.5), 42],
      // plataforma + escalera + bank
      ['p02_plataforma_frente', off(plat, -8, 0, 1.6), off(plat, 0, 0, 0.3), 55], ['p02_plataforma_trasera', off(plat, 8, 0, 1.6), off(plat, 0, 0, 0.3), 55],
      ['p02_plataforma_izquierda', off(plat, 0, -8, 1.6), off(plat, 0, 0, 0.3), 55], ['p02_plataforma_derecha', off(plat, 0, 8, 1.6), off(plat, 0, 0, 0.3), 55],
      ['p02_plataforma_tres_cuartos', off(plat, -6, -6, 3.5), off(plat, 0, 0, 0.3), 55], ['p02_plataforma_arriba', off(plat, -0.01, 0, 11), off(plat, 0, 0, 0), 55],
      // U
      ['p03_u_exterior', off(u, 0, -5, 1.4), off(u, 0, 0, 0.3), 55], ['p03_u_boca', off(u, -5, 0, 1.6), off(u, 0, 0, 0), 55],
      ['p03_u_interior_fondo', off(u, -0.6, 0, 3.2), off(u, 0.3, 0, -0.45), 60], ['p03_u_trasera', off(u, 5, 0, 1.4), off(u, 0, 0, 0.3), 55],
      // quarter
      ['p04_quarter_frente', off(q, -7, 0, 1.4), off(q, 0, 0, 0.6), 55], ['p04_quarter_lateral', off(q, 0, -7, 1.0), off(q, 0, 0, 0.6), 55],
      ['p04_quarter_coping', off(q, -1.6, -1.4, 2.4), off(q, 0, 0, 1.4), 45],
      // cajones, bordillo largo, banco
      ['p05_caja_pequena', off(bs, -2.6, -2.6, 1.4), off(bs, 0, 0, 0.3), 45], ['p05_caja_mediana', off(bm, -2.8, -2.8, 1.5), off(bm, 0, 0, 0.4), 45],
      ['p06_bordillo_largo', off(ll, -3.5, -3.5, 1.4), off(ll, 0, 0, 0.2), 50], ['p07_banco', off(bench, -2.6, 0, 1.2), off(bench, 0, 0, 0.4), 45],
      // suelo, paseo, vegetación, mobiliario
      ['p08_suelo_cerca', off(plat, -6, 3.5, 1.6), off(plat, -8.5, 3.5, 0), 60], ['p09_paseo_rosa', [W.spawn[0] - 3, 1.6, W.spawn[2] - 3], [W.spawn[0] - 5, 0, W.spawn[2] - 7], 60],
      ['p10_radiocasete', [W.cassette[0] - 2, 1.0, W.cassette[2] - 1.5], [W.cassette[0], 0.3, W.cassette[2]], 45],
    ];
    for (const p of W.palms.filter((p) => Math.hypot(p[0] - plat[0], p[2] - plat[2]) < 22).slice(0, 2)) shots.push([`p11_palmera_${shots.length}`, [p[0] - 4, 2.2, p[2] - 4], [p[0], 2.5, p[2]], 60]);
    shots.push(['p11_lecho_rosetas', W.palms.length ? [near(W.palms, plat)[0] - 2.2, 1.4, near(W.palms, plat)[2] - 2.2] : off(plat, -10, 0, 1.4), W.palms.length ? [near(W.palms, plat)[0], 0.2, near(W.palms, plat)[2]] : off(plat, -12, 0, 0), 55]);
    if (W.trees.length) { const t = near(W.trees, plat); shots.push(['p12_arbol', [t[0] - 6, 2.5, t[2] - 6], [t[0], 2.5, t[2]], 55]); }
    if (W.lamps.length) { const l = near(W.lamps, plat); shots.push(['p13_farola', [l[0] - 6, 2.0, l[2] - 6], [l[0], 2.4, l[2]], 50]); }
    if (nmgSign) shots.push(['p14_cartel', [nmgSign[0] - 3, nmgSign[1], nmgSign[2] - 3], [nmgSign[0], nmgSign[1], nmgSign[2]], 50]);
    for (const [n, p, t, f] of shots) await directShot(page, R, n, p, t, f);
    R.measure('camaras', shots.map(([n, p, t, f]) => ({ n, pos: p.map((v) => +v.toFixed(2)), target: t.map((v) => +v.toFixed(2)), hfov: f })));
    // cámara de juego real: llegada y charla
    await fixture(page, R, 'llegada (spawn) con la cámara de juego', () => { const g = window.__bk, m = g.park.manifest.spawn; g.skater.teleport(m.pos, m.heading, 'walk'); g.rig.snapBehind(g.skater); for (const id of ['hud', 'touch']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } return {}; });
    await sleep(1500); await R.shot(page, 'j01_llegada_camara_juego');
    await fixture(page, R, 'charla con Pantera (entrada real E)', () => { const g = window.__bk, z = g.park.zones.get('act.pantherTalk'), pan = g.manifest.get('npc.la_pantera'); g.skater.teleport(z.pos.clone(), Math.atan2(pan.pos.x - z.pos.x, pan.pos.z - z.pos.z), 'walk'); g.rig.snapBehind(g.skater); return {}; });
    await sleep(700); await page.keyboard.press('KeyE'); await sleep(1600); await page.evaluate(() => { for (const id of ['hud', 'touch', 'dialog']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } });
    await R.shot(page, 'j02_charla_camara_juego');
    R.check(shots.length >= 30, `capturas del inventario generadas (${shots.length} directas + 2 de juego); la revisión es visual`, 'vision', shots.map((x) => x[0]));
    R.pendingHuman('Revisión del inventario y de las direcciones propuestas — puerta A1');
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
