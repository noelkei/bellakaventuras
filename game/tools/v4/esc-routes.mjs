// V4-ESC-01/02 · Escaleras y perfiles caminables con ENTRADA NORMAL (teclas reales). Fixtures declaradas solo para
// colocar a ANMI al pie de cada recorrido. Mide alturas alcanzadas, etapas de guardado, impactos y caídas.
//  A. TT a pie: pie de escalera → cinco descansos → último giro (D) → tablero 4,2 m; bajada andando.
//  B. TT en tabla: con carrerilla sube tramos según energía; desde parado en un descanso NO sube el siguiente tramo.
//  C. TT paso agachado bajo el descanso 2: patata escondida solo agachado.
//  D. NMG bank: subir rodando a la plataforma (0,6 m), girar arriba, bajar sin caída; subir andando por el bank.
import { Report, runTest, launch, openGame, clickStart, sleep, snap, holdKeys } from './lib.mjs';

const R = new Report('ESC', 'esc-routes');
const placeTT = (page, x, z, h, yawOff, loco) => page.evaluate((x, z, h, yawOff, loco) => {
  const g = window.__bk, T = window.__bkTHREE, th = 173 * Math.PI / 180, r = 33.0;
  const O = new T.Vector3(r * Math.sin(th), 0, -r * Math.cos(th)), X = new T.Vector3(Math.cos(th), 0, Math.sin(th)), Z = new T.Vector3(-Math.sin(th), 0, Math.cos(th));
  const p = O.clone().addScaledVector(X, x).addScaledVector(Z, z); p.y = h;
  const dir = X.clone().multiplyScalar(Math.cos(yawOff)).addScaledVector(Z, Math.sin(yawOff));
  g.skater.teleport(p, Math.atan2(dir.x, dir.z), loco); g.rig.snapBehind(g.skater); g.input.clear();
  return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) };
}, x, z, h, yawOff, loco);

await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page);
    // ------------------------------------------------ A. TT andando
    R.fixture('A: ANMI a pie al pie de la escalera de TRATRATRA (x 23,5 del marco), mirando escaleras arriba', await placeTT(page, 23.5, 5.9, 0, Math.PI, 'walk'));
    await sleep(300);
    const up = []; await page.keyboard.down('KeyW');
    for (let i = 0; i < 100; i++) { const q = await snap(page); up.push(q); if (await page.evaluate(() => window.__bk.activities[3].stage === 4)) { await sleep(250); break; } await sleep(100); }
    await page.keyboard.up('KeyW');
    const maxA = Math.max(...up.map((q) => q.y));
    R.check(maxA > 3.9 && up.every((q) => q.loco === 'walk'), 'A: sube andando con W los cinco tramos hasta el último descanso (4,0 m) sin saltar', 'input', { maxY: maxA, t: up.length * 0.1 });
    const rest = await page.evaluate(() => ({ rest: window.__bk.state.p.partials.bridgeRest, stage: window.__bk.activities[3].stage }));
    R.check(rest.stage === 4, 'A: los cinco descansos se registran en orden (etapa 4)', 'input', rest);
    // último giro: D (derecha) hacia el tablero y W
    await holdKeys(page, ['KeyD'], 470, { every: 80 });
    const onDeck = await holdKeys(page, ['KeyW'], 1600, { every: 100 });
    const top = onDeck.at(-1);
    const reached = await page.evaluate(() => window.__bk.state.p.bridgeReached);
    R.check(top.y > 4.15 && reached, 'A: último giro y peldaño de 0,2 m: llega al tablero (4,2 m) y queda registrado arriba', 'input', { y: top.y, reached });
    const talk = await page.evaluate(() => !document.getElementById('prompt').hidden && document.getElementById('btn-action').textContent);
    R.note({ prompt_arriba: talk });
    // bajada andando: media vuelta y W
    await holdKeys(page, ['KeyD'], 950, { every: 100 });
    const down = await holdKeys(page, ['KeyW'], 1200, { every: 100 });
    await holdKeys(page, ['KeyA'], 470, { every: 80 });
    const down2 = await holdKeys(page, ['KeyW'], 6500, { every: 100 });
    const end = down2.at(-1);
    R.check(end.y < 0.2 && [...down, ...down2].every((q) => q.loco === 'walk'), 'A: baja andando por la misma escalera hasta el suelo sin caída ni impacto', 'input', { endY: end.y, locos: [...new Set([...down, ...down2].map((q) => q.loco))] });
    // ------------------------------------------------ B. TT en tabla
    R.fixture('B1: ANMI montada parada en el descanso 1 (1,6 m) mirando al tramo siguiente', await placeTT(page, 16.4, 5.9, 1.6, Math.PI, 'ride'));
    await sleep(300);
    const stall = await holdKeys(page, ['KeyW'], 2600, { every: 100 });
    const maxB1 = Math.max(...stall.map((q) => q.y));
    R.check(maxB1 < 2.3, 'B1: desde parado en un descanso la tabla NO sube el tramo siguiente (energía insuficiente, sin ayuda)', 'input', { maxY: maxB1, endState: stall.at(-1).state });
    R.fixture('B2: ANMI montada en el suelo a 10 m del pie de la escalera, mirando a ella', await placeTT(page, 32, 5.9, 0, Math.PI, 'ride'));
    await sleep(300);
    const run = await holdKeys(page, ['KeyW'], 4200, { every: 80 });
    const maxB2 = Math.max(...run.map((q) => q.y));
    R.check(maxB2 >= 0.75, 'B2: con carrerilla la tabla sube al menos el primer tramo (0,8 m) por energía', 'input', { maxY: maxB2, vmax: Math.max(...run.map((q) => q.vLong)), impacts: run.filter((q) => q.loco === 'impact').length });
    R.note({ B2_recorrido: run.filter((_, i) => i % 5 === 0).map((q) => [q.vLong, q.y, q.state]) });
    // ------------------------------------------------ C. paso agachado bajo el descanso 2
    R.fixture('C: ANMI a pie frente a la boca interior del paso bajo (z 9,0), agachada (C mantenida), mirando al tablero', await placeTT(page, 16.4, 9.0, 0, -Math.PI / 2, 'walk'));
    await sleep(300);
    const before = await page.evaluate(() => window.__bk.state.total);
    const cr = await holdKeys(page, ['KeyC', 'KeyW'], 3000, { every: 100 });
    const after = await page.evaluate(() => ({ total: window.__bk.state.total, has: window.__bk.state.isCollected('tratratra.hidden') }));
    R.check(after.has && cr.some((q) => q.crouched), 'C: agachada pasa bajo el descanso y recoge la patata escondida', 'input', { before, after, crouched: cr.filter((q) => q.crouched).length });
    R.fixture('C2: de pie (sin agacharse) frente al mismo paso', await placeTT(page, 16.4, 9.0, 0, -Math.PI / 2, 'walk'));
    const st = await holdKeys(page, ['KeyW'], 2000, { every: 100 });
    R.check(Math.min(...st.map((q) => q.z)) !== undefined && st.at(-1).crouched === false && !st.some((q) => q.y > 0.3), 'C2: de pie no entra (techo del paso a 1,42 m)', 'input', { endPos: [st.at(-1).x, st.at(-1).z] });
    // ------------------------------------------------ D. NMG bank
    const bank = await page.evaluate(() => { const a = window.__bk.manifest.get('nmg.bank.foot'); return { x: a.pos.x, z: a.pos.z, h: a.heading }; });
    R.fixture('D1: ANMI montada a 6 m del pie del bank NMG, mirando a él', await page.evaluate((b) => { const g = window.__bk, T = window.__bkTHREE; const d = new T.Vector3(Math.sin(b.h), 0, Math.cos(b.h)); const p = new T.Vector3(b.x, 0, b.z).addScaledVector(d, -6); g.skater.teleport(p, b.h, 'ride'); g.rig.snapBehind(g.skater); return [p.x, p.z]; }, bank));
    await sleep(300);
    const bk = await holdKeys(page, ['KeyW'], 2600, { every: 80 });
    const onPlat = bk.filter((q) => q.y > 0.55);
    R.check(onPlat.length > 0 && bk.every((q) => q.loco !== 'impact' && q.loco !== 'bail'), 'D1: sube rodando el bank hasta la plataforma (0,6 m) sin caída', 'input', { maxY: Math.max(...bk.map((q) => q.y)), vAt: onPlat[0]?.vLong });
    // frenar arriba, girar 180 y bajar por el bank
    await holdKeys(page, ['KeyS'], 900, { every: 100 });
    await holdKeys(page, ['KeyD'], 1150, { every: 100 });
    const bd = await holdKeys(page, ['KeyW'], 2200, { every: 80 });
    R.check(bd.at(-1).y < 0.1 && bd.every((q) => q.loco !== 'impact' && q.loco !== 'bail'), 'D1: tras girar arriba baja por el bank (o la escalera) sin caída', 'input', { endY: bd.at(-1).y, states: [...new Set(bd.map((q) => q.state))] });
    R.fixture('D2: ANMI a pie a 3 m del pie del bank', await page.evaluate((b) => { const g = window.__bk, T = window.__bkTHREE; const d = new T.Vector3(Math.sin(b.h), 0, Math.cos(b.h)); const p = new T.Vector3(b.x, 0, b.z).addScaledVector(d, -3); g.skater.teleport(p, b.h, 'walk'); return [p.x, p.z]; }, bank));
    const wk = await holdKeys(page, ['KeyW'], 2600, { every: 100 });
    R.check(Math.max(...wk.map((q) => q.y)) > 0.55, 'D2: el bank también se sube andando', 'input', { maxY: Math.max(...wk.map((q) => q.y)) });
  } finally { await browser.close(); }
});
