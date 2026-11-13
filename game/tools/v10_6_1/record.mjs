// V10.6.1 · guardián del récord y el top de todos (usuario, 25 oct). La respuesta de /e/record se simula en la página (fetch) con lo que el usuario
// puede poner desde record.sh (cuántos se enseñan 0–5, nombres) y el juego se termina con el atajo de pruebas del reto final, en una partida
// NUEVA con las 20 patatas puestas a mano (y una con recargas).
//  · top vacío / peor → «¡NUEVO RÉCORD!»; entra en el top → «¡ENTRAS EN EL TOP N!»; fuera → «¡JUEGO COMPLETADO!»; en los dos primeros, «@desventurasdeanmi»;
//  · la lista del rótulo enseña el top con este tiempo ya colocado («· tú»); mostrar 0 = nada de récord; mostrar 1 = solo el récord;
//  · sin nombres (decisión del usuario): si el servidor mandara alguno se ignora y nunca se inyecta HTML; formato antiguo `{"ds"}` sigue valiendo;
//  · el tiempo propio sale en la lista en otro color (fondo distinto del resto);
//  · sin conexión → no presume; conexión lenta (3 s) → el rótulo espera y acierta;
//  · toda carrera terminada manda `crono` (una vez, con sus décimas), también con recargas (usuario, 25 oct: cuentan igual, sin asterisco);
//  · el top tiene siempre 3 puestos: los que faltan repiten el último tiempo (1 → los 3; 2 → el 2.º dos veces);
//  · la esquina enseña el récord debajo del tiempo (si se enseña alguno).
// Orden del usuario: móvil vertical (iPhone = Android) > móvil horizontal > ordenador.
// Uso: node tools/v10_6_1/record.mjs --url http://127.0.0.1:5249/ [--task V10-6-1] [--label r]
import { Report, runTest, launch, sleep, arg, SAVE_20 } from '../v8/lib.mjs';
import { open8, start8, dev, S20, until } from '../it8/lib8.mjs';
const R = new Report('v1061-record', { task: arg('task', 'V10-6-1') });
const falso = (cfg) => [(cfg) => { window.__recCfg = cfg; const of = window.fetch.bind(window);
  window.fetch = (u, o) => { if (!String(u).includes('/e/record')) return of(u, o); const c = window.__recCfg;
    if (c.falla) return Promise.reject(new TypeError('sin red'));
    return new Promise((res) => setTimeout(() => res(new Response(JSON.stringify(c.json), { headers: { 'content-type': 'application/json' } })), c.lento || 30)); }; }, cfg];
const fixture = (r) => [(r) => { try { if (!sessionStorage.getItem('__crono_fixture')) { sessionStorage.setItem('__crono_fixture', '1'); localStorage.setItem('bellakaventuras.crono', JSON.stringify(r)); } } catch { /* */ } }, r];
const T3 = (...top) => ({ n: 3, top, ds: top[0]?.ds ?? null });

async function acabar(page, R, tag, lentoFinal = 0) {
  if (!(await until(page, () => window.__bk.activities?.some((a) => a.id === 'secretJump') && window.__bk.mode === 'explore', 90000))) { R.invalid(`${tag}: el reto final no llegó a cargar`, {}); return null; }
  await page.evaluate((ids, lento) => { const s = window.__bk.state; for (const id of ids) if (!s.p.collected.includes(id)) s.p.collected.push(id); if (lento) window.__recCfg.lento = lento;
    const a = window.__bk.activities.find((x) => x.id === 'secretJump'); a.debugComplete(); a.debugComplete(); }, SAVE_20.collected, lentoFinal);
  const fijo = await page.evaluate(() => window.__bkCrono.run);
  if (await until(page, () => window.__bk.cine?.active, 10000)) { await sleep(1500); await page.evaluate(() => window.__bk.closePreview()); }
  const ban = await until(page, () => { const e = document.getElementById('crono-fin'); return !e.hidden && getComputedStyle(e).opacity === '1' ? { small: e.querySelector('small').textContent, b: e.querySelector('b').textContent,
    em: e.querySelector('em').textContent, filas: [...e.querySelectorAll('ol li')].map((l) => l.textContent), html: e.querySelector('ol').innerHTML, record: e.classList.contains('record'),
    color: { tu: e.querySelector('ol li.tu') ? getComputedStyle(e.querySelector('ol li.tu')).backgroundColor : null, otro: e.querySelector('ol li:not(.tu):not(.cab)') ? getComputedStyle(e.querySelector('ol li:not(.tu):not(.cab)')).backgroundColor : null } } : null; }, 20000);
  const env = await page.evaluate(() => (window.__bkAvisos || []).filter((x) => x.n === 'crono'));
  return { fijo, ban, env };
}

await runTest(R, async () => {
  const b = await launch();
  try {
    // [nombre, respuesta del servidor, qué se espera, aparato, orientación]
    for (const [tag, cfg, espera, di, o] of [
      ['top vacío', { json: T3() }, 'nuevo', 'ip14', 'v'],
      ['récord peor (2:46:39.9)', { json: T3({ ds: 99999 }) }, 'nuevo', 'and360', 'v'],
      ['entra en el top 3', { json: T3({ ds: 1, nombre: '@ana.b' }, { ds: 2 }) }, 'entra', 'and412', 'v'],
      ['fuera del top 3', { json: T3({ ds: 1 }, { ds: 2, nombre: '@x_y' }, { ds: 3 }) }, 'fuera', 'ip14', 'v'],
      ['mostrar 1 (solo el récord)', { json: { n: 1, top: [{ ds: 1, nombre: '@solo' }], ds: 1 } }, 'uno', 'and360', 'v'],
      ['mostrar 0 (nada de récord)', { json: { n: 0, top: [], ds: null } }, 'cero', 'ip14', 'v'],
      ['el servidor manda un nombre con HTML', { json: T3({ ds: 1, nombre: '<img src=x onerror=alert(1)>' }) }, 'html', 'and412', 'v'],
      ['formato antiguo {ds}', { json: { ds: 99999 } }, 'nuevo', 'ip14', 'h'],
      ['sin conexión', { falla: true }, 'nada', 'and412', 'h'],
      ['conexión lenta al acabar', { json: T3({ ds: 99999 }) }, 'nuevo-lento', 'ip14', 'h'],
      ['entra en el top, ordenador', { json: T3({ ds: 1 }, { ds: 2 }) }, 'entra', 'pc720', 'h']]) {
      const touch = di !== 'pc720', errors = [], page = await open8(b, R, dev(di), o, { save: null, query: '?bktest=1&narr=off', errors, init: [falso(cfg)] });
      const T = `${tag} [${di} ${o}]`;
      try {
        await start8(page, touch); await sleep(1500);
        const esquina = await page.evaluate(() => ({ rec: document.getElementById('crono').dataset.rec ?? null, top: window.__bkCrono.top, n: window.__bkCrono.mostrar }));
        const j = cfg.json, primero = j && (j.top ? (j.n > 0 ? j.top[0]?.ds : undefined) : j.ds);
        const want = Number.isInteger(primero) ? 'Récord ' + await page.evaluate((d) => window.__bkCrono.formato(d * 100), primero) : null;
        R.check(esquina.rec === want, `${T}: la esquina ${want ? `enseña «${want}»` : 'no enseña récord'}`, 'fixture', esquina);
        const x = await acabar(page, R, T, espera === 'nuevo-lento' ? 3000 : 0); if (!x) continue;
        const ds = Math.floor(x.fijo.ms / 100), b0 = x.ban || {}, mio = await page.evaluate((d) => window.__bkCrono.formato(d * 100), ds);
        R.check(x.fijo.fin && x.env.length === 1 && x.env[0].q.ds === String(ds), `${T}: carrera limpia terminada; manda «crono» una vez (${ds})`, 'fixture', { run: x.fijo, env: x.env });
        const ig = /@desventurasdeanmi/.test(b0.em ?? '');
        if (espera.startsWith('nuevo')) R.check(b0.small === '¡NUEVO RÉCORD!' && ig && b0.record && b0.filas?.[1] === (j && !j.top ? `${mio} · tú` : `1. ${mio} · tú`), `${T}: «¡NUEVO RÉCORD!», @desventurasdeanmi y su tiempo el 1.º («· tú»)`, 'emulation', b0);
        if (tag === 'top vacío') R.check(b0.filas?.join('|') === `TOP 3|1. ${mio} · tú|2. ${mio} · tú|3. ${mio} · tú`, `${T}: un solo tiempo → ocupa los 3 puestos`, 'emulation', b0.filas);
        if (tag.startsWith('récord peor')) R.check(b0.filas?.join('|') === `TOP 3|1. ${mio} · tú|2. 2:46:39.9|3. 2:46:39.9`, `${T}: dos tiempos → el 2.º sale dos veces`, 'emulation', b0.filas);
        if (espera === 'entra') R.check(b0.small === '¡ENTRAS EN EL TOP 3!' && ig && b0.record && b0.filas?.[0] === 'TOP 3' && b0.filas?.[3] === `3. ${mio} · tú` && (tag.includes('ordenador') || b0.filas?.[1] === '1. 0:00.1') && b0.color.tu !== b0.color.otro,
          `${T}: «¡ENTRAS EN EL TOP 3!», @desventurasdeanmi y «3. ${mio} · tú» en otro color`, 'emulation', b0);
        if (espera === 'fuera') R.check(b0.small === '¡JUEGO COMPLETADO!' && !ig && !b0.record && b0.filas?.length === 4 && b0.filas[2] === '2. 0:00.2' && !b0.filas.some((f) => f.includes('tú')),
          `${T}: «¡JUEGO COMPLETADO!», sin @desventurasdeanmi, top 3 sin «tú»`, 'emulation', b0);
        if (espera === 'uno') R.check(b0.small === '¡JUEGO COMPLETADO!' && b0.filas?.join('|') === 'RÉCORD|0:00.1', `${T}: solo el récord (sin nombre)`, 'emulation', b0);
        if (espera === 'cero' || espera === 'nada') R.check(b0.small === '¡JUEGO COMPLETADO!' && !ig && !b0.record && !b0.filas?.length && /compártela en TikTok/.test(b0.em ?? ''),
          `${T}: sin presumir ni lista: «Haz captura y compártela en TikTok»`, 'emulation', b0);
        if (espera === 'html') R.check(!/<img|onerror/.test(b0.html ?? '') && b0.filas?.[1] === '1. 0:00.1', `${T}: se ignora (sin nombres) y no se inyecta nada`, 'emulation', b0);
        if (/peor|entra en el top 3|fuera/.test(tag)) await page.screenshot({ path: `${R.dir}/${R.base}_${di}_${o}_${espera}.png` });
        R.check(!errors.length, `${T}: sin errores`, 'emulation', errors.slice(0, 3));
      } finally { await page.close(); }
    }
    // con recargas (usuario, 25 oct): cuenta igual: se manda y puede ser récord; sin asterisco
    { const tag = 'con recargas [and360 v]', errors = [], EP = 'e-rec-recargas';
      const page = await open8(b, R, dev('and360'), 'v', { save: { ...S20, saveEpoch: EP, settings: { iosAppAsked: true } }, query: '?bktest=1&narr=off', errors,
        init: [falso({ json: T3({ ds: 99999 }) }), fixture({ v: 1, epoch: EP, ms: 600000, fin: false, recargas: 0, prueba: false, visto: false })] });
      try { await start8(page, true); await sleep(1500);
        const x = await acabar(page, R, tag);
        if (x) { const ds = Math.floor(x.fijo.ms / 100);
          R.check(x.fijo.recargas === 1 && x.env.length === 1 && x.env[0].q.ds === String(ds), `${tag}: manda su tiempo igual (${ds})`, 'fixture', { run: x.fijo, env: x.env });
          R.check(!!x.ban && x.ban.small === '¡NUEVO RÉCORD!' && !x.ban.b.includes('*') && x.ban.filas.some((f) => f.includes('tú')) && !/no cuenta/.test(x.ban.em), `${tag}: cuenta como cualquier otra (récord, sin asterisco)`, 'emulation', x.ban); }
        R.check(!errors.length, `${tag}: sin errores`, 'emulation', errors.slice(0, 3));
      } finally { await page.close(); } }
  } finally { await b.close(); }
}, { timeoutMs: 1500000 });
