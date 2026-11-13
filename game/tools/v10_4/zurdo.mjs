// V10.4 R20 · guardián (usuario: «meter algo en ajustes para poder cambiar el lado de los botones, para zurdos y diestros»): en Ajustes, la
// casilla «Zurdo» refleja los botones de acción (SALTO, AGACHARSE, SUBIR, SKILLS, ◎) al lado izquierdo, dentro de la pantalla y sin pisarse,
// y el joystick en la derecha; se guarda; un toque en SALTO salta; al quitarla, todo vuelve a la derecha. Móvil vertical y horizontal.
// R20 (usuario): el joystick se ve SIEMPRE en un sitio fijo; se maneja tocando cualquier punto de su zona (ANMI anda) y el dibujo no se mueve.
import { Report, runTest, launch, openGame, clickStart, sleep, SAVE_20 } from '../v8/lib.mjs';
import { PHONE_V, PHONE_H } from '../v10_2/lib102.mjs';
const R = new Report('zurdo');
const IDS = ['btn-jump', 'btn-crouch', 'btn-board', 'btn-cam', 'btn-dance'];
const rects = (page) => page.evaluate((ids) => { const o = {}; for (const id of [...ids, 'stick-zone']) { const e = document.getElementById(id); if (!e || e.hidden || !e.offsetWidth) continue; const r = e.getBoundingClientRect(); o[id] = [r.left, r.top, r.right, r.bottom].map(Math.round); } return { o, W: innerWidth, H: innerHeight }; }, IDS);
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [n, vp] of [['vertical', PHONE_V], ['horizontal', PHONE_H]]) {
      const page = await openGame(b, R, { viewport: vp, save: SAVE_20 }); await clickStart(page); await sleep(1500);
      const before = await rects(page);
      // joystick: visible y fijo; arrastrar desde otro punto de su zona mueve a ANMI sin mover el dibujo
      { const sk = () => page.evaluate(() => { const e = document.getElementById('stick'), r = e.getBoundingClientRect(); return { vis: !e.hidden && getComputedStyle(e).display !== 'none' && r.width > 0, x: Math.round(r.left), y: Math.round(r.top), knob: document.querySelector('#stick i').style.transform }; });
        const s0 = await sk(), z0 = before.o['stick-zone'], p0 = await page.evaluate(() => window.__bk.skater.footPos.clone());
        const tx = z0[0] + (z0[2] - z0[0]) * 0.7, ty = z0[1] + (z0[3] - z0[1]) * 0.35;
        const cdp = await page.createCDPSession(); const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
        await tp('touchStart', tx, ty); for (let k = 1; k <= 10; k++) { await tp('touchMove', tx, ty - 6 * k); await sleep(30); }
        await sleep(900); const s1 = await sk(); const p1 = await page.evaluate(() => window.__bk.skater.footPos.clone()); await tp('touchEnd', 0, 0); await sleep(300);
        const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
        R.check(s0.vis && s1.vis && Math.abs(s1.x - s0.x) <= 1 && Math.abs(s1.y - s0.y) <= 1 && /translate\(/.test(s1.knob) && moved > 0.5, `${n}: el joystick se ve siempre en su sitio y, tocando en otro punto de su zona, ANMI anda (${moved.toFixed(2)} m) sin que el dibujo se mueva`, 'input', { s0, s1, moved }); }
      // por la interfaz real: pausa → ajustes → casilla
      await page.evaluate(() => { document.getElementById('btn-pause').click(); }); await sleep(300);
      await page.evaluate(() => { document.getElementById('btn-settings').click(); }); await sleep(300);
      await page.evaluate(() => { const c = document.getElementById('opt-zurdo'); c.click(); }); await sleep(200);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bellakaventuras.remake.save')).settings?.leftHanded);
      await page.evaluate(() => { document.getElementById('btn-settings-close').click(); }); await sleep(200);
      await page.evaluate(() => { document.getElementById('btn-resume').click(); }); await sleep(800);
      const z = await rects(page), W = z.W, H = z.H;
      const btns = IDS.filter((id) => z.o[id]).map((id) => [id, z.o[id]]);
      // reflejo exacto: cada botón a la misma distancia del borde izquierdo que tenía del derecho (misma fila), y dentro de la pantalla
      const inLeft = btns.every(([id, r]) => r[0] >= 0 && r[2] <= W && r[1] >= 0 && r[3] <= H && before.o[id] && Math.abs(r[0] - (W - before.o[id][2])) <= 2 && Math.abs(r[1] - before.o[id][1]) <= 2);
      const over = []; for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) { const a = btns[i][1], c = btns[j][1]; if (a[0] < c[2] - 1 && c[0] < a[2] - 1 && a[1] < c[3] - 1 && c[1] < a[3] - 1) over.push(`${btns[i][0]}/${btns[j][0]}`); }
      const st = z.o['stick-zone']; const skz = await page.evaluate(() => { const r = document.getElementById('stick').getBoundingClientRect(); return [r.left, r.right].map(Math.round); });
      await R.shot(page, `zurdo_${n}`);
      R.check(saved === true && btns.length >= 4 && inLeft && over.length === 0, `${n}: con «Zurdo» los botones pasan a la izquierda (reflejo exacto), dentro de la pantalla y sin pisarse (guardado: ${saved})`, 'emulation', { btns, over, W, H });
      R.check(!!st && st[2] >= W - 2 && st[0] >= W * 0.3 && skz[0] > W / 2, `${n}: el joystick (zona y dibujo) pasa a la derecha`, 'emulation', { st, skz, W });
      const j0 = await page.evaluate(() => window.__bk.skater.footPos.y); const jr = z.o['btn-jump'];
      await page.touchscreen.tap((jr[0] + jr[2]) / 2, (jr[1] + jr[3]) / 2); let up = 0; for (let k = 0; k < 10; k++) { await sleep(60); up = Math.max(up, await page.evaluate(() => window.__bk.skater.footPos.y)); }
      R.check(up - j0 > 0.15, `${n}: un toque en SALTO (a la izquierda) salta (${(up - j0).toFixed(2)} m)`, 'input', { j0, up });
      await page.evaluate(() => { const g = window.__bk; g.state.p.settings.leftHanded = false; g.applySettings(); }); await sleep(800);
      const d = await rects(page); const back = IDS.filter((id) => d.o[id] && before.o[id]).every((id) => Math.abs(d.o[id][0] - before.o[id][0]) <= 2);
      R.check(back, `${n}: al quitarla, los botones vuelven a su sitio de siempre`, 'emulation', { d: d.o, before: before.o });
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
