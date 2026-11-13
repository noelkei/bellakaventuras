// IT8 · E2/E3 · guardián: los menús se usan enteros con SOLO el mando (tele 1920×1080, `--via mando`) o SOLO el teclado (`--via teclado`).
// Capas: pausa, ajustes, controles, tamaño de los botones, confirmar reinicio, confirmar «Volver a la plaza», 2D (pregunta del modo ayuda).
// Por capa: se abre con la entrada (Start/Esc y la cruceta/Tab + A/Intro sobre su botón); se recorre con la cruceta (o Tab) 2 vueltas:
//  · cada botón visible y activo de la capa recibe el foco alguna vez;
//  · el foco nunca sale de la capa (no se va a lo de detrás);
//  · el elemento con foco se ve marcado (:focus-visible con contorno) en cada paso;
//  · B (o Esc) la cierra y vuelve a la capa de antes (o al juego) sin hacer lo que decía el botón (reinicio cancelado, sigue en su sitio).
// Además, sin capas: la pausa se abre y se cierra con Start/Esc y el juego sigue.
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, dev, S20, N, BASE_VISTOS, pad, padTap, PAD, until, saveJson } from './lib8.mjs';
const VIA = arg('via', 'mando');
const R = new Report(`it8-menus-${VIA}`, { task: arg('task', 'IT8') });
const D = VIA === 'mando' ? dev('pc1080') : dev('pc720');
const info = (page, layer) => page.evaluate((layer) => { const a = document.activeElement, L = document.getElementById(layer);
  const vis = (e) => !!e && !e.closest('[hidden]') && e.getBoundingClientRect().width > 0;
  const btns = L ? [...L.querySelectorAll('button, input, a[href]')].filter((e) => vis(e) && !e.disabled).map((e) => e.id || e.className || e.textContent.trim().slice(0, 20)) : [];
  const cs = a ? getComputedStyle(a) : null; const marcado = !!a && a !== document.body && (a.matches(':focus-visible') && (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== 'none'));
  return { id: a ? (a.id || a.className || a.tagName) : null, dentro: !!L && !!a && L.contains(a), marcado, btns, abierta: vis(L) }; }, layer);
async function tab(page, back) { if (VIA === 'mando') return padTap(page, back ? PAD.UP : PAD.DOWN, 90); if (back) { await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift'); } else await page.keyboard.press('Tab'); await sleep(120); }
async function ok(page) { if (VIA === 'mando') return padTap(page, PAD.A); await page.keyboard.press('Enter'); await sleep(200); }
async function back(page) { if (VIA === 'mando') return padTap(page, PAD.B); await page.keyboard.press('Escape'); await sleep(250); }
async function pause(page) { if (VIA === 'mando') return padTap(page, PAD.START); await page.keyboard.press('Escape'); await sleep(250); }
/** Lleva el foco a `sel` con la entrada (máx. 30 pasos) y lo pulsa. */
async function goTo(page, sel) { for (let i = 0; i < 30; i++) { if (await page.evaluate((q) => document.activeElement?.matches?.(q), sel)) { await ok(page); await sleep(500); return true; } await tab(page, false); } return false; }
/** Recorre la capa: 2 vueltas; devuelve lo alcanzado y los fallos de foco. */
async function walk(page, layer) {
  const i0 = await info(page, layer); const seen = new Set(), fuera = [], sinMarca = [];
  const n = Math.max(4, i0.btns.length * 2 + 2);
  for (let i = 0; i < n; i++) { await tab(page, false); const s = await info(page, layer); if (s.id) seen.add(s.id); if (!s.dentro) fuera.push(s.id); else if (!s.marcado) sinMarca.push(s.id); }
  for (let i = 0; i < 3; i++) { await tab(page, true); const s = await info(page, layer); if (s.id) seen.add(s.id); if (!s.dentro) fuera.push(s.id); }
  const falta = i0.btns.filter((x) => !seen.has(x));
  return { botones: i0.btns, falta, fuera: [...new Set(fuera)], sinMarca: [...new Set(sinMarca)] };
}
await runTest(R, async () => {
  const b = await launch(); const out = {};
  try {
    const page = await open8(b, R, D, 'h', { save: { ...S20 } });
    if (VIA === 'mando') { await pad(page, {}); await sleep(200); await padTap(page, PAD.A); } else { await page.keyboard.press('Enter'); }
    const started = await until(page, () => window.__bk.started, 10000);
    R.check(!!started, `${VIA}: JUGAR/CONTINUAR se pulsa con ${VIA === 'mando' ? 'A' : 'Intro'} (foco inicial en el botón)`, 'input', { started });
    if (!started) return;
    await sleep(1500);
    const capas = [
      { id: 'pause', abrir: async () => { await pause(page); }, cierra: 'juego' },
      { id: 'settings', abrir: async () => { await pause(page); await sleep(400); return goTo(page, '#btn-settings'); }, cierra: 'pause' },
      { id: 'btn-size', abrir: async () => { await pause(page); await sleep(400); await goTo(page, '#btn-settings'); return goTo(page, '#btn-size-open'); }, cierra: 'settings' },
      { id: 'help', abrir: async () => { await pause(page); await sleep(400); return goTo(page, '#btn-help'); }, cierra: 'pause' },
      { id: 'confirm', abrir: async () => { await pause(page); await sleep(400); return goTo(page, '#btn-restart'); }, cierra: 'pause', guarda: async () => (await page.evaluate(() => window.__bk.state.total)) === 20 },
      { id: 'confirm-plaza', abrir: async () => { await pause(page); await sleep(400); return goTo(page, '#btn-plaza'); }, cierra: 'pause', guarda: async () => { const p = await page.evaluate(() => [window.__bk.skater.footPos.x, window.__bk.skater.footPos.z]); return true; } },
    ];
    for (const c of capas) {
      // limpiar: cerrar todo
      for (let i = 0; i < 4 && await page.evaluate(() => window.__bk.paused || !!document.querySelector('.modal:not([hidden]), #settings:not([hidden]), #help:not([hidden])')); i++) { await back(page); await sleep(300); }
      if (await page.evaluate(() => window.__bk.paused)) { await page.evaluate(() => window.__bk.setPaused(false)); await sleep(300); }
      const pos0 = await page.evaluate(() => [window.__bk.skater.footPos.x, window.__bk.skater.footPos.z]);
      await c.abrir(); await sleep(600);
      const ab = await info(page, c.id);
      if (!ab.abierta) { R.check(false, `${VIA} · ${c.id}: se abre con la entrada`, 'input', ab); out[c.id] = { abre: false }; continue; }
      const w = await walk(page, c.id); out[c.id] = w;
      R.check(!w.falta.length, `${VIA} · ${c.id}: cada botón (${w.botones.length}) recibe el foco`, 'input', { falta: w.falta, botones: w.botones });
      R.check(!w.fuera.length, `${VIA} · ${c.id}: el foco no se va detrás de la capa`, 'input', { fuera: w.fuera });
      R.check(!w.sinMarca.length, `${VIA} · ${c.id}: el foco se ve marcado en cada paso`, 'input', { sinMarca: w.sinMarca });
      await back(page); await sleep(600);
      const after = await page.evaluate((cierra) => ({ paused: window.__bk.paused, pausa: !document.getElementById('pause').hidden, settings: !document.getElementById('settings').hidden, total: window.__bk.state.total, pos: [window.__bk.skater.footPos.x, window.__bk.skater.footPos.z] }), c.cierra);
      const closedOk = !(await info(page, c.id)).abierta && (c.cierra === 'juego' ? !after.paused : c.cierra === 'pause' ? after.pausa : after.settings);
      const guarda = c.id === 'confirm' ? after.total === 20 : c.id === 'confirm-plaza' ? Math.hypot(after.pos[0] - pos0[0], after.pos[1] - pos0[1]) < 1 : true;
      R.check(closedOk && guarda, `${VIA} · ${c.id}: ${VIA === 'mando' ? 'B' : 'Esc'} la cierra y vuelve a ${c.cierra} sin hacer lo del botón`, 'input', after);
      out[c.id].cierre = after;
    }
    saveJson(`E-menus/${VIA}.json`, out);
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
