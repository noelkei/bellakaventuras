// V7 R5 · botón de actividad yendo en skate (IG-005) y cámara (IG-006 + cámara «Fortnite» también en teclado/ratón).
// Entradas reales: teclado (escritorio) y toques CDP (vertical). Fixtures: colocación de ANMI (declaradas en el informe).
//  A (escritorio y vertical) · en skate dentro del recuadro de La Pantera: botón VISIBLE, deshabilitado, con «Bájate del skate…»;
//    E / pulsarlo no inicia nada; al bajarse (Q / botón BAJAR) dentro del recuadro se habilita y E inicia la charla.
//  B (escritorio) · girando a pie y en tabla con A/D, la cámara va detrás del frente (≤ 20°); tras girarla a mano (J) y soltar,
//    vuelve detrás en ≤ 1,5 s.
//  C (escritorio y vertical) · cámara girada a mano justo antes de bajarse del skate → al terminar de bajarse queda detrás.
// Uso: node game/tools/v7/ux-r5.mjs --url v7 --task R5
import { Report, runTest, launch, openGame, clickStart, sleep, place, VIEWPORTS } from './lib.mjs';

const R = new Report('ux-r5');
const camState = (page) => page.evaluate(() => { const g = window.__bk, s = g.skater, d = g.rig.look.clone().sub(g.rig.cam.position), cy = Math.atan2(d.x, d.z);
  return { loco: s.loco, diffDeg: Math.round(Math.abs(Math.atan2(Math.sin(cy - s.heading), Math.cos(cy - s.heading))) * 180 / Math.PI), mode: g.mode, recenters: g.rig.dismountRecenters }; });
const btn = (page) => page.evaluate(() => { const p = document.getElementById('prompt'), b = document.getElementById('btn-action'), n = document.getElementById('prompt-note');
  return { visible: !p.hidden, off: b.classList.contains('off'), aria: b.getAttribute('aria-disabled'), label: b.textContent, note: n.hidden ? '' : n.textContent, mode: window.__bk.mode }; });
const talkPos = (page) => page.evaluate(() => { const z = window.__bk.park.zones.get('act.pantherTalk'); return [z.pos.x, 0, z.pos.z]; });

await runTest(R, async () => {
  const b = await launch();
  try {
    for (const vp of ['desktop', 'phone']) {
      const page = await openGame(b, R, vp === 'phone' ? { viewport: VIEWPORTS.phone } : {}); await clickStart(page); await sleep(900);
      const cdp = await page.target().createCDPSession();
      const tap = async (id) => { const r = await page.evaluate((id) => { const q = document.getElementById(id).getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2]; }, id);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r[0], y: r[1], id: 9, radiusX: 8, radiusY: 8, force: 1 }] }); await sleep(90); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
      // ------------------------------------------------ A. botón en skate
      const tp = await talkPos(page);
      await place(page, R, tp, 0, 'ride', `${vp}: en tabla dentro del recuadro de La Pantera`); await sleep(700);
      let s = await btn(page);
      R.check(s.visible && s.off && s.aria === 'true' && /HABLAR/.test(s.label) && /Bájate del skate/.test(s.note), `${vp}: en skate dentro del recuadro el botón SE VE, deshabilitado y con el aviso`, 'input', s);
      if (vp === 'phone') await tap('btn-action'); else await page.keyboard.press('KeyE');
      await sleep(600); s = await btn(page);
      R.check(s.mode === 'explore', `${vp}: pulsarlo (o E) en skate no inicia la actividad`, 'input', s);
      if (vp === 'phone') await tap('btn-board'); else await page.keyboard.press('KeyQ');
      await sleep(1100); s = await btn(page); const loco = (await camState(page)).loco;
      R.check(loco === 'walk' && s.visible && !s.off && s.note === '', `${vp}: al bajarse dentro del recuadro el botón se habilita y el aviso desaparece`, 'input', { ...s, loco });
      if (vp === 'phone') await tap('btn-action'); else await page.keyboard.press('KeyE');
      await sleep(900); s = await btn(page);
      R.check(s.mode === 'activity', `${vp}: a pie, el botón inicia la charla`, 'input', s);
      await page.click('#dialog-ok').catch(() => {}); await sleep(1500);
      // ------------------------------------------------ B. cámara detrás del frente con teclado (solo escritorio)
      if (vp === 'desktop') {
        for (const lc of ['walk', 'ride']) {
          await place(page, R, [-14, 0, -2], 0, lc, `B ${lc}`); await sleep(600);
          await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD'); await sleep(1600);
          const c = await camState(page); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW'); await sleep(400);
          R.check(c.diffDeg <= 20, `escritorio ${lc}: girando con A/D la cámara va detrás del frente (≤ 20°)`, 'input', c);
        }
        await place(page, R, [-14, 0, -2], 0, 'walk', 'B órbita manual'); await sleep(600);
        await page.keyboard.down('KeyJ'); await sleep(700); await page.keyboard.up('KeyJ'); const c0 = await camState(page); await sleep(1500); const c1 = await camState(page);
        R.check(c0.diffDeg >= 25 && c1.diffDeg <= 8, 'escritorio: tras girar la cámara a mano (J) y soltar, vuelve detrás en ≤ 1,5 s', 'input', { girada: c0, despues: c1 });
      }
      // ------------------------------------------------ C. al bajarse del skate la cámara queda detrás
      await place(page, R, [-14, 0, -2], 0, 'ride', `${vp}: C en tabla`); await sleep(700);
      const r0 = (await camState(page)).recenters;
      if (vp === 'desktop') { await page.keyboard.down('KeyJ'); await sleep(500); await page.keyboard.up('KeyJ'); await page.keyboard.press('KeyQ'); }
      else { await tap('btn-board'); }
      await sleep(1600); const c = await camState(page);
      R.check(c.loco === 'walk' && c.diffDeg <= 8 && c.recenters > r0, `${vp}: al terminar de bajarse del skate la cámara queda detrás del frente`, 'input', { ...c, recentradoPorBajada: c.recenters - r0 });
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
