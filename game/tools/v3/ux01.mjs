// UX-01: matriz del HUD táctil con toques REALES (CDP Input.dispatchTouchEvent: varios dedos a la vez) en viewports de
// revisión 390×844, 844×390 y 360×740 (EMULACIÓN de Chrome, no teléfono físico; la ergonomía de pulgares queda aparte).
// Por viewport: tamaño ≥44 px, dentro de pantalla, sin solapes entre controles, hit test en el centro, ninguno tapa a ANMI;
// SALTO, AGACHARSE (alterna), PAUSA, ACCIÓN y ◎ con toque; dos dedos (stick + SALTO, stick + cámara); giro de orientación
// con el dedo puesto y recuperación (nada queda pulsado).
//   node tools/v3/ux01.mjs → captures/v3/P3/UX-01/ux01.json + *.jpg
import path from 'node:path';
import { Report, launch, openGame, clickStart, sleep, VIEWPORTS } from './lib.mjs';

const R = new Report('P3/UX-01', 'ux01', { method: 'toques reales multi-dedo por CDP sobre la build en desarrollo; viewports emulados; fixture: posición junto a La Pantera para mostrar ACCIÓN' });
const browser = await launch();
const CONTROLS = ['#btn-jump', '#btn-crouch', '#btn-extra', '#btn-cam', '#btn-pause', '#btn-action'];
const matrix = {};

async function touch(cdp, type, pts) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 8, radiusY: 8, force: 1 })) }); }
const centerOf = (page, sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
async function tap(cdp, p, id = 9) { await touch(cdp, 'touchStart', [{ ...p, id }]); await sleep(70); await touch(cdp, 'touchEnd', [{ ...p, id }]); await sleep(120); }

try {
  for (const [name, vp] of [['390x844', VIEWPORTS.phone], ['844x390', VIEWPORTS.phoneLand], ['360x740', VIEWPORTS.narrow]]) {
    const page = await openGame(browser, R, { viewport: vp, save: null });
    const cdp = await page.createCDPSession();
    await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
    R.fixture(`${name}: posición a 2,2 m de La Pantera (para que ACCIÓN esté visible)`, 'teleport');
    await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE; await g.loadNpc('la_pantera'); const n = g.manifest.get('npc.la_pantera'); const d = new T.Vector3(Math.sin(n.heading), 0, Math.cos(n.heading)); g.skater.teleport(n.pos.clone().addScaledVector(d, 2.4), n.heading + Math.PI, 'walk'); g.rig.snapBehind(g.skater); g.input.clear(); });
    await page.waitForFunction(() => !document.getElementById('prompt').hidden, { timeout: 5000 }).catch(() => {});
    await sleep(400);
    await page.screenshot({ path: path.join(R.dir, `hud_${name}.jpg`), type: 'jpeg', quality: 72 });
    const lay = await page.evaluate((CONTROLS) => {
      const g = window.__bk, T = window.__bkTHREE;
      const head = g.skater.visualPos.clone().add(new T.Vector3(0, 1.0, 0)).project(g.rig.cam);
      const anmi = { x: (head.x + 1) / 2 * innerWidth, y: (1 - head.y) / 2 * innerHeight };
      const out = CONTROLS.map((sel) => {
        const el = document.querySelector(sel); if (!el) return { sel, visible: false };
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        const visible = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]');
        const x = r.left + r.width / 2, y = r.top + r.height / 2, hitEl = visible ? document.elementFromPoint(x, y) : null;
        return { sel, visible, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, hit: !!hitEl && (hitEl === el || el.contains(hitEl)), hitBy: hitEl ? (hitEl.id || hitEl.tagName) : null,
          coversAnmi: anmi.x > r.left - 30 && anmi.x < r.right + 30 && anmi.y > r.top - 30 && anmi.y < r.bottom + 30 };
      });
      const vis = out.filter((o) => o.visible), overlaps = [];
      for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) { const a = vis[i], b = vis[j]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push([a.sel, b.sel]); }
      return { controls: out, overlaps, anmi, vw: innerWidth, vh: innerHeight };
    }, CONTROLS);
    matrix[name] = lay;
    const vis = lay.controls.filter((c) => c.visible);
    R.check(['#btn-jump', '#btn-crouch', '#btn-pause', '#btn-action', '#btn-cam'].every((s) => vis.some((c) => c.sel === s)), `${name}: SALTO, AGACHARSE, PAUSA, ACCIÓN y ◎ visibles (EXTRA según ajuste)`, 'emulation', lay.controls.map((c) => [c.sel, c.visible]));
    R.check(vis.every((c) => c.w >= 44 && c.h >= 44 && c.inside), `${name}: todos ≥44×44 px y dentro de la pantalla`, 'emulation', vis.map((c) => [c.sel, c.w, c.h, c.inside]));
    R.check(vis.every((c) => c.hit) && lay.overlaps.length === 0, `${name}: el centro de cada control recibe su propio toque y no hay solapes`, 'emulation', { hit: vis.map((c) => [c.sel, c.hitBy]), overlaps: lay.overlaps });
    R.check(vis.every((c) => !c.coversAnmi), `${name}: ningún control tapa a ANMI`, 'emulation', { anmi: lay.anmi, covering: vis.filter((c) => c.coversAnmi).map((c) => c.sel) });

    // toques: SALTO (salto a pie), AGACHARSE alterna, ◎ recentra
    await page.evaluate(() => { window.__e0 = window.__bk.skater.events.length; });
    await tap(cdp, await centerOf(page, '#btn-jump')); await sleep(300);
    const j = await page.evaluate(() => window.__bk.skater.events.slice(window.__e0).map((e) => e.e));
    await tap(cdp, await centerOf(page, '#btn-crouch')); await sleep(250);
    const c1 = await page.evaluate(() => ({ want: window.__bk.skater.wantsCrouch, crouched: window.__bk.skater.isCrouched, pressed: document.getElementById('btn-crouch').getAttribute('aria-pressed') }));
    await tap(cdp, await centerOf(page, '#btn-crouch')); await sleep(250);
    const c2 = await page.evaluate(() => ({ want: window.__bk.skater.wantsCrouch, crouched: window.__bk.skater.isCrouched }));
    R.check(j.some((e) => /hop|jump|ollie/.test(e)) && c1.want && c1.crouched && !c2.want, `${name}: toque en SALTO salta; AGACHARSE alterna (agachado ↔ de pie)`, 'emulation', { j, c1, c2 });
    // dos dedos: stick hacia arriba + SALTO con el otro dedo
    const sz = await page.evaluate(() => { const r = document.getElementById('stick-zone').getBoundingClientRect(); return { x: r.left + Math.min(90, r.width * 0.4), y: r.bottom - Math.min(110, r.height * 0.35) }; });
    const jb = await centerOf(page, '#btn-jump');
    await page.evaluate(() => { window.__e0 = window.__bk.skater.events.length; });
    await touch(cdp, 'touchStart', [{ ...sz, id: 1 }]); await sleep(60);
    // stick hacia la derecha (de lado): delante está La Pantera y andar contra ella no avanza
    for (let k = 1; k <= 6; k++) { await touch(cdp, 'touchMove', [{ x: sz.x + k * 10, y: sz.y, id: 1 }]); await sleep(30); }
    await sleep(900);
    // CDP: en touchEnd se listan los puntos que se SUELTAN (los demás siguen pulsados)
    await touch(cdp, 'touchStart', [{ x: sz.x + 60, y: sz.y, id: 1 }, { ...jb, id: 2 }]); await sleep(80);
    await touch(cdp, 'touchEnd', [{ ...jb, id: 2 }]); await sleep(500);
    const two = await page.evaluate(() => { const g = window.__bk; return { speed: +g.skater.speed.toFixed(2), move: g.input.move, owners: [...g.input.owners.values()], ev: g.skater.events.slice(window.__e0).map((e) => e.e) }; });
    // tercer contacto: cámara con el otro dedo a la derecha mientras se mantiene el stick
    const yaw0 = await page.evaluate(() => window.__bk.rig.yaw);
    const cz = { x: lay.vw * 0.62, y: lay.vh * 0.35 };
    await touch(cdp, 'touchStart', [{ x: sz.x + 60, y: sz.y, id: 1 }, { ...cz, id: 3 }]);
    for (let k = 1; k <= 6; k++) { await touch(cdp, 'touchMove', [{ x: sz.x + 60, y: sz.y, id: 1 }, { x: cz.x + k * 14, y: cz.y, id: 3 }]); await sleep(30); }
    const yaw1 = await page.evaluate(() => window.__bk.rig.yaw);
    await touch(cdp, 'touchEnd', [{ x: cz.x + 84, y: cz.y, id: 3 }]); await sleep(100);
    R.check(two.speed > 0.5 && two.ev.some((e) => /hop|jump|ollie/.test(e)) && two.owners.includes('stick') && Math.abs(yaw1 - yaw0) > 0.02, `${name}: dos dedos — stick mantenido mueve mientras otro dedo salta, y otro gira la cámara`, 'emulation', { two, yaw0, yaw1 });
    // giro de orientación con el dedo puesto: al soltar no queda nada pulsado
    const other = name === '844x390' ? VIEWPORTS.phone : VIEWPORTS.phoneLand;
    await page.setViewport(other); await sleep(700);
    await touch(cdp, 'touchEnd', [{ x: sz.x + 60, y: sz.y, id: 1 }]); await sleep(400);
    const rec = await page.evaluate(() => { const g = window.__bk; return { owners: g.input.owners.size, move: g.input.move, stickHidden: document.getElementById('stick').hidden }; });
    await page.setViewport(vp); await sleep(600);
    await page.keyboard.press('KeyW').catch(() => {});
    await sleep(800);
    const rec2 = await page.evaluate(() => ({ speed: +window.__bk.skater.speed.toFixed(2), owners: window.__bk.input.owners.size }));
    R.check(rec.owners === 0 && rec.move.x === 0 && rec.move.y === 0 && rec.stickHidden && rec2.owners === 0, `${name}: girar la pantalla con el dedo en el stick y soltar → nada queda pulsado`, 'emulation', { rec, rec2 });
    // PAUSA y ACCIÓN con toque
    await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE; const n = g.manifest.get('npc.la_pantera'); const d = new T.Vector3(Math.sin(n.heading), 0, Math.cos(n.heading)); g.skater.teleport(n.pos.clone().addScaledVector(d, 2.4), n.heading + Math.PI, 'walk'); g.input.clear(); });
    await sleep(400);
    await tap(cdp, await centerOf(page, '#btn-pause')); await sleep(300);
    const p1 = await page.evaluate(() => window.__bk.paused);
    await tap(cdp, await centerOf(page, '#btn-resume')); await sleep(300);
    const p2 = await page.evaluate(() => window.__bk.paused);
    await page.waitForFunction(() => !document.getElementById('prompt').hidden, { timeout: 4000 }).catch(() => {});
    await tap(cdp, await centerOf(page, '#btn-action')); await sleep(600);
    const a1 = await page.evaluate(() => ({ mode: window.__bk.mode, dialog: !document.getElementById('dialog').hidden }));
    R.check(p1 && !p2 && a1.mode === 'activity' && a1.dialog, `${name}: toque en PAUSA pausa, REANUDAR vuelve y ACCIÓN abre la charla`, 'emulation', { p1, p2, a1 });
    await page.close();
  }
  R.data.matrix = matrix;
  R.note('Matriz en EMULACIÓN (viewport + toques CDP). La ergonomía de pulgares y safe areas reales quedan para teléfono físico.');
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
