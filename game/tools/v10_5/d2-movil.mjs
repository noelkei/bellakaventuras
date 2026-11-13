// V10.5 R0 · guardián del diálogo 2D en móvil (AM-04, AM-08, AM-09, AM-15; E5-13…E5-16):
//  · vertical, 7 móviles: Bellakat y Bellakroak no se pisan (hueco ≥ 8 px) y cada uno ocupa ≤ 44 % del ancho;
//  · horizontal, 7 móviles: los personajes no suben por encima del borde de abajo del bocadillo ni tapan sus botones;
//  · «Saltar tutorial» no pisa el nombre ni el texto del bocadillo, ni la pausa;
//  · con la pantalla girada por el juego (rot90: vertical fijada en horizontal; rotm90: horizontal fijada en vertical), el bocadillo y sus botones
//    quedan dentro de la pantalla, también con uno solo (modo ayuda).
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
import { dev, open7, start7 } from './lib105.mjs';
const R = new Report('d2-movil');
const PHONES = (arg('devs') ?? 'se1,se,ip14,pmax,and360,and360b,and412').split(',');
const m = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s), Rr = (e) => { if (!e || e.hidden || e.closest('[hidden]')) return null; const r = e.getBoundingClientRect(); return r.width > 1 ? { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } : null; };
  const ov = (a, b) => !!a && !!b && Math.min(a.r, b.r) - Math.max(a.x, b.x) > 1 && Math.min(a.b, b.b) - Math.max(a.y, b.y) > 1;
  const kat = Rr(q('#d2 .d2-kat')), kroak = Rr(q('#d2 .d2-kroak')), bub = Rr(q('#d2 .d2-bubble')), name = Rr(q('#d2 .d2-name')), text = Rr(q('#d2 .d2-text'));
  const btns = [...document.querySelectorAll('#d2 .d2-btn')].map(Rr).filter(Boolean);
  const skipEl = [...document.querySelectorAll('#ui button, #d2 button')].find((x) => /saltar tutorial/i.test(x.textContent) && Rr(x) && getComputedStyle(x).visibility !== 'hidden');
  const skip = skipEl ? Rr(skipEl) : null, pause = Rr(q('#btn-pause'));
  const W = innerWidth, H = innerHeight, inside = (r) => !!r && r.x >= -1 && r.y >= -1 && r.r <= W + 1 && r.b <= H + 1;
  return { W, H, html: document.documentElement.className, gap: kat && kroak ? +(kat.x - kroak.r).toFixed(1) : null, katShare: kat ? +(kat.w / W).toFixed(3) : null, kroakShare: kroak ? +(kroak.w / W).toFixed(3) : null,
    hostTop: Math.min(kat?.y ?? 1e9, kroak?.y ?? 1e9), bubBottom: bub?.b ?? null, hostOverBtn: btns.some((b) => ov(kat, b) || ov(kroak, b)),
    skipOverText: ov(skip, name) || ov(skip, text), skipOverPause: ov(skip, pause), skip: !!skip, bubInside: inside(bub), btnsInside: btns.length > 0 && btns.every(inside), nBtns: btns.length };
});
async function waitD2(page, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden && d.classList.contains('in'); })) return true; await sleep(120); } return false; }

await runTest(R, async () => {
  const b = await launch(), errors = [];
  try {
    for (const id of PHONES) for (const o of ['v', 'h']) {
      const D = dev(id), page = await open7(b, R, D, o, { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', errors }); await start7(page, true);
      const ok = await waitD2(page); await sleep(600); const s = await m(page);
      if (!ok) { R.invalid(`${id} ${o}: el 2D no se abrió`); await page.close(); continue; }
      if (o === 'v') R.check(s.gap >= 8 && s.katShare <= 0.441 && s.kroakShare <= 0.441, `${id} vertical: personajes sin pisarse (hueco ${s.gap} px ≥ 8) y cada uno ≤ 44 % del ancho`, 'vision', s);
      else R.check(s.hostTop >= s.bubBottom - 1 && !s.hostOverBtn, `${id} horizontal: los personajes no suben por encima del bocadillo ni tapan sus botones`, 'vision', s);
      R.check(s.skip && !s.skipOverText && !s.skipOverPause, `${id} ${o}: «Saltar tutorial» a la vista sin pisar el nombre, el texto ni la pausa`, 'vision', s);
      await page.close();
    }
    // pantalla girada por el juego: horizontal fijada con el móvil en vertical (rot90) y vertical fijada con el móvil en horizontal (rotm90)
    for (const [o, pref] of [['v', 'horizontal'], ['h', 'vertical']]) {
      const D = dev('ip14'), page = await open7(b, R, D, o, { save: { ...FRESH, settings: { iosAppAsked: true, orientation: pref } }, query: '?bktest=1', errors }); await start7(page, true);
      const ok = await waitD2(page); await sleep(600); const s = await m(page);
      R.check(ok && /rot(m)?90/.test(s.html) && s.bubInside && s.btnsInside, `ip14 ${o} con «${pref}» fijada (giro del juego): bocadillo y botones del 2D dentro de la pantalla`, 'vision', s);
      // uno solo (modo ayuda)
      await page.evaluate(() => { const g = window.__bk; g.d2.close(); g.narr.cancel(); });
      await sleep(800);
      for (const who of ['kroak', 'kat']) {
        await page.evaluate((who) => { void window.__bk.d2.say({ habla: who, texto: 'Prueba de una pista con uno solo: sigue la línea amarilla del suelo hasta la patata.' }, { solo: who }); }, who);
        await waitD2(page, 5000); await sleep(400); const t = await m(page);
        R.check(t.bubInside && t.btnsInside, `ip14 ${o} con «${pref}» fijada, solo ${who}: bocadillo y «Continuar» dentro de la pantalla`, 'vision', t);
        await page.evaluate(() => window.__bk.d2.close()); await sleep(300);
      }
      await page.close();
    }
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 1200000 });
