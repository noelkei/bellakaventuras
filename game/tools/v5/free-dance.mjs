// R2-G8 (usuario, 12 oct) · Botón BAILAR con abanico de 8 bailes. Entrada real (clic/toque en los botones, teclas B y 1–8):
//  · escritorio, vertical y horizontal: el botón aparece a pie; el abanico muestra 8 botones DENTRO de la pantalla y sin
//    solaparse; tocar un número baila ese clip (tabla aparcada en el suelo);
//  · los 8 bailes: clip correcto en bucle y suelas sobre el suelo (≥ −2 cm) durante 1,5 s;
//  · parar: W (se mueve), SALTO (no salta: se consume), volver a tocar su número;
//  · negativos: en tabla y sentada en el banco el botón no aparece; las teclas 1–8 no hacen nada en tabla.
import { Report, runTest, launch, openGame, clickStart, sleep, place, VIEWPORTS, SAVE_20 } from './lib.mjs';
const R = new Report('free-dance');
const DANCES = ['Step_Hip_Hop_Dance', 'Hip_Hop_Dance_1', 'Hip_Hop_Dance_2', 'Hip_Hop_Dance_3', 'FunnyDancing_02', 'FunnyDancing_03', 'Cardio_Dance', 'Breakdance_1990'];
const st = () => {
  const g = window.__bk, v = g.visual, s = g.skater, T = window.__bkTHREE, tv = new T.Vector3();
  let sole = Infinity; v.body.skeleton.update(); for (const i of v.soleIdx) { v.body.getVertexPosition(i, tv).applyMatrix4(v.body.matrixWorld); sole = Math.min(sole, tv.y); }
  const btn = document.getElementById('btn-dance'), ring = document.getElementById('dance-ring');
  const opts = [...ring.querySelectorAll('.dance-opt')].map((b) => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
  return { clip: v.currentName, sole: +sole.toFixed(3), btn: !btn.hidden, ring: !ring.hidden, opts, vy: +s.vy.toFixed(2), y: +s.footPos.y.toFixed(3), pos: [+s.footPos.x.toFixed(2), +s.footPos.z.toFixed(2)], vw: innerWidth, vh: innerHeight, dancing: g.activities.find((a) => a.id === 'freeDance').dancing };
};
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [lay, vp] of [['escritorio', VIEWPORTS.desktop], ['vertical', VIEWPORTS.phone], ['horizontal', VIEWPORTS.phoneLand]]) {
      const page = await openGame(b, R, { viewport: vp, save: SAVE_20 }); await clickStart(page); await sleep(900);
      await place(page, R, [-30, 0, 30], Math.PI / 2, 'walk', `${lay}: plaza`); await sleep(500);
      const s0 = await page.evaluate(st);
      R.check(s0.btn && !s0.ring, `${lay}: a pie aparece BAILAR (abanico cerrado)`, 'emulation', s0);
      await page.click('#btn-dance'); await sleep(400);
      const s1 = await page.evaluate(st);
      const inside = s1.opts.every(([l, t, r, bt]) => l >= 0 && t >= 0 && r <= s1.vw && bt <= s1.vh);
      const overlap = s1.opts.some((a, i) => s1.opts.some((c, j) => j > i && a[0] < c[2] - 2 && c[0] < a[2] - 2 && a[1] < c[3] - 2 && c[1] < a[3] - 2));
      R.check(s1.ring && s1.opts.length === 8 && inside && !overlap, `${lay}: BAILAR despliega 8 botones dentro de la pantalla y sin solaparse`, 'emulation', { opts: s1.opts, vw: s1.vw, vh: s1.vh });
      await R.shot(page, `${lay}_abanico`);
      await page.click('.dance-opt[data-n="3"]'); await sleep(900);
      const s2 = await page.evaluate(st);
      R.check(s2.clip === DANCES[2] && !s2.ring && s2.dancing === 2, `${lay}: tocar 3 baila ${DANCES[2]} y cierra el abanico`, 'emulation', s2);
      await R.shot(page, `${lay}_bailando_3`);
      await page.click('.dance-opt[data-n="3"]').catch(() => {}); // abanico cerrado: el clic no llega → usamos el botón principal para parar
      await page.click('#btn-dance'); await sleep(500);
      const s3 = await page.evaluate(st);
      R.check(s3.dancing === -1 && !DANCES.includes(s3.clip), `${lay}: volver a tocar BAILAR para el baile`, 'emulation', s3);
      if (lay === 'escritorio') {
        // los 8 bailes con teclado: clip y suelo
        for (let i = 0; i < 8; i++) {
          await page.keyboard.press(`Digit${i + 1}`); await sleep(300);
          let low = Infinity, clipOk = true;
          for (let k = 0; k < 6; k++) { const q = await page.evaluate(st); low = Math.min(low, q.sole); if (q.clip !== DANCES[i]) clipOk = false; await sleep(250); }
          R.check(clipOk && low >= -0.02, `tecla ${i + 1}: ${DANCES[i]} en bucle con las suelas sobre el suelo (mín ${low.toFixed(3)} m)`, 'emulation', { low, clipOk });
          await R.shot(page, `baile_${i + 1}`);
        }
        // parar con W: se mueve
        const a = await page.evaluate(st); await page.keyboard.down('KeyW'); await sleep(700); await page.keyboard.up('KeyW'); await sleep(200);
        const b2 = await page.evaluate(st);
        R.check(b2.dancing === -1 && Math.hypot(b2.pos[0] - a.pos[0], b2.pos[1] - a.pos[1]) > 0.3, 'W para el baile y ANMI anda', 'emulation', { a: a.pos, b: b2.pos, dancing: b2.dancing });
        // parar con SALTO: no salta
        await page.keyboard.press('Digit2'); await sleep(500); await page.keyboard.press('Space'); await sleep(250);
        const c = await page.evaluate(st);
        R.check(c.dancing === -1 && c.y < 0.05 && c.vy <= 0.01, 'SALTO para el baile sin saltar (salto consumido)', 'emulation', c);
        // B abre el abanico
        await page.keyboard.press('KeyB'); await sleep(350);
        R.check((await page.evaluate(st)).ring, 'tecla B abre el abanico', 'emulation');
        await page.keyboard.press('KeyB'); await sleep(200);
        // negativos: en tabla no hay botón y 1–8 no bailan
        await place(page, R, [-30, 0, 30], Math.PI / 2, 'ride', 'en tabla'); await sleep(500);
        await page.keyboard.press('Digit4'); await sleep(400);
        const d = await page.evaluate(st);
        R.check(!d.btn && d.dancing === -1, 'en tabla: sin botón BAILAR y la tecla 4 no baila', 'emulation', d);
        // sentada en el banco: sin botón
        const z = await page.evaluate(() => { const g = window.__bk, z = g.park.zones.get('act.benchSit'), a = g.manifest.get('nmg.bench.sit'); return [z.pos.x, z.pos.z, Math.atan2(a.pos.x - z.pos.x, a.pos.z - z.pos.z)]; });
        await place(page, R, [z[0], 0, z[1]], z[2], 'walk', 'delante del banco'); await sleep(600); await page.keyboard.press('KeyE'); await sleep(1300);
        await page.keyboard.press('Digit1'); await sleep(400);
        const e = await page.evaluate(st);
        R.check(!e.btn && e.dancing === -1 && e.clip === 'SK_SitBench', 'sentada: sin botón BAILAR y la tecla 1 no baila', 'emulation', e);
      }
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
