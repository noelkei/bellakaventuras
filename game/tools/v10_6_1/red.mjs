// V10.6.1 · red de seguridad del cronómetro («blindado»): se ROMPE a propósito cada entrada suya (?bktest: window.__bkCronoRomper = <parte>)
// y se comprueba que el juego sigue como si no existiera: arranca, el reloj del juego avanza, se puede terminar y la escena final sale; el
// cronómetro se apaga y se esconde; ningún error llega a la página. Móvil vertical (iPhone y Android), la prioridad del usuario.
// Uso: node tools/v10_6_1/red.mjs --url http://127.0.0.1:5249/ [--task V10-6-1] [--label r]
import { Report, runTest, launch, sleep, arg, SAVE_20 } from '../v8/lib.mjs';
import { open8, start8, dev, until, S0 } from '../it8/lib8.mjs';
const R = new Report('v1061-red', { task: arg('task', 'V10-6-1') });
const romperDesdeElPrincipio = (que) => [(q) => { window.__bkCronoRomper = q; }, que];
const reloj = (page) => page.evaluate(() => window.__bk.clock);

await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [parte, di] of [['empezar', 'ip14'], ['paso', 'and360'], ['terminar', 'ip14'], ['terminar-record', 'and360'], ['rotulo', 'and412'], ['rotulo-abrir', 'ip14'], ['aviso-reinicio', 'and360']]) {
      const tag = `rompe «${parte}» [${di} v]`, errors = [], avisosConsola = [];
      const vieja = parte === 'aviso-reinicio', temprano = parte === 'empezar' || parte === 'paso' || vieja;   // el aviso de reiniciar sale con una partida vieja
      const page = await open8(b, R, dev(di), 'v', { save: vieja ? S0 : null, query: '?bktest=1&narr=off', errors, init: temprano ? [romperDesdeElPrincipio(parte)] : [] });
      page.on('console', (m) => { if (/cronómetro apagado/.test(m.text())) avisosConsola.push(m.text().slice(0, 120)); });
      try {
        await start8(page, true); await sleep(vieja ? 5000 : 1500);
        const c0 = await reloj(page); await sleep(2000); const c1 = await reloj(page);
        R.check(c1 - c0 > 1.5, `${tag}: el juego arranca y su reloj avanza (${(c1 - c0).toFixed(2)} s en 2 s)`, 'emulation', { c0, c1 });
        if (!temprano) {
          if (!(await until(page, () => window.__bk.activities?.some((a) => a.id === 'secretJump') && window.__bk.mode === 'explore', 90000))) { R.invalid(`${tag}: el reto final no llegó a cargar`); continue; }
          await page.evaluate((ids, q) => { window.__bkCronoRomper = q; const s = window.__bk.state; for (const id of ids) if (!s.p.collected.includes(id)) s.p.collected.push(id);
            window.__bk.activities.find((x) => x.id === 'secretJump').debugComplete(); }, SAVE_20.collected, parte);
          const cine = await until(page, () => window.__bk.cine?.active, 10000);
          R.check(!!cine, `${tag}: la escena final sale igual`, 'emulation', { cine: !!cine });
          await sleep(1500); await page.evaluate(() => window.__bk.closePreview());
          const vuelta = await until(page, () => window.__bk.mode === 'explore' && !window.__bk.cine, 15000);
          await sleep(2500); const d0 = await reloj(page); await sleep(1500); const d1 = await reloj(page);
          R.check(!!vuelta && d1 - d0 > 1, `${tag}: tras la escena se vuelve a jugar y el reloj avanza`, 'emulation', { vuelta: !!vuelta, d: d1 - d0 });
        }
        const st = await page.evaluate(() => ({ roto: window.__bkCrono.roto, crono: !document.getElementById('crono').hidden, rotulo: !document.getElementById('crono-fin').hidden, modal: window.__bk.input.modal, hudInerte: document.getElementById('hud').hasAttribute('inert') }));
        R.check(st.roto && !st.crono && !st.rotulo && !st.modal && !st.hudInerte, `${tag}: el cronómetro se apaga y se esconde, y el juego conserva los controles`, 'fixture', st);
        R.check(!errors.length && avisosConsola.length === 1, `${tag}: ningún error llega a la página (un solo aviso en la consola)`, 'emulation', { errors: errors.slice(0, 3), avisosConsola });
      } finally { await page.close(); }
    }
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
