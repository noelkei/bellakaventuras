// V10.6 · guardián del resto de H8-10 (V10/IT9/B2_RECORRIDO.md §2.5): con una presentación de zona (PAS-01) en pantalla, pausa → «Volver a la plaza»:
//  · la presentación se corta YA (narrativa libre, sin 2D, explorando; la cámara de la plaza quieta, no viajando por debajo);
//  · después se vuelve a ofrecer y se termina (no se pierde) y la cámara sigue a ANMI al andar;
//  · en el tutorial (y la bienvenida) «Volver a la plaza» no se ofrece en la pausa.
// Ordenador, teclado. Uso: node tools/v10_6/plaza-narrativa.mjs --url <build> [--task V10-6] [--label r]
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
import { open8, start8, dev, S0, collectFry, drainUI, until } from '../it8/lib8.mjs';
const R = new Report('v106-plaza-narrativa', { task: arg('task', 'V10-6') });
const S_NMG3 = { ...S0, collected: ['no_me_guillo.visible', 'no_me_guillo.medium', 'no_me_guillo.hidden'], activities: { ...S0.activities, pantherTalk: true } };
const narr = (page) => page.evaluate(() => { const g = window.__bk, n = g.state.p.narr; return { vistos: n.vistos.slice(-4), busy: g.narr.busy, d2: !document.getElementById('d2').hidden, mode: g.mode, cam: g.rig.mode,
  camPos: g.rig.cam.position.toArray().map((v) => +v.toFixed(2)), dSpawn: +g.skater.footPos.distanceTo(g.park.manifest.spawn.pos).toFixed(2) }; });
await runTest(R, async () => {
  const b = await launch(); const d = dev('pc720'); const out = {};
  try {
    { const errors = [], page = await open8(b, R, d, 'h', { save: S_NMG3, query: '?bktest=1', errors });
      try { await start8(page, false); await sleep(1500); await drainUI(page, false, 10000);
        await page.evaluate(() => { const g = window.__bk, x = g.pickups.find((q) => q.id === 'no_me_guillo.activity'); x.available = true; x.group.visible = true; });
        await collectFry(page, 'no_me_guillo.activity', 2500);
        const pas = await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelector('.d2-text').textContent.slice(0, 50) : null; }, 15000);
        if (!pas) R.invalid('no salió PAS-01'); else {
          await page.keyboard.press('Escape'); await sleep(700); await page.click('#btn-plaza'); await sleep(600); await page.click('#btn-plaza-yes'); await sleep(700);
          const a = await narr(page); await sleep(700); const a2 = await narr(page);
          const mov = Math.hypot(...a.camPos.map((v, i) => v - a2.camPos[i]));
          out.corte = { pas, a, a2, camMov: +mov.toFixed(2) };
          R.check(!a.busy && !a.d2 && a.mode === 'explore' && a.dSpawn < 3, '«Volver a la plaza» con una presentación en pantalla la corta al momento (sin 2D, explorando, en la plaza)', 'input', out.corte);
          R.check(mov < 0.3, 'tras volver, la cámara no sigue viajando por la presentación cortada', 'input', { camMov: out.corte.camMov });
          const fin = await drainUI(page, false, 45000); const n = await narr(page);
          R.check(n.vistos.includes('PAS-02') || (await page.evaluate(() => window.__bk.state.p.narr.vistos.includes('PAS-02'))), 'la presentación cortada se vuelve a ofrecer y se termina', 'input', { vistos: n.vistos, limpio: fin?.ok });
          await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW'); await sleep(600);
          const c = await page.evaluate(() => { const g = window.__bk; return { cam: g.rig.mode, dist: +g.rig.cam.position.distanceTo(g.skater.footPos).toFixed(2) }; });
          out.despues = c; R.check(c.cam === 'follow' && c.dist < 9, 'al acabar, la cámara sigue a ANMI al andar', 'input', c);
        }
        R.check(!errors.length, 'sin errores (presentación)', 'emulation', errors.slice(0, 3));
      } finally { await page.close(); } }
    { const errors = [], page = await open8(b, R, d, 'h', { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', errors });
      try { await start8(page, false);
        const ex = await until(page, async () => { const g = window.__bk; if (g.narr.exercise) return true; const d = document.getElementById('d2'); if (d && !d.hidden) document.querySelector('#d2 .d2-btn.primary')?.click(); return false; }, 60000);
        if (!ex) R.invalid('no llegó el primer ejercicio del tutorial'); else {
          await page.keyboard.press('Escape'); await sleep(700);
          const v = await page.evaluate(() => ({ pausa: !document.getElementById('pause').hidden, plaza: !document.getElementById('btn-plaza').hidden }));
          out.tutorial = v; R.check(v.pausa && !v.plaza, 'en el tutorial, la pausa no ofrece «Volver a la plaza»', 'input', v);
        }
        R.check(!errors.length, 'sin errores (tutorial)', 'emulation', errors.slice(0, 3));
      } finally { await page.close(); } }
    R.measure('casos', out);
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
