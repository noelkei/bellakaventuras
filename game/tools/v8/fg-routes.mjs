// V6 T6-02/03 · Recorridos de FASHION GIRL con el controlador REAL y teclado real (fixtures solo colocan el punto de partida).
// Marco v10: w radial, s deck→pista. Mide la posición (w, s, y) en el marco a lo largo de cada recorrido.
import { Report, runTest, launch, openGame, clickStart, sleep, place, holdKeys, fixture } from './lib.mjs';
const R = new Report('fg-routes');
const th = (108 + 9) * Math.PI / 180, /* V10 (preparación): marco FG con el giro de corona +9° (Bola de Oro §07), como world/fg.ts */ O = [30.5 * Math.sin(th), -30.5 * Math.cos(th)], W = [Math.sin(th), -Math.cos(th)], S = [-Math.cos(th), -Math.sin(th)];
const V = (w, s, h = 0) => [O[0] + W[0] * w + S[0] * s, h, O[1] + W[1] * w + S[1] * s];
const H = (dw, ds) => Math.atan2(W[0] * dw + S[0] * ds, W[1] * dw + S[1] * ds);
const loc = (p) => { const dx = p.x - O[0], dz = p.z - O[1]; return { w: +(dx * W[0] + dz * W[1]).toFixed(2), s: +(dx * S[0] + dz * S[1]).toFixed(2), y: +p.y.toFixed(2) }; };
const st = async (page) => page.evaluate(() => { const g = window.__bk, s = g.skater; return { x: s.footPos.x, y: s.footPos.y, z: s.footPos.z, crouch: s.isCrouched, loco: s.loco, g: s.grounded, col: [...g.state.p.collected] }; });
const run = async (page, keys, ms) => { const out = []; await holdKeys(page, keys, ms, { every: 80, onSample: async () => { const q = await st(page); out.push({ ...loc(q), c: q.crouch ? 1 : 0, loco: q.loco }); } }); return out; };
const has = async (page, id) => (await st(page)).col.includes(id);
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(1500);
    // V10.3 R2 (W05, W-D08, W-D34; cambio de diseño aprobado, copia previa en V10/backups/pruebas/V10_3-R2): sin túnel. La patata 3 va encima
    // del tramo alto del muro bajo (0,5 m), junto al bloque de la radio. Antes: túnel con boca baja (secciones 1, 1b y 2 del V6)
    // ---------------------------------------------------------------- 1. el lateral del deck está cerrado: ni de pie ni agachada se entra
    for (const keys of [['KeyW'], ['KeyW', 'KeyC']]) {
      await place(page, R, V(5.6, -9.0), H(-1, 0), 'walk', `lateral del deck (${keys.join('+')})`);
      const tr = await run(page, keys, 3000), minW = Math.min(...tr.map((p) => p.w));
      R.check(minW > 2.8, `el lateral del deck es macizo: ${keys.length > 1 ? 'agachada' : 'de pie'} no se entra (mín w ${minW})`, 'input', { minW });
    }
    // ---------------------------------------------------------------- 2. patata 3: andando hasta el muro y de un salto encima; también con ollie
    let tr = [];
    await place(page, R, V(-2.1, -10.6), H(0, -1), 'walk', 'frente al muro de la radio');
    await page.keyboard.down('KeyW'); await sleep(450); await page.keyboard.press('Space'); await sleep(900); await page.keyboard.up('KeyW'); await sleep(600);
    { const q = await st(page), l = loc(q); R.measure('muro_a_pie', l);
      R.check(await has(page, 'fashion_girl.hidden'), `patata 3 cogida subiendo al muro de un salto (pie en y ${l.y})`, 'input', l); }
    await page.evaluate(() => { const g = window.__bk; g.state.p.collected = g.state.p.collected.filter((x) => x !== 'fashion_girl.hidden'); const pk = g.pickups.find((p) => p.spawn?.id === 'fashion_girl.hidden'); if (pk) { pk.collected = false; pk.group.visible = true; } });
    R.fixture('patata 3 marcada como no recogida para probar el ollie');
    // en tabla a lo largo del muro (entre el deck y el muro no hay carrerilla): ollie al tramo alto por su testero (w −3,8) y rodando hasta la patata
    await place(page, R, V(-9.0, -12.6), H(1, 0), 'ride', 'en tabla a lo largo del muro');
    { const t0 = Date.now(); await page.keyboard.down('KeyW'); let fired = false;
      while (Date.now() - t0 < 4500) { const l = loc(await st(page)); if (!fired && l.w > -5.0) { await page.keyboard.press('Space'); fired = true; } if (fired && l.w > -2.4) break; await sleep(30); }
      await page.keyboard.up('KeyW'); await sleep(700); }
    { const l = loc(await st(page)); R.check(await has(page, 'fashion_girl.hidden'), `patata 3 cogida con un ollie al muro (pie en y ${l.y})`, 'input', l); }
    // negativos: no se coge desde el suelo junto al muro (delante, detrás) ni desde encima del bloque de la radio
    const neg = await page.evaluate((pts) => { const g = window.__bk, f = g.park.manifest.fries.find((x) => x.id === 'fashion_girl.hidden');
      return pts.map(([x, y, z]) => { const dx = x - f.pos.x, dz = z - f.pos.z; const yOk = f.reach ? y >= f.reach[0] && y <= f.reach[1] : true; return Math.abs(dx) < f.trigger.x && Math.abs(dz) < f.trigger.z && yOk; }); },
      [V(-2.1, -11.8, 0), V(-2.1, -13.4, 0), V(-1.4, -12.6, 0.3)]);
    R.check(neg.every((v) => !v), 'patata 3 fuera de alcance desde el suelo delante y detrás del muro y desde el bloque de la radio', 'unit', neg);
    const dRadio = await page.evaluate(() => { const g = window.__bk, f = g.park.manifest.fries.find((x) => x.id === 'fashion_girl.hidden'), c = g.park.manifest.cassettes.find((q) => q.zone === 'fashion_girl');
      return +Math.hypot(f.pos.x - c.pos.x, f.pos.z - c.pos.z).toFixed(2); });
    R.check(dRadio > 1.0 && dRadio < 2.0, `la patata está justo al lado de la radio sin tocarla (${dRadio} m)`, 'unit', { dRadio });
    // ---------------------------------------------------------------- 3. U en tabla: del deck recto a la pista
    await place(page, R, V(0, -9.6, 1.8), H(0, 1), 'ride', 'deck');
    tr = await run(page, ['KeyW'], 4200);
    const onStage = tr.filter((p) => p.s > 5.7 && p.y > 0.9);
    R.measure('u_tabla', { maxS: Math.max(...tr.map((p) => p.s)), minY: Math.min(...tr.map((p) => p.y)), maxW: Math.max(...tr.map((p) => Math.abs(p.w))) });
    R.check(onStage.length > 0, 'en tabla desde el deck se llega recto a la pista', 'input', { last: tr.at(-1) });
    R.check(Math.max(...tr.map((p) => Math.abs(p.w))) < 0.8, 'trayectoria recta por el eje (|w| < 0,8)', 'input');
    // ---------------------------------------------------------------- 4. a pie (R2): del fondo de la U se sale andando a la zona de
    // entrada y de ahí a la pista; la pared del deck (1,8 m, labio a 65°) no se sube andando: al deck se sube por la escalera
    await place(page, R, V(0, -3.0, 0.06), H(0, 1), 'walk', 'fondo U');
    tr = await run(page, ['KeyW'], 4500);
    R.check(tr.some((p) => p.s > 0.3 && p.s < 3.4 && p.y > 0.9), 'a pie sube la transición a la zona de entrada', 'input', { last: tr.at(-1) });
    R.check(tr.some((p) => p.s > 3.6 && p.y > 0.9), 'de la zona de entrada sigue andando a la pista', 'input', { last: tr.at(-1) });
    await place(page, R, V(0, -5.0, 0.06), H(0, -1), 'walk', 'fondo U');
    tr = await run(page, ['KeyW'], 4000);
    R.check(!tr.some((p) => p.s < -8.2 && p.y > 1.6), 'a pie no se sube la pared del deck (se sube por la escalera)', 'input', { minS: Math.min(...tr.map((p) => p.s)), maxY: Math.max(...tr.map((p) => p.y)) });
    // ---------------------------------------------------------------- 5. rampas de la pista (lateral y trasera) a pie y en tabla
    // (V10.3: la salida en tabla pasa de w −13 —r 17,5, la pista de coches, ahora tras la valla— a w −7,6, el paseo interior)
    for (const [lab, from, h, loco] of [['lateral a pie', [-6.0, 5.75], H(1, 0), 'walk'], ['trasera a pie', [0, 11.6], H(0, -1), 'walk'], ['lateral en tabla', [-7.6, 5.75], H(1, 0), 'ride']]) {
      await place(page, R, V(from[0], from[1]), h, loco, lab);
      // V10.3: sin los 9 m de carrerilla de antes (la pista de coches queda tras la valla), la llegada en tabla se declara a 5 m/s
      if (loco === 'ride') await fixture(page, R, 'lateral en tabla: rodando a 5 m/s (la carrerilla que daba la pista)', () => { window.__bk.skater.speed = 5.0; return { v: window.__bk.skater.speed }; });
      tr = await run(page, ['KeyW'], 2600);
      R.check(tr.some((p) => p.y > 0.95 && Math.abs(p.w) < 3.1 && p.s > 3.6 && p.s < 8.0), `rampa ${lab} lleva al tablero`, 'input', { last: tr.at(-1) });
    }
    // ---------------------------------------------------------------- 6. patata 1 entre cuñas: andar por debajo NO; subir a la cuña SÍ
    await place(page, R, V(0, 12.4), H(0, 1), 'walk', 'bajo la patata');
    tr = await run(page, ['KeyW'], 2200);
    R.check(!(await has(page, 'fashion_girl.medium')), 'andando por el hueco bajo la patata no se recoge', 'input', { maxS: Math.max(...tr.map((p) => p.s)) });
    await place(page, R, V(-4.2, 13.8), H(1, 0), 'walk', 'cuña izquierda');   // R2: a la altura (s) de la patata
    tr = await run(page, ['KeyW'], 2600);
    R.measure('cuña_y_max', Math.max(...tr.map((p) => p.y)));
    R.check(await has(page, 'fashion_girl.medium'), 'subiendo la cuña hasta el labio se alcanza la patata suspendida', 'input', { last: tr.at(-1) });
  } finally { await b.close(); }
});
