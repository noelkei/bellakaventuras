// IT8 · G2 · partida larga: `--min` minutos (12) de vueltas por todo el parque (las 5 zonas, el centro, el exterior y la plaza), entrando y
// saliendo de actividades (grind, baile, banco, escalera, SKILLS) y abriendo la pausa; tras cada vuelta, recogida de basura forzada (CDP) y
// medida de: montón de JS, geometrías, texturas y programas de three, nodos del DOM, objetos de la escena y tirones (> 50 ms entre
// fotogramas) de la vuelta.
// Criterio (guardián): de la vuelta 2 a la última, geometrías, texturas y programas no crecen más de un 10 % ni objetos de la escena un 5 %;
// el montón de JS no crece > 20 %; los tirones por vuelta no se duplican.
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S20, toAct, saveJson } from './lib8.mjs';
const R = new Report('it8-memoria-larga', { task: arg('task', 'IT8') });
const MIN = +arg('min', '12');
const EJE = { no_me_guillo: 45, nosvamosdeaqui: 333, yinyang: 261, tratratra: 189, fashion_girl: 117 }, pol = (r, th) => [r * Math.sin(th * Math.PI / 180), -r * Math.cos(th * Math.PI / 180)];
const PUNTOS = [...Object.values(EJE).map((t) => pol(32, t)), [3, 3], [0, -47], [47, 0], null];
const ACTS = ['act.skateTutorial', 'act.danceCombo', 'act.benchSit'];
await runTest(R, async () => {
  const b = await launch(['--enable-precise-memory-info', '--js-flags=--expose-gc']); const vueltas = [];
  try {
    const page = await open8(b, R, dev('pc720'), 'h', { save: S20 });
    await start8(page, false); await sleep(2000);
    const cdp = await page.target().createCDPSession(); await cdp.send('HeapProfiler.enable');
    await page.evaluate(() => { window.__tir = 0; window.__fr = 0; let last = performance.now(); const f = (t) => { if (t - last > 50) window.__tir++; window.__fr++; last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
    const medir = async () => { await cdp.send('HeapProfiler.collectGarbage'); await sleep(400);
      return page.evaluate(() => { const g = window.__bk, i = g.renderer.info; let obj = 0; g.scene.traverse(() => obj++); const r = { heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, geo: i.memory.geometries, tex: i.memory.textures, prog: i.programs?.length ?? null, dom: document.getElementsByTagName('*').length, obj, tir: window.__tir, fr: window.__fr }; window.__tir = 0; window.__fr = 0; return r; }); };
    const t0 = Date.now(); let n = 0;
    while (Date.now() - t0 < MIN * 60000) {
      for (const p of PUNTOS) {
        await page.evaluate((p) => { const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier, s = g.skater; if (g.paused) g.setPaused(false); g.input.clear();
          if (!p) { const sp = g.manifest.spawn; s.teleport(sp.pos.clone(), sp.heading, 'walk'); } else { const h = g.world.castRay(new RA.Ray({ x: p[0], y: 20, z: p[1] }, { x: 0, y: -1, z: 0 }), 30, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider); s.teleport(new T.Vector3(p[0], h ? 20 - h.timeOfImpact + 0.05 : 0.05, p[1]), s.heading, 'walk'); }
          g.rig.snapBehind(s); }, p);
        await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.press('Space'); await sleep(800); await page.keyboard.up('KeyW'); await page.keyboard.press('KeyQ'); await sleep(600); await page.keyboard.press('KeyQ'); await sleep(400);
      }
      for (const a of ACTS) { await toAct(page, a); await sleep(700); await page.keyboard.press('KeyE'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(500);
        await page.evaluate(() => { const b = document.getElementById('btn-exit-act'); if (b && !b.hidden) b.click(); else document.getElementById('btn-resume').click(); }); await sleep(800);
        await page.evaluate(() => { const g = window.__bk; for (const x of g.activities) if (x.busy || x.seated) x.cancel?.(); if (!document.getElementById('dialog').hidden) document.getElementById('dialog-ok').click(); }); await sleep(300); }
      await page.keyboard.press('Digit2'); await sleep(2500); await page.keyboard.press('KeyW'); await sleep(300);
      await page.keyboard.press('Digit6'); await sleep(2500);
      const m = await medir(); m.vuelta = ++n; m.min = +((Date.now() - t0) / 60000).toFixed(1); vueltas.push(m); console.log('vuelta', JSON.stringify(m));
    }
    R.measure('vueltas', vueltas);
    if (vueltas.length < 3) { R.invalid('menos de 3 vueltas: no se puede comparar', vueltas); return; }
    const a = vueltas[1], z = vueltas.at(-1), cre = (k) => (a[k] ? (z[k] - a[k]) / a[k] : 0);
    R.check(cre('geo') <= 0.10 && cre('tex') <= 0.10 && (a.prog == null || cre('prog') <= 0.10), `partida larga (${vueltas.length} vueltas, ${MIN} min): geometrías, texturas y programas estables (${a.geo}→${z.geo}, ${a.tex}→${z.tex}, ${a.prog}→${z.prog})`, 'unit', { a, z });
    R.check(cre('obj') <= 0.05, `objetos de la escena estables (${a.obj}→${z.obj})`, 'unit', { a: a.obj, z: z.obj });
    if (a.heap != null) R.check(cre('heap') <= 0.20, `montón de JS sin crecer > 20 % (${a.heap}→${z.heap} MB)`, 'unit', { a: a.heap, z: z.heap });
    const tirA = vueltas.slice(1, 3).reduce((s, v) => s + v.tir / Math.max(1, v.fr), 0) / 2, tirZ = vueltas.slice(-2).reduce((s, v) => s + v.tir / Math.max(1, v.fr), 0) / 2;
    R.check(tirZ <= Math.max(0.01, tirA * 2), `los tirones no aumentan con el tiempo (${(tirA * 100).toFixed(2)} % → ${(tirZ * 100).toFixed(2)} % de fotogramas > 50 ms)`, 'unit', { tirA, tirZ });
    saveJson('G2-memoria/resultado.json', vueltas);
  } finally { await b.close(); }
}, { timeoutMs: (MIN + 10) * 60000 });
