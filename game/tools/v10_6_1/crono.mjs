// V10.6.1 · guardián del cronómetro de speedrun (V10/IT10/PLAN_CRONOMETRO.md):
//  A · partida nueva: arranca con JUGAR, cuenta tiempo real, la pausa y la pestaña oculta lo paran, recargar lo conserva y cuenta igual (usuario, 25 oct: sin asterisco);
//      sitio en la esquina sin tapar contador, pausa ni chip de modo (ordenador, iPhone vertical/horizontal, SE);
//  B · partida vieja (sin carrera): no se ve;
//  C · final sin despedida (recorrido 2D apagado): para al conseguir el salto, no sale en la escena final, rótulo al acabarla, desaparece;
//  D · final con despedida: el rótulo espera a que acabe el último diálogo; tras recargar no vuelve a salir y la esquina queda fija.
// Uso: node tools/v10_6_1/crono.mjs --url http://127.0.0.1:5249/ [--task V10-6-1] [--label r]
import { Report, runTest, launch, sleep, arg, SAVE_20 } from '../v8/lib.mjs';
import { open8, start8, dev, S0, S20, tapOrClick, until, hideShow, reload8 } from '../it8/lib8.mjs';
const R = new Report('v1061-crono', { task: arg('task', 'V10-6-1') });
const EP = 'e-prueba-crono';
const run = (page) => page.evaluate(() => ({ run: window.__bkCrono?.run ?? null, t: performance.now(), txt: document.getElementById('crono').textContent,
  visible: !document.getElementById('crono').hidden, fin: document.getElementById('crono').classList.contains('fin'), banner: !document.getElementById('crono-fin').hidden }));
const fixture = (r) => [(r) => { try { if (!sessionStorage.getItem('__crono_fixture')) { sessionStorage.setItem('__crono_fixture', '1'); localStorage.setItem('bellakaventuras.crono', JSON.stringify(r)); } } catch { /* */ } }, r];
const rects = (page) => page.evaluate(() => { const r = (id) => { const e = document.getElementById(id); if (!e || e.hidden || !e.offsetWidth) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); };
  return { crono: r('crono'), counter: r('counter'), pausa: r('btn-pause'), chip: r('mode-chip'), zona: r('zone'), W: innerWidth, H: innerHeight }; });
const cruza = (a, b) => !!a && !!b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const FMT = /^(\d+:)?\d+:\d{2}\.\d$/;

await runTest(R, async () => {
  const b = await launch(); const out = {};
  try {
    // ---------------------------------------------------------------- A · partida nueva
    for (const [di, o, touch, completo] of [['ip14', 'v', true, true], ['and360', 'v', true, true], ['se1', 'v', true, false], ['and412', 'h', true, false], ['ip14', 'h', true, false], ['pc720', 'h', false, true]]) {   // móvil vertical > horizontal > ordenador; iPhone = Android
      const tag = `A ${di} ${o}`, errors = [];
      const page = await open8(b, R, dev(di), o, { save: null, query: '?bktest=1&narr=off', errors });
      try {
        const antes = await run(page); R.check(!antes.visible && !antes.run, `${tag}: en la portada no hay cronómetro`, 'fixture', antes);
        await start8(page, touch); await sleep(600);
        const a0 = await run(page); await sleep(3000); const a1 = await run(page);
        // se lee entre fotogramas: el cronómetro va hasta el último fotograma dibujado, así que cada lectura puede ir hasta un fotograma por detrás
        const real = a1.t - a0.t, cont = a1.run.ms - a0.run.ms, fm = await page.evaluate(() => window.__bk.frameMs), tol = Math.max(real * 0.05, 2 * fm);
        R.check(a0.visible && FMT.test(a0.txt) && a1.run.recargas === 0 && a1.run.prueba && FMT.test(a1.txt), `${tag}: arranca con JUGAR, visible, formato m:ss.d, sin recargas (con ?bktest queda marcada «prueba»)`, 'emulation', { a0: a0.txt, a1: a1.txt, run: a1.run });
        R.check(Math.abs(cont - real) <= tol, `${tag}: cuenta tiempo real (${Math.round(cont)} ms en ${Math.round(real)} ms, fotograma ${Math.round(fm)} ms)`, 'emulation', { cont, real, fm, tol });
        const L = await rects(page), dentro = L.crono && L.crono[0] >= 0 && L.crono[2] <= L.W && L.crono[1] >= 0;
        R.check(dentro && !cruza(L.crono, L.counter) && !cruza(L.crono, L.pausa) && !cruza(L.crono, L.chip) && !cruza(L.crono, L.zona), `${tag}: la esquina no tapa contador, zona, pausa ni chip`, 'emulation', L);
        await page.screenshot({ path: `${R.dir}/${R.base}_${di}_${o}.png` });
        if (completo) {
          // pausa
          await tapOrClick(page, '#btn-pause', touch); await sleep(500);
          const p0 = await run(page); await sleep(2000); const p1 = await run(page);
          R.check(p1.run.ms - p0.run.ms < 50, `${tag}: en pausa no cuenta`, 'input', { d: p1.run.ms - p0.run.ms });
          await tapOrClick(page, '#btn-resume', touch); await sleep(800);
          const p2 = await run(page); R.check(p2.run.ms - p1.run.ms > 300, `${tag}: al seguir vuelve a contar`, 'input', { d: p2.run.ms - p1.run.ms });
          // pestaña oculta
          const h0 = await run(page); await hideShow(page, 3000); const h1 = await run(page);
          R.check(h1.run.ms - h0.run.ms < 900, `${tag}: con la pestaña oculta no cuenta (solo el rato de volver)`, 'input', { d: h1.run.ms - h0.run.ms });
          if (await page.evaluate(() => !document.getElementById('pause').hidden)) { await tapOrClick(page, '#btn-resume', touch); await sleep(500); }
          // recarga
          await page.evaluate(() => { window.__bk.state.setCheckpoint({ x: 30, y: 0.2, z: -30, heading: 0 }); window.__bk.state.save(); });   // con progreso guardado: CONTINUAR
          const r0 = await run(page); await reload8(page); await start8(page, touch); await sleep(600); const r1 = await run(page);
          R.check(r1.run && r1.run.recargas === 1 && FMT.test(r1.txt) && r1.run.ms >= r0.run.ms - 1100 && r1.run.ms < r0.run.ms + 4000, `${tag}: recargar conserva el tiempo y sigue contando (sin asterisco: cuenta igual)`, 'fixture', { antes: r0.run.ms, despues: r1.run, txt: r1.txt });
        }
        out[tag] = { a1: a1.txt, L };
        R.check(!errors.length, `${tag}: sin errores`, 'emulation', errors.slice(0, 3));
      } finally { await page.close(); }
    }

    // ---------------------------------------------------------------- B · partida vieja: sin cronómetro y, una vez, cómo reiniciar (usuario, 25 oct)
    for (const [di, o, touch, zurdo, quiere] of [['ip14', 'v', true, false, /toca II \(arriba a la derecha\).*Reiniciar partida/], ['and360', 'v', true, true, /toca II \(arriba a la izquierda\).*Reiniciar partida/],
      ['pc720', 'h', false, false, /pulsa Esc o II \(arriba a la derecha\).*Reiniciar partida/]]) {
      const tag = `B ${di} ${o}${zurdo ? ' zurdo' : ''}`, errors = [];
      const page = await open8(b, R, dev(di), o, { save: { ...S0, settings: { ...S0.settings, leftHanded: zurdo } }, query: '?bktest=1&narr=off', errors });
      try { await start8(page, touch); await sleep(1500); const v = await run(page);
        R.check(!v.visible && !v.run, `${tag}: partida vieja (sin carrera): no hay cronómetro`, 'fixture', v);
        const h = await until(page, () => { const e = document.getElementById('hint'); return !e.hidden && /Speedrun/.test(e.innerText) ? e.innerText : null; }, 15000);
        R.check(!!h && quiere.test(h.replace(/\s+/g, ' ')), `${tag}: sale «⏱ Speedrun: … Reiniciar partida» con el botón en su lado`, 'emulation', { h });
        if (di === 'ip14') await page.screenshot({ path: R.file_('aviso_reiniciar_ip14.png') });
        R.check(!errors.length, `${tag}: sin errores`, 'emulation', errors.slice(0, 3)); } finally { await page.close(); } }

    // ---------------------------------------------------------------- C y D · final
    for (const [tag, narr] of [['C sin despedida', false], ['D con despedida', true]]) {
      const errors = [], save = { ...(narr ? S20 : SAVE_20), saveEpoch: EP, settings: { iosAppAsked: true } };
      const page = await open8(b, R, dev('pc720'), 'h', { save, query: narr ? '?bktest=1' : '?bktest=1&narr=off', errors, init: [fixture({ v: 1, epoch: EP, ms: 754300, fin: false, recargas: 0, prueba: false, visto: false })] });
      try {
        await start8(page, false); await sleep(1500);
        const c0 = await run(page);
        if (!c0.run) { R.invalid(`${tag}: la partida preparada no retomó la carrera`, c0); continue; }
        if (!(await until(page, () => window.__bk.activities?.some((a) => a.id === 'secretJump') && window.__bk.mode === 'explore', 90000))) { R.invalid(`${tag}: el reto final no llegó a cargar`, {}); continue; }
        await page.evaluate(() => window.__bk.activities.find((a) => a.id === 'secretJump').debugComplete());
        await sleep(400); const c1 = await run(page); await sleep(2500); const c2 = await run(page);
        R.check(c1.run.fin && c2.run.ms === c1.run.ms && c2.fin && FMT.test(c2.txt), `${tag}: al conseguir el final el tiempo queda fijo (${c2.txt})`, 'fixture', { c1: c1.run, c2: c2.run, txt: c2.txt });
        const cine = await until(page, () => window.__bk.cine?.active, 8000);
        const enEscena = await run(page); R.check(!!cine && !enEscena.banner, `${tag}: durante la escena final no sale el rótulo`, 'emulation', { cine: !!cine, banner: enEscena.banner });
        await sleep(2000); await page.evaluate(() => window.__bk.closePreview());   // SALTAR
        if (narr) {
          // el 2D se crea la primera vez que se usa: hasta entonces no existe (no vale «no está oculto»)
          const d2 = await until(page, () => document.getElementById('d2')?.hidden === false && window.__bk.narr.actual === 'DES', 20000);
          const conD2 = await run(page); R.check(!!d2 && !conD2.banner, `${tag}: la despedida sale y el rótulo espera`, 'emulation', { d2: !!d2, banner: conD2.banner });
          let antes = false; const t0 = Date.now();
          while (Date.now() - t0 < 30000 && await page.evaluate(() => window.__bk.narr.actual === 'DES')) {
            antes ||= await page.evaluate(() => !document.getElementById('crono-fin').hidden && document.getElementById('d2')?.hidden === false);
            await tapOrClick(page, '#d2 .d2-btn.primary', false); await sleep(800); }
          R.check(!antes, `${tag}: el rótulo no sale mientras sigue la despedida`, 'emulation', { antes });
        }
        const ban = await until(page, () => !document.getElementById('crono-fin').hidden && getComputedStyle(document.getElementById('crono-fin')).opacity === '1' ? document.getElementById('crono-fin').innerText : null, 12000);
        const esperado = await page.evaluate((ms) => window.__bkCrono.formato(ms), c2.run.ms);
        R.check(!!ban && ban.includes(esperado) && !ban.includes(esperado + '*') && /COMPLETADO|RÉCORD|TOP/.test(ban), `${tag}: rótulo con el tiempo final al acabar (${esperado}, sin asterisco)`, 'emulation', { ban });
        await page.screenshot({ path: `${R.dir}/${R.base}_${tag.split(' ')[0]}_rotulo.png` });
        await sleep(700); await page.click('#btn-crono-ok');   // usuario, 25 oct: se queda hasta «CONTINUAR»
        const fuera = await until(page, () => document.getElementById('crono-fin').hidden && !window.__bk.input.modal, 3000);
        R.check(!!fuera, `${tag}: «CONTINUAR» cierra el rótulo y devuelve los controles`, 'input', {});
        if (narr) {
          await reload8(page); await start8(page, false); await sleep(3000); const r = await run(page);
          R.check(r.run?.fin && r.visible && r.fin && !r.banner && r.run.ms === c2.run.ms, `${tag}: tras recargar, la esquina sigue fija y el rótulo no se repite`, 'fixture', r);
        }
        R.check(!errors.length, `${tag}: sin errores`, 'emulation', errors.slice(0, 3));
      } finally { await page.close(); }
    }
    R.measure('casos', out);
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
