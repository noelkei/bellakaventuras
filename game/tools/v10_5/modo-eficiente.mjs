// V10.5 R0 · guardián del «Modo eficiente» (E5-33, E5-40, E5-43; T4, T7):
//  · la casilla sale en Ajustes solo en táctil (no en ordenador), apagada por defecto, y se guarda en la partida;
//  · encendido (en caliente): zona de sombras 28×28 m con lejanía 60 y borde desvanecido; las sombras dejan de recalcularse enteras en cada
//    fotograma; personajes lejanos a menos ritmo; tope de 3 pasos de física por fotograma, sin tope en la cinemática del parque ni en la escena
//    final; en la escena final, la zona de sombras grande; apagado, todo como antes;
//  · aviso «¿Va lento?…» una sola vez si va por debajo de ~25 FPS unos segundos explorando (no en el tutorial);
//  · 5 toques seguidos en el contador de patatas encienden y apagan el recuadro de FPS, y arrastrar desde el contador sigue moviendo la cámara.
import { Report, runTest, launch, sleep, SAVE_20 } from '../v8/lib.mjs';
import { dev, open7, start7 } from './lib105.mjs';
const R = new Report('modo-eficiente');
const KEY = 'bellakaventuras.remake.save';
const S = { ...SAVE_20, settings: { iosAppAsked: true } };
const info = (page) => page.evaluate(() => { const g = window.__bk, c = g.sun.shadow.camera;
  return { box: +(c.right - c.left).toFixed(2), far: c.far, auto: g.renderer.shadowMap.autoUpdate, policy: g.shadowPolicy ?? null, edge: g.shadowEdge ?? null, tiers: g.stats.npcTiers ? { ...g.stats.npcTiers } : null, eff: !!g.state.p.settings.eficiente }; });
const steps = (page, extra) => page.evaluate((extra) => { const g = window.__bk; const keep = g.paused; g.setPaused(true); g.acc = 0; if (extra === 'cine') g.narr.inCine = true; const n = g.tick(0.1); if (extra === 'cine') g.narr.inCine = false; g.acc = 0; g.setPaused(keep); return n; }, extra);
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; for (let n = e; n; n = n.parentElement) { if (n.hidden) return false; const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; }, sel);

await runTest(R, async () => {
  const b = await launch(), errors = [];
  try {
    // ordenador: sin casilla
    { const page = await open7(b, R, dev('pc720'), 'h', { save: S, query: '?bktest=1&narr=off', errors }); await start7(page, false); await sleep(800);
      await page.keyboard.press('Escape'); await sleep(400); await page.evaluate(() => document.getElementById('btn-settings').click()); await sleep(400);
      const v = await vis(page, '#opt-eficiente');
      R.check(!v, 'ordenador: la casilla «Modo eficiente» no sale en Ajustes', 'input', { visible: v });
      await page.close(); }
    // móvil
    const page = await open7(b, R, dev('ip14'), 'h', { save: S, query: '?bktest=1&narr=off', errors }); await start7(page, true); await sleep(1200);
    await page.keyboard.press('Escape'); await sleep(400); await page.evaluate(() => document.getElementById('btn-settings').click()); await sleep(400);
    const v = await vis(page, '#opt-eficiente'), off0 = await page.evaluate(() => document.getElementById('opt-eficiente')?.checked ?? null);
    R.check(v && off0 === false, 'táctil: la casilla «Modo eficiente» sale en Ajustes y empieza apagada', 'input', { visible: v, marcada: off0 });
    const base = await info(page), n0 = await steps(page);
    if (v) { const r = await page.evaluate(() => { const e = document.getElementById('opt-eficiente'); e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }); await sleep(300); await page.touchscreen.tap(r.x, r.y); await sleep(400); }   // como un jugador: se desplaza hasta la casilla y la toca
    const dk = await page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)).settings.eficiente; } catch { return null; } }, KEY);
    R.check(dk === true, 'al marcarla queda guardada en la partida', 'input', { disco: dk });
    await page.evaluate(() => { document.getElementById('btn-settings-close').click(); }); await sleep(200); await page.evaluate(() => document.getElementById('btn-resume').click()); await sleep(1500);
    const on = await info(page), n1 = await steps(page), n2 = await steps(page, 'cine');
    R.check(base.box >= 39 && on.box > 27 && on.box < 29 && on.far <= 60.5 && (on.edge ?? 0) > 0, 'encendido: zona de sombras 28×28 m, lejanía 60 y borde desvanecido (apagado: 40 m)', 'unit', { base, on });
    R.check(on.auto === false && !!on.policy, 'encendido: las sombras dejan de recalcularse enteras en cada fotograma (política propia)', 'unit', on);
    R.check(n0 === 6 && n1 === 3 && n2 === 6, 'tope de pasos: 6 apagado; 3 encendido; sin tope en la cinemática', 'unit', { apagado: n0, encendido: n1, cine: n2 });
    // personajes lejanos: desde el centro del parque los NPC quedan lejos
    await page.evaluate(() => { const g = window.__bk, a = g.park.manifest.get('sn.retry'); g.skater.teleport(a.pos.clone(), a.heading, 'walk'); g.rig.snapBehind(g.skater); }); await sleep(2500);
    const t = await info(page);
    R.check(!!t.tiers && (t.tiers.mid + t.tiers.low + t.tiers.off) > 0, 'encendido: los personajes lejanos o fuera de cuadro se animan a menos ritmo', 'unit', t.tiers);
    // escena final: zona grande
    await page.evaluate(() => { const g = window.__bk; g.state.p.finalDone = true; g.state.p.finalProof = { kind: 'secretnovio_v10', at: 'x' }; g.showPreview(); }); await sleep(3500);
    const fin = await info(page), nf = await page.evaluate(() => { const g = window.__bk; g.acc = 0; return g.tick(0.1); });
    R.check(fin.box >= 39 && nf === 6, 'escena final: zona de sombras grande y sin tope de pasos', 'unit', { fin, pasos: nf });
    await page.keyboard.press('Escape'); await sleep(2500);
    // aviso de «va lento» (FPS forzados a 20 explorando)
    await page.evaluate(() => { const g = window.__bk; g.state.p.settings.eficiente = false; g.applySettings(); Object.defineProperty(g, 'frameMs', { get: () => 50, set() {}, configurable: true }); });   // el aviso es para quien aún no lo tiene
    let toastTxt = null; for (let i = 0; i < 80 && !toastTxt; i++) { toastTxt = await page.evaluate(() => { const t = document.getElementById('toast'), h = document.getElementById('hint'); const s = [t, h].filter((e) => !e.hidden).map((e) => e.textContent).join(' '); return /lento/i.test(s) ? s : null; }); await sleep(500); }
    await page.evaluate(() => { delete window.__bk.frameMs; window.__bk.frameMs = 16; });
    const once = await page.evaluate(() => window.__bk.state.p.hints.filter((h) => /lento/.test(h)).length);
    R.check(!!toastTxt && /eficiente/i.test(toastTxt) && once === 1, 'por debajo de ~25 FPS explorando sale una vez «¿Va lento? Prueba el modo eficiente en Ajustes»', 'input', { texto: toastTxt, veces: once });
    // contador de FPS oculto: 5 toques en el contador
    const c = await page.evaluate(() => { const r = document.getElementById('counter').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    for (let i = 0; i < 5; i++) { await page.touchscreen.tap(c.x, c.y); await sleep(160); } await sleep(500);
    const dbg = await page.evaluate(() => { const d = document.getElementById('debug'); return !d.hidden && /fps/i.test(d.textContent); });
    for (let i = 0; i < 5; i++) { await page.touchscreen.tap(c.x, c.y); await sleep(160); } await sleep(500);
    const dbg2 = await page.evaluate(() => !document.getElementById('debug').hidden);
    const yaw0 = await page.evaluate(() => window.__bk.rig.yaw); const cdp = await page.createCDPSession();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id: 4 }] }); for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + i * 18, y: c.y + 4, id: 4 }] }); await sleep(20); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); await sleep(300); const yaw1 = await page.evaluate(() => window.__bk.rig.yaw);
    R.check(dbg && !dbg2 && Math.abs(yaw1 - yaw0) > 0.02, '5 toques en el contador encienden el recuadro de FPS, otros 5 lo apagan, y arrastrar desde el contador mueve la cámara', 'input', { encendido: dbg, apagado: !dbg2, giro: +(yaw1 - yaw0).toFixed(3) });
    await page.close();
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
