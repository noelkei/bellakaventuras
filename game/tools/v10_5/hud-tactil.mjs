// V10.5 R0 · guardián del HUD táctil (AM-10, AM-11, AM-16…AM-19, AM-21, AM-24, AM-25, AM-35; E5-23…E5-25, E5-28):
//  · matriz de 13 dispositivos × vertical/horizontal (los ordenadores, solo horizontal): explorando, con el tamaño de botones al 100 % y al 200 %,
//    diestro y zurdo, ningún botón se monta con otro botón ni con un rótulo del HUD (contador, zona, objetivo, chip, aro del joystick), ninguno
//    queda tapado, fuera de pantalla ni sin recibir toques (los avisos pasajeros #hint/#toast no cuentan);
//  · pausa: «Pantalla: …» no pisa el título; grind: ◀ ▶ no pisan AGACHARSE; «Vale» de las charlas ≥ 44 px;
//  · Ajustes en 320×568 vertical y en horizontal: «Volver» se alcanza (a la vista o desplazando) y recibe el toque;
//  · inicio en 320×568: el logo y los botones dentro de la pantalla (o desplazables);
//  · joystick: su zona táctil cubre el aro entero; empujar desde el centro y desde el 85 % derecho del aro mueve a ANMI (320, 375, 390; diestro y
//    zurdo).
import { Report, runTest, launch, sleep, arg, SAVE_20 } from '../v8/lib.mjs';
import { DEVICES, dev, open7, start7, scan, tapEl } from './lib105.mjs';
const R = new Report('hud-tactil');
const DEVS = (arg('devs') ?? DEVICES.map((d) => d.id).join(',')).split(',').map(dev).filter(Boolean);
const TRANS = /^#(hint|toast)\b/, HUDTXT = /^#(counter|zone|objective|mode-chip|stick|save-badge|task)\b/;
const S = { ...SAVE_20, settings: { iosAppAsked: true } };
/** Problemas de una exploración: solapes botón-botón y botón-rótulo, tapados, fuera de pantalla e inertes. */
function problems(s) {
  const over = s.over.filter((o) => !TRANS.test(o.a) && !TRANS.test(o.b) && (o.kind === 'botón-botón' || (o.kind !== 'otro-otro' && (HUDTXT.test(o.a) || HUDTXT.test(o.b))) || (HUDTXT.test(o.a) && HUDTXT.test(o.b)))).map((o) => `${o.a}~${o.b}`);
  const hidden = s.hidden.filter((h) => !TRANS.test(h.n) && !/^#(hint|toast)/.test(h.by ?? '')).map((h) => `${h.n}<${h.by}`);
  return { over, hidden, off: s.off.filter((o) => !TRANS.test(o.n)).map((o) => o.n), inert: s.inert.map((i) => i.n) };
}
const empty = (p) => !p.over.length && !p.hidden.length && !p.off.length && !p.inert.length;

await runTest(R, async () => {
  const b = await launch(), errors = [];
  try {
    for (const D of DEVS) for (const o of ['v', 'h']) {
      if (D.kind === 'desktop' && o === 'v') continue;
      const touch = D.kind !== 'desktop', tag = `${D.id} ${o}`;
      const page = await open7(b, R, D, o, { save: S, query: '?bktest=1&narr=off', errors }); await start7(page, touch); await sleep(3200);   // el chip completo dura 2,5 s
      if (touch) { await page.touchscreen.tap(Math.round((await page.evaluate(() => innerWidth)) * 0.62), 140); await sleep(300); }
      for (const k of [1, 2]) for (const z of touch ? [false, true] : [false]) {
        await page.evaluate((k, z) => { const g = window.__bk; g.state.p.settings.btnScale = k; g.state.p.settings.leftHanded = z; g.applySettings(); }, k, z); await sleep(350);
        const p = problems(await scan(page));
        R.check(empty(p), `${tag} ${k * 100} % ${z ? 'zurdo' : 'diestro'}: botones sin solapes, tapados, fuera ni inertes`, 'emulation', p);
      }
      await page.evaluate(() => { const g = window.__bk; g.state.p.settings.btnScale = 1; g.state.p.settings.leftHanded = false; g.applySettings(); }); await sleep(250);
      if (touch) {
        // grind: ◀ ▶ y AGACHARSE
        await page.evaluate(() => document.body.classList.add('grind')); await sleep(250);
        const g = await page.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(), ov = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
          const c = r('btn-crouch'), l = r('btn-lean-l'), rr = r('btn-lean-r'); return { lPisa: ov(l, c), rPisa: ov(rr, c) }; });
        R.check(!g.lPisa && !g.rPisa, `${tag} grind: ◀ y ▶ no pisan AGACHARSE`, 'emulation', g);
        await page.evaluate(() => document.body.classList.remove('grind')); await sleep(200);
        // «Vale» de las charlas
        const vale = await page.evaluate(() => { void window.__bk.say?.('Bellakat', 'Prueba'); const d = document.getElementById('dialog'); d.hidden = false; const r = document.getElementById('dialog-ok').getBoundingClientRect(); d.hidden = true; return { w: r.width, h: r.height }; });
        R.check(vale.h >= 44 && vale.w >= 44, `${tag}: «Vale» de las charlas ≥ 44 px`, 'emulation', vale);
      }
      // pausa: «Pantalla» sin pisar el título
      await page.keyboard.press('Escape'); await sleep(500);
      const pz = await page.evaluate(() => { const a = document.getElementById('btn-orient').getBoundingClientRect(), t = document.getElementById('pause-title').getBoundingClientRect(), p = document.getElementById('btn-pause').getBoundingClientRect();
        const ov = (x, y) => Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1; return { titulo: ov(a, t), esquinaPausa: ov(a, p), w: a.width }; });
      R.check(!pz.titulo && !pz.esquinaPausa, `${tag} pausa: «Pantalla: …» no pisa el título ni la esquina de II`, 'emulation', pz);
      // ajustes: «Volver» alcanzable
      await page.evaluate(() => document.getElementById('btn-settings').click()); await sleep(500);
      const v = await page.evaluate(() => { const s = document.getElementById('settings'), btn = document.getElementById('btn-settings-close'); btn.scrollIntoView({ block: 'nearest' }); const r = btn.getBoundingClientRect(), t = document.getElementById('settings-title').getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { dentro: r.top >= 0 && r.bottom <= innerHeight + 0.5, recibe: at === btn || btn.contains(at), tituloDentro: t.top >= -0.5 || s.scrollTop > 0, oy: getComputedStyle(s).overflowY }; });
      R.check(v.dentro && v.recibe, `${tag} Ajustes: «Volver» se alcanza y recibe el toque`, 'emulation', v);
      await page.evaluate(() => { document.getElementById('btn-settings-close').click(); }); await sleep(200);
      await page.close();
    }
    // inicio en 320×568 (vertical y horizontal)
    for (const o of ['v', 'h']) { const page = await open7(b, R, dev('se1'), o, { save: S, query: '?bktest=1&narr=off', errors }); await sleep(600);
      const st = await page.evaluate(() => { const s = document.getElementById('start'); const els = [...s.querySelectorAll('.logo, button:not([hidden])')]; return els.map((e) => { e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = e.getBoundingClientRect(); return { n: e.className || e.id, ok: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5 }; }); });
      R.check(st.every((x) => x.ok), `se1 ${o} inicio: logo y botones dentro de la pantalla (o al desplazar)`, 'emulation', st.filter((x) => !x.ok));
      await page.close(); }
    // joystick: zona ⊇ aro y empuje desde el centro y el borde derecho
    for (const [id, z] of [['se1', false], ['se', false], ['ip14', false], ['se1', true], ['ip14', true]]) {
      const page = await open7(b, R, dev(id), 'v', { save: { ...S, settings: { iosAppAsked: true, leftHanded: z } }, query: '?bktest=1&narr=off', errors }); await start7(page, true); await sleep(1000);
      const geo = await page.evaluate(() => { const s = document.getElementById('stick').getBoundingClientRect(), zr = document.getElementById('stick-zone').getBoundingClientRect(); return { aro: [s.left, s.top, s.right, s.bottom], zona: [zr.left, zr.top, zr.right, zr.bottom], w: s.width }; });
      const cubre = geo.zona[0] <= geo.aro[0] + 0.5 && geo.zona[2] >= geo.aro[2] - 0.5 && geo.zona[1] <= geo.aro[1] + 0.5 && geo.zona[3] >= geo.aro[3] - 0.5;
      const push = async (fx) => { const cdp = await page.createCDPSession(); const x = geo.aro[0] + (geo.aro[2] - geo.aro[0]) * fx, y = (geo.aro[1] + geo.aro[3]) / 2;
        const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7 }] });
        await tp('touchStart', x, y); for (let i = 1; i <= 6; i++) { await tp('touchMove', x, y - i * 9); await sleep(16); }
        const m = await page.evaluate(() => ({ ...window.__bk.input.move })); await tp('touchEnd'); await cdp.detach(); await sleep(150); return m; };
      const c = await push(0.5), r = await push(0.85);
      R.check(cubre && c.y > 0.3 && r.y > 0.3, `joystick ${id}${z ? ' zurdo' : ''}: la zona cubre el aro (${Math.round(geo.w)} px) y empujar desde el centro y el borde mueve a ANMI`, 'emulation', { geo, centro: c, borde: r });
      await page.close();
    }
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 3600000 });
void tapEl;
