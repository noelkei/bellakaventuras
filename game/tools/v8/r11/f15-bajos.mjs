// R11 · F15 · hallazgos bajos baratos (2 repeticiones).
//  SIS-32/PADX-03  al empezar el baile de FASHION GIRL el foco NO está en un botón de la cruceta (Espacio/Enter/A contaban como «↑»).
//  GUIA-06  NO ME GUILLO con la charla hecha y el premio sin recoger: el objetivo dice que el premio espera y dónde.
//  PADX-05  con el botón de acción a la vista, al pasar de teclado a mando la tecla mostrada cambia de E a Y.
//  SIS-13   el rótulo del preview final no es el provisional «Preview de prueba».
//  NMG-16   (V10: el circuito pasa a ser el grind de NVDA) el aviso de fin del circuito dice que la patata está junto a la meta (no «en la salida»).
//   node tools/v8/r11/f15-bajos.mjs --url pre --task R11 --label pre
import { Report, runTest, argUrl } from '../lib.mjs';
import { launch, abrir, sleep, SAVE_20 } from './f5-lib.mjs';
const R = new Report('r11-f15-bajos');
const pol = (r, th) => [r * Math.sin(th * Math.PI / 180), 0.02, -r * Math.cos(th * Math.PI / 180)];
await runTest(R, async () => {
  const b = await launch();
  try {
    for (let k = 1; k <= 2; k++) {
      { const page = await abrir(b, R, { save: { ...SAVE_20, activities: { ...SAVE_20.activities, danceCombo: false }, collected: SAVE_20.collected.filter((c) => c !== 'fashion_girl.activity') } });
        const r = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, z = g.park.zones.get('act.danceCombo'); window.__R11.releaseAll();
          g.skater.teleport(new T.Vector3(z.pos.x, (z.yMin ?? 0) + 0.3, z.pos.z), 0, 'walk'); g.autoMode = true; await g.simulate(0.5);
          const a = g.activities.find((x) => x.id === 'danceCombo'); a.start(); await new Promise((r) => setTimeout(r, 400)); await g.simulate(0.3);
          const ae = document.activeElement; return { open: !document.getElementById('dance').hidden, focus: ae?.id || ae?.tagName, enPad: !!ae?.closest?.('#dance-pad') }; });
        if (!r.open) R.invalid(`#${k} SIS-32: no se abrió el baile`, r);
        else R.check(!r.enPad, `#${k} SIS-32/PADX-03 al empezar el baile el foco no está en la cruceta (foco: ${r.focus})`, 'input', r);
        await page.close(); }
      { const page = await abrir(b, R, { save: { ...SAVE_20, collected: SAVE_20.collected.filter((c) => c !== 'no_me_guillo.activity') } });
        const o = await page.evaluate(async (p) => { const g = window.__bk, T = window.__bkTHREE; window.__R11.releaseAll(); g.skater.teleport(new T.Vector3(p[0], p[1], p[2]), 0, 'walk'); g.autoMode = true; await g.simulate(0.5); g.updateObjective(); return document.getElementById('objective').textContent; }, pol(30, 36));
        R.check(/premio/i.test(o) && /Pantera/.test(o), `#${k} GUIA-06 NMG con el premio sin recoger: «${o}»`, 'input', { o });
        // PADX-05: el juego vuelve a ofrecer la acción cada paso con la tecla de la fuente activa; antes la caché del botón la ignoraba
        const z = await page.evaluate(() => { const g = window.__bk; g.input.source = 'keyboard'; g.offerAction('PRUEBA', () => {}, 'r11-f15');
          const k1 = document.querySelector('#btn-action kbd')?.textContent; g.input.source = 'gamepad'; g.offerAction('PRUEBA', () => {}, 'r11-f15');
          const k2 = document.querySelector('#btn-action kbd')?.textContent; g.withdrawAction('r11-f15'); g.input.source = 'keyboard'; return { k1, k2 }; });
        R.check(z.k1 === 'E' && z.k2 === 'Y', `#${k} PADX-05 tecla del botón de acción: teclado ${z.k1} → mando ${z.k2} (esperado E → Y)`, 'input', z);
        await page.close(); }
      { const page = await b.newPage(); await page.goto(argUrl(), { waitUntil: 'load' });
        const r = await page.evaluate(async () => { const cfg = await (await fetch(new URL('./game-config.json', document.baseURI))).json();
          await new Promise((r) => setTimeout(r, 3000));
          const urls = [...new Set(performance.getEntriesByType('resource').map((e) => e.name).filter((u) => /\.js(\?|$)/.test(u)))];
          let js = ''; for (const u of urls) js += await (await fetch(u)).text();
          for (const m of js.matchAll(/["'](\.\/[\w.-]+\.js)["']/g)) { try { js += await (await fetch(new URL(m[1], urls[0]))).text(); } catch { /* */ } }
          return { label: cfg?.final?.visualLabel ?? cfg?.preview?.visualLabel ?? JSON.stringify(cfg).match(/"visualLabel":"([^"]*)"/)?.[1], meta: /Circuito completado! Tu patata est.{1,6} junto a la meta/.test(js), salida: /Tu patata est.{1,6} en la salida/.test(js), nv: /Grind completo otra vez/.test(js) && !/Circuito completado/.test(js), n: js.length }; });
        R.check(r.label && r.label !== 'Preview de prueba', `#${k} SIS-13 rótulo del preview: «${r.label}» (no el provisional)`, 'static', r);
        // V10 (cambio de diseño aprobado): el circuito tutorial ya no existe; su sitio lo ocupa el grind de NOSVAMOSDEAQUÍ, cuyo final es la frase de
        // Fennec y la patata que aparece a su lado (revealReward): basta con que no quede ningún «…en la salida»
        R.check((r.meta || r.nv) && !r.salida, `#${k} NMG-16 fin del circuito (V10: del grind de NVDA): sin «…en la salida» (${r.nv ? 'NVDA' : 'circuito'})`, 'static', r);
        await page.close(); }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
