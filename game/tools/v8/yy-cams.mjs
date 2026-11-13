// V8 · yy-cams: cámara NORMAL de juego en YINYANG (1280×800, 390×844 y 844×390, EMULACIÓN) con el mismo protocolo que tt-cams:
// estaciones a distintas cotas (deck, E1, N1, N2, fondo N3 junto a pared y rampa, P1 frente a T1) — ANMI de pies a cabeza en cuadro
// y sin sólido delante —; charla con la rana (rana entera, de cara, fuera del diálogo), pintura (lienzo dentro de la pantalla) y
// celebración (rana bailando y ANMI en cuadro, fuera del diálogo); al cerrar vuelve el seguimiento y los controles.
import { Report, runTest, launch, openGame, clickStart, sleep, place, VIEWPORTS, holdKeys } from './lib.mjs';
import { Pilot } from '../v4/pilot.mjs';
import { W, HD, yy } from './yy-lib.mjs';
import { maskStrokes, mouseStrokes, touchStrokes } from './yy-paint.mjs';
const R = new Report('yy-cams');
/** [nombre, local (x, v, h), dirección local, loco, ms andando] */
const ST = [
  ['deck_e1', [-9.8, 31.4, 0.02], [1, 0], 'walk', 700], ['e1_bajando', [-8.4, 31.4, -0.2], [1, 0], 'walk', 400], ['n1', [-6.0, 31.0, -1.0], [1, 0], 'walk', 500],
  ['n2_izq', [-3.0, 33.6, -1.75], [1, 0], 'walk', 600], ['n2_pared_baja', [2.5, 27.6, -1.75], [1, 0.1], 'walk', 600], ['n2_pie_r2', [-3.4, 29.6, -1.75], [-1, 0.4], 'walk', 500],
  ['n2_hacia_t1', [1.4, 27.8, -1.75], [0, 1], 'walk', 300], ['n1_dcha', [6.0, 33.4, -1.0], [1, -0.3], 'walk', 600], ['p1_frente', [1.4, 30.35, 0.02], [0, 1], 'walk', 0],
  ['p1_cuello', [1.4, 33.8, 0.02], [0, -1], 'walk', 500], ['n2_tabla', [-1.0, 28.0, -1.75], [1, 0], 'ride', 900],
];
const measure = (page) => page.evaluate(() => {
  const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier, cam = g.rig.cam, s = g.skater, f = s.footPos; cam.updateMatrixWorld();
  const pts = { pies: f.clone().add(new T.Vector3(0, 0.08, 0)), pecho: f.clone().add(new T.Vector3(0, 1.1, 0)), cabeza: f.clone().add(new T.Vector3(0, 1.72, 0)) };
  const out = { ndc: {}, tapado: {}, dist: +cam.position.distanceTo(f).toFixed(2), camY: +cam.position.y.toFixed(2) };
  for (const [k, p] of Object.entries(pts)) {
    const n = p.clone().project(cam); out.ndc[k] = [+n.x.toFixed(3), +n.y.toFixed(3), n.z < 1];
    const d = p.clone().sub(cam.position), L = d.length(); d.normalize();
    const hit = g.world.castRay(new RA.Ray(cam.position, d), L - 0.25, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider, undefined, (c) => g.rig.ignore ? g.rig.ignore(c) : true);
    out.tapado[k] = hit ? g.park.colliderName(hit.collider.handle) || 'collider' : null;
  }
  // cámara dentro de un sólido (p. ej. tras la pared del vaso)
  out.camDentro = !!g.world.intersectionWithShape(cam.position, { x: 0, y: 0, z: 0, w: 1 }, new RA.Ball(0.05), RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider);
  return out;
});
const frame = (page) => page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, cam = g.rig.cam, n = g.npcs.get('rana')?.[0], f = g.skater.footPos; cam.updateMatrixWorld();
  const pr = (v) => { const p = v.clone().project(cam); return [+p.x.toFixed(3), +p.y.toFixed(3), p.z < 1]; };
  const d = document.getElementById('dialog').getBoundingClientRect(), H = innerHeight, Wd = innerWidth, toPx = ([x, y]) => [(x + 1) / 2 * Wd, (1 - y) / 2 * H];
  const under = (p) => { const [px, py] = toPx(p); return !document.getElementById('dialog').hidden && px >= d.left && px <= d.right && py >= d.top && py <= d.bottom; };
  const at = n.root.position, rana = [pr(at.clone().add(new T.Vector3(0, 0.05, 0))), pr(at.clone().add(new T.Vector3(0, 1.45 * (n.root.scale?.y ?? 1), 0)))]   /* R1 usuario: rana a la mitad */, anmi = [pr(f.clone()), pr(f.clone().add(new T.Vector3(0, 1.75, 0)))];
  const fw = new T.Vector3(Math.sin(n.yaw), 0, Math.cos(n.yaw)), tc = cam.position.clone().sub(at).setY(0).normalize();
  return { rana, anmi, cara: +(Math.acos(Math.max(-1, Math.min(1, fw.dot(tc)))) * 180 / Math.PI).toFixed(1), clip: n.current?.getClip().name, ranaBajoDialogo: under(rana[1]), anmiBajoDialogo: under(anmi[1]) }; });
const inside = (pts, lim = 0.98) => pts.every(([x, y, z]) => Math.abs(x) <= lim && Math.abs(y) <= lim && z);
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [vp, view] of Object.entries(VIEWPORTS)) {
      const page = await openGame(b, R, { viewport: view, save: null }); await clickStart(page); await sleep(800);
      await page.evaluate(() => { window.__bk.loadNpc('rana'); document.getElementById('hint').hidden = true; });
      const P = new Pilot(page, R); const rows = {}; const touch = !!view.hasTouch;
      for (const [name, p, d, loco, ms] of ST) {
        await place(page, R, W(...p), HD(...d), loco, `${name} ${vp}`); await sleep(350);
        if (ms) await holdKeys(page, ['KeyW'], ms); await sleep(700);
        const m = await measure(page); rows[name] = m; await page.screenshot({ path: R.file_(`${name}_${vp}.png`) });
      }
      R.measure(`estaciones_${vp}`, rows);
      const out = Object.entries(rows).filter(([, m]) => !inside(Object.values(m.ndc), 0.96));
      R.check(out.length === 0, `${vp}: ANMI de pies a cabeza dentro del cuadro en las ${ST.length} estaciones (deck, E1, N1 a ambos lados de T1, N2, P1, tabla)`, 'emulation', out.map(([k, m]) => [k, m.ndc]));
      const hid = Object.entries(rows).filter(([, m]) => (m.tapado.pecho && m.tapado.cabeza) || m.camDentro);
      R.check(hid.length === 0, `${vp}: ninguna pared del vaso, T1 ni mobiliario tapa a ANMI y la cámara no entra en sólidos`, 'emulation', hid.map(([k, m]) => [k, m.tapado, m.camDentro]));
      // charla con la rana
      await place(page, R, W(2.0, 35.6, 0.02), HD(0.3, -1), 'walk', `rana ${vp}`); await page.waitForFunction(() => window.__bk.npcs.get('rana')?.[0]?.actions.has('Dance'), { timeout: 40000 }); await sleep(600);
      if (touch) { await page.waitForFunction(() => !document.getElementById('prompt').hidden, { timeout: 6000 }); await page.tap('#btn-action'); } else await P.act(/HABLAR/, 5000);
      await sleep(2600); let m = await frame(page); await page.screenshot({ path: R.file_(`charla_rana_${vp}.png`) });
      R.check(inside([...m.rana, m.anmi[1]]) && !m.ranaBajoDialogo && m.cara <= 55 && m.clip === 'Talk', `${vp}: charla: rana entera, de cara a cámara (≤55°) y fuera del diálogo; ANMI en primer término`, 'emulation', m);
      for (let i = 0; i < 4; i++) { if (touch) await page.tap('#dialog-ok'); else await page.click('#dialog-ok'); await sleep(350); }
      await page.waitForFunction(() => document.getElementById('graffiti-canvas').dataset.ready === '1', { timeout: 15000 });
      const ui = await page.evaluate(() => { const r = document.getElementById('graffiti-canvas').getBoundingClientRect(), e = document.getElementById('graffiti-exit').getBoundingClientRect(); return { c: [r.left, r.top, r.right, r.bottom].map(Math.round), exit: [e.left, e.top, e.right, e.bottom].map(Math.round), W: innerWidth, H: innerHeight }; });
      await page.screenshot({ path: R.file_(`pintura_${vp}.png`) });
      R.check(ui.c[0] >= 0 && ui.c[1] >= 0 && ui.c[2] <= ui.W && ui.c[3] <= ui.H && ui.c[2] - ui.c[0] > 150 && !(ui.exit[2] > ui.c[0] && ui.exit[0] < ui.c[2] && ui.exit[3] > ui.c[1] && ui.exit[1] < ui.c[3]), `${vp}: el lienzo cabe en pantalla, con proporción de la diana, y «Salir» no lo tapa`, 'emulation', ui);
      const strokes = await maskStrokes(page); if (touch) await touchStrokes(page, strokes, { steps: 4 }); else await mouseStrokes(page, strokes, { steps: 6 });
      await page.waitForFunction(() => !document.getElementById('dialog').hidden, { timeout: 10000 }); await sleep(1800);
      m = await frame(page); await page.screenshot({ path: R.file_(`celebracion_${vp}.png`) });
      R.check(inside([...m.rana, m.anmi[1]]) && !m.ranaBajoDialogo && m.clip === 'Dance', `${vp}: celebración: la rana bailando entera en cuadro, fuera del diálogo, con ANMI`, 'emulation', m);
      if (touch) await page.tap('#dialog-ok'); else await page.click('#dialog-ok'); await sleep(900);
      const s = await yy(page); const fz = await page.evaluate(() => window.__bk.skater.frozen);
      R.check(s.mode === 'explore' && !s.dialog && !fz, `${vp}: al cerrar vuelven el seguimiento y los controles`, 'emulation', { mode: s.mode, frozen: fz });
      await page.close();
    }
    R.pendingHuman('teléfono físico: cámara, charla, pintura y celebración en YINYANG (aquí solo emulación)');
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
