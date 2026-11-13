// V10.6 · guardián de los créditos (B6, V10/IT9/B6_CREDITOS.md): Pausa → «Créditos» (el usuario lo quiere en el menú de pausa) enseña EXACTAMENTE los tres rótulos y nombres del usuario;
// «Volver», Esc y B del mando los cierran y el foco vuelve a «Créditos»; desde la portada (enlace del pie) salen por encima del inicio y al
// cerrarlos el inicio sigue igual; en táctil los botones miden ≥ 44 px y todo queda dentro de la pantalla.
// Uso: node tools/v10_6/creditos.mjs --url <build> [--task V10-6] [--label r]
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S20, tapOrClick, onTop, until } from '../it8/lib8.mjs';
const R = new Report('v106-creditos', { task: arg('task', 'V10-6') });
const ESPERADO = [['Diseño y desarrollo', 'Noel Pedrosa Alba'], ['Proyecto y música', 'ANMI'], ['Creativo', 'Joan Because'], ['Colaboradores', 'La Mano de Oro · Adrián Rodríguez']];
const leer = (page) => page.evaluate(() => { const c = document.getElementById('creditos'); if (!c || c.hidden) return null;
  const filas = [...c.querySelectorAll('dl > div')].map((d) => [d.querySelector('dt')?.textContent.trim(), d.querySelector('dd')?.textContent.trim()]);
  const bs = [...c.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, h: Math.round(r.height), dentro: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth }; });
  return { filas, bs, titulo: c.querySelector('h2')?.textContent.trim(), foco: document.activeElement?.id }; });
const igual = (f) => JSON.stringify(f) === JSON.stringify(ESPERADO);
await runTest(R, async () => {
  const b = await launch(); const out = {};
  try {
    for (const [di, o, touch] of [['pc720', 'h', false], ['ip14', 'v', true], ['ip14', 'h', true], ['se1', 'h', true]]) {
      const tag = `${di} ${o}`, errors = [], page = await open8(b, R, dev(di), o, { save: S20, errors });
      try {
        // desde la portada
        const hayEnlace = await page.evaluate(() => !!document.getElementById('btn-creditos-start'));
        if (!hayEnlace) R.check(false, `${tag}: hay enlace «Créditos» en la portada`, 'input', 'no existe');
        else { await tapOrClick(page, '#btn-creditos-start', touch); await sleep(600); const c0 = await leer(page), top = await onTop(page, '#btn-creditos-close');
          out[`${tag} portada`] = c0;
          R.check(!!c0 && igual(c0.filas) && top.ok, `${tag}: desde la portada, créditos exactos y por encima del inicio`, 'input', { c0, top });
          if (touch) await tapOrClick(page, '#btn-creditos-close', true); else await page.keyboard.press('Escape'); await sleep(500);
          const v = await page.evaluate(() => ({ cred: !document.getElementById('creditos').hidden, start: !document.getElementById('start').hidden, cls: document.body.classList.contains('desde-inicio') }));
          R.check(!v.cred && v.start && !v.cls, `${tag}: al cerrarlos, el inicio sigue como estaba`, 'input', v); }
        // desde Ajustes, en la partida
        await start8(page, touch); await sleep(1200);
        if (touch) { await tapOrClick(page, '#btn-pause', true); } else { await page.keyboard.press('Escape'); }   // V10.6: «Créditos» va en el menú de pausa
        await sleep(600);
        if (!(await page.evaluate(() => !!document.getElementById('btn-creditos')))) { R.check(false, `${tag}: hay botón «Créditos» en la pausa`, 'input', 'no existe'); continue; }
        await tapOrClick(page, '#btn-creditos', touch); await sleep(600);
        const c = await leer(page); out[tag] = c;
        R.check(!!c && c.titulo === 'Créditos' && igual(c.filas), `${tag}: Pausa → Créditos enseña los créditos exactos`, 'input', c?.filas);
        R.check(!!c && c.bs.every((x) => x.dentro && (!touch || x.h >= 44)), `${tag}: «Volver» dentro de la pantalla${touch ? ' y ≥ 44 px' : ''}`, 'emulation', c?.bs);
        await page.keyboard.press('Escape'); await sleep(500);
        const e = await page.evaluate(() => ({ cred: !document.getElementById('creditos').hidden, ajustes: !document.getElementById('pause').hidden, foco: document.activeElement?.id }));
        R.check(!e.cred && e.ajustes && e.foco === 'btn-creditos', `${tag}: Esc cierra los créditos y vuelve a la pausa con el foco en «Créditos»`, 'input', e);
        // mando simulado: B cierra
        await tapOrClick(page, '#btn-creditos', touch); await sleep(500);
        await page.evaluate(() => { const g = window.__bk, mk = (p) => ({ axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: p && i === 1, value: p && i === 1 ? 1 : 0 })), id: 'prueba', connected: true }); g.input.fakePad = mk(false); setTimeout(() => { g.input.fakePad = mk(true); }, 120); setTimeout(() => { g.input.fakePad = mk(false); }, 300); });
        await sleep(800);
        const m = await page.evaluate(() => ({ cred: !document.getElementById('creditos').hidden, ajustes: !document.getElementById('pause').hidden }));
        R.check(!m.cred && m.ajustes, `${tag}: B del mando cierra los créditos`, 'input', m);
        await page.evaluate(() => { window.__bk.input.fakePad = null; });
        R.check(!errors.length, `${tag}: sin errores`, 'emulation', errors.slice(0, 3));
      } finally { await page.close(); }
    }
    R.measure('creditos', out);
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
