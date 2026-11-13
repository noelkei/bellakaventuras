// V10.6 · guardián de los avisos del juego (B5, V10/IT9/B5_METRICAS.md §5). Con ?bktest los avisos NO se mandan: se apuntan en window.__bkAvisos.
//  A · partida nueva en ordenador: carga-portada, carga-lista, jugar p=n, sonido, control teclado; saltar el tutorial (T) → saltar tutorial,
//      cinemática saltada → saltar cinematica, tutorial modo=saltado; dos patatas de NMG → patata-no_me_guillo n=1 y 2 (d ≥ 0); zona-no_me_guillo
//      orden 1; min-2 y fps (adelantando el reloj de juego de las pruebas).
//  B · grind de Bellakat en el iPhone sin equilibrar: act-empieza skateTutorial y act-falla intento 1; control tactil; orientacion.
//  C · recargar con la partida guardada: jugar p=c; las patatas ya cogidas no se vuelven a avisar; la siguiente sí, con su n.
//  D · un error lanzado a propósito con una ruta personal en el texto → error c=E99 (sin texto en ningún campo).
//  En todos: ningún aviso ni campo fuera del esquema, valores cerrados, NINGUNA petición de red a /e/ y sin errores de consola.
//  E · transporte con sendBeacon y fetch simulados (URL /e/<nombre>?…) y puedeEnviar() falso en localhost.
// Uso: node tools/v10_6/avisos.mjs --url <build> [--task V10-6] [--label r]
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
import { open8, start8, dev, S0, S20, collectFry, drainUI, toAct, tapOrClick, until, reload8 } from '../it8/lib8.mjs';
const R = new Report('v106-avisos', { task: arg('task', 'V10-6') });
const lista = (page) => page.evaluate(() => (window.__bkAvisos ?? null) && window.__bkAvisos.map((a) => ({ n: a.n, q: { ...a.q } })));
const hay = (L, n, f = () => true) => (L ?? []).filter((a) => a.n === n && f(a.q));
/** Esquema esperado (independiente del del juego: si el juego añade algo fuera de la especificación, falla). */
const ZON = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'], ACT = ['pantherTalk', 'skateTutorial', 'graffiti', 'bridgeTalk', 'danceCombo', 'secretnovio'];
const num = (max) => (v) => /^\d+(\.\d)?$/.test(v) && +v <= max, de = (...xs) => (v) => xs.includes(v), T = num(86400), P = de('n', 'c');
const ESQ = { 'carga-portada': { s: num(86400) }, 'carga-lista': { s: num(86400) }, 'carga-sale': { s: num(86400), pct: de('0', '25', '50', '75') },
  jugar: { p: P, red: de('wifi', 'datos', 'otro', '?'), calidad: de('4g', '3g', '2g', '?') }, tutorial: { t: T, p: P, modo: de('visto', 'saltado') },
  secretnovio: { t: T, p: P }, 'animacion-final': { t: T, p: P, modo: de('vista', 'saltada') }, 'dialogo-final': { t: T, p: P },
  'act-empieza': { a: de(...ACT), t: T, p: P }, 'act-falla': { a: de(...ACT), intento: num(20), t: T, p: P }, 'act-completa': { a: de(...ACT), t: T, dur: T, intentos: num(99), p: P },
  error: { c: de('E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E99'), fase: de('carga', 'portada', 'partida'), m: de('portada', 'motor', 'externo', 'promesa') },
  control: { c: de('tactil', 'raton', 'mando', 'teclado') }, orientacion: { o: de('vertical', 'horizontal') }, 'orientacion-cambia': { o: de('vertical', 'horizontal') },
  sonido: { s: de('on', 'off') }, 'sonido-cambia': { s: de('on', 'off') }, eficiente: { modo: de('guardado', 'manual') }, fps: { tramo: de('fluido', 'justo', 'lento'), f: num(240) },
  ayuda: { t: T, tipo: de('auto', 'pedida') }, saltar: { que: de('tutorial', 'cinematica', 'escena-final'), t: T } };
for (const z of ZON) { ESQ[`patata-${z}`] = { n: num(20), tipo: de('visible', 'medium', 'hidden', 'activity'), t: T, d: T, p: P }; ESQ[`zona-${z}`] = { t: T, orden: num(5), p: P }; }
for (const m of [2, 5, 10, 20, 30, 45, 60]) ESQ[`min-${m}`] = { p: P };
const fuera = (L) => (L ?? []).flatMap((a) => { const e = ESQ[a.n]; if (!e) return [`aviso desconocido ${a.n}`]; return Object.entries(a.q).filter(([k, v]) => !e[k] || !e[k](v)).map(([k, v]) => `${a.n}.${k}=${v}`); });
// V10.6.1 (cronómetro y top): leer el top (GET /e/record) no es un aviso ni manda nada; se apunta aparte y se exige que no lleve datos.
// Cualquier otra petición a /e/ (avisos, o /e/record que no sea un GET limpio) sigue contando como fallo, igual que antes.
const red = (page, out) => page.on('request', (r) => { const u = new URL(r.url()); if (!/\/e\//.test(u.pathname)) return;
  if (u.pathname === '/e/record' && r.method() === 'GET') (out.lecturas ??= []).push({ url: r.url(), q: u.search, cuerpo: r.postData() ?? '' }); else out.push(r.url()); });
await runTest(R, async () => {
  const b = await launch(); const out = {};
  try {
    // ---------------------------------------------------------------- A
    { const errors = [], peticiones = [], page = await open8(b, R, dev('pc720'), 'h', { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', errors }); red(page, peticiones);
      try {
        const L0 = await lista(page);
        if (L0 === null) { R.check(false, 'A · el juego apunta avisos en modo prueba (window.__bkAvisos)', 'unit', 'no existe'); }
        else {
          await start8(page, false); await sleep(1500);
          await until(page, () => !!window.__bk.narr.exercise || !document.getElementById('d2').hidden, 30000); await sleep(800);
          await page.keyboard.press('KeyT'); await sleep(1500);
          // pregunta del modo ayuda → «No»; cinemática → Esc; resto de frases → E
          const t0 = Date.now(); while (Date.now() - t0 < 90000) { const st = await page.evaluate(() => ({ e: window.__bk.state.p.narr.estado, busy: window.__bk.narr.busy, cine: window.__bk.narr.inCine, n: (() => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)').length : 0; })() }));
            if (st.e === 'hecho' && !st.busy) break; if (st.cine) { await page.keyboard.press('Escape'); await sleep(700); continue; }
            if (st.n >= 2) { await sleep(450); await page.evaluate(() => [...document.querySelectorAll('#d2 .d2-row .d2-btn:not(.d2-skip)')].at(-1).click()); } else if (st.n === 1) { await sleep(450); await page.keyboard.press('KeyE'); }
            await sleep(300); }
          await drainUI(page, false, 15000);
          for (const id of ['no_me_guillo.visible', 'no_me_guillo.medium']) { await collectFry(page, id, 2500); await sleep(1200); await drainUI(page, false, 15000); }
          await page.evaluate(() => window.__bkAvisosDebug.avanzar(125)); await sleep(500);
          const L = await lista(page); out.A = L;
          R.check(hay(L, 'carga-portada').length === 1 && hay(L, 'carga-lista').length === 1, 'A · carga-portada y carga-lista, una vez cada uno', 'unit', L.filter((a) => a.n.startsWith('carga')));
          R.check(hay(L, 'jugar', (q) => q.p === 'n').length === 1, 'A · jugar con p=n (partida nueva)', 'unit', hay(L, 'jugar'));
          R.check(hay(L, 'sonido').length === 1 && hay(L, 'control', (q) => q.c === 'teclado').length === 1, 'A · sonido al empezar y control=teclado', 'unit', [...hay(L, 'sonido'), ...hay(L, 'control')]);
          R.check(hay(L, 'saltar', (q) => q.que === 'tutorial').length === 1 && hay(L, 'tutorial', (q) => q.modo === 'saltado').length === 1, 'A · saltar tutorial y tutorial modo=saltado', 'unit', [...hay(L, 'saltar'), ...hay(L, 'tutorial')]);
          R.check(hay(L, 'saltar', (q) => q.que === 'cinematica').length === 1, 'A · saltar cinematica', 'unit', hay(L, 'saltar'));
          const pt = hay(L, 'patata-no_me_guillo'); R.check(pt.length === 2 && pt[0].q.n === '1' && pt[1].q.n === '2' && pt.every((a) => a.q.p === 'n' && +a.q.d >= 0 && a.q.tipo), 'A · dos patatas de NMG con n=1 y 2, tipo, d y p', 'unit', pt);
          R.check(hay(L, 'zona-no_me_guillo', (q) => q.orden === '1').length === 1, 'A · zona-no_me_guillo con orden=1', 'unit', L.filter((a) => a.n.startsWith('zona')));
          R.check(hay(L, 'min-2').length === 1 && hay(L, 'fps').length === 1, 'A · min-2 y fps al pasar el reloj de juego', 'unit', [...hay(L, 'min-2'), ...hay(L, 'fps')]);
          R.check(!fuera(L).length, 'A · ningún aviso ni campo fuera del esquema', 'unit', fuera(L).slice(0, 6));
        }
        R.check(!peticiones.length, 'A · ninguna petición de red a /e/ en modo prueba', 'unit', peticiones.slice(0, 3));
        R.check((peticiones.lecturas ?? []).every((l) => !l.q && !l.cuerpo), 'A · la lectura del top (GET /e/record) no lleva ningún dato', 'unit', (peticiones.lecturas ?? []).slice(0, 3));
        R.check(!errors.length, 'A · sin errores', 'emulation', errors.slice(0, 3));
      } finally { await page.close(); } }
    // ---------------------------------------------------------------- B y C (iPhone)
    { const errors = [], peticiones = [], page = await open8(b, R, dev('ip14'), 'h', { save: { ...S0, settings: { iosAppAsked: true } }, query: '?bktest=1&narr=off', errors }); red(page, peticiones);
      try { await start8(page, true); await sleep(1200);
        if ((await lista(page)) === null) R.check(false, 'B · el juego apunta avisos en modo prueba', 'unit', 'no existe'); else {
          await toAct(page, 'act.skateTutorial'); await until(page, () => !document.getElementById('prompt').hidden, 4000); await tapOrClick(page, '#btn-action', true); await sleep(1500);
          for (let i = 0; i < 6 && await page.evaluate(() => !document.getElementById('dialog').hidden); i++) { await tapOrClick(page, '#dialog-ok', true); await sleep(700); }
          if (await until(page, () => !document.getElementById('prompt').hidden, 4000)) await tapOrClick(page, '#btn-action', true);   // EMPEZAR GRIND
          const f = await until(page, () => (window.__bkAvisos ?? []).some((a) => a.n === 'act-falla'), 25000);
          const L = await lista(page); out.B = L;
          R.check(hay(L, 'act-empieza', (q) => q.a === 'skateTutorial').length === 1, 'B · act-empieza a=skateTutorial', 'unit', hay(L, 'act-empieza'));
          R.check(!!f && hay(L, 'act-falla', (q) => q.a === 'skateTutorial' && q.intento === '1').length === 1, 'B · el grind sin equilibrar da act-falla intento=1', 'unit', hay(L, 'act-falla'));
          R.check(hay(L, 'control', (q) => q.c === 'tactil').length === 1 && hay(L, 'orientacion', (q) => q.o === 'horizontal').length === 1, 'B · control=tactil y orientacion=horizontal', 'unit', [...hay(L, 'control'), ...hay(L, 'orientacion')]);
          // C · recargar: p=c y sin repetir patatas ya cogidas
          await page.evaluate(() => { for (const a of window.__bk.activities) if (a.busy) a.cancel?.(); }); await sleep(800); await drainUI(page, true, 8000);
          await collectFry(page, 'no_me_guillo.visible', 2500); await sleep(1500);
          await reload8(page); await start8(page, true); await sleep(1500); await drainUI(page, true, 8000);
          await collectFry(page, 'no_me_guillo.medium', 2500); await sleep(1200);
          const L2 = await lista(page); out.C = L2;
          R.check(hay(L2, 'jugar', (q) => q.p === 'c').length === 1, 'C · tras recargar, jugar con p=c', 'unit', hay(L2, 'jugar'));
          const p2 = hay(L2, 'patata-no_me_guillo'); R.check(p2.length === 1 && p2[0].q.n === '2' && p2[0].q.p === 'c', 'C · solo la patata nueva (n=2, p=c); la de antes no se repite', 'unit', p2);
          // D · error con texto personal
          await page.evaluate(() => { setTimeout(() => { throw new Error('fallo de prueba /Users/alguien/secreto.png'); }, 0); }); await sleep(600);
          const L3 = await lista(page); out.D = hay(L3, 'error');
          R.check(hay(L3, 'error', (q) => q.c === 'E99' && q.fase === 'partida').length === 1 && !JSON.stringify(L3).includes('secreto') && !JSON.stringify(L3).includes('/Users'), 'D · un error da error c=E99 fase=partida, sin texto', 'unit', out.D);
          R.check(!fuera(L3).length, 'B–D · ningún aviso ni campo fuera del esquema', 'unit', fuera(L3).slice(0, 6));
        }
        R.check(!peticiones.length, 'B–D · ninguna petición de red a /e/', 'unit', peticiones.slice(0, 3));
        R.check((peticiones.lecturas ?? []).every((l) => !l.q && !l.cuerpo), 'B–D · la lectura del top (GET /e/record) no lleva ningún dato', 'unit', (peticiones.lecturas ?? []).slice(0, 3));
        R.check(!errors.filter((e) => !/fallo de prueba/.test(e)).length, 'B–D · sin errores (salvo el lanzado a propósito)', 'emulation', errors.slice(0, 3));
      } finally { await page.close(); } }
    // ---------------------------------------------------------------- E · transporte
    { const page = await open8(b, R, dev('pc720'), 'h', { save: S20, query: '?bktest=1&narr=off' });
      try { const r = await page.evaluate(() => { const D = window.__bkAvisosDebug; if (!D) return null; const got = [];
          const sb = navigator.sendBeacon; navigator.sendBeacon = (u) => { got.push(['beacon', u]); return true; }; const a = D.transporte('/e/prueba?x=1');
          navigator.sendBeacon = () => false; const of = window.fetch; window.fetch = (u, o) => { got.push(['fetch', u, o?.method, o?.keepalive]); return Promise.resolve(new Response(null, { status: 204 })); }; const b2 = D.transporte('/e/prueba?x=2');
          navigator.sendBeacon = sb; window.fetch = of; return { a, b: b2, got, puede: D.puedeEnviar() }; });
        out.E = r;
        R.check(!!r && r.a === 'beacon' && r.b === 'fetch' && r.got[0][1] === '/e/prueba?x=1' && r.got[1][1] === '/e/prueba?x=2' && r.got[1][2] === 'POST' && r.got[1][3] === true, 'E · transporte: sendBeacon y, si falla, fetch POST con keepalive a /e/…', 'unit', r);
        R.check(!!r && r.puede === false, 'E · en localhost (y con ?bktest) no se envía nada', 'unit', r?.puede);
      } finally { await page.close(); } }
    R.measure('avisos', out);
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
