// V10.6 · guardián de la pantalla «Recomendamos usar cascos» (petición del usuario, 24 oct): con ?bktest&cascos (en las demás pruebas no sale),
//  · al pulsar JUGAR (partida nueva) sale encima de todo con su texto y «Continuar», y el juego no empieza debajo (ni tutorial ni 2D) hasta cerrarla;
//    al cerrarla empieza el tutorial; el toque del dedo en JUGAR no la cierra sola;
//  · con partida guardada (CONTINUAR) también sale; Esc la cierra y el juego sigue;
//  · B del mando la cierra; en un iPhone sin «Modo app» contestado, primero los cascos y DESPUÉS el aviso del iPhone, y luego la narrativa.
//  · M · matriz: los 13 aparatos (móviles, tabletas y ordenadores) en vertical y horizontal (+ modo app con muesca y la pantalla girada por el juego):
//    imagen, título, texto y «Continuar» dentro de la pantalla (zona segura), sin montarse, «Continuar» ≥ 44 px en táctil y encima de todo; cerrarla
//    deja el juego jugable (explorando, sin capa ni entrada bloqueada).
//  · E · casos raros: doble toque en JUGAR, doble toque en «Continuar», Intro, A del mando, perder el foco y volver, girar el móvil y recargar con
//    la pantalla abierta: nunca se queda atascado ni se salta el juego.
// Uso: node tools/v10_6/cascos.mjs --url <build> [--task V10-6] [--label r]
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
import { open8, dev, S20, onTop, tapOrClick, until, reload8 } from '../it8/lib8.mjs';
import { DEVICES, rotate } from '../v10_5/lib105.mjs';
const R = new Report('v106-cascos', { task: arg('task', 'V10-6') });
const Q = '?bktest=1&cascos=1';
const est = (page) => page.evaluate(() => { const g = window.__bk, c = document.getElementById('cascos'), d2 = document.getElementById('d2');
  return { cascos: !!c && !c.hidden, titulo: c?.querySelector('h2')?.textContent.trim() ?? null, texto: c?.querySelector('p')?.textContent.trim() ?? null, boton: document.getElementById('btn-cascos')?.textContent.trim() ?? null,
    started: g.started, d2: !!d2 && !d2.hidden, ejercicio: !!g.narr.exercise, narrBusy: g.narr.busy, ios: !document.getElementById('ios-app').hidden, paused: g.paused, modal: g.input.modal }; });
const jugar = async (page, touch) => { const b = await page.evaluate(() => { const r = document.getElementById('btn-start').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (touch) await page.touchscreen.tap(b.x, b.y); else await page.mouse.click(b.x, b.y); await sleep(1500); };
const pad = (page, i) => page.evaluate((i) => { const g = window.__bk, mk = (p) => ({ axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, k) => ({ pressed: p && k === i, value: p && k === i ? 1 : 0 })), id: 'prueba', connected: true });
  g.input.fakePad = mk(false); setTimeout(() => { g.input.fakePad = mk(true); }, 120); setTimeout(() => { g.input.fakePad = mk(false); }, 300); setTimeout(() => { g.input.fakePad = null; }, 600); }, i);
await runTest(R, async () => {
  const b = await launch(); const out = {};
  try {
    // A · ordenador, partida nueva, ratón
    { const errors = [], page = await open8(b, R, dev('pc720'), 'h', { save: { ...FRESH, settings: { iosAppAsked: true } }, query: Q, errors });
      try { await jugar(page, false); const a = await est(page), top = await onTop(page, '#btn-cascos'); await sleep(1500); const a2 = await est(page);
        out.A = { a, a2, top };
        R.check(a.cascos && a.titulo === 'Recomendamos usar cascos' && a.texto === 'Para disfrutar al máximo de la música y la experiencia.' && a.boton === 'Continuar' && top.ok, 'A · al pulsar JUGAR sale «Recomendamos usar cascos» con su texto y «Continuar», encima de todo', 'input', { a, top });
        R.check(a2.cascos && a2.started && !a2.d2 && !a2.ejercicio && !a2.narrBusy, 'A · mientras está, el juego no empieza debajo (sin tutorial ni 2D)', 'input', a2);
        await page.click('#btn-cascos'); const t = await until(page, () => { const d = document.getElementById('d2'); return (d && !d.hidden) || !!window.__bk.narr.exercise; }, 15000); const a3 = await est(page);
        R.check(!a3.cascos && !!t && !a3.modal, 'A · «Continuar» la cierra y empieza el tutorial', 'input', a3);
        R.check(!errors.length, 'A · sin errores', 'emulation', errors.slice(0, 3));
      } finally { await page.close(); } }
    // B · iPhone con partida guardada (CONTINUAR), dedo; luego Esc no aplica: se cierra con el dedo; y otra recarga cerrando con B del mando
    { const errors = [], page = await open8(b, R, dev('ip14'), 'h', { save: S20, query: Q, errors });
      try { const lab = await page.evaluate(() => document.querySelector('#btn-start .pt-vh')?.textContent ?? document.getElementById('btn-start').textContent);
        await jugar(page, true); const c = await est(page); out.B = { lab, c };
        R.check(/CONTINUAR/.test(lab) && c.cascos, 'B · con partida guardada (CONTINUAR) también sale', 'input', { lab, c });
        R.check(c.cascos, 'B · el toque del dedo en JUGAR no la cierra sola', 'input', c);
        await tapOrClick(page, '#btn-cascos', true); await sleep(800); const c2 = await est(page);
        R.check(!c2.cascos && !c2.modal && !c2.paused, 'B · con el dedo en «Continuar» se cierra y el juego sigue', 'input', c2);
        await reload8(page); await jugar(page, false); const c3 = await est(page); await page.keyboard.press('Escape'); await sleep(700); const c4 = await est(page);
        R.check(c3.cascos && !c4.cascos && !c4.paused && !c4.modal, 'B · Esc la cierra (como «Continuar») y no abre la pausa', 'input', { c3, c4 });
        await reload8(page); await jugar(page, false); const c5 = await est(page); await pad(page, 1); await sleep(900); const c6 = await est(page);
        R.check(c5.cascos && !c6.cascos && !c6.modal, 'B · B del mando la cierra', 'input', { c5, c6 });
        R.check(!errors.length, 'B · sin errores', 'emulation', errors.slice(0, 3));
      } finally { await page.close(); } }
    // C · iPhone sin «Modo app» contestado: primero cascos, después el aviso del iPhone, y luego la narrativa
    { const errors = [], page = await open8(b, R, dev('ip14'), 'v', { save: { ...FRESH, settings: {} }, query: Q, errors });
      try { await jugar(page, true); const d = await est(page);
        R.check(d.cascos && !d.ios, 'C · primero sale la de los cascos (sin el aviso del iPhone encima)', 'input', d);
        await tapOrClick(page, '#btn-cascos', true); const ios = await until(page, () => !document.getElementById('ios-app').hidden, 4000); const d2 = await est(page);
        R.check(!!ios && !d2.cascos, 'C · al cerrarla sale el aviso del iPhone', 'input', d2);
        await tapOrClick(page, '#btn-ios-no', true); const t = await until(page, () => { const e = document.getElementById('d2'); return (e && !e.hidden) || !!window.__bk.narr.exercise; }, 15000); const d3 = await est(page);
        R.check(!!t && !d3.ios && !d3.paused, 'C · y después empieza la narrativa', 'input', d3);
        out.C = { d, d2, d3 };
        R.check(!errors.length, 'C · sin errores', 'emulation', errors.slice(0, 3));
      } finally { await page.close(); } }

    // M · matriz de aparatos
    const geo = (page) => page.evaluate(() => { const c = document.getElementById('cascos'), W = innerWidth, H = innerHeight, cs = getComputedStyle(document.documentElement), px = (v) => parseFloat(cs.getPropertyValue(v)) || 0;
      const s = { t: px('--sat'), r: px('--sar'), b: px('--sab'), l: px('--sal') }, R = (sel) => { const e = c.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const it = { img: R('.cascos-img'), h2: R('h2'), p: R('p'), btn: R('#btn-cascos') }, rot = document.documentElement.className.match(/rotm?90/)?.[0] ?? null;
      const dentro = (q) => !!q && q.w > 1 && q.x >= s.l - 1 && q.y >= s.t - 1 && q.r <= W - s.r + 1 && q.b <= H - s.b + 1;
      const ov = (a, b) => !!a && !!b && Math.min(a.r, b.r) - Math.max(a.x, b.x) > 1 && Math.min(a.b, b.b) - Math.max(a.y, b.y) > 1;
      const fuera = Object.entries(it).filter(([, q]) => !dentro(q)).map(([k]) => k), mont = [['img', 'h2'], ['h2', 'p'], ['p', 'btn'], ['img', 'btn']].filter(([a, b]) => ov(it[a], it[b])).map((x) => x.join('-'));
      const imgOk = !!c.querySelector('.cascos-img')?.naturalWidth;
      return { W, H, rot, fuera, mont, btnH: it.btn ? Math.round(rot ? it.btn.w : it.btn.h) : 0, imgOk, desplaza: c.scrollHeight > c.clientHeight + 1 }; });
    const jugable = (page) => page.evaluate(() => { const g = window.__bk; return { cascos: !document.getElementById('cascos').hidden, modal: g.input.modal, mode: g.mode, paused: g.paused, world: g.input.world, narr: !!g.narr.busy }; });
    // «Jugable» = explorando con el mundo activo, o la narrativa en marcha (con una partida de 20 patatas, CONTINUAR ofrece el bloque final: es el juego)
    const sigue = (j) => (j.mode === 'explore' && j.world) || (j.mode === 'narr' && j.narr);
    const casos = [];
    for (const d of DEVICES) for (const o of d.kind === 'desktop' ? ['h'] : ['v', 'h']) casos.push({ d, o });
    for (const id of ['ip14', 'and360']) { casos.push({ d: dev(id), o: 'h', app: true }); }
    casos.push({ d: dev('ip14'), o: 'v', pref: 'horizontal' }); casos.push({ d: dev('se1'), o: 'h', pref: 'vertical' });
    for (const k of casos) { const touch = k.d.kind !== 'desktop', tag = `M · ${k.d.id} ${k.o}${k.app ? ' app' : ''}${k.pref ? ' girada(' + k.pref + ')' : ''}`, errors = [];
      const page = await open8(b, R, k.d, k.o, { save: { ...S20, settings: { ...S20.settings, ...(k.pref ? { orientation: k.pref } : {}) } }, query: Q, app: !!k.app, safe: !!k.app, errors });
      try { await jugar(page, touch); const g = await geo(page), top = await onTop(page, '#btn-cascos');
        R.check(g.imgOk && !g.fuera.length && !g.mont.length && top.ok && (!touch || g.btnH >= 44), `${tag}: imagen, título, texto y «Continuar» a la vista, sin montarse${touch ? ', ≥ 44 px' : ''} y encima de todo`, 'emulation', { ...g, top });
        if (touch) await tapOrClick(page, '#btn-cascos', true); else await page.click('#btn-cascos'); await sleep(700); const j = await jugable(page);
        R.check(!j.cascos && !j.modal && !j.paused && sigue(j), `${tag}: al cerrarla el juego queda jugable`, 'input', j);
        if (casos.indexOf(k) % 6 === 0) await R.shot(page, `M_${k.d.id}${k.o}${k.app ? 'app' : ''}${k.pref ? 'rot' : ''}`);
        R.check(!errors.length, `${tag}: sin errores`, 'emulation', errors.slice(0, 3));
      } finally { await page.close(); } }
    // E · casos raros (iPhone, dedo, salvo los de teclado y mando)
    { const d = dev('ip14'), errors = [];
      const page = await open8(b, R, d, 'v', { save: S20, query: Q, errors });
      try {
        // doble toque rápido en JUGAR
        const bx = await page.evaluate(() => { const r = document.getElementById('btn-start').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        await page.touchscreen.tap(bx.x, bx.y); await sleep(60); await page.touchscreen.tap(bx.x, bx.y); await sleep(1200);
        const e1 = await est(page); R.check(e1.cascos && e1.started, 'E · doble toque en JUGAR: una sola pantalla de cascos, abierta', 'input', e1);
        // perder el foco con ella abierta y volver
        await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(500); await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await sleep(500);
        const e2 = await est(page), topB = await onTop(page, '#btn-cascos');
        R.check(e2.cascos && topB.ok, 'E · tras perder el foco, la pantalla sigue y «Continuar» se puede tocar', 'input', { e2, topB });
        // girar el móvil con ella abierta
        await rotate(page, d, 'h'); await sleep(900); const g2 = await geo(page), topR = await onTop(page, '#btn-cascos');
        R.check(!g2.fuera.length && !g2.mont.length && topR.ok, 'E · al girar el móvil con ella abierta, todo sigue a la vista', 'emulation', { ...g2, topR });
        // doble toque en «Continuar»
        const c = await page.evaluate(() => { const r = document.getElementById('btn-cascos').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        await page.touchscreen.tap(c.x, c.y); await sleep(60); await page.touchscreen.tap(c.x, c.y); await sleep(900);
        const e3 = await page.evaluate(() => { const g = window.__bk; return { cascos: !document.getElementById('cascos').hidden, paused: g.paused, pausa: !document.getElementById('pause').hidden, modal: g.input.modal, mode: g.mode, world: g.input.world, narr: !!g.narr.busy }; });
        R.check(!e3.cascos && !e3.modal && sigue(e3), 'E · doble toque en «Continuar»: se cierra y el juego sigue (el 2.º toque no rompe nada)', 'input', e3);
        if (e3.pausa) await tapOrClick(page, '#btn-resume', true);
        // recargar con ella abierta: vuelve a salir al pulsar CONTINUAR y no se pierde nada
        await reload8(page); const antes = await page.evaluate(() => window.__bk.state.total); await jugar(page, true); const e4 = await est(page);
        await reload8(page); await jugar(page, true); const e5 = await est(page), despues = await page.evaluate(() => window.__bk.state.total);
        R.check(e4.cascos && e5.cascos && antes === despues, 'E · recargar con ella abierta: al volver sale otra vez y la partida sigue igual', 'input', { e4, e5, antes, despues });
        R.check(!errors.length, 'E · sin errores (iPhone)', 'emulation', errors.slice(0, 3));
      } finally { await page.close(); } }
    { const errors = [], page = await open8(b, R, dev('pc720'), 'h', { save: S20, query: Q, errors });
      try { await page.focus('#btn-start'); await page.keyboard.press('Enter'); await sleep(1300); const k1 = await est(page), foco = await page.evaluate(() => document.activeElement?.id);
        await page.keyboard.press('Enter'); await sleep(700); const k2 = await est(page);
        R.check(k1.cascos && foco === 'btn-cascos' && !k2.cascos && !k2.modal, 'E · con teclado: Intro en JUGAR la abre con el foco en «Continuar» e Intro la cierra', 'input', { k1, foco, k2 });
        await reload8(page); await page.evaluate(() => document.getElementById('btn-start').click()); await sleep(1300); const m1 = await est(page); await pad(page, 0); await sleep(900); const m2 = await est(page);
        R.check(m1.cascos && !m2.cascos && !m2.modal, 'E · con mando: A sobre «Continuar» la cierra', 'input', { m1, m2 });
        R.check(!errors.length, 'E · sin errores (ordenador)', 'emulation', errors.slice(0, 3));
      } finally { await page.close(); } }
    // D · sin ?cascos (las demás pruebas) no sale
    { const page = await open8(b, R, dev('pc720'), 'h', { save: S20, query: '?bktest=1&narr=off' });
      try { await jugar(page, false); const e = await est(page); out.D = e; R.check(!e.cascos && e.started, 'D · en las pruebas sin ?cascos no sale', 'input', e); } finally { await page.close(); } }
    R.measure('cascos', out);
  } finally { await b.close(); }
}, { timeoutMs: 2400000 });
