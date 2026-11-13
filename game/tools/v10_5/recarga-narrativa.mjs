// V10.5 R0 · guardián de recargas e interrupciones de la narrativa (AM-30, AM-31, AM-32; E5-29…E5-31), en iPhone 12–15 vertical con el dedo:
//  · recargar durante la cinemática del parque: al volver se retoma desde la cinemática (saltable), sigue la bienvenida y la guía, y el estado
//    acaba en «hecho» (antes quedaba en «tutorial-hecho» para siempre y el modo ayuda no funcionaba);
//  · recargar a mitad del tutorial: sigue en el paso guardado (no vuelve a la primera frase);
//  · recargar en mitad de una presentación de zona (PAS): se vuelve a ofrecer al explorar;
//  · «Se ha perdido la imagen» con un 2D abierto queda por ENCIMA del 2D y su «Continuar» (con el dedo) recarga;
//  · la pausa abierta con un 2D abierto queda por encima del 2D (recibe los toques).
import { Report, runTest, launch, sleep, withTimeout } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
import { dev, open7, start7 } from './lib105.mjs';
const R = new Report('recarga-narrativa');
const N = (vistos, ayuda = 'no') => ({ v: 1, estado: 'hecho', paso: '', practica: true, vistos, ayuda });
const BASE = ['PLA-10', 'CIN-01', 'PAR', 'NMG', 'OBJ'];
const d2 = (page) => page.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden ? { t: d.querySelector('.d2-text').textContent.slice(0, 60), n: d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)').length } : null; });
const narr = (page) => page.evaluate(() => { const n = window.__bk.state.p.narr; return { estado: n.estado, paso: n.paso, vistos: n.vistos.slice(), ayuda: n.ayuda, inCine: window.__bk.narr.inCine, ex: window.__bk.narr.exercise?.id ?? null }; });
async function until(page, fn, ms, ...a) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn, ...a); if (v) return v; await sleep(150); } return null; }
async function tapC(page, sel) { const b = await page.evaluate((q) => { const e = [...document.querySelectorAll(q)].find((x) => x.getBoundingClientRect().width > 0 && !x.closest('[hidden]')); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); if (!b) return false; await page.touchscreen.tap(b.x, b.y); await sleep(350); return true; }
async function reload(page) { await withTimeout(page.reload({ waitUntil: 'load' }), 60000, 'recarga'); await withTimeout(page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 }), 95000, 'listo'); await start7(page, true); await sleep(1500); }
/** Avanza los 2D con el dedo (en una pregunta, «No, gracias») hasta que se cumpla `fn` o pase `ms`. */
async function playUntil(page, fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; const s = await d2(page);
  if (s) { await sleep(500); if (s.n === 2) await tapC(page, '#d2 .d2-row .d2-btn:not(.d2-skip):not(.primary)'); else await tapC(page, '#d2 .d2-row .d2-btn.primary'); } else await sleep(250); } return false; }

await runTest(R, async () => {
  const b = await launch(), errors = [], D = dev('ip14');
  try {
    // 1 · cinemática
    { const page = await open7(b, R, D, 'v', { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', errors }); await start7(page, true);
      await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden; }, 15000); await sleep(600);
      await page.keyboard.press('KeyT');   // preparación: saltar el tutorial con T
      const inCine = await playUntil(page, () => window.__bk.narr.inCine, 60000); await sleep(3000);
      const a = await narr(page);
      await reload(page);
      const again = await playUntil(page, () => window.__bk.narr.inCine, 40000);
      if (again) { await sleep(1500); await page.keyboard.press('Escape'); }   // se salta la cinemática repetida
      const done = await playUntil(page, () => window.__bk.state.p.narr.estado === 'hecho' && !window.__bk.narr.busy, 120000);
      const z = await narr(page);
      R.check(inCine && a.estado === 'tutorial-hecho' && again && done && z.vistos.includes('PAR') && z.vistos.includes('NMG'), 'recargar en la cinemática: se retoma desde la cinemática, siguen la bienvenida y la guía y el estado acaba en «hecho»', 'input', { antes: a, repite: !!again, final: z });
      await page.close(); }
    // 2 · tutorial
    { const page = await open7(b, R, D, 'v', { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', errors }); await start7(page, true);
      const first = (await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelector('.d2-text').textContent.slice(0, 60) : null; }, 15000));
      // hasta el ejercicio de subir al skate (PLA-05): la marca se cumple colocando a ANMI en ella
      const t0 = Date.now(); let ex = null;
      while (Date.now() - t0 < 90000) { const n = await narr(page); ex = n.ex;
        if (n.ex === 'PLA-05') break;
        if (n.ex === 'PLA-03') { await page.evaluate(() => { const g = window.__bk; let m = null; g.scene.traverse((o) => { if (o.name === 'TUTORIAL_MARCA') m = o; }); if (m) { g.skater.teleport(m.position.clone().setY(g.skater.footPos.y), g.skater.heading, 'walk'); g.rig.snapBehind(g.skater); } }); await sleep(1500); continue; }
        const s = await d2(page); if (s) { await sleep(500); await tapC(page, '#d2 .d2-row .d2-btn.primary'); } else await sleep(300); }
      const a = await narr(page);
      await reload(page);
      const after = await until(page, () => { const d = document.getElementById('d2'), n = window.__bk.narr; if (n.exercise) return { ex: n.exercise.id }; return d && !d.hidden ? { t: d.querySelector('.d2-text').textContent.slice(0, 60) } : null; }, 20000);
      R.check(ex === 'PLA-05' && a.paso === 'PLA-05' && !!after && after.t !== first && (after.ex === 'PLA-05' || !!after.t), 'recargar a mitad del tutorial: sigue en el paso guardado (no vuelve a la primera frase)', 'input', { primera: first, antes: a, despues: after });
      await page.close(); }
    // 3 · presentación (PAS) cortada
    { const col = ['no_me_guillo.visible', 'no_me_guillo.medium', 'no_me_guillo.hidden'];
      const page = await open7(b, R, D, 'v', { save: { ...FRESH, collected: col, activities: { ...FRESH.activities, pantherTalk: true }, narr: N(BASE), settings: { iosAppAsked: true } }, query: '?bktest=1', errors }); await start7(page, true); await sleep(1500);
      await page.evaluate(() => { const g = window.__bk, x = g.pickups.find((q) => q.id === 'no_me_guillo.activity'); x.available = true; x.group.visible = true; g.skater.teleport(x.spawn.pos.clone(), 0, 'walk'); g.rig.snapBehind(g.skater); });
      const p1 = await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelector('.d2-text').textContent.slice(0, 60) : null; }, 12000);
      await sleep(600); await tapC(page, '#d2 .d2-row .d2-btn.primary'); await sleep(1200);
      const a = await narr(page);
      await reload(page);
      const re = await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelector('.d2-text').textContent.slice(0, 60) : null; }, 25000);
      const done = await playUntil(page, () => window.__bk.state.p.narr.vistos.includes('PAS-02') && !window.__bk.narr.busy, 60000);
      R.check(!!p1 && a.vistos.includes('PAS-01') && !a.vistos.includes('PAS-02') && !!re && done, 'recargar en una presentación: se vuelve a ofrecer al explorar y se termina', 'input', { antes: a.vistos.slice(-3), ofrecida: re, terminada: done });
      await page.close(); }
    // 4 · pausa y «Se ha perdido la imagen» por encima del 2D
    { const page = await open7(b, R, D, 'v', { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', errors }); await start7(page, true);
      await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden; }, 15000); await sleep(600);
      await page.keyboard.press('Escape'); await sleep(600);
      const pz = await page.evaluate(() => { const b = document.getElementById('btn-resume').getBoundingClientRect(), at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { pausa: !document.getElementById('pause').hidden, recibe: at?.id === 'btn-resume' }; });
      R.check(pz.pausa && pz.recibe, 'con un 2D abierto, la pausa queda por encima y recibe los toques', 'input', pz);
      await tapC(page, '#btn-resume'); await sleep(600);
      await page.evaluate(() => { window.__bk.renderer.getContext().getExtension('WEBGL_lose_context')?.loseContext(); }); await sleep(1500);
      const g1 = await page.evaluate(() => { const g = document.getElementById('glost'), bt = document.getElementById('btn-glost').getBoundingClientRect(), at = document.elementFromPoint(bt.left + bt.width / 2, bt.top + bt.height / 2); return { glost: !g.hidden, recibe: at?.id === 'btn-glost' }; });
      const nav = page.waitForNavigation({ timeout: 20000 }).then(() => true).catch(() => false); await tapC(page, '#btn-glost'); const navOk = await nav;
      R.check(g1.glost && g1.recibe && navOk, '«Se ha perdido la imagen» queda por encima del 2D y su «Continuar» (con el dedo) recarga', 'input', { ...g1, recarga: navOk });
      await page.close(); }
    R.check(!errors.filter((e) => !/CONTEXTO PERDIDO/.test(e)).length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 1500000 });
