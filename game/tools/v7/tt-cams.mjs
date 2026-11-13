// V7 T7-10 · Cámara NORMAL de juego (rig de seguimiento, no cámaras de captura) e interfaz en TRA TRA TRA, en escritorio
// 1280×800, móvil vertical 390×844 y horizontal 844×390 (EMULACIÓN: no es teléfono físico). En cada estación ANMI se coloca
// (fixture), anda ~1 s con W para que la cámara se asiente y se mide: ANMI de pies a cabeza dentro del cuadro, sin sólido
// entre la cámara y su cuerpo (rayos a pies, pecho y cabeza con el mismo filtro que usa el rig) y captura. En las dos
// charlas (cámara fija de la sesión): el NPC que habla y ANMI dentro del cuadro y fuera del cuadro de diálogo; al cerrar se
// vuelve al seguimiento. En la trepa: captura a media altura en EV1 y EV2.
// Uso: node game/tools/v7/tt-cams.mjs --url dev --task T7-10
import { Report, runTest, launch, openGame, clickStart, sleep, place, VIEWPORTS, holdKeys } from './lib.mjs';
import { Pilot, W, HD, tt, talk, KIT, ROOF, HC, RC, LC, TALK_SPOT } from './tt-lib.mjs';

const R = new Report('tt-cams');
const cx = KIT.limo.center[0], ev2 = KIT.ladders.EV2;
/** estaciones: [nombre, local (x, y, h), dirección local, loco, ms andando] */
const ST = [
  ['e1_pie', [0, -6.4, 0.03], [0, 1], 'walk', 900], ['camino_inferior', [2.5, 0, 1.23], [1, 0], 'walk', 900], ['ev1_pie', [10, -0.9, 1.23], [0, 1], 'walk', 250],
  ['p1', [10, (KIT.P1.bounds[1] + KIT.P1.bounds[3]) / 2, 3.23], [0, 1], 'walk', 0], ['trasera_ante_H', [11.0, HC, 4.43], [-1, 0], 'walk', 250], ['e3_descanso', [KIT.rear.hole[0] - 1.4, HC + 0.3, 4.43], [-1, 0], 'walk', 250],
  ['recta_carrera', [7.0, RC, 5.63], [-1, 0], 'ride', 600], ['recepcion', [-3.4, RC, 5.63], [-1, 0], 'walk', 500], ['techo_centro', [cx, LC + 0.6, ROOF + 0.03], [0, -1], 'walk', 300],
  ['techo_trasera', [cx, LC + 1.2, ROOF + 0.03], [0, 1], 'walk', 300], ['plaza_bajo_H', [(KIT.rear.hole[0] + KIT.rear.hole[2]) / 2, KIT.rear.bounds[3] + 1.2, 0.03], [0, -1], 'walk', 900], ['plaza_bajo_recta', [-1.6, KIT.recta.bounds[3] - 0.1, 0.03], [1, 0], 'walk', 900],
];
const measure = (page) => page.evaluate(() => {
  const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier, cam = g.rig.cam, s = g.skater, f = s.footPos;
  cam.updateMatrixWorld();
  const pts = { pies: f.clone().add(new T.Vector3(0, 0.08, 0)), pecho: f.clone().add(new T.Vector3(0, 1.1, 0)), cabeza: f.clone().add(new T.Vector3(0, 1.72, 0)) };
  const out = { ndc: {}, tapado: {}, dist: +cam.position.distanceTo(f).toFixed(2) };
  for (const [k, p] of Object.entries(pts)) {
    const n = p.clone().project(cam); out.ndc[k] = [+n.x.toFixed(3), +n.y.toFixed(3), n.z < 1];
    const d = p.clone().sub(cam.position), L = d.length(); d.normalize();
    const hit = g.world.castRay(new RA.Ray(cam.position, d), L - 0.25, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider, undefined, (c) => g.rig.ignore ? g.rig.ignore(c) : true);
    out.tapado[k] = hit ? g.park.colliderName(hit.collider.handle) || 'collider' : null;
  }
  return out;
});
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [vp, view] of Object.entries(VIEWPORTS)) {
      const page = await openGame(b, R, { viewport: view }); await clickStart(page); await sleep(800);
      await page.evaluate(() => { const g = window.__bk; g.loadNpc('aissa'); g.loadNpc('juseph'); document.getElementById('hint').hidden = true; });
      const P = new Pilot(page, R); const rows = {};
      for (const [name, p, d, loco, ms] of ST) {
        await place(page, R, W(...p), HD(...d), loco, `${name} ${vp}`); await sleep(350);
        if (ms) await holdKeys(page, ['KeyW'], ms); await sleep(650);
        const m = await measure(page); rows[name] = m;
        await page.screenshot({ path: R.file_(`${name}_${vp}.png`) });
      }
      R.measure(`estaciones_${vp}`, rows);
      const inFrame = Object.entries(rows).filter(([, m]) => !Object.values(m.ndc).every(([x, y, z]) => Math.abs(x) <= 0.96 && Math.abs(y) <= 0.97 && z));
      R.check(inFrame.length === 0, `${vp}: ANMI de pies a cabeza dentro del cuadro en las ${ST.length} estaciones`, 'emulation', inFrame.map(([k, m]) => [k, m.ndc]));
      const hidden = Object.entries(rows).filter(([, m]) => m.tapado.pecho && m.tapado.cabeza);
      R.check(hidden.length === 0, `${vp}: ningún pilar, losa ni la limo tapa a ANMI (pecho y cabeza a la vista)`, 'emulation', hidden.map(([k, m]) => [k, m.tapado]));
      // trepa: captura a media altura en EV1 y EV2 (ACCIÓN real + W)
      for (const [lad, at, dir] of [['EV1', [KIT.ladders.EV1.at, KIT.ladders.EV1.face - KIT.ladders.EV1.standoff - 0.5, 1.23], [0, 1]], ['EV2', [ev2.face + ev2.standoff + 0.5, ev2.at, 5.63], [-1, 0]]]) {
        await place(page, R, W(...at), HD(...dir), 'walk', `${lad} ${vp}`); await sleep(400);
        if (await P.act(/TREPAR/, 3000)) { await sleep(450); await holdKeys(page, ['KeyW'], 1100); await sleep(250); const m = await measure(page); await page.screenshot({ path: R.file_(`trepa_${lad}_${vp}.png`) });
          R.check(Object.values(m.ndc).every(([x, y, z]) => Math.abs(x) <= 0.97 && Math.abs(y) <= 0.98 && z) && !(m.tapado.pecho && m.tapado.cabeza), `${vp}: ANMI visible trepando ${lad}`, 'emulation', m);
          await page.keyboard.down('KeyW'); const t0 = Date.now(); while (Date.now() - t0 < 9000 && (await tt(page)).ladder.phase !== 'off') await sleep(80); await page.keyboard.up('KeyW'); await sleep(500); const s = await tt(page);
          R.check(s.ladder.phase === 'off' && s.mode === 'explore', `${vp}: al terminar ${lad} se devuelven cámara y controles`, 'emulation', { phase: s.ladder.phase, mode: s.mode }); }
        else R.check(false, `${vp}: TREPAR ofrecido en ${lad}`, 'emulation');
      }
      // charlas: encuadre individual con el diálogo abierto
      for (const who of ['aissa', 'juseph']) {
        await place(page, R, W(...TALK_SPOT[who], ROOF + 0.03), who === 'aissa' ? HD(0, -1) : HD(0, 1), 'walk', `techo ${who} ${vp}`); await sleep(400);
        const tk = await talk(P, page, { close: false }); await sleep(3000);   // encuadre asentado (el rig funde hacia la cámara de la sesión)
        const m = await page.evaluate((who) => { const THREE_deg = (r) => (r * 180 / Math.PI).toFixed(1); const g = window.__bk, T = window.__bkTHREE, cam = g.rig.cam, n = g.npcs.get(who)?.[0], f = g.skater.footPos; cam.updateMatrixWorld();
          const pr = (v) => { const p = v.clone().project(cam); return [+p.x.toFixed(3), +p.y.toFixed(3), p.z < 1]; };
          const seat = g.manifest.get(`npc.${who}`).pos, d = document.getElementById('dialog').getBoundingClientRect(), H = innerHeight, Wd = innerWidth;
          const toPx = ([x, y]) => [(x + 1) / 2 * Wd, (1 - y) / 2 * H];
          const at = n ? n.root.position : seat, npc = [pr(at.clone().add(new T.Vector3(0, 0.1, 0))), pr(at.clone().add(new T.Vector3(0, 1.7, 0)))] /* R1: el NPC habla de pie (raíz real) */, anmi = [pr(f.clone()), pr(f.clone().add(new T.Vector3(0, 1.75, 0)))];
          const under = (p) => { const [px, py] = toPx(p); return px >= d.left && px <= d.right && py >= d.top && py <= d.bottom; };
          const fw = n ? new T.Vector3(Math.sin(n.yaw), 0, Math.cos(n.yaw)) : null, tc = n ? cam.position.clone().sub(n.root.position).setY(0).normalize() : null;
          return { npc, anmi, cara: fw ? +THREE_deg(Math.acos(Math.max(-1, Math.min(1, fw.dot(tc))))) : null, clip: n?.current?.getClip().name ?? null, dialog: [d.left, d.top, d.right, d.bottom].map(Math.round), npcBajoDialogo: under(npc[1]), anmiBajoDialogo: under(anmi[1]), view: [Wd, H] }; }, who);
        await page.screenshot({ path: R.file_(`charla_${who}_${vp}.png`) });
        // R3 (usuario): protagonismo del NPC: plano por encima del hombro de ANMI. El NPC entero en cuadro, con la cabeza fuera del
        // diálogo y la CARA hacia la cámara (≤ 55° entre su frente y la cámara); de ANMI basta la cabeza (de espaldas, en primer término)
        const ok = [...m.npc, m.anmi[1]].every(([x, y, z]) => Math.abs(x) <= 0.98 && Math.abs(y) <= 0.98 && z);
        R.check(tk.ok && ok && !m.npcBajoDialogo && m.cara !== null && m.cara <= 55, `${vp}: charla con ${who}: ${who} entero, de cara a cámara y fuera del diálogo; ANMI de espaldas en primer término`, 'emulation', m);
        R.check(m.clip === 'Talk', `${vp}: ${who} habla DE PIE, levantado de la limo (Talk; R1 del usuario)`, 'emulation', m.clip);
        await page.click('#dialog-ok'); await sleep(900); const s = await tt(page);   // controles devueltos al cerrar; el NPC vuelve a su asiento andando (R1)
        await page.waitForFunction((who) => window.__bk.npcs.get(who)?.[0]?.current?.getClip().name === 'SitIdle', { timeout: 8000 }, who).catch(() => {});
        const clip = await page.evaluate((who) => window.__bk.npcs.get(who)?.[0]?.current?.getClip().name ?? null, who);
        R.check(s.mode === 'explore' && !s.dialog && clip === 'SitIdle', `${vp}: al cerrar vuelve el seguimiento, los controles y el reposo sentado de ${who}`, 'emulation', { mode: s.mode, clip });
      }
      // botón de acción y HUD dentro de pantalla sobre el techo
      const ui = await page.evaluate(() => { const r = (id) => { const e = document.getElementById(id); if (!e || e.hidden) return null; const q = e.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)]; }; return { prompt: r('prompt'), hud: r('hud'), W: innerWidth, H: innerHeight }; });
      R.measure(`ui_${vp}`, ui);
      await page.close();
    }
    R.pendingHuman('teléfono físico: cámara y controles en TRA TRA TRA (aquí solo emulación de viewport y táctil)');
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
