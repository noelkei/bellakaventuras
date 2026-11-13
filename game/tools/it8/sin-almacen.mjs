// IT8 · A1 · guardián: jugar sin poder guardar no rompe nada y el jugador lo SABE.
// Casos (cada uno en ordenador 1280×720 y en iPhone 12–15 vertical):
//  · «bloqueado»: leer window.localStorage lanza SecurityError (Safari con cookies bloqueadas, modo privado antiguo);
//  · «cuota0»: localStorage.setItem lanza QuotaExceededError siempre (modo privado de Safari ≤ 10, cuota 0);
//  · «se-llena»: guarda bien al principio y a mitad de partida se llena; después se libera y «Reintentar guardar» lo arregla.
// Comprueba: sin errores; JUGAR se activa; en la portada se VE el aviso de que no se guardará (bloqueado/cuota0); dentro del juego el
// distintivo de guardado se ve y está encima (un toque le llegaría); recoger una patata funciona; en se-llena, tras recoger con el disco lleno
// el aviso «No se pudo guardar» sale en ≤ 10 s, «Reintentar guardar» está en la pausa y, liberado el espacio, guarda la patata.
// `--rojo`: quita el aviso del juego (listeners de state) para demostrar que la comprobación del distintivo sale ROJA.
import { Report, runTest, launch, sleep, arg, flag } from '../v8/lib.mjs';
import { open8, start8, dev, S0, collectFry, onTop, disk, tapOrClick, saveJson } from './lib8.mjs';
const R = new Report('it8-sin-almacen', { task: arg('task', 'IT8') });
const ROJO = flag('rojo');
const CASOS = (arg('casos') ?? 'bloqueado,cuota0,se-llena').split(',');
const APARATOS = (arg('aparatos') ?? 'pc720:h,ip14:v').split(',').map((s) => s.split(':'));
const TRAMPA = {
  bloqueado: () => { try { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('El acceso al almacenamiento está bloqueado', 'SecurityError'); } }); } catch { /* */ } },
  cuota0: () => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (this === window.localStorage) throw new DOMException('cuota 0', 'QuotaExceededError'); return set.call(this, k, v); }; },
  'se-llena': () => { const set = Storage.prototype.setItem; window.__bkLleno = false; Storage.prototype.setItem = function (k, v) { if (window.__bkLleno && this === window.localStorage) throw new DOMException('lleno', 'QuotaExceededError'); return set.call(this, k, v); }; },
};
const vis = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); if (!e) return { ok: false, txt: '' }; const cs = getComputedStyle(e), r = e.getBoundingClientRect();
  let op = 1; for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x); op *= +c.opacity; if (c.display === 'none' || c.visibility === 'hidden') op = 0; }
  return { ok: !e.closest('[hidden]') && op > 0.3 && r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1 && cs.visibility !== 'hidden', txt: e.textContent.trim().slice(0, 160), op: +op.toFixed(2), r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }; }, sel);
await runTest(R, async () => {
  const b = await launch(); const filas = [];
  try {
    for (const caso of CASOS) for (const [di, o] of APARATOS) {
      const d = dev(di), touch = d.kind !== 'desktop', errors = [], tag = `${caso} · ${di} ${o}`;
      const page = await open8(b, R, d, o, { save: caso === 'se-llena' ? S0 : undefined, init: [TRAMPA[caso]], errors });
      const fila = { caso, aparato: `${di} ${o}` };
      if (caso !== 'se-llena') {
        fila.portada = await vis(page, '#load-text');
        R.check(fila.portada.ok && /no guarda|sesión/i.test(fila.portada.txt), `${tag}: en la portada se ve que la partida no se guardará`, 'emulation', fila.portada);
      }
      await start8(page, touch); await sleep(1200);
      if (ROJO) await page.evaluate(() => { window.__bk.state.listeners.length = 0; });
      const id = 'no_me_guillo.visible';
      if (caso === 'se-llena') {
        fila.antes = await page.evaluate(() => ({ st: window.__bk.state.status }));
        await page.evaluate(() => { window.__bkLleno = true; });
      }
      const c = await collectFry(page, id, 2500); fila.patata = c;
      R.check(c.got && c.total >= 1, `${tag}: recoger una patata funciona (${c.total ?? '?'} recogidas)`, 'input', c);
      // el distintivo de guardado (≤ 10 s)
      let badge = null; const t0 = Date.now();
      while (Date.now() - t0 < 10000) { badge = { ...(await vis(page, '#save-badge')), top: await onTop(page, '#save-badge') }; if (badge.ok) break; await sleep(400); }
      fila.distintivo = badge; fila.estado = await page.evaluate(() => ({ st: window.__bk.state.status, persistent: window.__bk.state.persistent, err: window.__bk.state.lastError }));
      const espera = caso === 'se-llena' ? /no se pudo guardar/i : /sesión/i;
      // el distintivo no se toca: basta con que se vea (las zonas táctiles transparentes de cámara y joystick encima no lo tapan a la vista)
      const tapa = badge.top.ok || /cam-zone|stick-zone/.test(badge.top.why);
      R.check(badge.ok && tapa && espera.test(badge.txt), `${tag}: en el juego se ve el aviso «${caso === 'se-llena' ? 'No se pudo guardar' : 'Partida de esta sesión'}» y nada opaco lo tapa`, 'emulation', { badge, estado: fila.estado });
      if (caso === 'se-llena') {
        await page.keyboard.press('Escape'); await sleep(700);
        const rb = await onTop(page, '#btn-save-retry'); fila.reintentar = rb;
        R.check(rb.ok, `${tag}: «Reintentar guardar» está en la pausa y se puede pulsar`, 'emulation', rb);
        await page.evaluate(() => { window.__bkLleno = false; });
        await tapOrClick(page, '#btn-save-retry', touch); await sleep(600);
        const dk = await disk(page); fila.disco = dk?.collected;
        R.check(Array.isArray(dk?.collected) && dk.collected.includes(id), `${tag}: liberado el espacio, «Reintentar guardar» guarda la patata`, 'input', { disco: dk?.collected, st: await page.evaluate(() => window.__bk.state.status) });
        await tapOrClick(page, '#btn-resume', touch); await sleep(300);
      }
      fila.errores = errors.slice(0, 6);
      R.check(!errors.length, `${tag}: sin errores de página ni de consola`, 'emulation', errors.slice(0, 6));
      filas.push(fila); await page.close();
    }
    saveJson(`A1-sin-almacen/resultado${ROJO ? '_rojo' : ''}.json`, filas);
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
