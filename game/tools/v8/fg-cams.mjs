// V6 T6-10 · Cámara e interfaz de FASHION GIRL en escritorio, vertical y horizontal (emulación): baile (ANMI de cabeza a pies
// dentro del cuadro y sin chicas delante, timer/secuencia/Salir/botones sin solaparse y dentro de pantalla) + capturas con la
// cámara de JUEGO (rig) dentro del túnel, en la escalera y en la U.
import { Report, runTest, launch, openGame, clickStart, sleep, place, VIEWPORTS, holdKeys } from './lib.mjs';
// V10.2 Q05 (D-05a, cambio de diseño aprobado): sin el baile ganado, Bella reta a ANMI antes de empezar: se cierra su frase con «Vale» (clic)
const pasaBella = async (page) => { for (let i = 0; i < 20; i++) { const v = await page.evaluate(() => !document.getElementById('dialog').hidden && document.getElementById('dialog-name').textContent === 'Bella');
  if (v) { await sleep(350); await page.click('#dialog-ok'); await sleep(450); return true; }
  if (await page.evaluate(() => !document.getElementById('dance').hidden)) return false; await sleep(100); } return false; };   // sin diálogo (baile ya ganado): no espera
const R = new Report('fg-cams');
const th = (108 + 9) * Math.PI / 180, /* V10 (preparación): marco FG con el giro de corona +9° (Bola de Oro §07), como world/fg.ts */ O = [30.5 * Math.sin(th), -30.5 * Math.cos(th)], W = [Math.sin(th), -Math.cos(th)], S = [-Math.cos(th), -Math.sin(th)];
const V = (w, s, h = 0) => [O[0] + W[0] * w + S[0] * s, h, O[1] + W[1] * w + S[1] * s];
const H = (dw, ds) => Math.atan2(W[0] * dw + S[0] * ds, W[1] * dw + S[1] * ds);
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [vp, view] of Object.entries(VIEWPORTS)) {
      const page = await openGame(b, R, { viewport: view }); await clickStart(page);
      await page.evaluate(() => window.__bk.loadNpc('bella')); await sleep(2500);
      await place(page, R, V(0, 5.6, 1.0), H(0, 1), 'walk', 'pista ' + vp); await sleep(400);
      await page.evaluate(() => { const g = window.__bk; g.activities.find((a) => a.id === 'danceCombo').start(); }); await pasaBella(page);
      R.fixture('inicio del baile por llamada directa (la oferta por ACCIÓN ya se prueba en fg-dance)');
      await sleep(1600);
      const m = await page.evaluate(() => {
        const g = window.__bk, T = window.__bkTHREE, cam = g.rig.cam, c = g.manifest.get('dance.center').pos;
        const pr = (v) => { const p = v.clone().project(cam); return [+p.x.toFixed(3), +p.y.toFixed(3), p.z < 1]; };
        const anmi = [pr(c.clone()), pr(c.clone().add(new T.Vector3(0, 1.8, 0)))];
        // ¿alguna chica DELANTE de ANMI y solapando su silueta en pantalla?
        const camP = cam.position, dA = camP.distanceTo(c);
        const box = (pts) => ({ x0: Math.min(...pts.map((p) => p[0])) - 0.04, x1: Math.max(...pts.map((p) => p[0])) + 0.04, y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) });
        const aB = box(anmi);
        const girls = (g.npcs.get('bella') ?? []).map((n) => { const p = n.root.position; const gb = box([pr(p.clone()), pr(p.clone().add(new T.Vector3(0, 1.7, 0)))]); const front = camP.distanceTo(p) < dA;
          const ov = Math.max(0, Math.min(aB.x1, gb.x1) - Math.max(aB.x0, gb.x0)) * Math.max(0, Math.min(aB.y1, gb.y1) - Math.max(aB.y0, gb.y0)) / ((aB.x1 - aB.x0) * (aB.y1 - aB.y0)); return { front, ov: +ov.toFixed(3), on: Math.abs(gb.x0) < 1 && Math.abs(gb.x1) < 1 }; });
        const rect = (id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom }; };
        const els = { timer: rect('dance-timer'), seq: rect('dance-seq'), pad: rect('dance-pad'), exit: rect('dance-exit'), title: document.querySelector('#dance .mg-title').getBoundingClientRect() };
        return { anmi, girls, els, W: innerWidth, H: innerHeight };
      });
      const inFrame = m.anmi.every(([x, y, z]) => Math.abs(x) <= 0.95 && Math.abs(y) <= 0.95 && z);
      R.check(inFrame, `${vp}: ANMI de cabeza a pies dentro del cuadro`, 'emulation', m.anmi);
      R.check(m.girls.length === 5 && m.girls.every((x) => !(x.front && x.ov > 0.15)), `${vp}: ninguna chica delante tapando a ANMI`, 'emulation', m.girls);
      R.check(m.girls.filter((x) => x.on).length >= 4, `${vp}: chicas en cuadro (≥4 de 5)`, 'emulation', m.girls.map((x) => x.on));
      const E = m.els, inside = (r) => r.x0 >= 0 && r.y0 >= 0 && r.x1 <= m.W + 0.5 && r.y1 <= m.H + 0.5, ov = (a, c) => a.x0 < c.x1 && c.x0 < a.x1 && a.y0 < c.y1 && c.y0 < a.y1;
      R.check(['timer', 'seq', 'pad', 'exit'].every((k) => inside(E[k])), `${vp}: timer, secuencia, botones y Salir dentro de pantalla`, 'emulation', E);
      R.check(!ov(E.timer, E.seq) && !ov(E.seq, E.pad) && !ov(E.timer, E.pad) && !ov(E.exit, E.timer) && !ov(E.exit, E.seq), `${vp}: sin solapes entre timer, secuencia, botones y Salir`, 'emulation', E);
      await page.screenshot({ path: R.file_(`baile_${vp}.png`) });
      // stage 3 (5 flechas) en vertical: que quepan
      await page.evaluate(() => { const d = window.__bk.activities.find((a) => a.id === 'danceCombo'); d.stage = 2; d.showStage(); });
      await sleep(300);
      const s3 = await page.evaluate(() => { const r = document.getElementById('dance-seq').getBoundingClientRect(); return { x0: r.left, x1: r.right, W: innerWidth }; });
      R.check(s3.x0 >= 0 && s3.x1 <= s3.W, `${vp}: secuencia de 5 flechas cabe`, 'emulation', s3);
      await page.screenshot({ path: R.file_(`baile_stage3_${vp}.png`) });
      await page.click('#dance-exit'); await sleep(500);
      // cámaras de juego: túnel, escalera, U
      if (vp === 'desktop' || vp === 'phone') {
        // V10.3 R2 (W05): sin túnel; la foto pasa al muro de la radio con la patata escondida encima (copia previa en V10/backups/pruebas/V10_3-R2)
        await place(page, R, V(-2.1, -9.6), H(0, -1), 'walk', 'muro de la radio'); await sleep(900);
        await page.screenshot({ path: R.file_(`juego_muro_radio_${vp}.png`) });
        await place(page, R, V(0, -10.9), H(0, 1), 'walk', 'escalera'); await sleep(300); await page.keyboard.press('KeyE'); await holdKeys(page, ['KeyW'], 900); await sleep(600);
        await page.screenshot({ path: R.file_(`juego_escalera_${vp}.png`) });
        await holdKeys(page, ['KeyS'], 2600);
        await place(page, R, V(0, -9.6, 1.8), H(0, 1), 'ride', 'deck'); await holdKeys(page, ['KeyW'], 1500);
        await page.screenshot({ path: R.file_(`juego_u_${vp}.png`) });
      }
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
