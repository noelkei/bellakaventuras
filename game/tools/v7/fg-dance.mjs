// V6 T6-09 · Matriz del baile de FASHION GIRL (doc. 05 §Matriz) con teclado real: stages 10/5/3 s y 3/4/5 pulsaciones;
// la celebración no consume tiempo; error reinicia la secuencia sin devolver tiempo; pausa congela; timeout sale y el
// siguiente intento empieza en el stage 1; Salir y recarga descartan; premio físico único junto a la salida lateral; las
// cinco chicas bailan el MISMO clip que ANMI y en el mismo instante.
import { Report, runTest, launch, openGame, clickStart, sleep, place, fixture } from './lib.mjs';
const R = new Report('fg-dance');
const th = 108 * Math.PI / 180, O = [30.5 * Math.sin(th), -30.5 * Math.cos(th)], W = [Math.sin(th), -Math.cos(th)], S = [-Math.cos(th), -Math.sin(th)];
const V = (w, s, h = 0) => [O[0] + W[0] * w + S[0] * s, h, O[1] + W[1] * w + S[1] * s];
const H = (dw, ds) => Math.atan2(W[0] * dw + S[0] * ds, W[1] * dw + S[1] * ds);
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const dc = (page) => page.evaluate(() => { const g = window.__bk, d = g.activities.find((a) => a.id === 'danceCombo'), s = g.skater;
  return { busy: d.busy, stage: d.stage, idx: d.idx, seq: d.seq, left: d.timer ? +(d.timer.deadline - g.sim.now).toFixed(3) : null, cel: !!d['celebration'], mode: g.mode, frozen: s.frozen,
    done: g.state.p.activities.danceCombo, collected: [...g.state.p.collected], partial: g.state.p.partials.danceRounds, now: +g.sim.now.toFixed(3) }; });
const press = async (page, d) => { await page.keyboard.press(KEY[d]); await sleep(60); };
const startDance = async (page) => {
  await place(page, R, V(0, 5.6, 1.0), H(0, 1), 'walk', 'pista'); await sleep(350);
  const lab = await page.evaluate(() => document.getElementById('btn-action')?.textContent ?? '');
  await page.keyboard.press('KeyE'); await sleep(500); return lab;
};
const girlsSync = (page) => page.evaluate(() => { const g = window.__bk, anmi = g.visual.actions.get(g.visual.currentName);
  return { anmi: g.visual.currentName, t: anmi ? +anmi.time.toFixed(3) : null, girls: (g.npcs.get('bella') ?? []).map((n) => ({ clip: n.current?.getClip().name, t: +(n.current?.time ?? -1).toFixed(3) })) }; });
await runTest(R, async () => {
  const b = await launch();
  try {
    let page = await openGame(b, R); await clickStart(page);
    await page.evaluate(() => window.__bk.loadNpc('bella')); await sleep(2500);
    const nGirls = await page.evaluate(() => (window.__bk.npcs.get('bella') ?? []).length);
    R.check(nGirls === 5, 'cinco chicas en la pista', 'input', { nGirls });
    // ------------------------------------------------ 1-2. stages 10/5/3 y 3/4/5; celebración no consume tiempo
    const lab = await startDance(page);
    let q = await dc(page);
    R.check(/BAILAR/.test(lab) && q.busy && q.stage === 0 && q.seq.length === 3 && q.left > 9.3 && q.left <= 10, 'stage 1: 10 s y 3 pulsaciones', 'input', q);
    const sync1 = await girlsSync(page);
    R.check(sync1.girls.length === 5 && sync1.girls.every((x) => x.clip === `Dance_${sync1.anmi}` && Math.abs(x.t - sync1.t) < 0.08), 'las cinco bailan el mismo clip que ANMI en el mismo instante (bucle)', 'input', sync1);
    for (const d of q.seq) await press(page, d);
    await sleep(500); const cel = await girlsSync(page);
    R.check(cel.girls.every((x) => x.clip === `Dance_${cel.anmi}` && Math.abs(x.t - cel.t) < 0.08), 'en la celebración bailan el clip de ronda de ANMI, sincronizadas', 'input', cel);
    for (let i = 0; i < 80; i++) { q = await dc(page); if (q.stage === 1 && !q.cel) break; await sleep(60); }   // celebración entera sin saltarla
    const tr = await page.evaluate(() => window.__bk.activities.find((a) => a.id === 'danceCombo').trace);
    R.measure('traza_stage1_2', tr);
    R.check(q.stage === 1 && q.seq.length === 4 && q.left > 4.6 && q.left <= 5, 'stage 2: 5 s y 4 pulsaciones (celebración sin consumir)', 'input', q);
    // ------------------------------------------------ 4. error: secuencia desde el principio, el tiempo no vuelve
    await press(page, q.seq[0]);
    const wrong = ['up', 'down', 'left', 'right'].find((d) => d !== q.seq[1]);
    const before = await dc(page); await press(page, wrong); const after = await dc(page);
    R.check(after.idx === 0 && after.seq.join() === before.seq.join() && after.left < before.left, 'error: misma secuencia desde el principio y sin devolver tiempo', 'input', { before: before.left, after: after.left, idx: after.idx });
    // ------------------------------------------------ 5. pausa congela el timer
    const p0 = (await dc(page)).left; await page.keyboard.press('Escape'); await sleep(1500); const p1 = (await dc(page)).left; await page.keyboard.press('Escape'); await sleep(200);
    R.check(Math.abs(p0 - p1) < 0.1, 'pausa: el timer no corre', 'input', { p0, p1 });
    q = await dc(page); for (const d of q.seq) await press(page, d);
    await sleep(700); await press(page, 'up'); await sleep(300);   // saltar celebración
    q = await dc(page);
    R.check(q.stage === 2 && q.seq.length === 5 && q.idx === 0 && q.left > 2.6, 'stage 3: 3 s y 5 pulsaciones; saltar la celebración no mete flecha', 'input', q);
    for (const d of q.seq) await press(page, d);
    await sleep(600); q = await dc(page);
    R.check(q.done && !q.collected.includes('fashion_girl.activity'), 'stage 3 superado: reto completo, la patata no cuenta hasta recogerla', 'input', q);
    const fry = await page.evaluate(() => { const g = window.__bk, p = g.pickups.find((x) => x.id === 'fashion_girl.activity'); return p ? { avail: p.available, vis: p.group.visible, pos: p.spawn.pos.toArray() } : null; });
    R.check(fry && fry.avail, 'patata del premio física disponible', 'input', fry);
    await sleep(8000);   // celebración final y salida
    q = await dc(page); R.check(!q.busy && q.mode === 'explore' && !q.frozen, 'tras el final vuelve a explorar', 'input', q);
    await place(page, R, [fry.pos[0] + 1.5, 0, fry.pos[2]], Math.atan2(-1.5, 0), 'walk', 'junto al premio');
    await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW'); await sleep(300);
    q = await dc(page); R.check(q.collected.includes('fashion_girl.activity'), 'se recoge el premio en el suelo', 'input', { n: q.collected.length });
    const n0 = q.collected.length;
    // repetir: no duplica premio
    await startDance(page); q = await dc(page);
    R.check(q.busy && q.stage === 0, 'BAILAR OTRA VEZ empieza en stage 1', 'input', q);
    for (const d of q.seq) await press(page, d);
    await sleep(500);
    // ------------------------------------------------ 3. timeout en el stage 2
    await sleep(4300); q = await dc(page);
    R.check(q.stage === 1 && q.left !== null, 'stage 2 en curso para provocar el timeout', 'input', q);
    await sleep(5600); q = await dc(page);
    R.check(!q.busy && q.mode === 'explore' && !q.frozen, 'timeout: sale de la actividad y devuelve el control', 'input', q);
    const vis = await page.evaluate(() => ({ board: window.__bk.visual.deck?.visible, overlay: document.getElementById('dance').hidden }));
    R.check(vis.overlay === true, 'timeout: interfaz del baile cerrada', 'input', vis);
    await startDance(page); q = await dc(page);
    R.check(q.stage === 0 && q.left > 9.3, 'tras el timeout el siguiente intento empieza en stage 1', 'input', q);
    R.check(q.collected.length === n0, 'repetir no duplica el premio', 'input', { n: q.collected.length, n0 });
    // ------------------------------------------------ 6. Salir en el stage 2 y recarga en el stage 2
    for (const d of q.seq) await press(page, d); await sleep(700); await press(page, 'up'); await sleep(300);
    q = await dc(page); R.check(q.stage === 1, 'en stage 2 antes de Salir', 'input', q);
    await page.click('#dance-exit'); await sleep(400);
    await startDance(page); q = await dc(page);
    R.check(q.stage === 0, 'Salir descarta el intento (vuelve a stage 1)', 'input', q);
    for (const d of q.seq) await press(page, d); await sleep(700); await press(page, 'up'); await sleep(300);
    q = await dc(page); R.check(q.stage === 1 && q.partial === 0, 'stage 2 sin parcial guardado', 'input', q);
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
    await clickStart(page); await page.evaluate(() => window.__bk.loadNpc('bella')); await sleep(2000);
    await startDance(page); q = await dc(page);
    R.check(q.stage === 0 && q.done, 'recarga: vuelve a stage 1 y conserva el éxito', 'input', q);
    // ------------------------------------------------ 9. pulsación tras el plazo no cuenta
    const late = await page.evaluate(() => { const g = window.__bk, d = g.activities.find((a) => a.id === 'danceCombo'); d.timer.deadline = g.sim.now - 0.001; const i0 = d.idx; d.press(d.seq[0]); return { i0, i1: d.idx }; });
    R.fixture('plazo vencido forzado en página para comprobar el orden pulsación/plazo', late);
    R.check(late.i1 === late.i0, 'una pulsación posterior al plazo no cuenta', 'unit', late);
    await sleep(1800); q = await dc(page); R.check(!q.busy, 'y el timeout termina el intento', 'input', q);
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
