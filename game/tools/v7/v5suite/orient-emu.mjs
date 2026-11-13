// T5-18 · Orientación elegible (HUM-A5-005, REV04-012, DT-17) en EMULACIÓN (no es teléfono: headless no fija orientación
// nativa, así que se ejerce el RESPALDO de rotación del contenedor). Viewport vertical 390×844 con preferencia «Horizontal» y
// horizontal 844×390 con «Vertical»: clase de giro, tamaño lógico del render (aspecto), stick: un gesto «arriba» en la
// pantalla girada = avance (no giro), botón de pausa alcanzable por hit-test DOM, preferencia persistida tras recargar, y
// guardado v4 sin el campo → 'auto'. El cambio se hace con clics reales en el botón «Pantalla: …» de la pausa.
import { Report, runTest, launch, openGame, clickStart, sleep, VIEWPORTS, SAVE_20 } from '../lib.mjs';
const R = new Report('orient-emu');
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [vpName, vp, want] of [['vertical', VIEWPORTS.phone, 'Horizontal'], ['horizontal', VIEWPORTS.phoneLand, 'Vertical']]) {
      const page = await openGame(b, R, { viewport: vp }); await clickStart(page);
      const cdp = await page.target().createCDPSession();
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
      // pausa (botón real) → «Pantalla» hasta la preferencia buscada
      await page.evaluate(() => document.getElementById('btn-pause').click()); await sleep(300);
      for (let i = 0; i < 3; i++) { const t = await page.$eval('#btn-orient', (e) => e.textContent); if (t.includes(want)) break; await page.click('#btn-orient'); await sleep(600); }
      const label = await page.$eval('#btn-orient', (e) => e.textContent);
      await page.click('#btn-resume'); await sleep(500);
      const st = await page.evaluate(() => { const g = window.__bk, c = g.renderer.domElement; return { cls: document.documentElement.className, bufAspect: +(c.width / c.height).toFixed(3), camAspect: +g.rig.cam.aspect.toFixed(3), setting: g.state.p.settings.orientation }; });
      const logicalLand = want === 'Horizontal';
      R.check(st.cls.includes(logicalLand ? 'rot90' : 'rotm90') && (logicalLand ? st.camAspect > 1 : st.camAspect < 1), `${vpName}: preferencia ${want} → contenedor girado y aspecto lógico correcto`, 'emulation', { label, ...st });
      // stick: un gesto «arriba» en la pantalla GIRADA (arriba lógico) debe hacer avanzar sin girar
      await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); g.skater.teleport(new T.Vector3(-14, 0, -2), 0, 'walk'); });
      const zone = await page.evaluate(() => { const r = document.getElementById('stick-zone').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
      // punto lógico (60, H−110) → pantalla
      const map = await page.evaluate(() => ({ W: innerWidth, H: innerHeight, cls: document.documentElement.className }));
      const toScreen = (lx, ly) => (map.cls.includes('rotm90') ? [ly, map.H - lx] : map.cls.includes('rot90') ? [map.W - ly, lx] : [lx, ly]);
      const LH = map.cls.includes('rot') ? map.W : map.H;
      const [sx, sy] = toScreen(80, LH - 110), [ux, uy] = toScreen(80, LH - 110 - 56);
      await touch('touchStart', [[sx, sy, 1]]); await sleep(60); await touch('touchMove', [[ux, uy, 1]]); await sleep(900);
      const mv = await page.evaluate(() => ({ thr: window.__bk.skater.throttle, steer: window.__bk.skater.steer, v: window.__bk.skater.vLong, h: window.__bk.skater.heading, owners: window.__bk.input.activeOwners }));
      await touch('touchEnd', []);
      R.check(mv.thr > 0.8 && Math.abs(mv.steer) < 0.05 && mv.v > 1, `${vpName}: «arriba» en la pantalla girada = avanzar recto`, 'emulation', { zone, map, sx, sy, ux, uy, ...mv });
      // pausa alcanzable (hit-test en su centro de pantalla)
      const hit = await page.evaluate(() => { const r = document.getElementById('btn-pause').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { id: e?.id, inScreen: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; });
      R.check(hit.id === 'btn-pause' && hit.inScreen, `${vpName}: botón de pausa dentro de la pantalla y alcanzable`, 'emulation', hit);
      await R.shot(page, `girada_${vpName}`);
      // persistencia: recarga
      await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
      const after = await page.evaluate(() => ({ setting: window.__bk.state.p.settings.orientation, cls: document.documentElement.className }));
      R.check(after.setting === (logicalLand ? 'horizontal' : 'vertical'), `${vpName}: la preferencia persiste al recargar`, 'emulation', after);
      await page.close();
    }
    // guardado v4 sin el campo → 'auto'
    const p2 = await openGame(b, R, { save: { ...SAVE_20, settings: { volume: 0.5 } } });
    const s2 = await p2.evaluate(() => window.__bk.state.p.settings.orientation);
    R.check(s2 === 'auto', 'guardado v4 sin orientación → «auto»', 'unit', { s2 });
    R.pendingHuman('Orientación en el teléfono del usuario (Android Chrome / iPhone Safari, rotación bloqueada y libre, las tres preferencias) — G8-T');
  } finally { await b.close(); }
});
