// V10.6.2 · guardián del botón «CONTINUAR» del rótulo final (usuario, 25 oct: «debería haber un botón de OK o continuar para que desaparezca»).
// El rótulo es una ventana como «cascos»: se queda hasta cerrarla, con el foco en «CONTINUAR» y el juego sin entrada debajo.
//  · no se va solo (16 s después sigue); toques en los primeros 500 ms (el fantasma del toque que cierra la despedida) no lo cierran;
//  · se cierra con el dedo, aporreando, con Esc, con B y con A del mando; tras cerrarlo el juego recupera los controles y su reloj avanza;
//  · con una pausa por medio (ventana encima) sigue funcionando.
// Orden del usuario: móvil vertical (iPhone = Android) > móvil horizontal > ordenador.
// Uso: node tools/v10_6_1/boton.mjs --url http://127.0.0.1:5249/ [--task V10-6-1] [--label r]
import { Report, runTest, launch, sleep, arg, SAVE_20 } from '../v8/lib.mjs';
import { open8, start8, dev, until, tapOrClick, center, padTap, PAD, blurFocus } from '../it8/lib8.mjs';
const R = new Report('v1061-boton', { task: arg('task', 'V10-6-1') });
const ESTADO = () => { const g = window.__bk, e = document.getElementById('crono-fin');
  return { abierto: !e.hidden, foco: document.activeElement?.id ?? null, modal: g.input.modal, hudInerte: document.getElementById('hud').hasAttribute('inert'), paused: g.paused, reloj: g.clock, mode: g.mode }; };

async function hastaRotulo(page, R, tag) {
  if (!(await until(page, () => window.__bk.activities?.some((a) => a.id === 'secretJump') && window.__bk.mode === 'explore', 90000))) { R.invalid(`${tag}: el reto final no llegó a cargar`); return false; }
  await page.evaluate((ids) => { const s = window.__bk.state; for (const id of ids) if (!s.p.collected.includes(id)) s.p.collected.push(id);
    window.__bk.activities.find((x) => x.id === 'secretJump').debugComplete(); }, SAVE_20.collected);
  if (await until(page, () => window.__bk.cine?.active, 10000)) { await sleep(1200); await page.evaluate(() => window.__bk.closePreview()); }
  return !!(await until(page, () => !document.getElementById('crono-fin').hidden, 15000));
}
async function controlDeVuelta(page, R, tag) {
  await sleep(600); const a = await page.evaluate(ESTADO); await sleep(1500); const b = await page.evaluate(ESTADO);
  R.check(!a.abierto && !a.modal && !a.hudInerte && b.reloj - a.reloj > 1, `${tag}: se cierra y el juego recupera los controles (reloj +${(b.reloj - a.reloj).toFixed(1)} s)`, 'input', { a, b });
}

await runTest(R, async () => {
  const b = await launch();
  try {
    // [aparato, orientación, táctil, cómo se cierra]
    for (const [di, o, touch, como] of [['ip14', 'v', true, 'dedo'], ['and360', 'v', true, 'aporreando'], ['and412', 'v', true, 'mando-A'], ['ip14', 'h', true, 'pausa-y-dedo'],
      ['and412', 'h', true, 'mando-B'], ['pc720', 'h', false, 'Esc'], ['pc720', 'h', false, 'raton']]) {
      const tag = `${di} ${o} · ${como}`, errors = [];
      const page = await open8(b, R, dev(di), o, { save: null, query: '?bktest=1&narr=off', errors });
      try {
        await start8(page, touch); await sleep(1200);
        if (!(await hastaRotulo(page, R, tag))) { R.invalid(`${tag}: no salió el rótulo`); continue; }
        // toque fantasma: justo al abrirse, varios toques en «CONTINUAR» no lo cierran
        for (let i = 0; i < 3; i++) { const c = await center(page, '#btn-crono-ok'); if (c) { if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y); } await sleep(60); }
        const f = await page.evaluate(ESTADO);
        R.check(f.abierto && f.foco === 'btn-crono-ok' && f.modal && f.hudInerte, `${tag}: abierto como ventana (foco en CONTINUAR, juego sin entrada) y los toques fantasma no lo cierran`, 'input', f);
        if (di === 'ip14' && o === 'v') { await sleep(16000); const l = await page.evaluate(ESTADO); R.check(l.abierto, `${tag}: no se va solo (16 s después sigue)`, 'emulation', l); }
        await sleep(700);
        if (como === 'dedo' || como === 'raton') await tapOrClick(page, '#btn-crono-ok', touch);
        else if (como === 'aporreando') { for (let i = 0; i < 12; i++) { const c = await center(page, '#btn-crono-ok'); if (c) await page.touchscreen.tap(c.x, c.y); await sleep(35); } }
        else if (como === 'Esc') await page.keyboard.press('Escape');
        else if (como === 'mando-B') await padTap(page, PAD.B);
        else if (como === 'mando-A') await padTap(page, PAD.A);
        else if (como === 'pausa-y-dedo') {
          await blurFocus(page, 1000); const p = await page.evaluate(ESTADO);
          R.check(p.paused && p.abierto, `${tag}: perder el foco pausa con el rótulo abierto debajo`, 'input', p);
          await tapOrClick(page, '#btn-resume', true); await sleep(700);
          const q = await page.evaluate(ESTADO); R.check(!q.paused && q.abierto, `${tag}: al seguir, el rótulo sigue ahí`, 'input', q);
          await tapOrClick(page, '#btn-crono-ok', true);
        }
        await controlDeVuelta(page, R, tag);
        if (di === 'ip14' && o === 'v') await page.screenshot({ path: R.file_(`cerrado_${di}_${o}.png`) });
        R.check(!errors.length, `${tag}: sin errores`, 'emulation', errors.slice(0, 3));
      } finally { await page.close(); }
    }
    // aspecto del rótulo con el botón (iPhone vertical): captura
    { const errors = [], page = await open8(b, R, dev('ip14'), 'v', { save: null, query: '?bktest=1&narr=off', errors });
      try { await start8(page, true); await sleep(1200); if (await hastaRotulo(page, R, 'captura')) { await sleep(900); await page.screenshot({ path: R.file_('rotulo_ip14_v.png') }); }
        const r = await page.evaluate(() => { const b = document.getElementById('btn-crono-ok').getBoundingClientRect(); return { dentro: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth, alto: b.height }; });
        R.check(r.dentro && r.alto >= 44, 'iPhone vertical: «CONTINUAR» entero en pantalla y de buen tamaño para el dedo', 'emulation', r);
      } finally { await page.close(); } }
  } finally { await b.close(); }
}, { timeoutMs: 1200000 });
