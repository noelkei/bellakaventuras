// V4-UX-03 · Disposición en formatos de revisión (EMULACIÓN Chrome, no teléfono físico): 390×844 y 844×390 táctiles,
// escritorio 1280×800 y escritorio a 200 % (viewport CSS 640×400 con DPR 2, equivalente al zoom del navegador). Por
// formato: controles táctiles (incluido el botón TABLA nuevo) dentro de pantalla, ≥ 44 px y sin solapes entre sí; HUD sin
// solaparse con los controles; pausa, Controles y Ajustes caben o se desplazan DENTRO del modal (sin mover la página);
// movimiento reducido apaga la sacudida de cámara al chocar. Capturas por formato.
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
const R = new Report('UX-03', 'ux-v4');
const FORMATS = [
  { name: 'movil_vertical_390x844', viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, touch: true },
  { name: 'movil_apaisado_844x390', viewport: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, touch: true },
  { name: 'escritorio_1280x800', viewport: { width: 1280, height: 800, deviceScaleFactor: 1 }, touch: false },
  { name: 'escritorio_zoom200_640x400', viewport: { width: 640, height: 400, deviceScaleFactor: 2 }, touch: false },
];
await runTest(R, async () => {
  const browser = await launch();
  try {
    for (const F of FORMATS) {
      const page = await openGame(browser, R, { save: null, viewport: F.viewport });
      await clickStart(page); await sleep(1200);
      const lay = await page.evaluate(() => {
        const vis = (el) => el && !el.hidden && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
        const ids = ['btn-jump', 'btn-crouch', 'btn-extra', 'btn-board', 'btn-cam', 'btn-pause'];
        const W = innerWidth, H = innerHeight;
        const els = ids.map((id) => ({ id, el: document.getElementById(id) })).filter((x) => vis(x.el)).map((x) => { const r = x.el.getBoundingClientRect(); return { id: x.id, x: r.left, y: r.top, w: r.width, h: r.height }; });
        const out = els.filter((r) => r.x < 0 || r.y < 0 || r.x + r.w > W + 0.5 || r.y + r.h > H + 0.5).map((r) => r.id);
        const small = els.filter((r) => r.id !== 'btn-pause' && (r.w < 44 || r.h < 44)).map((r) => `${r.id} ${r.w.toFixed(0)}×${r.h.toFixed(0)}`);
        const ov = []; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i], b = els[j]; const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (ix > 1 && iy > 1) ov.push(`${a.id}×${b.id}`); }
        return { W, H, touchShown: vis(document.getElementById('touch')), els, out, small, ov };
      });
      await page.screenshot({ path: `${R.dir}/${F.name}_juego.png` });
      R.check(lay.out.length === 0 && lay.ov.length === 0 && (!F.touch || (lay.touchShown && lay.small.length === 0 && lay.els.some((e) => e.id === 'btn-board'))), `${F.name}: controles dentro de pantalla, sin solapes${F.touch ? ', ≥ 44 px y con el botón TABLA' : ''}`, 'emulation', lay);
      // modales: pausa, Controles, Ajustes (contenido cabe o se desplaza dentro del modal; la página no se mueve)
      await page.keyboard.press('Escape'); await sleep(300);
      for (const [btn, modal] of [[null, 'pause'], ['btn-help', 'help'], ['btn-settings', 'settings']]) {
        if (btn) { await page.click(`#${btn}`); await sleep(300); }
        const m = await page.evaluate((id) => {
          const el = document.getElementById(id); if (!el || el.hidden) return { id, shown: false };
          const box = el.querySelector('.panel, .card, .modal, section, div') ?? el; const r = el.getBoundingClientRect();
          const sc = [...el.querySelectorAll('*')].concat([el]).find((n) => n.scrollHeight > n.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(n).overflowY));
          return { id, shown: true, fits: r.height <= innerHeight + 1 && r.width <= innerWidth + 1, overflowing: [...el.querySelectorAll('*')].concat([el]).some((n) => n.scrollHeight > n.clientHeight + 2), scrollable: !!sc, pageScroll: document.scrollingElement.scrollHeight > innerHeight + 1 };
        }, modal);
        await page.screenshot({ path: `${R.dir}/${F.name}_${modal}.png` });
        R.check(m.shown && m.fits && (!m.overflowing || m.scrollable) && !m.pageScroll, `${F.name}: «${modal}» cabe o se desplaza dentro del modal (sin mover la página)`, 'emulation', m);
        if (btn) { await page.keyboard.press('Escape'); await sleep(250); }
      }
      await page.keyboard.press('Escape'); await sleep(200);
      await page.close();
    }
    // movimiento reducido: sin sacudida de cámara en un golpe fuerte (ajuste guardado del jugador; fixture declarada)
    const page = await openGame(browser, R, { save: null });
    await clickStart(page); await sleep(800);
    const shake = await page.evaluate(() => { const g = window.__bk; g.state.p.settings.reducedMotion = true; g.applySettings?.(); g.rig.shake = 0; g.skater.onLand?.(9, true); const a = g.rig.shake; g.state.p.settings.reducedMotion = false; g.skater.onLand?.(9, true); return { reducida: a, normal: g.rig.shake }; });
    R.fixture('ajuste de movimiento reducido activado en el estado del jugador y aterrizaje fuerte disparado por su gancho', shake);
    R.check(shake.reducida === 0 && shake.normal > 0, 'movimiento reducido: un aterrizaje fuerte no sacude la cámara (con el ajuste apagado sí)', 'unit', shake);
    R.pendingHuman('Revisión en teléfono físico (notch/safe-area, pulgares, zoom de texto real del sistema)');
  } finally { await browser.close(); }
}, { timeoutMs: 900000 });
