// ACT-04: grafiti YINYANG y ascenso de TRATRATRA con ENTRADA REAL. Fixtures declaradas: posición de salida (junto al muro
// del mural y al pie del ascenso) y recargas de página.
//   G  grafiti: arrastres de ratón en zigzag hasta ~40 % → salir → recargar → «SEGUIR PINTANDO» con cobertura restaurada →
//      terminar (≥92 %) → premio → recogerlo
//   B  puente: subir las 5 plataformas con ollie siguiendo el arco → descanso guardado → recarga en un descanso → arriba →
//      bajada abierta → recarga arriba sin hablar (sigue abierta) → hablar → premio → bajar por la rampa
//   node tools/v3/act04.mjs [G|B] → captures/v3/P3/ACT-04/act04.json + *.jpg
import path from 'node:path';
import sharp from 'sharp';
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const which = process.argv[2] ?? 'GB';
const R = new Report('P3/ACT-04', 'act04', { method: 'ratón y teclado reales; fixtures: posiciones de salida declaradas y recargas' });
const browser = await launch();
let page = await openGame(browser, R, { viewport: { width: 900, height: 620, deviceScaleFactor: 1 }, save: null });
const reload = async () => { await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 }); await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; }); };
const held = new Set();
async function keys(want) { for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } }
const promptText = () => page.evaluate(() => (document.getElementById('prompt').hidden ? '' : document.getElementById('btn-action').textContent));
async function paint(rows, cover = 1) {
  // zigzag real con el ratón sobre el canvas del mural (filas horizontales)
  const b = await page.evaluate(() => { const r = document.getElementById('graffiti-canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const n = Math.round(rows * cover);
  for (let i = 0; i < n; i++) {
    const y = b.y + b.h * (0.04 + 0.92 * i / (rows - 1));
    await page.mouse.move(b.x + b.w * 0.03, y); await page.mouse.down();
    for (let k = 1; k <= 16; k++) await page.mouse.move(b.x + b.w * (0.03 + 0.94 * k / 16), y);
    await page.mouse.up();
    if (await page.evaluate(() => document.getElementById('graffiti').hidden)) break;
  }
}
const pct = () => page.evaluate(() => document.getElementById('graffiti-pct')?.textContent);
/** Piloto a un punto del mundo con teclas relativas a la cámara (como tutorial.mjs): elige W / W+A / W+D / A / D. */
async function goTo(tg, { tol = 1.0, vmax = 3.5, maxMs = 15000, until = null } = {}) {
  const t0 = Date.now(); let o = null;
  while (Date.now() - t0 < maxMs) {
    o = await page.evaluate(({ tg, vmax }) => {
      const g = window.__bk, p = g.skater.footPos, f = g.rig.forward, d = { x: tg.x - p.x, z: tg.z - p.z }, L = Math.hypot(d.x, d.z), right = { x: -f.z, z: f.x };
      const combos = [['KeyW'], ['KeyW', 'KeyA'], ['KeyW', 'KeyD'], ['KeyA'], ['KeyD']].map((k) => { const y = k.includes('KeyW') ? 1 : 0, x = (k.includes('KeyD') ? 1 : 0) - (k.includes('KeyA') ? 1 : 0); const n = Math.hypot(x, y) || 1; const w = { x: (f.x * y + right.x * x) / n, z: (f.z * y + right.z * x) / n }; return { k, dot: (w.x * d.x + w.z * d.z) / (L || 1) }; }).sort((a, b) => b.dot - a.dot);
      let k = combos[0].k.slice(); const v = g.skater.speed;
      if (v > vmax + 0.5) k = ['KeyS'];
      else if (combos[0].dot < 0.75) { k = k.filter((x) => x !== 'KeyW'); if (!k.length) k = ['KeyA']; if (v < 0.8) k.push('KeyW'); }
      else if (v > vmax) k = k.filter((x) => x !== 'KeyW');
      return { L, keys: k, y: p.y, speed: v, loco: g.skater.loco, respawns: g.skater.respawns };
    }, { tg, vmax });
    (R.data.trace ??= []).push([+(o.L).toFixed(2), +o.y.toFixed(2), o.loco]);
    if (o.L < tol) break;
    if (until && (await until())) break;
    await keys(o.loco === 'bail' ? [] : o.keys);
    await sleep(30);
  }
  await keys([]); return o;
}

try {
  await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
  if (which.includes('G')) {
    await page.evaluate(() => { const g = window.__bk, a = g.manifest.get('mural.paint'); g.skater.teleport(a.pos.clone(), a.heading, 'walk'); g.input.clear(); });
    await page.waitForFunction(() => /PINTAR/.test(document.getElementById('btn-action').textContent) && !document.getElementById('prompt').hidden, { timeout: 5000 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => document.getElementById('graffiti-canvas').dataset.ready === '1', { timeout: 8000 });
    await paint(18, 0.4); const p1 = await pct();
    await page.screenshot({ path: path.join(R.dir, 'G1_parcial.jpg'), type: 'jpeg', quality: 75 });
    await page.click('#graffiti-exit'); await sleep(400);
    const saved = await page.evaluate(() => ({ mask: (window.__bk.state.p.partials.graffitiMask ?? '').length, check: window.__bk.state.p.partials.graffitiCheck, done: !!window.__bk.state.p.activities.graffiti }));
    R.check(parseInt(p1) > 15 && parseInt(p1) < 80 && saved.mask > 0 && saved.check > 0 && !saved.done, 'G: pintar en parte con el ratón guarda la máscara parcial al salir', 'input', { p1, saved });
    await reload();
    await page.evaluate(() => { const g = window.__bk, a = g.manifest.get('mural.paint'); g.skater.teleport(a.pos.clone(), a.heading, 'walk'); g.input.clear(); });
    await page.waitForFunction(() => /SEGUIR PINTANDO/.test(document.getElementById('btn-action').textContent) && !document.getElementById('prompt').hidden, { timeout: 5000 }).catch(() => {});
    const pr = await promptText();
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => document.getElementById('graffiti-canvas').dataset.ready === '1', { timeout: 8000 });
    const p2 = await pct();
    R.check(/SEGUIR PINTANDO/.test(pr) && p2 === p1, 'G: tras recargar ofrece «SEGUIR PINTANDO» con la misma cobertura', 'input', { pr, p1, p2 });
    await paint(18, 1);
    await page.waitForFunction(() => window.__bk.state.p.activities.graffiti, { timeout: 8000 }).catch(() => {});
    const fin = await page.evaluate(() => ({ done: !!window.__bk.state.p.activities.graffiti, pct: document.getElementById('graffiti-pct').textContent }));
    await page.screenshot({ path: path.join(R.dir, 'G2_final.jpg'), type: 'jpeg', quality: 75 });
    await page.waitForFunction(() => document.getElementById('graffiti').hidden && window.__bk.mode === 'explore', { timeout: 8000 }).catch(() => {});
    const avail = await page.evaluate(() => window.__bk.pickups.filter((p) => p.id === 'yinyang.activity' && p.available && !p.collected).length);
    R.check(fin.done && avail === 1, 'G: completar el mural (≥92 %) guarda la actividad y deja una patata de premio', 'input', { fin, avail });
    // recogerla rodando: está delante del mural
    await page.evaluate(() => { const g = window.__bk, P = g.park.manifest.fries.find((q) => q.id === 'yinyang.activity').pos; const p = g.skater.footPos; g.skater.teleport(p.clone(), Math.atan2(P.x - p.x, P.z - p.z), 'walk'); g.rig.snapBehind(g.skater); g.input.clear(); });
    await keys(['KeyW']); await page.waitForFunction(() => window.__bk.state.p.collected.includes('yinyang.activity'), { timeout: 7000 }).catch(() => {}); await keys([]);
    const got = await page.evaluate(() => window.__bk.state.p.collected.includes('yinyang.activity'));
    R.check(got, 'G: la patata del mural se recoge andando hacia ella', 'input', { got });
  }

  if (which.includes('B')) {
    const T = { stepR: 29.1, platL: 4.2, startDa: 23 };
    const degPer = (T.platL / T.stepR) * 180 / Math.PI;
    const geo = () => page.evaluate(({ T, degPer }) => {
      const g = window.__bk, S = g.park.sector('tratratra'), p = g.skater.footPos, r = Math.hypot(p.x, p.z);
      let best = null; for (let da = -40; da <= 40; da += 0.1) { const q = S.P(r, da); const d = Math.hypot(q.x - p.x, q.z - p.z); if (!best || d < best[1]) best = [da, d]; }
      const f = g.rig.forward, right = { x: -f.z, z: f.x };
      return { da: best[0], r, y: p.y, speed: g.skater.speed, grounded: g.skater.grounded, loco: g.skater.loco, stage: g.activities.find((a) => a.id === 'bridgeTalk').stage, reached: g.state.p.bridgeReached, partial: g.state.p.partials.bridgeRest };
    }, { T, degPer });
    // salida: al pie del ascenso, sobre el arco, mirando en sentido horario (da decreciente)
    await page.evaluate(({ T }) => { const g = window.__bk, S = g.park.sector('tratratra'); const a = S.P(T.stepR, T.startDa + 6), b2 = S.P(T.stepR, T.startDa + 5); g.skater.teleport(a, Math.atan2(b2.x - a.x, b2.z - a.z), 'ride'); g.rig.snapBehind(g.skater); g.input.clear(); }, { T });
    await sleep(300);
    const climb = async (fromStage, toStage) => {
      let jumpedFor = fromStage; const t0 = Date.now();
      while (Date.now() - t0 < 90000) {
        const o = await geo();
        if (o.stage >= toStage && o.grounded) break;
        if (o.loco === 'bail') { await keys([]); await sleep(1300); continue; }
        // seguir el arco: punto 2,2 m por delante en sentido horario a r stepR
        const k = await page.evaluate(({ T, da }) => { const g = window.__bk, S = g.park.sector('tratratra'), p = g.skater.footPos, f = g.rig.forward, right = { x: -f.z, z: f.x }; const look = S.P(T.stepR, da - (2.2 / T.stepR) * 180 / Math.PI); const d = { x: look.x - p.x, z: look.z - p.z }, L = Math.hypot(d.x, d.z) || 1; const lat = (d.x * right.x + d.z * right.z) / L; return lat > 0.12 ? ['KeyW', 'KeyD'] : lat < -0.12 ? ['KeyW', 'KeyA'] : ['KeyW']; }, { T, da: o.da });
        const kk = o.speed > 4.6 ? k.filter((x) => x !== 'KeyW') : k;
        await keys(o.grounded ? kk : []);
        // siguiente escalón según la ALTURA a la que está (si cae, vuelve a empezar desde el suelo como un jugador)
        const lvl = Math.round(o.y / 0.8) - 1, next = lvl + 1, edgeDa = T.startDa - degPer * next, arc = (o.da - edgeDa) * Math.PI / 180 * T.stepR;
        if (o.grounded && jumpedFor !== next && arc < 1.35 && arc > 0.3 && o.speed > 2.0) { await page.keyboard.press('Space'); jumpedFor = next; }
        if (o.grounded && arc < -0.5) jumpedFor = -9;   // se pasó sin subir
        if (o.grounded && lvl < 0 && arc < -1) {   // en el suelo y pasado el ascenso: volver al pie (da creciente) rodeando
          await keys([]); await page.evaluate(() => {}); await goTo((await page.evaluate(({ T }) => { const q = window.__bk.park.sector('tratratra').P(T.stepR - 3.5, T.startDa + 6); return { x: q.x, z: q.z }; }, { T })), { tol: 1.5, vmax: 3 });
          await goTo((await page.evaluate(({ T }) => { const q = window.__bk.park.sector('tratratra').P(T.stepR, T.startDa + 5); return { x: q.x, z: q.z }; }, { T })), { tol: 1.0, vmax: 2 });
          jumpedFor = -9;
        }
        await sleep(25);
      }
      await keys([]);
    };
    await climb(-1, 1);
    let o = await geo();
    R.check(o.stage >= 1 && o.partial >= 1 && o.y > 1.4, 'B: subir con ollie las dos primeras plataformas guarda el descanso alcanzado', 'input', o);
    await reload();
    o = await geo();
    R.check(o.partial >= 1 && !o.reached, 'B: tras recargar se conserva el último descanso', 'input', o);
    // vuelve a la posición segura del descanso (checkpoint) y sigue subiendo
    await climb(o.partial, 4);
    // tramo final: la 5.ª plataforma solapa el canto interior del tablero (0,2 m más alto, autostep): girar hacia fuera
    const P5 = await page.evaluate(() => { const S = window.__bk.park.sector('tratratra'), a = S.P(32.6, -14.2), b = S.P(34.5, -10); return { a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z } }; });
    // en la tabla el radio de giro no cabe en la plataforma de 4,2 m (orbitaba el punto): parar, Q (seguir a pie) y andar
    await keys(['KeyS']); await sleep(900); await keys([]); await page.keyboard.press('KeyQ'); await sleep(500);
    await goTo(P5.a, { tol: 0.8, vmax: 2.2 }); await goTo(P5.b, { tol: 1.0, vmax: 2.5 });
    await page.keyboard.press('KeyQ');
    await page.waitForFunction(() => window.__bk.state.p.bridgeReached, { timeout: 8000 }).catch(() => {});
    o = await geo();
    const gateOpen = await page.evaluate(() => { const g = window.__bk; return !!g.park.bridgeGate && g.park.bridgeGate.colliders.every((c) => !c.isEnabled()); });
    await page.screenshot({ path: path.join(R.dir, 'B_arriba.jpg'), type: 'jpeg', quality: 75 });
    R.check(o.reached && gateOpen, 'B: llegar arriba con las 5 plataformas abre la barrera de bajada', 'input', { o, gateOpen });
    await reload();
    const rl = await page.evaluate(() => { const g = window.__bk; return { reached: g.state.p.bridgeReached, gateOpen: g.park.bridgeGate.colliders.every((c) => !c.isEnabled()), talk: !!g.state.p.activities.bridgeTalk }; });
    R.check(rl.reached && rl.gateOpen && !rl.talk, 'B: recargar arriba sin hablar mantiene la bajada abierta', 'input', rl);
    // hablar: andar hasta Aissa y Juseph con el piloto
    const resp0 = await page.evaluate(() => window.__bk.skater.respawns);
    const top = await page.evaluate(() => { const a = window.__bk.manifest.get('bridge.top').pos; return { x: a.x, z: a.z }; });
    await goTo(top, { tol: 1.2, vmax: 2.5, until: () => page.evaluate(() => /HABLAR/.test(document.getElementById('btn-action').textContent) && !document.getElementById('prompt').hidden) });
    await page.waitForFunction(() => /HABLAR/.test(document.getElementById('btn-action').textContent) && !document.getElementById('prompt').hidden, { timeout: 5000 }).catch(() => {});
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__bk.state.p.activities.bridgeTalk && window.__bk.mode === 'explore', { timeout: 12000 }).catch(() => {});
    const tk = await page.evaluate(() => ({ talk: !!window.__bk.state.p.activities.bridgeTalk, mode: window.__bk.mode, avail: window.__bk.pickups.filter((p) => p.id === 'tratratra.activity' && p.available && !p.collected).length }));
    R.check(tk.talk && tk.avail === 1, 'B: hablar con Aissa y Juseph (E) guarda la charla y deja la patata del puente', 'input', tk);
    const rw = await page.evaluate(() => { const P = window.__bk.park.manifest.fries.find((q) => q.id === 'tratratra.activity').pos; return { x: P.x, z: P.z }; });
    await goTo(rw, { tol: 0.4, vmax: 2.5, until: () => page.evaluate(() => window.__bk.state.p.collected.includes('tratratra.activity')) });
    const got = await page.evaluate(() => window.__bk.state.p.collected.includes('tratratra.activity'));
    R.check(got, 'B: la patata del tablero se recoge andando hasta ella', 'input', { got });
    // bajada: por la barrera abierta y la rampa hasta el suelo, sin reaparecer
    const gate = await page.evaluate(() => { const t = window.__bk.park.bridgeGate.colliders[0].translation(); return { x: t.x, z: t.z }; });
    const yTop = await page.evaluate(() => window.__bk.skater.footPos.y);
    const g1 = await goTo(gate, { tol: 1.0, vmax: 3 });
    const bot = await page.evaluate(() => { const a = window.__bk.manifest.get('bridge.rampBottom').pos; return { x: a.x, z: a.z }; });
    const g2 = await goTo(bot, { tol: 1.5, vmax: 5, maxMs: 20000 });
    await page.screenshot({ path: path.join(R.dir, 'B_bajada.jpg'), type: 'jpeg', quality: 75 });
    const fin = await page.evaluate(() => ({ y: window.__bk.skater.footPos.y, respawns: window.__bk.skater.respawns }));
    R.check(yTop > 4 && g1.L < 1.0 && g2.L < 1.5 && fin.y < 0.3 && fin.respawns === resp0, 'B: bajada por la barrera abierta y la rampa hasta el suelo con entrada normal (sin reaparecer)', 'input', { yTop, atGate: g1.L, atBottom: g2.L, fin, resp0 });
  }
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await keys([]).catch(() => {}); await browser.close(); R.finish(); }
