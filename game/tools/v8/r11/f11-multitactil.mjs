// R11 · F11 · copia de la sonda de la auditoría AUD-JUG/SIS/touch3.mjs (mismas comprobaciones; solo cambian las rutas de import).
// AUD-JUG/SIS · botones táctiles pulsados con un 2.º dedo mientras el pulgar mantiene el joystick (lo normal al conducir):
// ◎ (recentrar), II (pausa), BAILAR, SALTO (control: usa pointerdown). CDP Input.dispatchTouchEvent (pasa por el reconocedor de
// gestos de Chrome; emulación declarada). Para cada botón: con el joystick pulsado y, de control, con el joystick suelto. 2 rep.
import { Report, runTest, launch, sleep, SAVE_20, VIEWPORTS } from '../lib.mjs';
import { openSis, start } from './f11-sis-lib.mjs';
const R = new Report('r11-f11-multitactil');
await runTest(R, async () => {
  const b = await launch();
  try {
    for (let rep = 1; rep <= 2; rep++) {
      const page = await openSis(b, R, { viewport: VIEWPORTS.phone, save: SAVE_20, label: `#${rep}` }); await start(page); await sleep(800);
      const cdp = await page.target().createCDPSession();
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })) });
      const center = (id) => page.evaluate((id) => { const e = document.getElementById(id); if (!e || e.closest('[hidden]') || e.offsetParent === null) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, id);
      const probe = () => page.evaluate(() => ({ paused: window.__bk.paused, recenter: window.__bk.rig.recenterCount, jumps: window.__bk.input.stats.jumps, ring: !document.getElementById('dance-ring').hidden }));
      const S = [80, 700];
      const res = {};
      for (const id of ['btn-jump', 'btn-cam', 'btn-pause', 'btn-dance']) for (const held of [true, false]) {
        await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); g.skater.teleport(new T.Vector3(-43.2, 0, -50), 39 * Math.PI / 180, 'walk'); g.rig.snapBehind(g.skater); });
        await sleep(400);
        if (held) { await touch('touchStart', [[S[0], S[1], 1]]); for (let i = 1; i <= 5; i++) { await touch('touchMove', [[S[0], S[1] - i * 8, 1]]); await sleep(25); } await sleep(300); }
        const c = await center(id); if (!c) { res[`${id}_${held ? 'con' : 'sin'}`] = 'no visible'; if (held) await touch('touchEnd', []); continue; }
        const p0 = await probe();
        if (held) { await touch('touchStart', [[S[0], S[1] - 40, 1], [c[0], c[1], 2]]); await sleep(70); await touch('touchMove', [[S[0], S[1] - 40, 1]]); }
        else { await touch('touchStart', [[c[0], c[1], 2]]); await sleep(70); await touch('touchEnd', []); }
        await sleep(400); const p1 = await probe();
        const fired = id === 'btn-jump' ? p1.jumps > p0.jumps : id === 'btn-cam' ? p1.recenter > p0.recenter : id === 'btn-pause' ? p1.paused : p1.ring;
        res[`${id}_${held ? 'con' : 'sin'}`] = { fired, p0, p1 };
        if (held) await touch('touchEnd', []);
        await sleep(200);
        if (p1.paused) { await page.evaluate(() => document.getElementById('btn-resume').click()); await sleep(300); }
        if (p1.ring) { await page.evaluate(() => document.getElementById('btn-dance').click()); await sleep(200); }
      }
      const bad = Object.entries(res).filter(([k, v]) => k.endsWith('_con') && v.fired === false && res[k.replace('_con', '_sin')]?.fired).map(([k]) => k);
      R.check(bad.length === 0, `#${rep}: con el pulgar en el joystick, un 2.º dedo puede pulsar ◎, II y BAILAR (como SALTO)`, 'emulation', { bad, res });
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
