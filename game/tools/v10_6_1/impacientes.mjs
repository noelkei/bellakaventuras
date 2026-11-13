// V10.6.1 · guardián del cronómetro a prueba de impacientes (usuario, 25 oct: «la gente pulsará botones muy rápido y de forma repetida»):
//  E · arranque: JUGAR aporreado = una sola carrera desde 0; con «Recomendamos usar cascos» abierto no cuenta (aún no se puede jugar); al cerrarlo
//      (aporreando también) empieza a contar; cuenta en el tutorial (cinemática y 2D); 12 s aporreando 2D, «Saltar tutorial», pausa, Seguir y Esc:
//      el tiempo nunca baja, nunca cuenta más que el reloj real, no se para solo, sin errores;
//  F · actividades (charla de la Pantera, baile, grafiti, grind): entrando a toques repetidos, cuenta tiempo real dentro de cada una;
//  G · final: el salto repetido no lo mueve; SALTAR y la despedida aporreados; el rótulo sale UNA vez con el tiempo fijo; recargar y aporrear
//      CONTINUAR no lo cambia ni lo repite.
// Uso: node tools/v10_6_1/impacientes.mjs --url http://127.0.0.1:5249/ [--task V10-6-1] [--label r]
import { Report, runTest, launch, sleep, arg, SAVE_20 } from '../v8/lib.mjs';
import { open8, dev, S20, until, toAct, reload8, waitReady, center } from '../it8/lib8.mjs';
const R = new Report('v1061-impacientes', { task: arg('task', 'V10-6-1') });
const EP = 'e-prueba-impacientes';
const st = (page) => page.evaluate(() => { const g = window.__bk; return { run: window.__bkCrono?.run ?? null, t: performance.now(), paused: !!g?.paused, mode: g?.mode,
  cascos: document.getElementById('cascos')?.hidden === false, ios: document.getElementById('ios-app')?.hidden === false, d2: document.getElementById('d2')?.hidden === false,
  cine: !!(g?.narr?.inCine || g?.cine?.active), pausa: document.getElementById('pause')?.hidden === false }; });
/** Toques muy seguidos en el centro de `sel` (si está visible), con dedo o ratón. */
async function mash(page, sel, n, touch, gap = 40) { let k = 0; for (let i = 0; i < n; i++) { const c = await center(page, sel); if (c) { if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y); k++; } await sleep(gap); } return k; }
/** Ventana de `ms` sin pausa: lo contado frente al reloj real (tolerancia: 5 % o dos fotogramas). */
async function ventana(page, ms = 2000) { const a = await st(page); await sleep(ms); const b = await st(page); const fm = await page.evaluate(() => window.__bk.frameMs);
  const cont = b.run.ms - a.run.ms, real = b.t - a.t; return { cont: Math.round(cont), real: Math.round(real), ok: Math.abs(cont - real) <= Math.max(real * 0.05, 2 * fm) && !a.paused && !b.paused, a, b }; }
async function quitarPausa(page, touch) { for (let i = 0; i < 6 && (await st(page)).pausa; i++) { await mash(page, '#btn-resume', 1, touch); await sleep(400); } }
const fixture = (r) => [(r) => { try { if (!sessionStorage.getItem('__crono_fixture')) { sessionStorage.setItem('__crono_fixture', '1'); localStorage.setItem('bellakaventuras.crono', JSON.stringify(r)); } } catch { /* */ } }, r];

await runTest(R, async () => {
  const b = await launch();
  try {
    // ---------------------------------------------------------------- E · arranque y tutorial aporreando
    // prioridad del usuario (estadísticas): móvil vertical > móvil horizontal > ordenador; iPhone = Android
    for (const [di, o, touch] of [['ip14', 'v', true], ['and412', 'v', true], ['and360', 'h', true], ['pc720', 'h', false]]) {
      const tag = `E ${di} ${o}`, errors = [];
      const page = await open8(b, R, dev(di), o, { save: null, query: '?bktest=1&cascos', errors });
      try {
        const nJ = await mash(page, '#btn-start', 10, touch, 30);
        await until(page, () => window.__bk.started, 5000); await sleep(300);
        const e0 = await st(page);
        R.check(e0.run && e0.run.recargas === 0 && e0.run.ms < 100 && e0.cascos, `${tag}: JUGAR aporreado (${nJ} toques) = una carrera desde 0, con el aviso de cascos`, 'input', e0);
        await sleep(1500); const e1 = await st(page);
        R.check(e1.cascos && e1.run.ms < 100, `${tag}: con «Recomendamos usar cascos» abierto no cuenta (${Math.round(e1.run.ms)} ms)`, 'input', { ms: e1.run.ms });
        await mash(page, '#btn-cascos', 25, touch, 50); await sleep(400);
        if ((await st(page)).ios) await mash(page, '#btn-ios-no', 8, touch, 50);
        await sleep(600); const e2 = await st(page);
        R.check(!e2.cascos && !e2.ios && e2.run.ms > 0, `${tag}: al cerrar el aviso (aporreando) empieza a contar`, 'input', e2);
        const w1 = await ventana(page); R.check(w1.ok, `${tag}: cuenta tiempo real en el tutorial (${w1.cont}/${w1.real} ms; cinemática ${w1.b.cine}, 2D ${w1.b.d2}, modo ${w1.b.mode})`, 'emulation', w1);
        // 12 s de caos: 2D, «Saltar tutorial», pausa, Seguir, Esc y toques sueltos
        const sels = ['#d2 .d2-btn.primary', '#d2 .d2-skip', '#btn-pause', '#btn-resume', '#d2 .d2-btn:not(.d2-skip)', 'ESC', 'CENTRO'];
        let prev = (await st(page)).run.ms, t0 = performance.now(), baja = 0, pasa = 0, n = 0; const tA = Date.now(), msA = prev;
        while (Date.now() - tA < 12000) {
          const s = sels[(n * 7 + (n >> 2)) % sels.length]; n++;
          if (s === 'ESC') await page.keyboard.press('Escape');
          else if (s === 'CENTRO') { const v = page.viewport(); if (touch) await page.touchscreen.tap(v.width / 2, v.height / 2); else await page.mouse.click(v.width / 2, v.height / 2); }
          else await mash(page, s, 1, touch, 0);
          await sleep(35);
          if (n % 8 === 0) { const x = await st(page); if (x.run.ms < prev) baja++; prev = x.run.ms; }
        }
        const fin = await st(page), msCaos = fin.run.ms - msA, realCaos = Date.now() - tA;
        R.check(!baja && msCaos <= realCaos + 50 && !fin.run.fin && fin.run.recargas === 0, `${tag}: 12 s aporreando (${n} pulsaciones): el tiempo nunca baja ni corre más que el real (${Math.round(msCaos)}/${realCaos} ms) y no se da por terminado`, 'input', { baja, msCaos, realCaos, run: fin.run });
        await quitarPausa(page, touch); await sleep(300);
        const w2 = await ventana(page); R.check(w2.ok, `${tag}: tras el caos sigue contando tiempo real (${w2.cont}/${w2.real} ms; modo ${w2.b.mode}, 2D ${w2.b.d2})`, 'emulation', w2);
        R.check(!errors.length, `${tag}: sin errores`, 'emulation', errors.slice(0, 3));
      } finally { await page.close(); }
    }

    // ---------------------------------------------------------------- F · actividades
    for (const [di, o, touch] of [['ip14', 'v', true], ['and360', 'v', true], ['and412', 'h', true], ['pc720', 'h', false]]) {
      const errors = [], page = await open8(b, R, dev(di), o, { save: null, query: '?bktest=1&narr=off', errors });
      try {
        await mash(page, '#btn-start', 6, touch, 40); await until(page, () => window.__bk.started, 5000); await sleep(800);
        if ((await st(page)).ios) await mash(page, '#btn-ios-no', 4, touch, 60);
        await until(page, () => window.__bk.activities?.length > 5 && window.__bk.mode === 'explore', 60000);
        // camino real: botón de acción aporreado → charla (BAILAR / HABLAR abren primero el diálogo) → botones del diálogo aporreados → minijuego
        const enFlujo = () => window.__bk.mode !== 'explore' || document.getElementById('dialog')?.hidden === false || ['dance', 'graffiti', 'grind-hud'].some((id) => document.getElementById(id)?.hidden === false);
        for (const [zona, nombre, mini, salir] of [
          ['act.pantherTalk', 'charla de la Pantera', null, '#dialog button'],
          ['act.danceCombo', 'baile', 'dance', '#dance-exit'],
          ['act.graffiti', 'grafiti', 'graffiti', '#graffiti-exit'],
          ['act.skateTutorial', 'grind', null, null]]) {
          const tag = `F ${di} ${o} · ${nombre}`;
          await quitarPausa(page, touch);
          const ta = await toAct(page, zona); await sleep(900);
          let ok = false; for (let i = 0; i < 12 && !ok; i++) { await mash(page, '#btn-action', 3, touch, 40); ok = !!(await until(page, enFlujo, 700)); }
          if (!ta.ok || !ok) { R.invalid(`${tag}: no se pudo entrar a toques (no es del cronómetro)`, { ta, ok }); continue; }
          const w = await ventana(page); R.check(w.ok, `${tag}: en la actividad (charla o juego) cuenta tiempo real (${w.cont}/${w.real} ms; modo ${w.b.mode})`, 'emulation', w);
          if (mini) {
            let dentro = false; const t0 = Date.now();
            while (!dentro && Date.now() - t0 < 20000) { await mash(page, '#dialog button', 2, touch, 60); await mash(page, '#btn-action', 1, touch, 0); await quitarPausa(page, touch);
              dentro = await page.evaluate((id) => document.getElementById(id)?.hidden === false, mini); }
            if (!dentro) R.invalid(`${tag}: no se llegó al minijuego a toques (no es del cronómetro)`, {});
            else { await sleep(600); const w2 = await ventana(page); R.check(w2.ok, `${tag}: dentro del minijuego cuenta tiempo real (${w2.cont}/${w2.real} ms)`, 'emulation', w2); }
          }
          // fuera: su botón de salir (aporreado) y, si queda algo, Esc
          if (salir) await mash(page, salir, 6, touch, 60);
          for (let i = 0; i < 4 && (await page.evaluate(() => window.__bk.mode !== 'explore')); i++) { await page.keyboard.press('Escape'); await sleep(500); await quitarPausa(page, touch); }
          await sleep(500);
        }
        R.check(!errors.length, `F ${di} ${o}: sin errores`, 'emulation', errors.slice(0, 3));
      } finally { await page.close(); }
    }

    // ---------------------------------------------------------------- G · final aporreando
    for (const [di, o, touch] of [['ip14', 'v', true], ['and412', 'v', true], ['pc720', 'h', false]]) {
      const tag = `G ${di} ${o}`, errors = [], save = { ...S20, saveEpoch: EP, settings: { iosAppAsked: true } };
      const page = await open8(b, R, dev(di), o, { save, query: '?bktest=1', errors, init: [fixture({ v: 1, epoch: EP, ms: 1234500, fin: false, recargas: 0, prueba: false, visto: false })] });
      try {
        await page.evaluateOnNewDocument(() => { window.__rotulos = 0; addEventListener('DOMContentLoaded', () => { const el = document.getElementById('crono-fin');
          new MutationObserver(() => { if (!el.hidden) window.__rotulos++; }).observe(el, { attributes: true, attributeFilter: ['hidden'] }); }); });
        await page.reload({ waitUntil: 'load' }); await waitReady(page);
        await mash(page, '#btn-start', 8, touch, 30); await until(page, () => window.__bk.started, 5000);
        // en táctil, una partida antigua vuelve a ver la pregunta del modo ayuda: se contesta a toques, como cualquiera
        { const t0 = Date.now(); while (Date.now() - t0 < 90000 && !(await page.evaluate(() => window.__bk.activities?.some((a) => a.id === 'secretJump') && window.__bk.mode === 'explore' && document.getElementById('d2')?.hidden !== false))) {
            await mash(page, '#d2 .d2-row .d2-btn:not(.d2-skip):last-child', 1, touch, 0); await mash(page, '#d2 .d2-btn.primary', 1, touch, 0); await sleep(300); } }
        if (!(await until(page, () => window.__bk.activities?.some((a) => a.id === 'secretJump') && window.__bk.mode === 'explore', 5000))) { R.invalid(`${tag}: el reto final no llegó a cargar`, {}); continue; }
        await page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'secretJump'); for (let i = 0; i < 5; i++) a.debugComplete(); });
        const g0 = await st(page); await sleep(1500); const g1 = await st(page);
        R.check(g0.run.fin && g1.run.ms === g0.run.ms, `${tag}: el salto final repetido para el tiempo una sola vez`, 'fixture', { g0: g0.run, g1: g1.run });
        await until(page, () => window.__bk.cine?.active, 8000); await sleep(800);
        await mash(page, '#btn-cine-skip', 20, touch, 40); for (let i = 0; i < 4; i++) { await page.keyboard.press('Escape'); await sleep(60); }
        await quitarPausa(page, touch);
        // despedida aporreada (y alguna pausa por medio)
        const t0 = Date.now(); let k = 0;
        while (Date.now() - t0 < 30000) {
          const s = await st(page); if (!s.d2 && !s.pausa && k > 30 && (await page.evaluate(() => window.__bk.narr.actual)) !== 'DES') break;
          if (k % 15 === 7) await mash(page, '#btn-pause', 1, touch, 0); else if (s.pausa) await mash(page, '#btn-resume', 1, touch, 0); else await mash(page, '#d2 .d2-btn.primary', 1, touch, 0);
          k++; await sleep(80);
        }
        await sleep(2500); const g2 = await st(page); const rot = await page.evaluate(() => ({ n: window.__rotulos, txt: document.getElementById('crono-fin').innerText, visto: window.__bkCrono.run.visto }));
        const esperado = await page.evaluate((ms) => window.__bkCrono.formato(ms), g0.run.ms);
        R.check(rot.n === 1 && rot.txt.includes(esperado) && g2.run.ms === g0.run.ms && rot.visto, `${tag}: con SALTAR y la despedida aporreados, el rótulo sale una vez con el tiempo fijo (${esperado})`, 'input', { rot, run: g2.run });
        await sleep(9000);
        await reload8(page); await mash(page, '#btn-start', 8, touch, 30); await sleep(4000);
        const g3 = await st(page), n3 = await page.evaluate(() => window.__rotulos);
        R.check(g3.run.fin && g3.run.ms === g0.run.ms && g3.run.recargas === g0.run.recargas && n3 === 0, `${tag}: recargar y aporrear CONTINUAR no cambia el tiempo ni repite el rótulo`, 'input', { run: g3.run, rotulos: n3 });
        R.check(!errors.length, `${tag}: sin errores`, 'emulation', errors.slice(0, 3));
      } finally { await page.close(); }
    }
  } finally { await b.close(); }
}, { timeoutMs: 1500000 });
