// R11 · F11 · copia de la sonda de la auditoría AUD-JUG/SIS/ux2.mjs (mismas comprobaciones; solo cambian las rutas de import).
// AUD-JUG/SIS · UX dirigida: (a) en teléfonos pequeños, ¿qué hay ENCIMA del botón BAILAR/TABLA en el recuadro de La Pantera?
// (b) chip de modo completo sobre el botón HABLAR al bajarse de la tabla dentro del recuadro; (c) abanico abierto tapa TABLA/EXTRA;
// (d) movimiento reducido (preferencia del sistema y animaciones que quedan); (e) redimensionar a mitad de partida. 2 repeticiones.
import { Report, runTest, launch, sleep, SAVE_20, arg } from '../lib.mjs';
import { openSis, start } from './f11-sis-lib.mjs';
const R = new Report('r11-f11-hud');
const ONLY = arg('cases', null)?.split(',');
const want = (k) => !ONLY || ONLY.includes(k);
const SAVE = { ...SAVE_20, activities: { ...SAVE_20.activities, pantherTalk: false }, collected: SAVE_20.collected.filter((x) => x !== 'no_me_guillo.activity'), revealSeen: true };
const PH = { ph360: { width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, ph320: { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ph375: { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
const toPantera = (page, loco = 'walk', dx = 0) => page.evaluate((loco, dx) => { const g = window.__bk, T = window.__bkTHREE, a = g.park.areas.find((x) => x.mesh.name === 'AREA_act.pantherTalk'); g.input.clear(); g.skater.teleport(new T.Vector3(a.x + dx, 0, a.z), 0, loco); g.rig.snapBehind(g.skater); }, loco, dx);
const topAt = (page, id) => page.evaluate((id) => { const e = document.getElementById(id); if (!e || e.closest('[hidden]') || e.offsetParent === null) return { id, vis: false }; const r = e.getBoundingClientRect(); const pts = [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5]].map(([fx, fy]) => { const t = document.elementFromPoint(r.x + r.width * fx, r.y + r.height * fy); return t ? (t.closest('[id]')?.id ?? t.tagName) : null; }); return { id, vis: true, rect: [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(0)), top: pts }; }, id);
await runTest(R, async () => {
  const b = await launch();
  try {
    for (let rep = 1; rep <= 2; rep++) {
      // (a)
      if (want('tapado')) for (const [name, vp] of Object.entries(PH)) {
        const page = await openSis(b, R, { viewport: vp, save: SAVE, label: `${name}#${rep}` }); await start(page);
        await page.evaluate(() => { document.getElementById('hint').hidden = true; document.getElementById('toast').hidden = true; });
        await toPantera(page); await sleep(900);
        await page.evaluate(() => { document.getElementById('hint').hidden = true; document.getElementById('toast').hidden = true; });
        const dance = await topAt(page, 'btn-dance'), board = await topAt(page, 'btn-board'), act = await topAt(page, 'btn-action');
        const shot = await R.shot(page, `tapado_${name}_${rep}`);
        // toque real en el centro del botón BAILAR: ¿se abre el abanico o empieza la charla?
        let tap = null; if (dance.vis) { await page.touchscreen.tap(dance.rect[0] + dance.rect[2] / 2, dance.rect[1] + dance.rect[3] / 2); await sleep(500); tap = await page.evaluate(() => ({ mode: window.__bk.mode, dialog: !document.getElementById('dialog').hidden, ring: !document.getElementById('dance-ring').hidden })); }
        R.check(dance.vis && dance.top.every((t) => t === 'btn-dance') && board.top.every((t) => t === 'btn-board'), `tapado ${name}#${rep}: en el recuadro de La Pantera los botones BAILAR y TABLA no quedan debajo de HABLAR`, 'emulation', { dance, board, act, tapEnBailar: tap, shot });
        await page.close();
      }
      // (b) chip completo sobre HABLAR al bajar de la tabla dentro del recuadro (escritorio)
      if (want('chip')) for (const vp of [{ width: 1280, height: 800, deviceScaleFactor: 1 }, { width: 1280, height: 720, deviceScaleFactor: 1 }]) {
        const page = await openSis(b, R, { viewport: vp, save: SAVE, label: `chip ${vp.height}#${rep}` }); await start(page); await sleep(3000);
        await toPantera(page, 'ride'); await sleep(800);
        await page.keyboard.press('KeyQ'); await sleep(700);
        const m = await page.evaluate(() => { const r = (id) => { const e = document.getElementById(id); if (!e || e.closest('[hidden]') || e.offsetParent === null) return null; const q = e.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height, t: e.textContent.trim().slice(0, 40) }; };
          const c = r('mode-chip'), p = r('prompt'); let ov = null; if (c && p) { const ix = Math.min(c.x + c.w, p.x + p.w) - Math.max(c.x, p.x), iy = Math.min(c.y + c.h, p.y + p.h) - Math.max(c.y, p.y); ov = ix > 2 && iy > 2 ? [+ix.toFixed(0), +iy.toFixed(0)] : null; }
          return { chip: c, prompt: p, ov, loco: window.__bk.skater.loco }; });
        const shot = await R.shot(page, `chip_${vp.height}_${rep}`);
        R.check(!m.ov, `chip ${vp.width}×${vp.height}#${rep}: al bajar de la tabla en el recuadro de La Pantera el chip «A pie · Q…» no tapa el botón HABLAR`, 'input', { ...m, shot });
        await page.close();
      }
      // (c) abanico abierto en táctil: ¿qué recibe un toque en TABLA?
      if (want('abanico')) {
        const page = await openSis(b, R, { viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, save: SAVE, label: `abanico#${rep}` }); await start(page);
        await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(-14, 0, -2), 0, 'walk'); }); await sleep(600);
        await page.evaluate(() => document.getElementById('btn-dance').click()); await sleep(400);
        const board = await topAt(page, 'btn-board'), extra = await topAt(page, 'btn-extra');
        await page.touchscreen.tap(board.rect[0] + board.rect[2] / 2, board.rect[1] + board.rect[3] / 2); await sleep(600);
        const after = await page.evaluate(() => ({ dancing: window.__bk.activities.find((a) => a.id === 'freeDance').dancing, loco: window.__bk.skater.loco }));
        const shot = await R.shot(page, `abanico_${rep}`);
        R.check(board.top.every((t) => t === 'btn-board'), `abanico#${rep}: con el abanico de bailes abierto, el botón TABLA sigue accesible`, 'emulation', { board, extra, trasTocarTabla: after, shot });
        await page.close();
      }
      // (d) movimiento reducido
      if (want('reducido')) {
        const page = await openSis(b, R, { save: SAVE, label: `reducido#${rep}` });
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
        const os = await page.evaluate(() => ({ mq: matchMedia('(prefers-reduced-motion: reduce)').matches, setting: window.__bk.state.p.settings.reducedMotion }));
        await start(page);
        await page.evaluate(() => { const g = window.__bk; g.state.p.settings.reducedMotion = true; g.applySettings(); g.input.setHot(true); document.getElementById('btn-crouch').classList.add('pending'); });
        await sleep(200);
        const anim = await page.evaluate(() => ({ bodyReduced: document.body.classList.contains('reduced'), jumpHot: getComputedStyle(document.getElementById('btn-jump')).animationName, crouchPending: getComputedStyle(document.getElementById('btn-crouch')).animationName, ringTransition: getComputedStyle(document.getElementById('dance-ring')).transitionDuration }));
        R.check(os.setting === os.mq, `reducido#${rep}: la preferencia del sistema «reducir movimiento» se refleja en el ajuste inicial`, 'emulation', os);
        R.check(anim.jumpHot === 'none' && anim.crouchPending === 'none', `reducido#${rep}: con «movimiento reducido» los botones dejan de latir en bucle`, 'emulation', anim);
        await page.close();
      }
      // (e) redimensionar a mitad de partida
      if (want('resize')) {
        const page = await openSis(b, R, { save: SAVE, label: `resize#${rep}` }); await start(page);
        const sizes = [[1280, 800], [700, 900], [1600, 500], [420, 420], [1280, 800]]; const rows = [];
        for (const [w, h] of sizes) { await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 }); await sleep(600);
          rows.push(await page.evaluate(() => { const g = window.__bk, c = g.renderer.domElement, pr = g.renderer.getPixelRatio(); const off = ['counter', 'btn-pause', 'objective', 'mode-chip'].map((id) => { const e = document.getElementById(id); if (!e || e.offsetParent === null) return null; const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.x < -1 || r.y < -1 ? id : null; }).filter(Boolean);
            return { vw: innerWidth, vh: innerHeight, canvasCss: [c.clientWidth, c.clientHeight], buf: [c.width, c.height], pr, aspect: +g.rig.cam.aspect.toFixed(3), want: +(innerWidth / innerHeight).toFixed(3), off }; })); }
        const bad = rows.filter((r) => Math.abs(r.aspect - r.want) > 0.02 || r.canvasCss[0] !== r.vw || r.canvasCss[1] !== r.vh || r.off.length);
        R.check(bad.length === 0, `resize#${rep}: tras cada cambio de tamaño, lienzo y cámara con el aspecto de la ventana y HUD dentro`, 'emulation', rows);
        await page.close();
      }
    }
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
