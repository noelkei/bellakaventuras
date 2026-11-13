// V10.4 R6 · guardián de la capa de diálogo 2D (W-D12, W-D13; dossier 03/04 §7):
//  · máscara oscura semitransparente: misma opacidad (.78) y desenfoque (4 px) que la pausa, color más oscuro; el mundo se ve detrás;
//  · Bellakroak a la izquierda y Bellakat a la derecha, con su PNG cargado; nombre de quien habla y texto literal del dossier;
//  · se avanza con teclado (E), toque (botón) y mando (A); las teclas se ignoran en los primeros 250 ms; en una pregunta, B = segunda opción;
//  · modo de uno solo (modo ayuda): solo se ve el que habla;
//  · «reducir movimiento»: sin transición; móvil vertical y horizontal: texto completo dentro de la pantalla, botón ≥ 44 px.
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
import { FRESH, PHONE_V, PHONE_H, setPad, padPress } from '../v10_2/lib102.mjs';
const R = new Report('dialogo-2d');
const OLD = { ...FRESH, collected: ['no_me_guillo.visible'], narr: { v: 1, estado: 'hecho', paso: '', practica: true, vistos: ['PAR', 'NMG', 'OBJ'], ayuda: 'no' } };
const say = (page, line, opts = {}) => page.evaluate((line, opts) => { window.__d2r = 'pend'; window.__bk.d2.say(line, opts).then((r) => { window.__d2r = r; }); }, line, opts);
const look = (page) => page.evaluate(() => { const d = document.getElementById('d2'); if (!d || d.hidden) return null; const m = getComputedStyle(d.querySelector('.d2-mask')), r = (e) => e.getBoundingClientRect();
  const imgs = [...d.querySelectorAll('.d2-host')].map((i) => ({ cls: i.className, hidden: i.hidden, ok: i.complete && i.naturalWidth > 0, x: r(i).left, w: r(i).width }));
  const b = d.querySelector('.d2-btn'), t = d.querySelector('.d2-text'), bb = r(d.querySelector('.d2-bubble'));
  return { bg: m.backgroundColor, blur: m.backdropFilter || m.webkitBackdropFilter, name: d.querySelector('.d2-name').textContent, text: t.textContent, imgs, btnH: r(b).height, btnW: r(b).width,
    bubble: { l: bb.left, r: bb.right, t: bb.top, b: bb.bottom }, vw: innerWidth, vh: innerHeight, opacity: getComputedStyle(d).opacity, transition: getComputedStyle(d).transitionDuration, textOverflow: t.scrollHeight > t.clientHeight + 2 }; });
const res = (page) => page.evaluate(() => window.__d2r);
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: OLD, query: '?bktest=1' }); await clickStart(page); await sleep(1500);
    const pause = await page.evaluate(() => { const p = document.getElementById('pause'); p.hidden = false; const c = getComputedStyle(p); const o = { bg: c.backgroundColor, blur: c.backdropFilter || c.webkitBackdropFilter }; p.hidden = true; return o; });
    // teclado
    await say(page, { habla: 'kat', texto: '¡Ey! Soy Bellakat. Ven, que te enseñamos cómo va esto.', kat: 'saludo', kroak: 'espera' }); await sleep(80);
    await page.keyboard.press('KeyE'); await sleep(60); const early = await res(page);
    await sleep(500); const L = await look(page);
    R.measure('capa', { L, pause });
    const rgba = (s) => s.match(/[\d.]+/g).map(Number);
    R.check(!!L && rgba(L.bg)[3] === rgba(pause.bg)[3] && /blur\(4px\)/.test(L.blur) && rgba(L.bg).slice(0, 3).reduce((a, x) => a + x) < rgba(pause.bg).slice(0, 3).reduce((a, x) => a + x),
      `máscara: misma opacidad (${rgba(L.bg)[3]}) y desenfoque que la pausa, más oscura (${L.bg} frente a ${pause.bg})`, 'static', { L: L?.bg, pause });
    const kr = L.imgs.find((i) => /kroak/.test(i.cls)), kt = L.imgs.find((i) => /kat/.test(i.cls));
    R.check(kr.ok && kt.ok && !kr.hidden && !kt.hidden && kr.x < kt.x, 'Bellakroak a la izquierda y Bellakat a la derecha, con sus PNG cargados', 'static', L.imgs);
    R.check(L.name === 'Bellakat' && L.text.startsWith('¡Ey! Soy Bellakat'), 'nombre de quien habla y texto literal', 'static', { name: L.name, text: L.text });
    R.check(early === 'pend', 'una tecla en los primeros 250 ms no avanza la frase (R11 MIX-03)', 'input', { early });
    await page.keyboard.press('KeyE'); await sleep(200); R.check((await res(page)) === 0 && !(await look(page)), 'E avanza y cierra la frase', 'input');
    // mando: A avanza; en una pregunta B elige la segunda opción
    await say(page, { habla: 'kroak', texto: 'Prueba de mando.' }); await sleep(450); await padPress(page, 0); await sleep(200);
    R.check((await res(page)) === 0, 'el botón A del mando avanza', 'input', { r: await res(page) });
    await setPad(page, 0, false);
    await say(page, { habla: 'kat', texto: '¿Quieres que te echemos una mano?' }, { choices: ['Sí, ayúdame', 'No, gracias'] }); await sleep(450); await padPress(page, 1); await sleep(200);
    R.check((await res(page)) === 1, 'en una pregunta, B elige la segunda opción («No, gracias»)', 'input', { r: await res(page) });
    // uno solo
    await say(page, { habla: 'kroak', texto: 'Solo uno.' }, { solo: 'kroak' }); await sleep(400); const S = await look(page);
    R.check(S.imgs.find((i) => /kat/.test(i.cls)).hidden && !S.imgs.find((i) => /kroak/.test(i.cls)).hidden, 'modo de uno solo: solo se ve el que habla (W-D13)', 'static', S.imgs);
    await page.keyboard.press('KeyE'); await sleep(200);
    await page.close();
    // toque en móvil vertical y horizontal; reducir movimiento
    for (const [lab, vp, red] of [['vertical', PHONE_V, true], ['horizontal', PHONE_H, false]]) {
      const p2 = await openGame(b, R, { viewport: vp, save: { ...OLD, settings: { reducedMotion: red, reducedMotionSet: true, iosAppAsked: true } }, query: '?bktest=1' }); await clickStart(p2); await sleep(1500);
      await say(p2, { habla: 'kroak', texto: 'Cinco zonas y una secreta, una por cada tema de BELLakaciones, el EP más bellako de ANMI.' }); await sleep(450);
      const M = await look(p2);
      R.check(M.bubble.l >= 0 && M.bubble.r <= M.vw && M.bubble.t >= 0 && M.bubble.b <= M.vh && !M.textOverflow && M.btnH >= 44, `${lab}: el bocadillo cabe entero, sin texto cortado, botón de ${Math.round(M.btnH)} px`, 'static', M);
      if (red) R.check(parseFloat(M.transition) === 0, 'con «reducir movimiento» la capa aparece sin transición', 'static', { transition: M.transition });
      const box = await p2.evaluate(() => { const r = document.querySelector('#d2 .d2-btn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await p2.touchscreen.tap(box.x, box.y); await sleep(250);
      R.check((await res(p2)) === 0, `${lab}: tocar «Continuar» avanza`, 'input');
      await p2.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
