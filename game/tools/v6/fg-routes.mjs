// V6 T6-02/03 · Recorridos de FASHION GIRL con el controlador REAL y teclado real (fixtures solo colocan el punto de partida).
// Marco v10: w radial, s deck→pista. Mide la posición (w, s, y) en el marco a lo largo de cada recorrido.
import { Report, runTest, launch, openGame, clickStart, sleep, place, holdKeys, fixture } from './lib.mjs';
const R = new Report('fg-routes');
const th = 108 * Math.PI / 180, O = [30.5 * Math.sin(th), -30.5 * Math.cos(th)], W = [Math.sin(th), -Math.cos(th)], S = [-Math.cos(th), -Math.sin(th)];
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
    // ---------------------------------------------------------------- 1. túnel: de pie no cabe; agachada entra, se levanta dentro, recoge y vuelve
    await place(page, R, V(5.6, -9.0), H(-1, 0), 'walk', 'boca');
    let tr = await run(page, ['KeyW'], 2600);
    const minStand = Math.min(...tr.map((p) => p.w));
    R.measure('tunel_de_pie_min_w', minStand);
    R.check(minStand > 2.6, 'de pie no se cruza la boca (la cápsula para antes del muro)', 'input', { minW: minStand });
    tr = await run(page, ['KeyW', 'KeyC'], 2600);
    const inside = tr.filter((p) => p.w < 2.4);
    R.check(inside.length > 0 && inside.every((p) => p.c === 1), 'agachada cruza la boca', 'input', { last: tr.at(-1) });
    tr = await run(page, ['KeyW'], 2500);   // suelta C dentro: se levanta cuando cabe y camina de pie
    const stood = tr.filter((p) => p.c === 0 && p.w < 0.8);
    R.check(stood.length > 0, 'dentro se levanta y camina de pie', 'input', { last: tr.at(-1), minY: Math.min(...tr.map((p) => p.y)) });
    R.measure('tunel_suelo_y', Math.min(...tr.map((p) => p.y)));
    R.check(await has(page, 'fashion_girl.hidden'), 'patata 3 recogida al fondo', 'input');
    await page.keyboard.down('KeyD'); await sleep(1400); await page.keyboard.up('KeyD');   // media vuelta a pie (pasos)
    await page.evaluate((h) => { const s = window.__bk.skater; s.heading = h; }, H(1, 0));
    R.fixture('rumbo de salida fijado hacia la boca (el giro a pasos no es objeto de esta prueba)');
    tr = await run(page, ['KeyW'], 2500);
    const maxStand = Math.max(...tr.map((p) => p.w));
    R.check(maxStand < 2.5, 'de pie no sale (techo de la rampa)', 'input', { maxW: maxStand });
    tr = await run(page, ['KeyW', 'KeyC'], 3000);
    tr = tr.concat(await run(page, ['KeyW'], 1200));
    R.check(tr.at(-1).w > 4.4 && tr.at(-1).y > -0.05 && tr.at(-1).c === 0, 'sale agachada por la boca y se levanta fuera', 'input', { last: tr.at(-1) });
    // ---------------------------------------------------------------- 1b. holgura lateral de la boca (entrada agachada desviada ±0,2 m)
    for (const off of [-0.2, 0.2]) {
      await place(page, R, V(5.6, -9.0 + off), H(-1, 0), 'walk', `boca desviada ${off}`);
      const t2 = await run(page, ['KeyW', 'KeyC'], 4500);   // agachada se avanza a 1 m/s
      R.check(t2.some((p) => p.w < 2.2), `agachada desviada ${off > 0 ? '+' : ''}${off} m del eje también cruza la boca`, 'input', { last: t2.at(-1) });
    }
    // ---------------------------------------------------------------- 2. patata 3 no se recoge desde encima del deck ni por detrás
    await page.evaluate(() => { const g = window.__bk; g.state.p.collected = g.state.p.collected.filter((x) => x !== 'fashion_girl.hidden'); });
    R.fixture('patata 3 marcada como no recogida para la prueba negativa (la recogida ya se comprobó)');
    // la pickup ya está marcada recogida en el juego: comprobamos el criterio geométrico directamente con el manifiesto
    const neg = await page.evaluate((pts) => { const g = window.__bk, f = g.park.manifest.fries.find((x) => x.id === 'fashion_girl.hidden');
      return pts.map(([x, y, z]) => { const dx = x - f.pos.x, dz = z - f.pos.z; const yOk = f.reach ? y >= f.reach[0] && y <= f.reach[1] : true; return Math.abs(dx) < f.trigger.x && Math.abs(dz) < f.trigger.z && yOk; }); },
      [V(-1.95, -9.0, 1.8), V(-3.15, -9.0, 0), V(-1.95, -10.35, 0), V(-1.95, -7.7, 0.5)]);
    R.check(neg.every((v) => !v), 'patata 3 fuera de alcance desde deck, reverso, frente y U', 'unit', neg);
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
    for (const [lab, from, h, loco] of [['lateral a pie', [-6.0, 5.75], H(1, 0), 'walk'], ['trasera a pie', [0, 11.6], H(0, -1), 'walk'], ['lateral en tabla', [-13.0, 5.75], H(1, 0), 'ride']]) {
      await place(page, R, V(from[0], from[1]), h, loco, lab);
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
